import { Message, Occasion, WeaknessId } from '../types'

interface AnomalyEvent {
  type: 'recall' | 'burst' | 'long_reply' | 'long_silence' | 'contact_went_cold' | 'defensive'
  messageId: string
  timestamp: number
  context?: string
}

// 检测异常事件
export function detectAnomalies(messages: Message[]): AnomalyEvent[] {
  const events: AnomalyEvent[] = []
  const userMessages = messages.filter(m => m.sender === 'user')

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // 撤回
    if (msg.isRecalled && msg.sender === 'user') {
      events.push({ type: 'recall', messageId: msg.id, timestamp: msg.timestamp })
    }

    // 连发 3 条以上（用户在 2 分钟内连发）
    if (msg.sender === 'user') {
      const burst = userMessages.filter(m =>
        Math.abs(m.timestamp - msg.timestamp) < 120000 && m.id !== msg.id
      )
      if (burst.length >= 2) {
        events.push({ type: 'burst', messageId: msg.id, timestamp: msg.timestamp })
      }
    }

    // 单条超过 100 字
    if (msg.sender === 'user' && msg.content.length > 100) {
      events.push({ type: 'long_reply', messageId: msg.id, timestamp: msg.timestamp, context: msg.content })
    }

    // 防御性解释（包含「因为」「所以」「由于」）
    if (msg.sender === 'user' && /因为|所以|由于|主要是|原因是/.test(msg.content)) {
      events.push({ type: 'defensive', messageId: msg.id, timestamp: msg.timestamp, context: msg.content })
    }
  }

  // 长时间不回（超过 2 小时）
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1]
    const curr = messages[i]
    if (prev.sender === 'contact' && curr.sender === 'user') {
      const gap = curr.timestamp - prev.timestamp
      if (gap > 7200000) {
        events.push({ type: 'long_silence', messageId: curr.id, timestamp: curr.timestamp })
      }
    }
  }

  // 对方发完后沉默 1 天+
  for (let i = 0; i < messages.length - 1; i++) {
    const curr = messages[i]
    const next = messages[i + 1]
    if (curr.sender === 'user' && next.sender === 'user') {
      // 用户发完，对方 24 小时没回
      const contactReplied = messages.slice(i + 1).find(
        m => m.sender === 'contact' && m.timestamp - curr.timestamp < 86400000
      )
      if (!contactReplied) {
        events.push({ type: 'contact_went_cold', messageId: curr.id, timestamp: curr.timestamp })
      }
    }
  }

  return events
}

export interface WeaknessCandidacy {
  id: WeaknessId
  count: number
  examples: string[]
  confidence?: number
  interpretation?: string
}

