import { Skill, IntentResult, WeaknessId, Occasion, EmotionType } from '../types'
import { registry } from './skill-registry'

// 多信号评分路由
export function routeSkill(
  intent: IntentResult,
  userWeaknesses: WeaknessId[],
  occasion: Occasion
): Skill | null {
  const THRESHOLD = 40

  const scored = registry.all().map(skill => ({
    skill,
    score: scoreSkill(skill, intent, userWeaknesses, occasion),
  }))

  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best || best.score < THRESHOLD) return null
  return best.skill
}

function scoreSkill(
  skill: Skill,
  intent: IntentResult,
  userWeaknesses: WeaknessId[],
  occasion: Occasion
): number {
  let score = 0

  // 意图匹配（40分）
  if (skill.scenes.includes(intent.intent)) score += 40

  // 弱项关联（35分）
  const hasWeaknessMatch = userWeaknesses.some(w => skill.relatedWeaknesses.includes(w))
  if (hasWeaknessMatch) score += 35

  // 场合适配（15分）
  if (skill.occasions.includes(occasion)) score += 15

  // 情绪强度（10分）
  if (emotionMatches(intent.emotion, skill.emotionThreshold)) score += 10

  // 优先级加权
  if (skill.priority === 'high') score += 5
  if (skill.priority === 'low') score -= 5

  return score
}

function emotionMatches(
  emotion: EmotionType,
  threshold: 'any' | 'negative' | 'urgent'
): boolean {
  if (threshold === 'any') return true
  if (threshold === 'negative') return emotion === 'negative' || emotion === 'urgent'
  if (threshold === 'urgent') return emotion === 'urgent'
  return false
}

// 是否应该跳过 Skill 路由（简短消息、轻松场景）
export function shouldSkipRouting(message: string, userGoal: string): boolean {
  if (userGoal === 'casual') return true
  if (message.length <= 5) return true
  if (/^(好|嗯|哦|哈|ok|OK|😄|👍)/.test(message.trim())) return true
  return false
}
