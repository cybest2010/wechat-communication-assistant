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
    `${AI_API_URL}/v1/messages`,
    {
      model: AI_MODEL,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': AI_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 30000,
    }
  )

  return response.data?.content?.[0]?.text || ''
}
