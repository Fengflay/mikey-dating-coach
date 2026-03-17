# Mikey情感导师

> AI驱动的约会教练工具 - 分析她的消息，给你三个神回复

你把她发的消息丢给Mikey，他帮你分析潜台词，告诉你什么该说什么不该说，然后给你三个不同风格的回复选项。不教你当舔狗，教你建立吸引力。

---

## 产品截图

```
她说："今天好累啊"

📊 情境诊断
━━━━━━━━━━━━━━━
阶段: 暧昧初期
温度: 6/10 (偏暖)
潜台词: 寻求关心和陪伴，向你展示脆弱面是信任的表现

⚠️ 排雷区
━━━━━━━━━━━━━━━
• 别说"多喝热水"
• 别说"那你早点休息"
• 别追问"为什么累"

💬 回复选项
━━━━━━━━━━━━━━━
A. 幽默 → "累的话让我背你啊 虽然隔着屏幕有点难"
B. 共情 → "辛苦了 想听你说说今天怎么了"
C. 引导 → "你值得好好放松一下 周末一起去公园走走？"
```

---

## 两个版本

本项目提供两个版本，选适合你的：

### 版本一：独立应用（推荐新手）

**下载就能用，不需要装任何框架。**

| 特性 | 详情 |
|------|------|
| 位置 | `mikey-app/` |
| 技术 | Node.js + Express + grammY |
| 交互方式 | Telegram 机器人 |
| 管理界面 | 浏览器打开 localhost:3456 |
| 知识库 | 本地 Markdown 文件 |
| 打包大小 | ~50MB |
| 支持平台 | macOS (ARM/Intel) + Windows |

#### 快速开始（5分钟）

