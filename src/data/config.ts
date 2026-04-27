import fs from 'fs'
import path from 'path'

export interface WeFlowConfig {
  apiUrl: string
  accessToken: string
}

const CONFIG_PATH = path.join(process.cwd(), 'data', 'weflow-config.json')

function readConfigFile(): Partial<WeFlowConfig> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    }
  } catch {
    // ignore parse errors, fall through to defaults
  }
  return {}
}

function writeConfigFile(cfg: WeFlowConfig): void {
  const dir = path.dirname(CONFIG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8')
}

let cached: WeFlowConfig | null = null

export function getWeFlowConfig(): WeFlowConfig {
  if (!cached) {
    const file = readConfigFile()
    cached = {
      apiUrl: file.apiUrl ?? process.env.WEFLOW_API_URL ?? 'http://localhost:5031',
      accessToken: file.accessToken ?? process.env.WEFLOW_ACCESS_TOKEN ?? '',
    }
  }
  return cached
}

export function updateWeFlowConfig(patch: Partial<WeFlowConfig>): WeFlowConfig {
  const current = getWeFlowConfig()
  cached = { ...current, ...patch }
  writeConfigFile(cached)
  return cached
}
