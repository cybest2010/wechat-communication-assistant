import axios from 'axios'
import { Message } from '../types'

const BASE_URL = process.env.WEFLOW_API_URL || 'http://localhost:3000'
const API_KEY = process.env.WEFLOW_API_KEY || ''

const client = axios.create({
  baseURL: BASE_URL,
  headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
  timeout: 10000,
})

export interface WeFlowMessage {
  id: string
  talkerId: string
  talkerName: string
  content: string
  type: number
  timestamp: number
  isSelf: boolean
  isRecalled?: boolean
}

export interface WeFlowContact {
  id: string
  name: string
  alias?: string
  isRoom: boolean
}

// 获取最新消息（轮询用）
export async function getLatestMessages(since?: number): Promise<WeFlowMessage[]> {
  try {
    const params = since ? { since } : {}
    const res = await client.get('/messages', { params })
    return res.data?.messages ?? []
  } catch (err) {
    console.error('[WeFlow] getLatestMessages failed:', err)
    return []
  }
}

// 获取某个联系人的历史消息
export async function getHistoryMessages(contactId: string, limit = 20): Promise<Message[]> {
  try {
    const res = await client.get(`/messages/${contactId}`, { params: { limit } })
    const raw: WeFlowMessage[] = res.data?.messages ?? []
    return raw.map(m => ({
      id: m.id,
      contactId: m.talkerId,
      contactName: m.talkerName,
      content: m.content,
      sender: m.isSelf ? 'user' : 'contact',
      timestamp: m.timestamp,
      isRecalled: m.isRecalled,
    }))
  } catch (err) {
    console.error('[WeFlow] getHistoryMessages failed:', err)
    return []
  }
}

// 导出全量历史消息（用于初始化分析）
export async function exportAllMessages(contactId?: string): Promise<Message[]> {
  try {
    const params = contactId ? { contactId } : {}
    const res = await client.get('/messages/export', { params })
    const raw: WeFlowMessage[] = res.data?.messages ?? []
    return raw.map(m => ({
      id: m.id,
      contactId: m.talkerId,
      contactName: m.talkerName,
      content: m.content,
      sender: m.isSelf ? 'user' : 'contact',
      timestamp: m.timestamp,
      isRecalled: m.isRecalled,
    }))
  } catch (err) {
    console.error('[WeFlow] exportAllMessages failed:', err)
    return []
  }
}

// 获取联系人列表
export async function getContacts(): Promise<WeFlowContact[]> {
  try {
    const res = await client.get('/contacts')
    return res.data?.contacts ?? []
  } catch (err) {
    console.error('[WeFlow] getContacts failed:', err)
    return []
  }
}

// 将原始 WeFlow 消息转为内部格式
export function normalizeMessage(m: WeFlowMessage): Message {
  return {
    id: m.id,
    contactId: m.talkerId,
    contactName: m.talkerName,
    content: m.content,
    sender: m.isSelf ? 'user' : 'contact',
    timestamp: m.timestamp,
    isRecalled: m.isRecalled,
  }
}
