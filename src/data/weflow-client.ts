import axios from 'axios'
import { Message } from '../types'

const BASE_URL = process.env.WEFLOW_API_URL || 'http://localhost:5031'
const ACCESS_TOKEN = process.env.WEFLOW_ACCESS_TOKEN || ''

const client = axios.create({
  baseURL: BASE_URL,
  params: ACCESS_TOKEN ? { access_token: ACCESS_TOKEN } : {},
  timeout: 10000,
})

// SSE 推送的消息格式（message.new / message.revoke 事件）
export interface WeFlowSSEMessage {
  sessionId: string
  sessionType: string       // 'private' | 'group'
  rawid: string             // 去重用
  avatarUrl: string
  sourceName: string        // 私聊：发送者名；群聊：发送者名
  groupName?: string        // 群聊时有
  content: string
  timestamp: number         // 秒级 Unix 时间戳
}

// REST API 的历史消息格式
export interface WeFlowHistoryMessage {
  localId: string
  serverId?: string
  createTime: number        // 秒级 Unix 时间戳
  isSend: boolean           // true = 自己发的
  senderUsername: string
  content: string
  rawContent?: string
}

export interface WeFlowContact {
  id: string
  name: string
  alias?: string
  isRoom: boolean
}

// 将 SSE 消息转为内部格式
export function normalizeSSEMessage(m: WeFlowSSEMessage): Message {
  const contactId = m.sessionId
  const contactName = m.groupName ? `${m.groupName} - ${m.sourceName}` : m.sourceName
  return {
    id: m.rawid,
    contactId,
    contactName,
    content: m.content,
    sender: 'contact',
    timestamp: m.timestamp * 1000,  // 转为毫秒
    isRecalled: false,
  }
}

// 获取某会话的历史消息（REST API）
export async function getHistoryMessages(sessionId: string, limit = 20): Promise<Message[]> {
  try {
    const res = await client.get(`/api/v1/sessions/${sessionId}/messages`, { params: { limit } })
    const raw: WeFlowHistoryMessage[] = res.data?.messages ?? []
    return raw.map(m => ({
      id: m.localId,
      contactId: sessionId,
      contactName: m.senderUsername,
      content: m.content,
      sender: m.isSend ? 'user' : 'contact',
      timestamp: m.createTime * 1000,
      isRecalled: false,
    }))
  } catch (err) {
    console.error('[WeFlow] getHistoryMessages failed:', err)
    return []
  }
}

// 导出全量历史消息（用于初始化分析）
export async function exportAllMessages(sessionId?: string): Promise<Message[]> {
  try {
    const params = sessionId ? { sessionId } : {}
    const res = await client.get('/api/v1/messages', { params })
    const raw: WeFlowHistoryMessage[] = res.data?.messages ?? []
    return raw.map(m => ({
      id: m.localId,
      contactId: sessionId || m.senderUsername,
      contactName: m.senderUsername,
      content: m.content,
      sender: m.isSend ? 'user' : 'contact',
      timestamp: m.createTime * 1000,
      isRecalled: false,
    }))
  } catch (err) {
    console.error('[WeFlow] exportAllMessages failed:', err)
    return []
  }
}

// 获取联系人列表
export async function getContacts(): Promise<WeFlowContact[]> {
  try {
    const res = await client.get('/api/v1/contacts')
    return res.data?.contacts ?? []
  } catch (err) {
    console.error('[WeFlow] getContacts failed:', err)
    return []
  }
}

// 构建 SSE 推送地址
export function getSSEUrl(): string {
  const url = new URL('/api/v1/push/messages', BASE_URL)
  if (ACCESS_TOKEN) url.searchParams.set('access_token', ACCESS_TOKEN)
  return url.toString()
}
