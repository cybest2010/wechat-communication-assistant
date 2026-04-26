export type Occasion = 'workplace' | 'colleague' | 'boss' | 'business' | 'friend' | 'family' | 'stranger'
export type RelationshipType = 'superior' | 'peer' | 'subordinate' | 'friend' | 'family' | 'stranger' | 'business'
export type RelationshipStatus = 'normal' | 'friction' | 'new'
export type WeaknessId = 'W01' | 'W02' | 'W03' | 'W04' | 'W05' | 'W06' | 'W07' | 'W08'
export type UserGoal = 'agree' | 'decline' | 'advance' | 'maintain' | 'casual'
export type SceneType = 'criticism' | 'conflict' | 'request' | 'negotiation' | 'emotional' | 'invitation' | 'persuasion' | 'workplace' | 'casual' | 'disagreement' | 'demand'
export type EmotionType = 'neutral' | 'negative' | 'urgent' | 'positive'

export interface WeaknessInfo {
  id: WeaknessId
  name: string
  description: string
}

export const WEAKNESSES: Record<WeaknessId, WeaknessInfo> = {
  W01: { id: 'W01', name: '冲动表达', description: '撤回率高，事后解释多' },
  W02: { id: 'W02', name: '不会拒绝', description: '先答应后找借口反悔' },
  W03: { id: 'W03', name: '过度道歉', description: '道歉词密度异常高' },
  W04: { id: 'W04', name: '冲突逃避', description: '冲突类消息回复率低' },
  W05: { id: 'W05', name: '表达不清', description: '对方频繁追问同一件事' },
  W06: { id: 'W06', name: '情感生硬', description: '关心类表达后对方反应平淡' },
  W07: { id: 'W07', name: '防御解释', description: '解释性句式比例高' },
  W08: { id: 'W08', name: '回避想法', description: '「随便/都行」频率异常高' },
}

export interface StyleProfile {
  avgLength: number
  commonWords: string[]
  emojiFrequency: 'rare' | 'medium' | 'high'
  usePeriod: boolean
  byOccasion: Partial<Record<Occasion, { avgLength: number; emojiFrequency: 'rare' | 'medium' | 'high' }>>
}

export interface UserProfile {
  style: StyleProfile
  weaknesses: WeaknessId[]
  updatedAt: string
}

export interface ContactInfo {
  id: string
  name: string
  occasion: Occasion
  relationshipType: RelationshipType
  relationshipStatus: RelationshipStatus
  recentContext: string
  confirmedAt: string
}

export interface Message {
  id: string
  contactId: string
  contactName: string
  content: string
  sender: 'user' | 'contact'
  timestamp: number
  isRecalled?: boolean
}

export interface SampleStore {
  scene: string
  samples: string[]
  updatedAt: string
}

export interface IntentResult {
  intent: SceneType
  challenge: string
  emotion: EmotionType
}

export interface SkillMeta {
  name: string
  title: string
  description: string
  version: string
  scenes: SceneType[]
  occasions: Occasion[]
  relatedWeaknesses: WeaknessId[]
  priority: 'high' | 'medium' | 'low'
  emotionThreshold: 'any' | 'negative' | 'urgent'
}

export interface Skill extends SkillMeta {
  content: string
}

export interface ContextPackage {
  occasion: Occasion
  relationship: string
  history: Message[]
  weaknesses: WeaknessId[]
  samples: string[]
  userGoal: UserGoal
  skill: Skill | null
}

export interface ReplyOption {
  text: string
  direction: string
  isRecommended: boolean
  tone?: string
  reason?: string
}

export interface AssistantResult {
  situationAnalysis: string
  weaknessTip: string | null
  frameworkTip: string | null
  intent?: SceneType
  emotion?: EmotionType
  replies: ReplyOption[]
  avoid: Array<{ text: string; reason: string }>
}
