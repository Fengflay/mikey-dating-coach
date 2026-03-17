# Mikey情感导师 - 安装指南

## 前提条件

- Node.js 18+ 已安装
- pnpm 已安装（`npm install -g pnpm`）
- OpenClaw 已安装并能正常运行
- 一个 Telegram Bot Token（下面教你怎么拿）

## 第一步：获取 Telegram Bot Token（5分钟）

1. 打开 Telegram，搜索 `@BotFather`
2. 发送 `/newbot`
3. 给你的 bot 起个名字，比如 `Mikey情感导师`
4. 再给一个用户名，比如 `mikey_dating_coach_bot`
5. BotFather 会给你一个 token，长这样：`123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
6. 复制保存好这个 token

## 第二步：配置 OpenClaw 的 Telegram（3分钟）

在你的 OpenClaw 配置文件（通常是 `~/.openclaw/config.yaml`）中添加：

```yaml
channels:
  telegram:
    enabled: true
    token: "你的BOT_TOKEN粘贴在这里"
```

## 第三步：安装插件（2分钟）

```bash
# 进入插件目录
cd openclaw-plugin-mikey

# 安装依赖
pnpm install

# 构建
pnpm build

# 用 OpenClaw 安装此插件（从本地路径）
openclaw plugins install ./
```

## 第四步：验证安装（1分钟）

```bash
# 查看已安装的插件
openclaw plugins list

# 应该能看到：
# - openclaw-plugin-mikey (0.1.0) - Mikey情感导师
```

## 第五步：启动并测试（1分钟）

```bash
# 启动 OpenClaw
openclaw start

# 打开 Telegram，找到你的 bot
# 发送一条消息试试：
# "她说：你在干嘛呀"
```

## 常见问题

**Q: Bot 没有回复？**
- 检查 token 是否正确
- 确认 `openclaw start` 正在运行
- 查看日志：`openclaw logs --tail 50`

**Q: 回复是英文的？**
- 确认 `openclaw.plugin.json` 中 `config.language` 是 `"zh-CN"`
- SKILL.md 中已经指定了中文输出

**Q: 想添加更多知识？**
- 在 `knowledge/` 文件夹里新建 `.md` 文件就行
- 重启 OpenClaw 后自动加载
- 文件名建议用数字开头方便排序，如 `05-xxx.md`
