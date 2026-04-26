# 微信沟通助手 · 终版设计文档

> 不是文字助手（帮你写），不是风格模仿器（学你说话），而是**沟通顾问**（帮你想清楚怎么处理）+ **表达润色**（用自然语气说出来）。

---

## 一、设计原则（第一性原理）

### 核心问题
用户的根本需求是：**在微信上把一件事处理好**，而不仅仅是"发一条消息"。

### 三层拆解

| 层次 | 问题 | 系统做什么 |
|------|------|-----------|
| 想清楚 | 这件事怎么处理最合适？ | 局势分析 + 意图识别 + 场景评估 |
| 说清楚 | 用什么方式表达？ | 目标导向的方向选择 |
| 像自己 | 让 AI 回复有自己的味道？ | 个人风格画像 + 弱项规避 + 样本注入 |

---

## 二、系统架构

```
微信消息（WeFlow SSE）
        │
        ▼
┌───────────────────┐
│  消息监听层        │  src/data/message-listener.ts
│  SSE 长连接 + 去重 │  → WeFlow /api/v1/push/messages
└────────┬──────────┘
         │ WebSocket 推送
         ▼
┌───────────────────┐
│  Web UI 前端       │  src/ui/public/index.html
│  自动模式 / 手动   │
└────────┬──────────┘
         │ POST /api/suggest
         ▼
┌─────────────────────────────────────────┐
│              推理引擎                    │
│                                         │
│  1. Context Builder                     │  buildContext()
│     ├─ 获取联系人画像（场合/关系）       │
│     ├─ 获取历史消息（WeFlow REST API）   │
│     ├─ 意图提取（轻量 AI 调用）          │  extractIntent()
│     └─ Skill 路由                       │  routeSkill()
│                                         │
│  2. Prompt Builder                      │  buildPrompt()
│     ├─ 注入用户画像（风格/弱项/样本）    │
│     ├─ 注入 Skill 内容（如有）          │
│     └─ 组装结构化提示词                  │
│                                         │
│  3. AI Client                           │  callAI()
│     └─ OpenAI 兼容接口（/v1/chat/...）  │
│                                         │
│  4. Human Checker                       │  humanScore()
│     └─ 人味评分，不达标则重试（最多2次） │
└────────┬────────────────────────────────┘
         │
         ▼
┌───────────────────┐
│  结构化输出        │
│  AssistantResult  │
│  ├─ situationAnalysis  局势分析         │
│  ├─ intent / emotion   场景标签         │
│  ├─ weaknessTip        弱项提示         │
│  ├─ frameworkTip       Skill 策略       │
│  ├─ replies[3]         回复建议         │
│  └─ avoid[2]           建议避免说       │
└───────────────────┘
```

---

## 三、核心模块说明

### 3.1 消息监听（message-listener.ts）

- 连接 WeFlow SSE 地址：`GET /api/v1/push/messages?access_token=xxx`
- 监听 `message.new` 事件，过滤 `message.revoke`
- 按 `rawid` 去重，防止重复触发
- 断线后 3 秒自动重连
- 通过 WebSocket 实时推送到浏览器

### 3.2 用户画像（profile）

```
画像结构：
├─ style
│   ├─ avgLength       平均回复字数
│   ├─ commonWords     高频词列表
│   ├─ emojiFrequency  emoji 使用频率
│   ├─ usePeriod       是否习惯用句号
│   └─ byOccasion      各场合的风格差异
└─ weaknesses          已确认的沟通弱项列表 [W01~W08]
```

**8 类沟通弱项：**

| ID | 名称 | 检测信号 |
|----|------|---------|
| W01 | 冲动表达 | 撤回率高，事后解释多 |
| W02 | 不会拒绝 | 先答应后找借口反悔 |
| W03 | 过度道歉 | 道歉词密度异常高 |
| W04 | 冲突逃避 | 冲突类消息回复率低 |
| W05 | 表达不清 | 对方频繁追问同一件事 |
| W06 | 情感生硬 | 关心类表达后对方反应平淡 |
| W07 | 防御解释 | 解释性句式比例高 |
| W08 | 回避想法 | 「随便/都行」频率异常高 |

**画像构建流程：**
1. 手动触发「分析历史消息」→ 调用 WeFlow REST API 导出全量消息
2. `weakness-detector` 检测弱项候选（不直接写入，需用户确认）
3. `sample-archiver` 识别「最佳状态」样本并归档
4. 用户在 UI 确认/忽略每个弱项候选

### 3.3 Skill 系统

每个 Skill 是一个目录，包含 `SKILL.md`：

```yaml
---
name: never-split-difference
title: 永不妥协
description: 克里斯·沃斯的谈判技巧，适用于协商/拒绝场景
version: 1.0.0
scenes:
  - negotiation
  - conflict
  - request
occasions:
  - workplace
  - business
relatedWeaknesses:
  - W02
  - W04
priority: high
emotionThreshold: any
---

[Skill 正文内容，注入到 Prompt 中作为策略参考]
```

**路由逻辑（skill-router.ts）：**
- 匹配意图 `scene` + 场合 `occasion`
- 如用户有对应弱项，优先级提升
- 情绪门槛（emotionThreshold）过滤

### 3.4 样本系统（反馈回路）

**最佳状态样本**的判定条件（sample-archiver.ts）：
1. 是用户发的消息（isSend = true）
2. 没有被撤回
3. 5 分钟内没有补充解释
4. 对方 2 小时内正常回复
5. 对方的回复不包含追问（不含问号）

