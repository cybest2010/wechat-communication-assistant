# 微信沟通助手 · 完整设计文档

---

## 1. 产品定位

### 1.1 核心定义

```
用你的声音，说你最好状态下会说的话
```

### 1.2 三层能力

| 层次 | 能力 | 说明 |
|------|------|------|
| 识别 | 弱项系统 | 知道你在哪类场景容易出问题 |
| 策略 | Skill 路由 | 找到对应的沟通处理方法 |
| 表达 | 画像系统 | 用你自己的风格说出来 |

### 1.3 明确不是什么

```
不是  文字助手（帮你写）         → 会失去你自己
不是  风格模仿器（照抄你说话）   → 会复制你的缺陷
不是  沟通顾问（变成另一个人）   → 会失去个人风格
```

### 1.4 「最好状态的你」

```
同一个人，不同状态差别很大：

普通状态                      最好状态
────────────────             ────────────────
「行吧行吧，我去」             「这次帮你，下次你请我吃饭」
「不好意思不好意思」            「这次没空，下次吧」
「因为最近比较忙所以…」         「最近忙，周五前给你」

风格相同：简短、直接
差别在于：有没有底气，有没有说清楚

AI 的任务：找到你风格里最有效的那句话
```

---

## 2. 系统架构

### 2.1 整体分层

```
┌─────────────────────────────────────────────────────────┐
│                        数据层                             │
│           WeFlow API · 历史消息 · 本地存储                 │
├─────────────────────────────────────────────────────────┤
│                      分析层（离线）                        │
│         弱项识别 · 场合标注 · 样本归档 · 画像构建            │
├─────────────────────────────────────────────────────────┤
│                       Skill 层                           │
│       意图提取 · 多信号评分路由 · SKILL.md 注入             │
├─────────────────────────────────────────────────────────┤
│                       推理层                              │
│        上下文包构建 · 单次 AI 推理 · 人味质量检测            │
├─────────────────────────────────────────────────────────┤
│                       展示层                              │
│        局势分析 · 推荐回复 · 备选 · 避免项 · 反馈            │
└─────────────────────────────────────────────────────────┘
```

### 2.2 完整数据流

```
                   ┌──────────────┐
                   │  WeFlow API  │
                   └──────┬───────┘
                          │
             ┌────────────┴────────────┐
             │                         │
        实时消息（SSE）            历史消息（REST）
             │                         │
             ↓                         ↓
      ┌─────────────┐         ┌──────────────────┐
      │  消息监听    │         │    离线分析        │
      │  WebSocket  │         │  弱项识别          │
      │  推送到浏览器│         │  样本归档          │
      └──────┬──────┘         │  画像构建          │
             │                └────────┬──────────┘
             └────────────┬────────────┘
                          ↓
                 ┌─────────────────┐
                 │   用户目标点选   │
                 └────────┬────────┘
                          ↓
                 ┌──────────────────────────┐
                 │        Skill 路由          │
                 │   轻量 AI 意图提取         │
                 │   → intent/challenge      │
                 │      /emotion             │
                 │          ↓               │
                 │   多信号评分              │
                 │   意图×弱项×场合×情绪     │
                 │          ↓               │
                 │   分数≥阈值→读 SKILL.md   │
                 │   分数＜阈值→不注入        │
                 └────────┬─────────────────┘
                          ↓
                 ┌─────────────────┐
                 │   上下文包构建   │
                 │  场合+关系+历史  │
                 │  弱项+样本+目标  │
                 │  Skill框架(如有) │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │   单次 AI 推理   │
                 │ 策略+生成+评估   │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │   人味质量检测   │
                 │ 不达标→重新生成  │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │     界面展示     │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │     反馈闭环     │
                 │ 画像+样本+权重   │
                 └─────────────────┘
```

---

## 3. 数据层

### 3.1 数据来源

```
WeFlow HTTP API（默认端口 5031）
├── 实时消息监听        SSE /api/v1/push/messages → WebSocket 推送到浏览器
├── 历史消息导出        REST /api/v1/messages → 初始化画像和样本
└── 联系人 / 群组信息   /api/v1/contacts → 场合标注用
```

