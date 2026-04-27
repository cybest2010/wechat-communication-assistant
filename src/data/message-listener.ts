import http from 'http'
import https from 'https'
import { WeFlowSSEMessage, normalizeSSEMessage, getSSEUrl } from './weflow-client'
import { Message } from '../types'

type MessageHandler = (message: Message) => void

class MessageListener {
  private handlers: MessageHandler[] = []
  private connected: boolean = false
  private req?: http.ClientRequest
  private reconnectTimer?: NodeJS.Timeout
  private seenIds = new Set<string>()

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler)
  }

  start() {
    if (this.connected) {
      console.log('[MessageListener] Already connected')
      return
    }
    this.connect()
  }

  stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    if (this.req) {
      this.req.destroy()
      this.req = undefined
    }
    this.connected = false
    console.log('[MessageListener] Stopped')
  }

  /** Stop the current connection and immediately reconnect with fresh config. */
  restart() {
    console.log('[MessageListener] Restarting with updated config...')
    this.stop()
    this.connect()
  }

  private connect() {
    const sseUrl = getSSEUrl()
    console.log(`[MessageListener] Connecting to SSE: ${sseUrl}`)

    const url = new URL(sseUrl)
    const lib = url.protocol === 'https:' ? https : http

    this.req = lib.get(sseUrl, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[MessageListener] SSE connect failed: HTTP ${res.statusCode}`)
        res.destroy()
        this.scheduleReconnect()
        return
      }

      console.log('[MessageListener] SSE connected')
      this.connected = true

      let buffer = ''
      let eventName = ''

      res.setEncoding('utf8')

      res.on('data', (chunk: string) => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim()
            this.handleEvent(eventName, dataStr)
            eventName = ''
          }
          if (line === '') {
            eventName = ''
          }
        }
      })

      res.on('end', () => {
        console.log('[MessageListener] SSE connection closed, reconnecting...')
        this.connected = false
        this.scheduleReconnect()
      })

      res.on('error', (err) => {
        console.error('[MessageListener] SSE stream error:', err.message)
        this.connected = false
        this.scheduleReconnect()
      })
    })

    this.req.on('error', (err) => {
      console.error('[MessageListener] SSE request error:', err.message)
      this.connected = false
      this.scheduleReconnect()
    })
  }

  private handleEvent(eventName: string, dataStr: string) {
    if (eventName !== 'message.new') return

    try {
      const data: WeFlowSSEMessage = JSON.parse(dataStr)

      if (this.seenIds.has(data.rawid)) return
      this.seenIds.add(data.rawid)
      if (this.seenIds.size > 1000) {
        const arr = Array.from(this.seenIds)
        this.seenIds = new Set(arr.slice(arr.length - 500))
      }

      const msg = normalizeSSEMessage(data)
      console.log(`[MessageListener] New message from ${msg.contactName}: ${msg.content.slice(0, 30)}`)

      this.handlers.forEach(handler => {
        try {
          handler(msg)
        } catch (err) {
          console.error('[MessageListener] Handler error:', err)
        }
      })
    } catch (err) {
      console.error('[MessageListener] Failed to parse SSE data:', dataStr)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, 3000)
  }
}

export const messageListener = new MessageListener()