**手动反馈回路：**
用户在 UI 点击"复制"某条回复 → 自动调用 `/api/sample/save` 存为当前场景样本 → 下次生成时注入 Prompt。

### 3.5 人味检测（human-checker.ts）

打分维度（满分 100）：
- AI 黑名单词命中 → 每次 -20（如"当然"、"感谢您"、"温馨提示"等）
- 超过平均字数 2 倍 → -15
- 以句号结尾 → -10
- 包含用户常用词 → 每个 +5

分数 < 50 时重新生成，最多重试 2 次。

---

## 四、数据流

### 4.1 自动模式

```
WeFlow 收到消息
    → SSE 推送到 message-listener
    → WebSocket 推送到浏览器
    → 用户点击消息（仅展示，不分析）
    → 用户选择场合 + 目标
    → 点击"生成回复建议"
    → POST /api/suggest
    → 推理引擎处理
    → 渲染结果
    → 用户点击"复制"
    → 反馈回路（存样本 + 记录行为）
```

### 4.2 手动模式

```
用户粘贴消息文本
    → 选择场合 + 目标
    → 点击"生成回复建议"
    → POST /api/suggest（contactId = "manual"）
    → 推理引擎处理（无历史记录）
    → 渲染结果
```

---

## 五、API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/suggest` | 生成回复建议，body: `{ contactId, message, goal, occasion }` |
| GET  | `/api/contacts` | 联系人列表 |
| GET  | `/api/contacts/:id` | 获取单个联系人 |
| POST | `/api/contacts` | 创建/更新联系人 |
| GET  | `/api/profile` | 获取用户画像 |
| POST | `/api/profile/analyze` | 触发历史消息分析，返回 AnalysisReport |
| POST | `/api/profile/weakness/confirm` | 确认弱项 |
| POST | `/api/profile/weakness/dismiss` | 忽略弱项 |
| POST | `/api/feedback` | 记录用户行为反馈 |
| POST | `/api/sample/save` | 保存回复为最佳样本 |
| GET  | `/api/skills` | 获取已加载的 Skill 列表 |
| POST | `/api/listener/start` | 启动消息监听 |
| POST | `/api/listener/stop` | 停止消息监听 |

---

## 六、环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WEFLOW_API_URL` | WeFlow 服务地址 | `http://localhost:5031` |
| `WEFLOW_ACCESS_TOKEN` | WeFlow Access Token | 空 |
| `AI_API_URL` | AI API 地址（OpenAI 兼容，不含 /v1） | `https://api.openai.com` |
| `AI_API_KEY` | AI API Key | 空 |
| `AI_MODEL` | 模型名称 | `claude-sonnet-4-6` |
| `PORT` | Web 服务端口 | `8080` |

---

## 七、目录结构

```
wechat-communication-assistant/
├─ src/
│   ├─ index.ts                  入口：加载 Skill、启动服务
│   ├─ types.ts                  全局类型定义
│   ├─ data/
│   │   ├─ storage.ts            本地 JSON 存储（画像/联系人/样本/反馈）
│   │   ├─ weflow-client.ts      WeFlow REST API + SSE 地址构建
│   │   └─ message-listener.ts  SSE 长连接监听 + 断线重连
│   ├─ analysis/
│   │   ├─ weakness-detector.ts  弱项检测算法
│   │   ├─ sample-archiver.ts    最佳样本归档算法
│   │   ├─ profile-builder.ts    画像构建入口
│   │   └─ run-analysis.ts       CLI 分析脚本
│   ├─ reasoning/
│   │   ├─ ai-client.ts          OpenAI 兼容 API 封装
│   │   ├─ intent-extractor.ts   意图 + 情绪提取（轻量 AI）
│   │   ├─ context-builder.ts    上下文组装
│   │   ├─ prompt-builder.ts     Prompt 构建
│   │   ├─ human-checker.ts      人味评分
│   │   └─ assistant.ts          主推理入口
│   ├─ skill/
│   │   ├─ skill-loader.ts       SKILL.md 解析
│   │   ├─ skill-registry.ts     Skill 注册 + 热加载
│   │   └─ skill-router.ts       场景路由
│   └─ ui/
│       ├─ server.ts             Express + WebSocket 服务
│       └─ public/index.html     Web 前端
├─ skills/                       沟通技能库目录
│   ├─ never-split-difference/   《永不妥协》谈判技巧
│   ├─ nonviolent-communication/ 非暴力沟通
│   ├─ crucial-conversations/    关键对话
│   ├─ managing-up/              向上管理
│   └─ boundary-setting/         边界设定
├─ data/                         运行时数据（git 忽略）
│   ├─ profile.json
│   ├─ contacts/
│   ├─ samples/
│   └─ feedback/
└─ docs/
    └─ DESIGN.md                 本文档
```

---

## 八、扩展 Skill

在 `skills/` 下新建目录，添加 `SKILL.md`：

```markdown
---
name: your-skill-name
title: 书名或技能名
description: 一句话说明适用场景
version: 1.0.0
scenes:
  - conflict   # 适用场景（可多个）
occasions:
  - workplace  # 适用场合
relatedWeaknesses:
  - W04        # 关联弱项
priority: medium   # high / medium / low
emotionThreshold: negative   # any / negative / urgent
---

[在此写入 Skill 内容，3~5 条核心原则即可，过长影响推理质量]
```

保存后自动热加载，无需重启服务。
