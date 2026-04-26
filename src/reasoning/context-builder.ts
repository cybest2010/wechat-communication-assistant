import { ContextPackage, IntentResult, UserGoal, Message, Occasion } from '../types'
import { getProfile, getContact, getSamples } from '../data/storage'
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

  // 匹配场景样本
  const sceneMap: Record<string, string> = {
    request: 'rejection',
    invitation: 'rejection',
    emotional: 'emotional',
    workplace: 'workplace',
    criticism: 'workplace',
  }
  const sampleScene = sceneMap[intent.intent] || 'casual'
  const samples = getSamples(sampleScene).slice(0, 5)

  const ctx: ContextPackage = {
    occasion,
    relationship: formatRelationship(contact),
    history,
    weaknesses: profile.weaknesses,
    samples,
    userGoal,
    skill,
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
