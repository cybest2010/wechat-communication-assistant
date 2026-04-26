import { ContextPackage, IntentResult, UserGoal, Message, Occasion } from '../types'
import { getProfile, getContact, getSamples, getScenePreferences } from '../data/storage'
import { getHistoryMessages } from '../data/weflow-client'
import { extractIntent } from './intent-extractor'
import { routeSkill, shouldSkipRouting } from '../skill/skill-router'

export async function buildContext(
  contactId: string,
  message: string,
  userGoal: UserGoal,
  occasionOverride?: Occasion
): Promise<{ ctx: ContextPackage; intent: IntentResult }> {
  const profile = getProfile()
  const contact = getContact(contactId)
  const occasion: Occasion = occasionOverride || contact?.occasion || 'friend'

  const history = await getHistoryMessages(contactId, 15)

  // 意图提取（轻量 AI 调用）
  const intent = await extractIntent(message, history, occasion)

  // Skill 路由
  let skill = null
  if (!shouldSkipRouting(message, userGoal)) {
    skill = routeSkill(intent, profile.weaknesses, occasion)
  }

  // 匹配场景样本：优先按用户目标选择，其次按意图类型
  const intentSceneMap: Record<string, string> = {
    request: 'rejection',
    invitation: 'rejection',
    emotional: 'emotional',
    workplace: 'workplace',
    criticism: 'workplace',
    negotiation: 'casual',
    disagreement: 'casual',
  }
  const goalSceneOverride: Partial<Record<string, string>> = {
    agree: 'agreement',
    decline: 'rejection',
  }
  const sampleScene = goalSceneOverride[userGoal] || intentSceneMap[intent.intent] || 'casual'
  const samples = getSamples(sampleScene).slice(0, 5)

  // 加载该场景的历史偏好方向（反馈闭环）
  const { preferred, avoided } = getScenePreferences(sampleScene)

  const ctx: ContextPackage = {
    occasion,
    relationship: formatRelationship(contact),
    history,
    weaknesses: profile.weaknesses,
    samples,
    userGoal,
    skill,
    preferredDirections: preferred,
    avoidedDirections: avoided,
  }
  return { ctx, intent }
}

function formatRelationship(contact: ReturnType<typeof getContact>): string {
  if (!contact) return '未知关系，正常状态'
  const type = contact.relationshipType
  const status = contact.relationshipStatus === 'normal' ? '关系正常'
    : contact.relationshipStatus === 'friction' ? '最近有些摩擦'
    : '刚认识'
  return `${type}，${status}`
}