### 3.2 本地存储结构

```
data/                          （git 忽略）
├── profile.json
├── contacts/
│   └── {contact_id}.json
├── samples/
│   └── {scene}.json
└── feedback/
    └── history.json
```

**profile.json**

```json
{
  "style": {
    "avg_length": 12,
    "common_words": ["好的", "哈哈", "嗯", "行"],
    "emoji_frequency": "medium",
    "punctuation": "no_period",
    "by_occasion": {
      "workplace": { "avg_length": 18, "emoji_frequency": "rare" },
      "friend":    { "avg_length": 8,  "emoji_frequency": "high" }
    }
  },
  "weaknesses": ["W02", "W07"],
  "updated_at": "2026-04-26"
}
```

**contacts/{id}.json**

```json
{
  "id": "zhangsan_001",
  "name": "张三",
  "occasion": "workplace",
  "relationship_type": "colleague",
  "relationship_status": "normal",
  "recent_context": "",
  "confirmed_at": "2026-04-20"
}
```

**samples/{scene}.json**

```json
{
  "scene": "rejection",
  "samples": [
    "这周不行诶，下次吧",
    "最近有事，改天",
    "不去了，你们玩"
  ],
  "updated_at": "2026-04-26"
}
```

---

## 4. 分析层（离线）

### 4.1 用户画像双轨设计

```
画像
├── Part A  个人风格（保留，驱动表达）
│   ├── 平均句子长度
│   ├── 常用词 / 口头禅
│   ├── emoji 使用频率
│   ├── 标点习惯
│   └── 场合专属词汇
│
└── Part B  沟通弱项（只用于过滤，不替代风格）
    ├── W01  冲动表达    撤回率高，事后解释多
    ├── W02  不会拒绝    先答应后找借口反悔
    ├── W03  过度道歉    道歉词密度异常高
    ├── W04  冲突逃避    冲突类消息回复率低
    ├── W05  表达不清    对方频繁追问同一件事
    ├── W06  情感生硬    关心类表达后对方反应平淡
    ├── W07  防御解释    解释性句式比例高
    └── W08  回避想法    「随便/都行」频率异常高
```

### 4.2 弱项识别流程

```
历史消息
   ↓
Step 1  异常事件提取
        ├── 撤回记录
        ├── 连发 3 条以上
        ├── 单条超过 100 字
        ├── 超过 2 小时未回
        ├── 发完后对方沉默 1 天+
        └── 对方语气明显转冷
   ↓
Step 2  模式聚类
        同类事件归组
        出现 5 次以上才标记为弱项
   ↓
Step 3  AI 解读
        判断弱项类型 + 置信度 + 典型案例
   ↓
Step 4  用户确认
        展示发现 → 用户认可 / 否定
        认可写入画像，否定丢弃
```

### 4.3 最佳状态样本归档

**入选条件（同时满足）：**

```
├── 用户没有撤回这条消息
├── 用户没有在 5 分钟内补充解释
├── 对方在 2 小时内正常回复
└── 对方的回复不包含追问（不含问号）
```

**样本库：**

```
samples/
├── rejection.json      拒绝时说得好的例子
├── agreement.json      答应时说得好的例子
├── workplace.json      工作场合表达自然的例子
├── casual.json         朋友闲聊自然的例子
└── emotional.json      表达关心效果好的例子

每类保留 20 条，滚动更新
```

**手动反馈回路：** 用户在 UI 点击「复制」某条回复 → 自动调用 `/api/sample/save` 存为当前场景样本 → 下次生成时注入 Prompt。

### 4.4 场合与关系管理

| 场合类型 | 语气基调 | 特殊规则 |
|---------|---------|---------|
| workplace | 正式、简洁 | 不用 emoji，给时间节点 |
| business | 半正式、客气 | 适当保持距离 |
| friend | 随意、自然 | 表情 / 玩笑 OK |
| family | 亲切、口语 | 关心优先 |
| stranger | 礼貌、简短 | 保持边界 |

