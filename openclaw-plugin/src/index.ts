import type { PluginAPI } from "@openclaw/sdk";

/**
 * Mikey情感导师插件
 *
 * 注册两个工具：
 * 1. analyze_message - 分析女生发来的消息
 * 2. get_coaching_advice - 生成三种风格的回复建议
 *
 * 不需要注册 channel（用 OpenClaw 自带的 Telegram）
 * 不需要注册 service（无状态，无数据库）
 */
export function register(api: PluginAPI) {
  // ─── 工具 1：消息分析 ───
  api.registerTool({
    name: "analyze_message",
    description:
      "分析女生发来的聊天消息，判断关系阶段、潜台词、聊天温度和关键信号",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "女生发来的原始消息内容",
        },
        context: {
          type: "string",
          description: "（可选）之前的聊天背景，帮助更准确分析",
        },
      },
      required: ["message"],
    },
    execute: async ({ message, context }) => {
      // 构建分析 prompt，让 OpenClaw 的 AI 核心来处理
      const analysisPrompt = buildAnalysisPrompt(message, context);
      return {
        type: "prompt",
        content: analysisPrompt,
      };
    },
  });

  // ─── 工具 2：回复建议 ───
  api.registerTool({
    name: "get_coaching_advice",
    description:
      "根据消息分析结果，生成幽默、共情、引导三种风格的回复建议",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "女生发来的原始消息内容",
        },
        stage: {
          type: "string",
          enum: ["陌生", "暧昧", "热恋", "冷淡", "挽回"],
          description: "当前关系阶段",
        },
        temperature: {
          type: "string",
          enum: ["冷", "平", "热"],
          description: "聊天温度",
        },
        subtext: {
          type: "string",
          description: "分析出的潜台词",
        },
      },
      required: ["message", "stage", "temperature"],
    },
    execute: async ({ message, stage, temperature, subtext }) => {
      const advicePrompt = buildAdvicePrompt(
        message,
        stage,
        temperature,
        subtext
      );
      return {
        type: "prompt",
        content: advicePrompt,
      };
    },
  });

  // ─── 注册知识库上下文引擎 ───
  api.registerContextEngine({
    name: "mikey-knowledge",
    description: "约会沟通知识库",
    source: "knowledge/*.md",
    priority: "high",
  });
}

// ─── Prompt 构建函数 ───

function buildAnalysisPrompt(message: string, context?: string): string {
  let prompt = `你是一位资深情感分析师。请分析以下女生发来的消息。

## 她发的消息
「${message}」
`;

  if (context) {
    prompt += `
## 聊天背景
${context}
`;
  }

  prompt += `
## 请分析以下维度

1. **关系阶段**（从以下选一个）：陌生 / 暧昧 / 热恋 / 冷淡 / 挽回
2. **她的潜台词**：这句话背后真正想表达什么？用一句大白话说清楚
3. **聊天温度**：冷🥶 / 平😐 / 热🔥
4. **关键信号**：列出1-3个正面或负面的沟通信号

分析要接地气，不要学术化。像跟兄弟聊天一样说。
`;

  return prompt;
}

function buildAdvicePrompt(
  message: string,
  stage: string,
  temperature: string,
  subtext?: string
): string {
  return `你是Mikey情感导师。根据以下分析，生成三个回复方案。

## 原始消息
「${message}」

## 分析结果
- 关系阶段：${stage}
- 聊天温度：${temperature}
${subtext ? `- 潜台词：${subtext}` : ""}

## 请生成三个回复方案

**A 幽默路线 🎭**
- 用轻松有趣的方式回应
- 目标：让她觉得你有意思

**B 共情路线 💝**
- 展示你理解她的感受
- 目标：拉近情感距离

**C 引导路线 🎯**
- 把话题引向约会/见面/更深层的交流
- 目标：推进关系

## 要求
- 每个回复1-3句话，能直接复制发送
- 用「」包裹可复制的回复内容
- 每个方案附一句话解释策略
- 如果有风险信号，加上"千万别说"的反面示例
- 加上一个"加分动作"建议（比如：过一小时再回、配一张照片等）
- 风格自然口语化，像真人发的微信消息
`;
}
