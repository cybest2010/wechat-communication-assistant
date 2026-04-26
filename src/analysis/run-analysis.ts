import 'dotenv/config'
import { exportAllMessages } from '../data/weflow-client'
import { buildProfile } from './profile-builder'

async function main() {
  console.log('开始分析历史消息...')
  const messages = await exportAllMessages()
  console.log(`获取到 ${messages.length} 条消息`)

  const report = buildProfile(messages)
  console.log('\n分析完成：')
  console.log(`  总消息数：${report.totalMessages}`)
  console.log(`  已归档样本：${report.samplesArchived} 条`)
  console.log(`  风格已更新：${report.styleUpdated}`)

  if (report.weaknessCandidates.length > 0) {
    console.log('\n发现以下沟通弱项（需要你确认）：')
    for (const w of report.weaknessCandidates) {
      console.log(`  [${w.id}] ${w.name}（出现 ${w.count} 次）`)
    }
    console.log('\n请通过 UI 确认或在 API 中调用 /api/profile/weakness/confirm')
  } else {
    console.log('未发现明显弱项')
  }
}

main().catch(console.error)
