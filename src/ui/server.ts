import express from 'express'
import path from 'path'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { generateReplies } from '../reasoning/assistant'
import { buildProfile, confirmWeakness, dismissWeakness } from '../analysis/profile-builder'
import { getProfile, saveContact, getContact, getAllContacts, addFeedback, addSample } from '../data/storage'
import { exportAllMessages, getContacts, refreshClient } from '../data/weflow-client'
import { getWeFlowConfig, updateWeFlowConfig } from '../data/config'
import { registry } from '../skill/skill-registry'
import { UserGoal, WeaknessId, Occasion, RelationshipType, RelationshipStatus } from '../types'
// Occasion type used for request body typing (passed through to generateReplies)
import { messageListener } from '../data/message-listener'

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// --- 回复建议 ---

app.post('/api/suggest', async (req, res) => {
  try {
    const { contactId, message, goal = 'casual', occasion } = req.body
    if (!contactId || !message) return res.status(400).json({ error: 'contactId and message required' })

    const result = await generateReplies(contactId, message, goal as UserGoal, occasion || undefined)
    res.json({ ok: true, result })
  } catch (err) {
    console.error('/api/suggest error:', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// --- 联系人管理 ---

app.get('/api/contacts', (_req, res) => {
  res.json({ contacts: getAllContacts() })
})

app.get('/api/contacts/:id', (req, res) => {
  const contact = getContact(req.params.id)
  if (!contact) return res.status(404).json({ error: 'Not found' })
  res.json({ contact })
})

app.post('/api/contacts', (req, res) => {
  const { id, name, occasion, relationshipType, relationshipStatus } = req.body
  if (!id || !name) return res.status(400).json({ error: 'id and name required' })

  saveContact({
    id,
    name,
    occasion: (occasion || 'friend') as Occasion,
    relationshipType: (relationshipType || 'friend') as RelationshipType,
    relationshipStatus: (relationshipStatus || 'normal') as RelationshipStatus,
    recentContext: '',
    confirmedAt: new Date().toISOString(),
  })
  res.json({ ok: true })
})

// 从 WeFlow 同步联系人列表（跳过已存在的，新联系人默认 friend 场合）
app.post('/api/contacts/sync', async (_req, res) => {
  try {
    const weflowContacts = await getContacts()
    const existing = getAllContacts()
    const existingIds = new Set(existing.map(c => c.id))

    let added = 0
    for (const wc of weflowContacts) {
      if (existingIds.has(wc.id)) continue
      saveContact({
        id: wc.id,
        name: wc.alias || wc.name,
        occasion: (wc.isRoom ? 'workplace' : 'friend') as Occasion,
        relationshipType: (wc.isRoom ? 'peer' : 'friend') as RelationshipType,
        relationshipStatus: 'normal',
        recentContext: '',
        confirmedAt: new Date().toISOString(),
      })
      added++
    }
    res.json({ ok: true, total: weflowContacts.length, added })
  } catch (err) {
    console.error('/api/contacts/sync error:', err)
    res.status(500).json({ error: 'Sync failed' })
  }
})

// --- 画像 ---

app.get('/api/profile', (_req, res) => {
  res.json({ profile: getProfile() })
})

app.post('/api/profile/analyze', async (_req, res) => {
  try {
    const messages = await exportAllMessages()
    const report = await buildProfile(messages)
    res.json({ ok: true, report })
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed' })
  }
})

app.post('/api/profile/weakness/confirm', (req, res) => {
  const { id } = req.body
  confirmWeakness(id as WeaknessId)
  res.json({ ok: true })
})

app.post('/api/profile/weakness/dismiss', (req, res) => {
  const { id } = req.body
  dismissWeakness(id as WeaknessId)
  res.json({ ok: true })
})

// --- 反馈 ---

app.post('/api/feedback', (req, res) => {
  const { contactId, scene, intent, chosenDirection, wasRecommended, notLikeMe } = req.body
  addFeedback({
    timestamp: Date.now(),
    contactId,
    scene: scene || '',
    intent: intent || '',
    chosenDirection: chosenDirection || '',
    wasRecommended: !!wasRecommended,
    notLikeMe: !!notLikeMe,
  })
  res.json({ ok: true })
})

// --- 样本保存（反馈回路：用户复制了某条回复，存为最佳样本）---

app.post('/api/sample/save', (req, res) => {
  const { text, scene } = req.body
  if (!text) return res.status(400).json({ error: 'text required' })
  addSample(scene || 'casual', text)
  res.json({ ok: true })
})

// --- Skill 管理 ---

app.get('/api/skills', (_req, res) => {
  res.json({ skills: registry.summary() })
})

// --- 监听器控制 ---

app.post('/api/listener/start', (_req, res) => {
  messageListener.start()
  res.json({ ok: true })
})

app.post('/api/listener/stop', (_req, res) => {
  messageListener.stop()
  res.json({ ok: true })
})

// --- WeFlow 配置（动态修改推送地址）---

app.get('/api/config/weflow', (_req, res) => {
  const cfg = getWeFlowConfig()
  // 隐藏 token 明文，只返回是否已设置
  res.json({
    apiUrl: cfg.apiUrl,
    accessTokenSet: cfg.accessToken.length > 0,
  })
})

app.post('/api/config/weflow', (req, res) => {
  const { apiUrl, accessToken } = req.body
  if (!apiUrl) return res.status(400).json({ error: 'apiUrl required' })

  const patch: { apiUrl: string; accessToken?: string } = { apiUrl }
  if (typeof accessToken === 'string') patch.accessToken = accessToken

  updateWeFlowConfig(patch)
  refreshClient()
  messageListener.restart()

  res.json({ ok: true, apiUrl })
})

// --- 启动 ---

export function startServer(port = 8080) {
  const server = createServer(app)
  const wss = new WebSocketServer({ server })

  // WebSocket 连接管理
  const clients = new Set<WebSocket>()

  wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected')
    clients.add(ws)

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected')
      clients.delete(ws)
    })

    ws.on('error', (err) => {
      console.error('[WebSocket] Error:', err)
      clients.delete(ws)
    })

    // 发送连接确认
    ws.send(JSON.stringify({ type: 'connected' }))
  })

  // 启动消息监听器
  messageListener.onMessage((message) => {
    // 广播新消息给所有连接的客户端
    const payload = JSON.stringify({
      type: 'new_message',
      data: message,
    })

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
      }
    })
  })

  // 连接 WeFlow SSE 推送
  messageListener.start()

  server.listen(port, () => {
    console.log(`[Server] Running at http://localhost:${port}`)
    console.log(`[WebSocket] Ready for connections`)
    console.log(`[MessageListener] Polling for new messages...`)
  })
}

export default app
