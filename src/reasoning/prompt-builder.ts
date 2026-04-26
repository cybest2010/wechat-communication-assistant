import { ContextPackage, UserProfile, WeaknessId, WEAKNESSES } from '../types'
import { getProfile } from '../data/storage'

const GOAL_LABELS: Record<string, string> = {
  agree: '答应对方',
  decline: '婉拒对方',
  advance: '推进这件事',
  maintain: '维持关系，不激化',
  casual: '随便回一下',
}

export function buildPrompt(message: string, ctx: ContextPackage): string {
  const profile = getProfile()

  const weaknessDesc = ctx.weaknesses.length > 0
    ? ctx.weaknesses.map(w => `${w} ${WEAKNESSES[w].name}：${WEAKNESSES[w].description}`).join('、')
    : '暂无已识别的沟通弱项'

  const samplesText = ctx.samples.length > 0
    ? ctx.samples.map(s => `· ${s}`).join('\n')
    : '（暂无样本）'

  const historyText = ctx.history.slice(-15).map(m =>
    `${m.sender === 'user' ? '我' : '对方'}：${m.content}`
  ).join('\n')

  const skillSection = ctx.skill ? `
[沟通框架参考 · 来自${ctx.skill.title}]
${ctx.skill.content}
` : ''

  return `你是用户的沟通助手。根据以下完整上下文，生成回复建议。

[用户画像]
风格特征：说话偏${profile.style.avgLength <= 10 ? '简短' : '正常'}，${profile.style.usePeriod ? '使用句号' : '不用句号'}，emoji 频率${profile.style.emojiFrequency}
常用词：${profile.style.commonWords.slice(0, 10).join('、') || '暂无'}
沟通弱项：${weaknessDesc}
最佳状态样本（模仿这些风格，不要模仿弱点）：
${samplesText}

[场合与关系]
场合：${ctx.occasion}
关系：${ctx.relationship}

[对话历史]
${historyText || '（无历史记录）'}

[当前消息]
对方说：${message}

[用户目标]
${GOAL_LABELS[ctx.userGoal] || '随便回一下'}
${skillSection}
[要求]
- 回复必须符合用户的说话风格（参考最佳状态样本的语气、长度、用词）
- 不要用"当然、非常、您好、感谢、明白了、没问题、我会尽快、温馨提示、欢迎随时、请您"等词
- 不要写得太完整工整，越自然越好
- 每条回复控制在 ${Math.max(8, profile.style.avgLength + 5)} 字以内

请严格按以下格式输出，不要输出其他内容：

局势分析：（1~2句，说清楚这件事的处境和风险）
弱项提示：（如触发用户弱项，写一句提醒；否则写"无"）
框架建议：（如有沟通框架，写1句核心策略；否则写"无"）
推荐：[回复文字]||[一句理由]
备选A：[回复文字]||[方向说明]
备选B：[回复文字]||[方向说明]
避免1：[表达方式]||[原因]
避免2：[表达方式]||[原因]`
}
