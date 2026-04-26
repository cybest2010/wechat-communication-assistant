import { AssistantResult, ContextPackage, Occasion, ReplyOption, UserGoal } from '../types'
import { buildContext } from './context-builder'
import { buildPrompt } from './prompt-builder'
import { callAI } from './ai-client'
import { humanScore } from './human-checker'

export async function generateReplies(
  contactId: string,
  message: string,
  userGoal: UserGoal,
  occasionOverride?: Occasion
): Promise<AssistantResult> {
  const { ctx, intent } = await buildContext(contactId, message, userGoal, occasionOverride)
  const prompt = buildPrompt(message, ctx)

  let raw = ''
  let attempts = 0

  // 最多重试 2 次，直到人味评分达标
  while (attempts < 3) {
    raw = await callAI(prompt, { maxTokens: 800, temperature: 0.75 })
    const replies = parseReplies(raw)
    if (replies.length === 0 || humanScore(replies[0].text) >= 50) break
    attempts++
  }

  return { ...parseResult(raw, ctx), intent: intent.intent, emotion: intent.emotion }
}

function parseResult(raw: string, ctx: ContextPackage): AssistantResult {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)

  const get = (prefix: string) => {
    const line = lines.find(l => l.startsWith(prefix))
    return line ? line.slice(prefix.length).trim() : ''
  }

  const parseReply = (line: string): ReplyOption | null => {
    const parts = line.split('||')
    if (parts.length < 2) return null
    return { text: parts[0].trim(), direction: parts[1].trim(), isRecommended: false }
  }

  const situationAnalysis = get('局势分析：')
  const weaknessTip = get('弱项提示：').replace('无', '') || null
  const frameworkTip = get('框架建议：').replace('无', '') || null

  const recommended = parseReply(get('推荐：'))
  const altA = parseReply(get('备选A：'))
  const altB = parseReply(get('备选B：'))

  const replies: ReplyOption[] = []
  if (recommended) replies.push({ ...recommended, isRecommended: true })
  if (altA) replies.push(altA)
  if (altB) replies.push(altB)

  const avoid: Array<{ text: string; reason: string }> = []
  const avoid1 = get('避免1：')
  const avoid2 = get('避免2：')
  for (const a of [avoid1, avoid2]) {
    if (!a) continue
    const parts = a.split('||')
    if (parts.length >= 2) avoid.push({ text: parts[0].trim(), reason: parts[1].trim() })
  }

  return {
    situationAnalysis,
    weaknessTip: weaknessTip || null,
    frameworkTip: ctx.skill ? (frameworkTip || null) : null,
    replies,
    avoid,
  }
}

function parseReplies(raw: string): ReplyOption[] {
  const lines = raw.split('\n').map(l => l.trim())
  const result: ReplyOption[] = []
  for (const line of lines) {
    if (line.startsWith('推荐：') || line.startsWith('备选')) {
      const content = line.replace(/^(推荐：|备选[A-Z]：)/, '')
      const parts = content.split('||')
      if (parts[0]) result.push({ text: parts[0].trim(), direction: '', isRecommended: line.startsWith('推荐') })
    }
  }
  return result
}
