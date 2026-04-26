import { Message, Occasion, UserProfile, WeaknessId, WEAKNESSES } from '../types'
import { inferWeaknesses, analyzeStyle, WeaknessCandidacy } from './weakness-detector'
import { archiveBestSamples } from './sample-archiver'
import { getProfile, saveProfile, getAllContacts } from '../data/storage'
import { callAI } from '../reasoning/ai-client'

export interface AnalysisReport {
  totalMessages: number
  weaknessCandidates: Array<{ id: WeaknessId; count: number; name: string; interpretation?: string }>
  samplesArchived: number
  styleUpdated: boolean
}

// 从历史消息构建/更新用户画像
export async function buildProfile(messages: Message[]): Promise<AnalysisReport> {
  const profile = getProfile()

  // 构建 contactId → occasion 的映射，用于按场合拆分风格
  const contacts = getAllContacts()
  const occasionMap: Record<string, Occasion> = {}
  for (const c of contacts) occasionMap[c.id] = c.occasion

  // 1. 分析风格（含场合细分）
  const style = analyzeStyle(messages, occasionMap)
  if (style) {
    profile.style = {
      ...profile.style,
      avgLength: style.avgLength,
      commonWords: style.commonWords,
      emojiFrequency: style.emojiFrequency as 'rare' | 'medium' | 'high',
      usePeriod: style.usePeriod,
      byOccasion: style.byOccasion,
    }
  }

  // 2. 规则层：检测弱项候选（需要用户确认才写入画像）
  const candidates = inferWeaknesses(messages)

  // 3. AI 解读：对规则层的候选弱项进行置信度评估和白话解读
  const interpretedCandidates = candidates.length > 0
    ? await interpretWeaknessesWithAI(candidates, messages)
    : candidates

  // 4. 归档最佳样本
  const samplesArchived = archiveBestSamples(messages)

  saveProfile(profile)

  return {
    totalMessages: messages.length,
    weaknessCandidates: interpretedCandidates.map(c => ({
      id: c.id,
      count: c.count,
      name: requireWeaknessName(c.id),
      interpretation: c.interpretation,
    })),
    samplesArchived,
    styleUpdated: !!style,
  }
}

// AI 解读弱项：判断置信度 + 给出用户能理解的一句话描述
async function interpretWeaknessesWithAI(
  candidates: WeaknessCandidacy[],
  _messages: Message[]
): Promise<WeaknessCandidacy[]> {
  const candidatesDesc = candidates.map(c => {
    const examples = c.examples.slice(0, 3).map(e => `"${e}"`).join('、')
    return `${c.id} ${WEAKNESSES[c.id].name}（检测到 ${c.count} 次）${examples ? '，典型示例：' + examples : ''}`
  }).join('\n')

  const prompt = `以下是用户聊天记录的统计分析结果，请对每个沟通弱项给出置信度（0~1）和一句话解读，只返回 JSON 数组，不要解释。

弱项列表：
${candidatesDesc}

返回格式：
[
  {
    "id": "W07",
    "confidence": 0.85,
    "interpretation": "你回消息时经常加因果解释，可能给对方一种防御感强的印象"
  }
]`

  try {
    const raw = await callAI(prompt, { maxTokens: 500, temperature: 0 })
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return candidates
    const parsed: Array<{ id: string; confidence: number; interpretation: string }> = JSON.parse(match[0])
    return candidates.map(c => {
      const interp = parsed.find(p => p.id === c.id)
      return { ...c, confidence: interp?.confidence, interpretation: interp?.interpretation }
    })
  } catch {
    return candidates
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
