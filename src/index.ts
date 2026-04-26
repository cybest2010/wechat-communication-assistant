import 'dotenv/config'
import { registry } from './skill/skill-registry'
import { startServer } from './ui/server'

// 加载所有 Skill
registry.load()
registry.watch()

// 启动 Web 服务
const port = parseInt(process.env.PORT || '8080', 10)
startServer(port)
