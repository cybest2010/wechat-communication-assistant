import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import { Skill } from '../types'
import { loadSkill } from './skill-loader'

const SKILLS_DIR = path.join(process.cwd(), 'skills')

class SkillRegistry {
  private skills: Map<string, Skill> = new Map()

  load() {
    if (!fs.existsSync(SKILLS_DIR)) return
    this.skills.clear()

    const dirs = fs.readdirSync(SKILLS_DIR)
    for (const dir of dirs) {
      const fullPath = path.join(SKILLS_DIR, dir)
      if (!fs.statSync(fullPath).isDirectory()) continue

      const skill = loadSkill(fullPath)
      if (skill) {
        this.skills.set(skill.name, skill)
        console.log(`[SkillRegistry] Loaded: ${skill.name}`)
      }
    }
    console.log(`[SkillRegistry] ${this.skills.size} skills loaded`)
  }

  // 监听 skills 目录变化，热加载
  watch() {
    chokidar.watch(SKILLS_DIR, { depth: 2 }).on('change', (filePath) => {
      if (filePath.endsWith('SKILL.md')) {
        const skillDir = path.dirname(filePath)
        const skill = loadSkill(skillDir)
        if (skill) {
          this.skills.set(skill.name, skill)
          console.log(`[SkillRegistry] Reloaded: ${skill.name}`)
        }
      }
    })
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  all(): Skill[] {
    return Array.from(this.skills.values())
  }

  summary(): Array<{ name: string; title: string; scenes: string[] }> {
    return this.all().map(s => ({ name: s.name, title: s.title, scenes: s.scenes }))
  }
}

export const registry = new SkillRegistry()
