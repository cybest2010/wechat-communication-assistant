import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { Skill, SkillMeta, SceneType, Occasion, WeaknessId } from '../types'

export function loadSkill(skillDir: string): Skill | null {
  const filePath = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(filePath)) return null

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const { data, content } = matter(raw)

    const meta: SkillMeta = {
      name: data.name,
      title: data.title || data.name,
      description: data.description || '',
      version: data.version || '1.0',
      scenes: (data.scenes || []) as SceneType[],
      occasions: (data.occasions || []) as Occasion[],
      relatedWeaknesses: (data['related-weaknesses'] || []) as WeaknessId[],
      priority: data.priority || 'medium',
      emotionThreshold: data['emotion-threshold'] || 'any',
    }

    return { ...meta, content: content.trim() }
  } catch (err) {
    console.error(`[SkillLoader] Failed to load ${filePath}:`, err)
    return null
  }
}