**识别方式：**
- 首次对话弹出一次确认，永久记住
- 用户可随时在联系人管理中修改

---

## 5. Skill 层

### 5.1 文件结构

```
skills/
├── crucial-conversations/       《关键对话》
│   └── SKILL.md
├── boundary-setting/            边界设定
│   └── SKILL.md
├── never-split-difference/      《永不妥协》
│   └── SKILL.md
├── nonviolent-communication/    非暴力沟通
│   └── SKILL.md
└── managing-up/                 向上管理
    └── SKILL.md

扩展规则：新建文件夹 + 写 SKILL.md，无需改任何代码
一本书可拆成多个 Skill，每个对应不同场景
```

### 5.2 SKILL.md 格式规范

```markdown
---
name:                    # 唯一标识，与文件夹名一致，英文小写
title:                   # 展示名，如《关键对话》· 处理冲突
description:             # 一句话说明解决什么问题
version: 1.0

scenes:                  # 从枚举值选
  -
occasions:               # 从枚举值选
  -
related-weaknesses:      # 从枚举值选
  -
priority: medium         # high / medium / low
emotion-threshold: any   # any / negative / urgent
---

## 适用信号
- （什么情况下应该用这个 Skill）

## 核心原则
- （最关键的 1~3 条，简短）

## 处理步骤
1.
2.
3.

## 建议避免
- （容易犯的错 + 原因）

## 话术示例
- （可选，真实表达方式）
```

### 5.3 枚举值定义

**scenes**

```
criticism       被批评 / 被指责
conflict        冲突 / 对立
request         被请求帮忙
negotiation     谈判 / 讨价还价
emotional       对方倾诉 / 情绪低落
invitation      被邀约
persuasion      需要说服对方
workplace       职场压力 / 汇报
casual          日常闲聊
disagreement    意见分歧
demand          催促
```

**occasions**

```
workplace   工作群
colleague   同事私聊
boss        上下级
business    业务往来
friend      朋友
family      家人
stranger    陌生人
```

**related-weaknesses / priority / emotion-threshold**

```
related-weaknesses:  W01  W02  W03  W04  W05  W06  W07  W08
priority:            high / medium / low
emotion-threshold:   any / negative / urgent
```

### 5.4 路由设计

**路由依据**

```
不是「对方说了什么」
而是「用户在这件事上面临什么挑战 × 他有哪些弱项」
```

**Step 1：轻量 AI 意图提取**

```
输入：消息 + 最近 5 条历史 + 场合
输出：
{
  "intent":    "criticism",
  "challenge": "被指责时不知如何回应",
  "emotion":   "negative"
}

Prompt：
分析以下对话，提取三个字段，只返回 JSON。

[场合] {occasion}
[对话历史] {last_5_messages}
[当前消息] {message}

{
  "intent":    从 scenes 枚举值中选一个,
  "challenge": 用户回复这条消息最难处理的地方（一句话，15字以内）,
  "emotion":   neutral / negative / urgent / positive
}
```

**Step 2：多信号评分**

```
维度                权重    规则
────────────────────────────────────────
意图匹配             40     scenes 包含 intent
弱项关联             35     related-weaknesses 命中用户弱项
场合适配             15     occasions 包含当前场合
情绪强度             10     emotion 达到 emotion-threshold

总分 ≥ 40 → 注入该 Skill
总分 < 40 → 不注入
多个命中  → 取最高分
```

**评分示例**

```
消息：「你这个月绩效不行」
场合：workplace，用户弱项：W07

crucial-conversations：
  intent=criticism 命中 scenes      → +40
  W07 命中 related-weaknesses       → +35
  workplace 命中 occasions           → +15
  emotion=negative 达到阈值          → +10
  总分 100 → 触发 ✅

boundary-setting：
  intent=criticism 未命中 scenes    → +0
  W07 未命中 related-weaknesses     → +0
  总分 0 → 不触发 ✅
```

**不触发条件**

