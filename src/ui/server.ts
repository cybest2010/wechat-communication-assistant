import express from 'express'
import path from 'path'
import { generateReplies } from '../reasoning/assistant'
import { buildProfile, confirmWeakness, dismissWeakness } from '../analysis/profile-builder'
import { getProfile, saveContact, getContact, getAllContacts, addFeedback } from '../data/storage'
import { exportAllMessages } from '../data/weflow-client'
import { registry } from '../skill/skill-registry'
import { UserGoal, WeaknessId, Occasion, RelationshipType, RelationshipStatus } from '../types'

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// --- 回复建议 ---

app.post('/api/suggest', async (req, res) => {
  try {
    const { contactId, message, goal = 'casual' } = req.body
    if (!contactId || !message) return res.status(400).json({ error: 'contactId and message required' })

    const result = await generateReplies(contactId, message, goal as UserGoal)
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

// --- 画像 ---

app.get('/api/profile', (_req, res) => {
  res.json({ profile: getProfile() })
})

app.post('/api/profile/analyze', async (_req, res) => {
  try {
    const messages = await exportAllMessages()
    const report = buildProfile(messages)
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

// --- Skill 管理 ---

app.get('/api/skills', (_req, res) => {
  res.json({ skills: registry.summary() })
})

// --- 启动 ---

export function startServer(port = 8080) {
  app.listen(port, () => {
    console.log(`[Server] Running at http://localhost:${port}`)
  })
}

export default app