**前置条件：**
- [Node.js 18+](https://nodejs.org/) 已安装
- 一个 [Telegram Bot Token](#如何获取-telegram-bot-token)
- 一个 [Claude API Key](#如何获取-claude-api-key)

```bash
# 1. 克隆项目
git clone https://github.com/Fengflay/mikey-dating-coach.git
cd mikey-dating-coach/mikey-app

# 2. 安装依赖
npm install

# 3. 启动
npm start
```

启动后浏览器会自动打开设置页面，输入你的 Telegram Bot Token 和 Claude API Key 就行了。

#### 打包成可执行文件

```bash
# macOS Apple Silicon (M1/M2/M3/M4)
npm run build:mac-arm

# macOS Intel
npm run build:mac-x64

# Windows
npm run build:win

# 打包后的文件在 dist/ 目录
```

打包完的文件可以直接发给别人用，双击就能运行。

---

### 版本二：OpenClaw 插件（轻量版）

**如果你已经在用 OpenClaw，装个插件就行。**

| 特性 | 详情 |
|------|------|
| 位置 | `openclaw-plugin/` |
| 技术 | TypeScript + OpenClaw Plugin API |
| 交互方式 | 复用 OpenClaw 的 Telegram 通道 |
| 知识库 | 4个 Markdown 文件 |
| 文件数 | 12个文件 |

#### 安装步骤

```bash
# 1. 进入插件目录
cd mikey-dating-coach/openclaw-plugin

# 2. 安装依赖并构建
pnpm install && pnpm build

# 3. 安装到 OpenClaw
openclaw plugins install ./

# 4. 确认安装成功
openclaw plugins list
```

详细指南见 [`openclaw-plugin/SETUP.md`](openclaw-plugin/SETUP.md)

---

## 如何获取 Telegram Bot Token

1. 打开 Telegram，搜索 **@BotFather**
2. 发送 `/newbot`
3. 输入机器人名称，比如 `Mikey情感导师`
4. 输入用户名，比如 `mikey_dating_coach_bot`（必须以 `_bot` 结尾）
5. BotFather 会给你一串 token，类似 `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
6. 复制保存

## 如何获取 Claude API Key

1. 打开 [console.anthropic.com](https://console.anthropic.com/)
2. 注册/登录账号
3. 进入 **Settings → API Keys**
4. 点击 **Create Key**
5. 复制保存（以 `sk-ant-` 开头）
6. 需要充值才能使用（最低 $5）

---

## 使用方法

### 基本用法

1. 在 Telegram 里找到你的机器人
2. 把她发给你的消息**复制粘贴**发过去
3. 等几秒，Mikey 会给你：
   - **情境诊断** — 当前处于什么阶段，对话温度如何
   - **潜台词分析** — 她这句话背后真正想表达什么
   - **排雷区** — 哪些话绝对不能说
   - **三个回复选项** — 幽默/共情/引导，选一个你喜欢的
4. 点击代码块复制回复，发给她

### 管理后台（独立应用版）

启动应用后，浏览器打开 `http://localhost:3456/admin`：

- **导师管理** — 添加/编辑/删除情感导师
- **上传资料** — 上传导师的课程内容、文章、聊天案例
- **资料库** — 查看所有已上传的资料和处理状态
- **审核队列** — 审核 AI 处理后的知识块

### 添加知识库内容

**独立应用版：**
```
mikey-app/knowledge-base/
├── mikey/
│   ├── opening-lines.md      # 开场白技巧
│   ├── texting-rhythm.md     # 聊天节奏
│   └── decoding-signals.md   # 信号解读
└── 你的导师名/
    └── 任意文件名.md          # 直接放 Markdown 文件
```

**OpenClaw 插件版：**
```
openclaw-plugin/knowledge/
├── 01-messaging-basics.md     # 聊天基础
├── 02-relationship-stages.md  # 关系阶段
├── 03-signal-decoding.md      # 信号解读
└── 04-response-styles.md      # 回复风格
```

直接新建 `.md` 文件放进去，重启后自动加载。

---

## 核心分析逻辑

### 三个回复维度

| 类型 | 风格 | 适用场景 |
|------|------|----------|
| **A. 幽默风趣** | 调侃、推拉、不正经 | 气氛平淡、关系升温期 |
| **B. 高情绪价值** | 深度共情、展示理解力 | 对方心情不好、建立深度连结 |
| **C. 引导进攻** | 带节奏、埋伏笔 | 需要邀约、突破友谊区 |

### 四个诊断维度

1. **关系阶段** — 初识 / 暧昧期 / 冷淡期 / 冲突期 / 约会中 / 恋爱中
2. **意图解读** — 她说这句话背后真正想要什么
3. **对话温度** — 1-10分评估当前聊天热度
4. **行为诊断** — 你是否犯了常见错误（需求感过强等）

### Mikey的原则

- 拒绝油腻土味情话
- 不做舔狗复读机
- 直接指出你的错误
- 回复必须像真人发的消息
- 培养你自己的吸引力，不是替你说话

---

## 项目结构

```
mikey-dating-coach/
│
├── mikey-app/                    # 独立应用版
│   ├── src/
│   │   ├── main.js               # 入口：启动 Web + Telegram Bot
│   │   ├── app.js                # Express 服务器 + API 路由
│   │   ├── telegram-bot.js       # Telegram 机器人（grammY）
│   │   ├── ai-engine.js          # Claude API 集成
│   │   ├── config.js             # 配置管理（JSON文件）
│   │   └── knowledge.js          # 知识库加载（Markdown）
│   ├── web/
│   │   ├── setup.html            # 首次设置页面
│   │   ├── index.html            # 主界面
│   │   └── admin.html            # 管理后台
│   ├── knowledge-base/mikey/     # 知识库文件
│   ├── prompts/                  # AI 系统提示词
│   └── package.json
│
├── openclaw-plugin/              # OpenClaw 插件版
│   ├── src/index.ts              # 插件入口（2个工具）
│   ├── skills/SKILL.md           # Mikey 人格定义
│   ├── knowledge/                # 4个知识文件
│   └── openclaw.plugin.json      # 插件清单
│
├── 设计文档（参考）
│   ├── ARCHITECTURE.md           # 系统架构设计
│   ├── prompts/                  # 提示词模板
│   ├── schemas/                  # 数据模型
│   ├── knowledge-base/           # 知识库设计文档（含SQL）
│   ├── wireframes/               # UX 线框图
│   ├── css/                      # 设计系统
│   ├── index.html                # 可交互 UI 原型
│   └── admin.html                # 导师管理后台原型
│
└── README.md                     # 你正在看的这个
```

---

## 技术栈

### 独立应用版
- **运行时**: Node.js 18+
- **Telegram**: grammY（Telegram Bot框架）
- **Web服务**: Express.js
- **AI**: Claude API（Anthropic）
- **知识库**: 本地 Markdown 文件（无数据库）
- **打包**: pkg（单文件可执行）

### OpenClaw 插件版
- **框架**: OpenClaw Plugin API
- **语言**: TypeScript
- **测试**: Vitest
- **Telegram**: 复用 OpenClaw 内置通道

---

## 常见问题

**Q: 这个工具收费吗？**
A: 工具本身免费开源。但你需要一个 Claude API 账号，按 API 调用量付费（每次分析约 $0.01-0.03）。

**Q: 支持微信吗？**
A: 目前只支持 Telegram。微信没有开放个人聊天 API，无法直接接入。你可以把微信里的对话复制粘贴到 Telegram 机器人里分析。

**Q: 我的聊天记录安全吗？**
A: 所有数据都在你本地，不经过我们的服务器。聊天内容会发送到 Claude API 进行分析，受 Anthropic 的隐私政策保护。

**Q: 怎么添加新的导师知识？**
A: 在 `knowledge-base/` 目录下新建 Markdown 文件即可。支持上传课程笔记、文章、聊天案例等。

**Q: Bot 没有回复？**
A: 检查以下几点：
1. 应用是否在运行（终端里看日志）
2. Telegram Bot Token 是否正确
3. Claude API Key 是否有效且有余额
4. 确认你给 Bot 发的是普通文本消息（不是命令）

**Q: 可以用其他 AI 模型吗？**
A: 默认用 Claude Sonnet。在管理后台的设置里可以切换模型。理论上只要改 API 调用就能接入 GPT-4 或 DeepSeek 等。

---

## 开发计划

- [x] Telegram 机器人
- [x] Claude API 集成
- [x] 本地知识库（Markdown）
- [x] Web 管理后台
- [x] OpenClaw 插件版
- [x] 导师管理系统
- [ ] 截图 OCR（发截图自动识别文字）
- [ ] 剪贴板监听（复制自动分析）
- [ ] 聊天记录文件导入（WhatsApp/Telegram导出）
- [ ] iMessage 本地数据库读取（macOS）
- [ ] 多语言支持
- [ ] 语音消息识别

---

## 贡献

欢迎 PR 和 Issue。特别欢迎：
- 新的知识库内容（导师课程笔记、实战案例等）
- 提示词优化
- Bug 修复

---

## 免责声明

本工具仅供学习和参考，不保证任何社交结果。请尊重对方，真诚对待每一段关系。AI 建议仅供参考，最终的沟通方式取决于你自己。

---

## License

MIT