```
├── 消息极短（好 / 嗯 / 哦）
├── 用户目标是「随便回」
├── 对话明显是轻松玩笑
└── 所有 Skill 得分均低于阈值
```

---

## 6. 推理层

### 6.1 上下文包

```json
{
  "occasion": "workplace",
  "relationship": "colleague / normal",
  "history": "最近 15 条对话",
  "weaknesses": ["W07"],
  "samples": ["好，今天想想", "明白，周五给你"],
  "user_goal": "承认问题",
  "skill": {
    "title": "《关键对话》· 处理冲突",
    "content": "..."
  }
}
```

### 6.2 用户目标采集

```
收到消息时界面顶部一键点选：

「我现在想...」
[ 答应 ]  [ 婉拒 ]  [ 推进 ]  [ 维持关系 ]  [ 随便回 ]

不选则默认「随便回」
```

### 6.3 Prompt 结构

```
[用户画像]
风格特征：{style}
沟通弱项：{weaknesses}
最佳状态样本：
· {sample_1}
· {sample_2}
· {sample_3}

[场合与关系]
场合：{occasion}
关系：{relationship}，{status}

[对话历史]
{recent_15_messages}

[当前消息]
{message}

[用户目标]
{user_goal}

[沟通框架参考]（有则注入，无则省略）
来自：{skill.title}
{skill.content}

────────────────────────────────
输出格式（严格按此）：
局势分析：（1~2 句）
弱项提示：（触发弱项则写，否则写"无"）
框架建议：（有 Skill 则写 1 句核心策略，否则写"无"）
推荐：[回复文字]||[一句理由]
备选A：[回复文字]||[方向说明]
备选B：[回复文字]||[方向说明]
避免1：[表达方式]||[原因]
避免2：[表达方式]||[原因]
```

### 6.4 人味质量检测

生成后检测，不达标最多重新生成 2 次：

| 检测项 | 规则 |
|--------|------|
| 黑名单词 | 当然 / 非常 / 您好 / 感谢 / 明白了 / 没问题 / 我会尽快 / 温馨提示 / 欢迎随时 / 请您 → 命中任意一个，重新生成 |
| 长度校验 | 超过用户该场合平均字数 2 倍 → 重新生成 |
| 完整度校验 | 句子结构过于工整（主谓宾 + 标点完整）→ 扣分 |
| 风格相似度 | 包含用户常用词 → 加分；完全不像 → 扣分 |

---

## 7. 展示层

### 7.1 界面结构

```
┌──────────────────────────────────────────────────┐
│  💼 工作群 · 老板                                  │
│  "你这个月绩效不行"                               │
├──────────────────────────────────────────────────┤
│  🧠 局势分析                                       │
│  对方在表达不满。这时候辩解适得其反，               │
│  先接住再给出明确计划效果更好。                     │
│                                                  │
│  ⚠️ 注意：你容易过度解释，这里点到为止就够了         │
│  💡 《关键对话》：先认可，再给方案，不要辩解         │
├──────────────────────────────────────────────────┤
│  「我现在想...」                                   │
│  [答应]  [婉拒]  [推进]  [维持关系]  [随便回]      │
├──────────────────────────────────────────────────┤
│  ⭐ 推荐                                          │
│  "明白，我这周复盘下，周五给你改进计划"       [复制]│
│  → 承认 + 给时间节点，干净利落                     │
│                                                  │
│  备选                                            │
│  "哪块你觉得问题最大，我们对下"             [复制]│
│  "好，今天想想，明天回你"                   [复制]│
│                                                  │
│  ✗ 建议避免                                      │
│  "因为最近项目比较多所以……"                        │
│  → 解释太多，对方只想看到你的态度                   │
└──────────────────────────────────────────────────┘
```

### 7.2 反馈闭环

| 用户操作 | 系统动作 |
|---------|---------|
| 复制推荐项 | 记录该方向在此场景被采用；保存为最佳样本 |
| 复制备选项 | 推荐方向不准，调整评分权重 |
| 点「不像我说的」 | 标记样本，触发画像增量更新 |
| 长期不用某方向 | 降低该方向在此场景权重 |