// 从异常事件推断弱项
export function inferWeaknesses(messages: Message[]): WeaknessCandidacy[] {
  const events = detectAnomalies(messages)
  const countMap: Partial<Record<WeaknessId, WeaknessCandidacy>> = {}

  function inc(id: WeaknessId, example?: string) {
    if (!countMap[id]) countMap[id] = { id, count: 0, examples: [] }
    countMap[id]!.count++
    if (example) countMap[id]!.examples.push(example.slice(0, 50))
  }

  for (const e of events) {
    switch (e.type) {
      case 'recall':       inc('W01'); break
      case 'burst':        inc('W05'); break
      case 'long_reply':   inc('W07', e.context); break
      case 'defensive':    inc('W07', e.context); break
      case 'long_silence': inc('W04'); break
      case 'contact_went_cold': inc('W01'); break
    }
  }

  // 分析用户消息的语言模式
  const userMessages = messages.filter(m => m.sender === 'user')
  const allText = userMessages.map(m => m.content).join('\n')

  // 过度道歉
  const apologyCount = (allText.match(/不好意思|对不起|抱歉|sorry|没事吧/gi) || []).length
  if (apologyCount > userMessages.length * 0.15) inc('W03')

  // 先答应后反悔（找「好的」后跟着拒绝词的模式）
  let agreeCount = 0
  for (let i = 0; i < userMessages.length - 1; i++) {
    if (/^(好的?|行|没问题|可以)/.test(userMessages[i].content)) {
      const later = userMessages.slice(i + 1, i + 5)
      if (later.some(m => /不行了|不去了|算了|有事/.test(m.content))) agreeCount++
    }
  }
  if (agreeCount >= 3) inc('W02')

  // 回避想法
  const avoidCount = (allText.match(/随便|都行|无所谓|你说吧/gi) || []).length
  if (avoidCount > userMessages.length * 0.1) inc('W08')

  // W06: 情感生硬 — 用户发关心消息后对方回复冷淡（极短且无正面情绪）
  const caringPattern = /辛苦了|注意身体|好好休息|保重|加油|还好吗|没事吧|怎么了|你还好/
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i]
    if (msg.sender !== 'user' || !caringPattern.test(msg.content)) continue
    const nextContact = messages.slice(i + 1, i + 4).find(m => m.sender === 'contact')
    if (
      nextContact &&
      nextContact.content.length <= 8 &&
      !/谢谢|感谢|❤|😊|感动|暖|哈哈|哦/.test(nextContact.content)
    ) {
      inc('W06', msg.content)
    }
  }

  return Object.values(countMap).filter(w => w.count >= 5) as WeaknessCandidacy[]
}

// 分析用户风格
// occasionMap: contactId → occasion，用于按场合拆分风格数据
export function analyzeStyle(messages: Message[], occasionMap?: Record<string, Occasion>) {
  const userMessages = messages.filter(m => m.sender === 'user' && m.content.length > 0)
  if (userMessages.length === 0) return null

  const avgLength = Math.round(
    userMessages.reduce((s, m) => s + m.content.length, 0) / userMessages.length
  )

  const wordFreq: Record<string, number> = {}
  for (const m of userMessages) {
    const words = m.content.match(/[\u4e00-\u9fa5a-zA-Z]+/g) || []
    for (const w of words) {
      wordFreq[w] = (wordFreq[w] || 0) + 1
    }
  }
  const commonWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w)

  const emojiCount = (userMessages.map(m => m.content).join('').match(/[\u{1F300}-\u{1FFFF}]/gu) || []).length
  const emojiFrequency = emojiCount > userMessages.length * 0.3 ? 'high'
    : emojiCount > userMessages.length * 0.1 ? 'medium' : 'rare'

  const usePeriod = userMessages.filter(m => m.content.endsWith('。')).length > userMessages.length * 0.3

  // 按场合拆分风格数据
  const byOccasion: Partial<Record<Occasion, { avgLength: number; emojiFrequency: 'rare' | 'medium' | 'high' }>> = {}
  if (occasionMap) {
    const occGroups: Partial<Record<Occasion, Message[]>> = {}
    for (const m of userMessages) {
      const occ = occasionMap[m.contactId]
      if (!occ) continue
      if (!occGroups[occ]) occGroups[occ] = []
      occGroups[occ]!.push(m)
    }
    for (const [occ, msgs] of Object.entries(occGroups) as [Occasion, Message[]][]) {
      if (msgs.length < 3) continue
      const occAvgLen = Math.round(msgs.reduce((s, m) => s + m.content.length, 0) / msgs.length)
      const occEmojis = (msgs.map(m => m.content).join('').match(/[\u{1F300}-\u{1FFFF}]/gu) || []).length
      const occEmojiFreq: 'rare' | 'medium' | 'high' = occEmojis > msgs.length * 0.3 ? 'high'
        : occEmojis > msgs.length * 0.1 ? 'medium' : 'rare'
      byOccasion[occ] = { avgLength: occAvgLen, emojiFrequency: occEmojiFreq }
    }
  }

  return { avgLength, commonWords, emojiFrequency, usePeriod, byOccasion }
}
