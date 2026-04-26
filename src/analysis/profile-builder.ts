import { Message, UserProfile, WeaknessId } from '../types'
import { inferWeaknesses, analyzeStyle } from './weakness-detector'
import { archiveBestSamples } from './sample-archiver'
import { getProfile, saveProfile } from '../data/storage'

export interface AnalysisReport {
  totalMessages: number
  weaknessCandidates: Array<{ id: WeaknessId; count: number; name: string }>
  samplesArchived: number
  styleUpdated: boolean
}

// 从历史消息构建/更新用户画像
export function buildProfile(messages: Message[]): AnalysisReport {
  const profile = getProfile()

  // 1. 分析风格
  const style = analyzeStyle(messages)
  if (style) {
    profile.style = {
      ...profile.style,
      avgLength: style.avgLength,
      commonWords: style.commonWords,
      emojiFrequency: style.emojiFrequency as 'rare' | 'medium' | 'high',
      usePeriod: style.usePeriod,
    }
  }

  // 2. 检测弱项候选（需要用户确认才写入）
  const candidates = inferWeaknesses(messages)

  // 3. 归档最佳样本
  const samplesArchived = archiveBestSamples(messages)

  saveProfile(profile)

  return {
    totalMessages: messages.length,
    weaknessCandidates: candidates.map(c => ({
      id: c.id,
      count: c.count,
      name: requireWeaknessName(c.id),
    })),
    samplesArchived,
    styleUpdated: !!style,
  }
}

// 用户确认弱项后写入画像
export function confirmWeakness(id: WeaknessId) {
  const profile = getProfile()
  if (!profile.weaknesses.includes(id)) {
    profile.weaknesses.push(id)
    saveProfile(profile)
  }
}

export function dismissWeakness(id: WeaknessId) {
  const profile = getProfile()
  profile.weaknesses = profile.weaknesses.filter(w => w !== id)
  saveProfile(profile)
}

function requireWeaknessName(id: WeaknessId): string {
  const names: Record<WeaknessId, string> = {
    W01: '冲动表达', W02: '不会拒绝', W03: '过度道歉', W04: '冲突逃避',
    W05: '表达不清', W06: '情感生硬', W07: '防御解释', W08: '回避想法',
  }
  return names[id]
}