---

## 8. API 接口

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

## 9. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WEFLOW_API_URL` | WeFlow 服务地址 | `http://localhost:5031` |
| `WEFLOW_ACCESS_TOKEN` | WeFlow Access Token | 空 |
| `AI_API_URL` | AI API 地址（OpenAI 兼容，不含 /v1） | `https://api.openai.com` |
| `AI_API_KEY` | AI API Key | 空 |
| `AI_MODEL` | 模型名称 | `claude-sonnet-4-6` |
| `PORT` | Web 服务端口 | `8080` |

---

## 10. 项目结构

```
wechat-communication-assistant/
│
├── skills/
│   ├── crucial-conversations/
│   │   └── SKILL.md
│   ├── boundary-setting/
│   │   └── SKILL.md
│   ├── never-split-difference/
│   │   └── SKILL.md
│   ├── nonviolent-communication/
│   │   └── SKILL.md
│   └── managing-up/
│       └── SKILL.md
│
├── src/
│   ├── index.ts                  入口：加载 Skill、启动服务
│   ├── types.ts                  全局类型定义
│   ├── data/
│   │   ├── storage.ts            本地 JSON 存储（画像/联系人/样本/反馈）
│   │   ├── weflow-client.ts      WeFlow REST API + SSE 地址构建
│   │   └── message-listener.ts  SSE 长连接监听 + 断线重连
│   ├── analysis/
│   │   ├── weakness-detector.ts  弱项识别算法
│   │   ├── sample-archiver.ts    最佳样本归档算法
│   │   ├── profile-builder.ts    画像构建入口
│   │   └── run-analysis.ts       CLI 分析脚本
│   ├── reasoning/
│   │   ├── ai-client.ts          OpenAI 兼容 API 封装
│   │   ├── intent-extractor.ts   意图 + 情绪提取（轻量 AI）
│   │   ├── context-builder.ts    上下文包构建
│   │   ├── prompt-builder.ts     Prompt 构建
│   │   ├── human-checker.ts      人味评分
│   │   └─  assistant.ts          主推理入口
│   ├── skill/
│   │   ├── skill-loader.ts       SKILL.md 解析
│   │   ├── skill-registry.ts     Skill 注册 + 热加载
│   │   └── skill-router.ts       多信号评分路由
│   └── ui/
│       ├── server.ts             Express + WebSocket 服务
│       └── public/index.html     Web 前端
│
├── data/                         运行时数据（git 忽略）
│   ├── profile.json
│   ├── contacts/
│   ├── samples/
│   └── feedback/
│
└── docs/
    └── DESIGN.md                 本文档
```

---

## 11. 开发优先级

```
Phase 1  跑通核心流程
  ├── WeFlow API 接入 + 消息监听（SSE）
  ├── 场合标注（人工确认）
  ├── Skill 加载 + 注册
  ├── 简单意图提取
  └── 基础回复生成（1推荐 + 2备选）

Phase 2  画像 + 路由精准化
  ├── 弱项识别 + 用户确认
  ├── 最佳状态样本归档
  ├── 多信号评分路由
  └── 人味质量检测

Phase 3  体验完善
  ├── 局势分析 + 弱项提示展示
  ├── 用户目标点选
  ├── 反馈闭环 + 权重更新
  └── 新增更多 Skill
```

---

## 12. 核心设计原则

| 原则 | 说明 |
|------|------|
| 风格与弱项分离 | 保留你的说话风格，只过滤会出问题的表达 |
| 样本驱动而非规则驱动 | 给 AI 看你说得好的原话，而不是描述规则 |
| 挑战导向路由 | 路由依据是用户面临的挑战，而不是关键词 |
| 单次推理 | 上下文一次性输入，避免多步误差累积 |
| AI 建议人做决定 | AI 只推荐，用户手动复制发送 |
| 新增 Skill 零代码 | 新建文件夹即扩展，不改任何逻辑代码 |
