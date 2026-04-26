import { getLatestMessages, normalizeMessage } from './weflow-client'
import { Message } from '../types'

type MessageHandler = (message: Message) => void

class MessageListener {
  private handlers: MessageHandler[] = []
  private lastTimestamp: number = Date.now()
  private polling: boolean = false
  private intervalId?: NodeJS.Timeout

  // 注册消息处理器
  onMessage(handler: MessageHandler) {
    this.handlers.push(handler)
  }

  // 开始监听
  start(pollIntervalMs: number = 2000) {
    if (this.polling) {
      console.log('[MessageListener] Already polling')
      return
    }

    console.log('[MessageListener] Starting to poll...')
    this.polling = true

    this.intervalId = setInterval(async () => {
      await this.poll()
    }, pollIntervalMs)

    // 立即执行一次
    this.poll()
  }

  // 停止监听
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
    this.polling = false
    console.log('[MessageListener] Stopped polling')
  }

  // 轮询新消息
  private async poll() {
    try {
      const messages = await getLatestMessages(this.lastTimestamp)

      if (messages.length === 0) return

      // 过滤掉自己发的消息，只处理对方发来的
      const incomingMessages = messages.filter(m => !m.isSelf)

      for (const rawMsg of incomingMessages) {
        const msg = normalizeMessage(rawMsg)

        // 更新最后时间戳
        if (rawMsg.timestamp > this.lastTimestamp) {
          this.lastTimestamp = rawMsg.timestamp
        }

        // 通知所有处理器
        this.handlers.forEach(handler => {
          try {
            handler(msg)
          } catch (err) {
            console.error('[MessageListener] Handler error:', err)
          }
        })
      }

      if (incomingMessages.length > 0) {
        console.log(`[MessageListener] Received ${incomingMessages.length} new message(s)`)
      }
    } catch (err) {
      console.error('[MessageListener] Poll error:', err)
    }
  }

  // 重置时间戳（用于重新开始）
  reset() {
    this.lastTimestamp = Date.now()
  }
}

export const messageListener = new MessageListener()
