import { getProfile } from '../data/storage'

const AI_BLACKLIST = [
  '当然', '非常', '您好', '感谢您', '明白了', '没问题', '我会尽快',
  '温馨提示', '欢迎随时', '请您', '祝您', '不客气', '您的', '收到您',
]

export function isHumanEnough(text: string): boolean {
  // 黑名单词检测
  for (const word of AI_BLACKLIST) {
    if (text.includes(word)) return false
  }

  // 长度检测
  const profile = getProfile()
  const maxLen = profile.style.avgLength * 2.5
  if (text.length > maxLen) return false

  // 结构完整度检测（有主谓宾 + 标点结尾 = 太像 AI）
  if (/[\u4e00-\u9fa5]{3,}[，,][\u4e00-\u9fa5]{3,}[，,][\u4e00-\u9fa5]{3,}[。！]$/.test(text)) {
    return false
  }

  return true
}

export function humanScore(text: string): number {
  let score = 100
  const profile = getProfile()

  for (const word of AI_BLACKLIST) {
    if (text.includes(word)) score -= 20
  }

  const maxLen = profile.style.avgLength * 2
  if (text.length > maxLen) score -= 15

  if (text.endsWith('。')) score -= 10

  // 包含用户常用词加分
  for (const word of profile.style.commonWords.slice(0, 10)) {
    if (text.includes(word)) score += 5
  }

  return Math.max(0, Math.min(100, score))
}
