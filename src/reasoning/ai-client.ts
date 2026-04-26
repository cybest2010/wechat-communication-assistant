import axios from 'axios'

const AI_API_URL = process.env.AI_API_URL || 'https://api.anthropic.com'
const AI_API_KEY = process.env.AI_API_KEY || ''
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6'

interface AIOptions {
  maxTokens?: number
  temperature?: number
}

export async function callAI(prompt: string, options: AIOptions = {}): Promise<string> {
  const { maxTokens = 1000, temperature = 0.7 } = options

  const response = await axios.post(
    `${AI_API_URL}/v1/chat/completions`,
    {
      model: AI_MODEL,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  )

  return response.data?.choices?.[0]?.message?.content || ''
}
