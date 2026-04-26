import fs from 'fs'
import path from 'path'
import { UserProfile, ContactInfo, SampleStore } from '../types'

const DATA_DIR = path.join(process.cwd(), 'data')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

// --- User Profile ---

const PROFILE_PATH = path.join(DATA_DIR, 'profile.json')

const DEFAULT_PROFILE: UserProfile = {
  style: {
    avgLength: 12,
    commonWords: [],
    emojiFrequency: 'medium',
    usePeriod: false,
    byOccasion: {},
  },
  weaknesses: [],
  updatedAt: new Date().toISOString(),
}

export function getProfile(): UserProfile {
  return readJson(PROFILE_PATH, DEFAULT_PROFILE)
}

export function saveProfile(profile: UserProfile) {
  profile.updatedAt = new Date().toISOString()
  writeJson(PROFILE_PATH, profile)
}

// --- Contacts ---

const CONTACTS_DIR = path.join(DATA_DIR, 'contacts')

export function getContact(id: string): ContactInfo | null {
  const filePath = path.join(CONTACTS_DIR, `${id}.json`)
  return readJson<ContactInfo | null>(filePath, null)
}

export function saveContact(contact: ContactInfo) {
  const filePath = path.join(CONTACTS_DIR, `${contact.id}.json`)
  writeJson(filePath, contact)
}

export function getAllContacts(): ContactInfo[] {
  ensureDir(CONTACTS_DIR)
  return fs.readdirSync(CONTACTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => readJson<ContactInfo>(path.join(CONTACTS_DIR, f), null as unknown as ContactInfo))
    .filter(Boolean)
}

// --- Samples ---

const SAMPLES_DIR = path.join(DATA_DIR, 'samples')

export function getSamples(scene: string): string[] {
  const filePath = path.join(SAMPLES_DIR, `${scene}.json`)
  const store = readJson<SampleStore | null>(filePath, null)
  return store?.samples ?? []
}

export function saveSamples(scene: string, samples: string[]) {
  const filePath = path.join(SAMPLES_DIR, `${scene}.json`)
  const store: SampleStore = { scene, samples, updatedAt: new Date().toISOString() }
  writeJson(filePath, store)
}

export function addSample(scene: string, sample: string) {
  const samples = getSamples(scene)
  if (!samples.includes(sample)) {
    const updated = [sample, ...samples].slice(0, 20) // 最多保留 20 条
    saveSamples(scene, updated)
  }
}

// --- Feedback ---

const FEEDBACK_PATH = path.join(DATA_DIR, 'feedback', 'history.json')

export interface FeedbackEntry {
  timestamp: number
  contactId: string
  scene: string
  intent: string
  chosenDirection: string
  wasRecommended: boolean
  notLikeMe: boolean
}

export function addFeedback(entry: FeedbackEntry) {
  const history = readJson<FeedbackEntry[]>(FEEDBACK_PATH, [])
  history.unshift(entry)
  writeJson(FEEDBACK_PATH, history.slice(0, 500))
}

export function getFeedbackHistory(): FeedbackEntry[] {
  return readJson<FeedbackEntry[]>(FEEDBACK_PATH, [])
}

// 根据反馈历史推断某场景下用户倾向选择/不选的回复方向
// 实现「长期不复制某方向 → 降低该方向在此场景权重」的反馈闭环
export function getScenePreferences(scene: string): { preferred: string[]; avoided: string[] } {
  const history = getFeedbackHistory()

  // 统计该场景下各方向被选中的次数
  const dirCount: Record<string, number> = {}
  for (const entry of history) {
    if (entry.scene !== scene || entry.notLikeMe || !entry.chosenDirection) continue
    dirCount[entry.chosenDirection] = (dirCount[entry.chosenDirection] || 0) + 1
  }

  // 出现 2 次以上的方向视为用户偏好方向
  const preferred = Object.entries(dirCount)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dir]) => dir)

  // 被明确标记「不像我」的方向视为应避免方向
  const avoidedSet = new Set<string>()
  for (const entry of history) {
    if (entry.scene === scene && entry.notLikeMe && entry.chosenDirection) {
      avoidedSet.add(entry.chosenDirection)
    }
  }
  const avoided = [...avoidedSet].slice(0, 3)

  return { preferred, avoided }
}
