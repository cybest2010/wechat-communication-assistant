import { Message } from '../types'
import { addSample } from '../data/storage'

// 判断一条消息是否是「最佳状态」的回复
function isBestState(
  msgIndex: number,
  messages: Message[]
): boolean {
  const msg = messages[msgIndex]
  if (msg.sender !== 'user' || msg.content.length === 0) return false

  // 用户没有撤回
  if (msg.isRecalled) return false

  // 用户没有在之后 5 分钟内补充解释
  const next = messages.slice(msgIndex + 1, msgIndex + 4)
  const quickFollowUp = next.find(
    m => m.sender === 'user' && m.timestamp - msg.timestamp < 300000
  )
  if (quickFollowUp) return false

  // 对方在 2 小时内有正常回复
  const contactReplied = messages.slice(msgIndex + 1, msgIndex + 6).find(
    m => m.sender === 'contact' && m.timestamp - msg.timestamp < 7200000
  )
  if (!contactReplied) return false

  // 对方回复不是追问（不包含问号）
  if (contactReplied.content.includes('？') || contactReplied.content.includes('?')) return false

  return true
}

// 推断消息所属场景
function inferScene(content: string): string {
  if (/不行了?|不去了?|没空|有事|帮不了|改天/.test(content)) return 'rejection'
  if (/好的?|行|可以|没问题|收到/.test(content)) return 'agreement'
  if (/明白|了解|知道了|收到|好的/.test(content)) return 'workplace'
  if (/哈哈|😄|😂|🤣/.test(content)) return 'casual'
  if (/辛苦|加油|没事|会好的|你行的/.test(content)) return 'emotional'
  return 'casual'
}

// 从历史消息中归档最佳状态样本
export function archiveBestSamples(messages: Message[]) {
  let archived = 0
  for (let i = 0; i < messages.length; i++) {
    if (isBestState(i, messages)) {
      const scene = inferScene(messages[i].content)
      addSample(scene, messages[i].content)
      archived++
    }
  }
  return archived
}
