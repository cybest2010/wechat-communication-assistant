import axios, { AxiosInstance } from 'axios'
import { Message } from '../types'
import { getWeFlowConfig } from './config'

// SSE 推送的消息格式（message.new / message.revoke 事件）
export interface WeFlowSSEMessage {
  sessionId: string
  sessionType: string
  rawid: string
  avatarUrl: string
  sourceName: string
  groupName?: string
  content: string
  timestamp: number
}

// REST API 的历史消息格式
export interface WeFlowHistoryMessage {
  localId: string
  serverId?: string
  sessionId?: string
  createTime: number
  isSend: boolean
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

let client: AxiosInstance = buildClient()

function buildClient(): AxiosInstance {
  const { apiUrl, accessToken } = getWeFlowConfig()
  return axios.create({
    baseURL: apiUrl,
    params: accessToken ? { access_token: accessToken } : {},
    timeout: 10000,
  })
}

/** Call this after updating WeFlow config to apply the new URL / token. */
export function refreshClient(): void {
  client = buildClient()
}

export function normalizeSSEMessage(m: WeFlowSSEMessage): Message {
  const contactId = m.sessionId
  const contactName = m.groupName ? `${m.groupName} - ${m.sourceName}` : m.sourceName
  return {
    id: m.rawid,
    contactId,
    contactName,
    content: m.content,
    sender: 'contact',
    timestamp: m.timestamp * 1000,
    isRecalled: false,
  }
}

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

export async function exportAllMessages(sessionId?: string): Promise<Message[]> {
  try {
    const params = sessionId ? { sessionId } : {}
    const res = await client.get('/api/v1/messages', { params })
    const raw: WeFlowHistoryMessage[] = res.data?.messages ?? []
    return raw.map(m => ({
      id: m.localId,
      contactId: sessionId ?? m.sessionId ?? m.senderUsername,
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

export async function getContacts(): Promise<WeFlowContact[]> {
  try {
    const res = await client.get('/api/v1/contacts')
    return res.data?.contacts ?? []
  } catch (err) {
    console.error('[WeFlow] getContacts failed:', err)
    return []
  }
}

export function getSSEUrl(): string {
  const { apiUrl, accessToken } = getWeFlowConfig()
  const url = new URL('/api/v1/push/messages', apiUrl)
  if (accessToken) url.searchParams.set('access_token', accessToken)
  return url.toString()
}
