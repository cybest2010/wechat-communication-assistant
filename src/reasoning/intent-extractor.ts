import { IntentResult, Message, Occasion } from '../types'
import { callAI } from './ai-client'

export async function extractIntent(
  message: string,
  history: Message[],
  occasion: Occasion
): Promise<IntentResult> {
  const recentHistory = history.slice(-5).map(m =>
    `${m.sender === 'user' ? '我' : '对方'}：${m.content}`
  ).join('\n')

  const prompt = `分析以下对话，提取三个字段，只返回 JSON，不要解释。

[场合] ${occasion}
[对话历史]
${recentHistory}
[当前消息] ${message}

返回格式：
{
  "intent": "从以下选一个：criticism/conflict/request/negotiation/emotional/invitation/persuasion/workplace/casual/disagreement/demand",
  "challenge": "用户回复这条消息最难处理的地方（一句话，15字以内）",
  "emotion": "neutral/negative/urgent/positive"
}`

  try {
    const raw = await callAI(prompt, { maxTokens: 200, temperature: 0 })
    const json = extractJSON(raw)
    return {
      intent: json.intent || 'casual',
      challenge: json.challenge || '不确定如何回应',
      emotion: json.emotion || 'neutral',
    }
  } catch {
    return { intent: 'casual', challenge: '不确定如何回应', emotion: 'neutral' }
  }
}

function extractJSON(text: string): Record<string, string> {
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) return {}
  try {
    return JSON.parse(match[0])
  } catch {
    return {}
  }
}
