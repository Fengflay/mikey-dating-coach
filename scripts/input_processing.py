"""
Mikey情感导师 - 输入处理模块
处理两种输入类型: 截图OCR 和 文本粘贴
将原始输入统一为结构化对话格式
"""

import re
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class InputType(Enum):
    TEXT_PASTE = "text_paste"
    SCREENSHOT = "screenshot"


class MessageRole(Enum):
    MALE_USER = "user_male"      # 用户(男方)
    FEMALE_TARGET = "target_female"  # 女方
    SYSTEM_NOTE = "system_note"  # 系统标注(时间戳、撤回等)


@dataclass
class ParsedMessage:
    role: MessageRole
    content: str
    timestamp: Optional[str] = None
    has_emoji: bool = False
    has_image: bool = False
    reply_delay_minutes: Optional[int] = None


@dataclass
class ParsedConversation:
    messages: list[ParsedMessage] = field(default_factory=list)
    input_type: InputType = InputType.TEXT_PASTE
    parsing_confidence: float = 1.0
    warnings: list[str] = field(default_factory=list)


# ============================================================
# 文本粘贴处理
# ============================================================

# 用于解析的LLM提示词
TEXT_PARSING_PROMPT = """
你是一个对话解析引擎。用户会粘贴他和一个女生的微信/社交软件聊天记录。
你的任务是将原始文本解析为结构化的对话格式。

规则:
1. 识别哪些消息是用户(男方)发的,哪些是女方发的
2. 用户通常会用某种方式标注谁是谁,比如:
   - "我: xxx" / "她: xxx"
   - "男: xxx" / "女: xxx"
   - 名字标注: "小鱼: xxx" / "我: xxx"
   - 无标注但有换行分隔
3. 如果无法确定消息归属,标记为 uncertain 并在warnings中说明
4. 保留所有表情符号描述 [表情] [图片] 等
5. 识别时间戳(如果有的话)
6. 注意微信特有的格式: "[图片]", "[语音]", "[表情]", "撤回了一条消息"

输入:
{raw_text}

请输出JSON:
{{
  "messages": [
    {{
      "role": "user_male | target_female | system_note",
      "content": "消息内容",
      "timestamp": "时间戳(如有)",
      "has_emoji": true/false,
      "has_image": true/false
    }}
  ],
  "parsing_confidence": 0.0-1.0,
  "warnings": ["任何不确定的地方"]
}}
"""


def parse_text_input(raw_text: str) -> dict:
    """
    尝试用正则规则预解析文本,如果格式不明确则回退到LLM解析。
    返回统一的对话结构。
    """
    # 常见格式正则匹配
    patterns = [
        # "我: xxx" / "她: xxx" 格式
        r'^(我|她|他|对方|女方|男方|女生|男生)\s*[:：]\s*(.+)$',
        # 带时间戳: "14:30 我: xxx"
        r'^(\d{1,2}:\d{2})\s+(我|她)\s*[:：]\s*(.+)$',
        # 微信复制格式: "昵称 时间\n消息内容"
        r'^(.+?)\s+(\d{1,2}:\d{2})\s*$',
    ]

    lines = raw_text.strip().split('\n')
    messages = []
    role_map = {
        '我': MessageRole.MALE_USER,
        '男方': MessageRole.MALE_USER,
        '男生': MessageRole.MALE_USER,
        '她': MessageRole.FEMALE_TARGET,
        '他': MessageRole.FEMALE_TARGET,
        '对方': MessageRole.FEMALE_TARGET,
        '女方': MessageRole.FEMALE_TARGET,
        '女生': MessageRole.FEMALE_TARGET,
    }

    parsed_count = 0
    for line in lines:
        line = line.strip()
        if not line:
            continue

        # 尝试 "我/她: xxx" 格式
        match = re.match(r'^(我|她|他|对方|女方|男方|女生|男生)\s*[:：]\s*(.+)$', line)
        if match:
            role_key = match.group(1)
            content = match.group(2).strip()
            role = role_map.get(role_key, MessageRole.FEMALE_TARGET)
            messages.append(ParsedMessage(
                role=role,
                content=content,
                has_emoji='[表情]' in content or bool(re.search(r'[\U0001f600-\U0001f9ff]', content)),
                has_image='[图片]' in content,
            ))
            parsed_count += 1
            continue

    confidence = parsed_count / max(len([l for l in lines if l.strip()]), 1)

    if confidence < 0.5:
        # 正则解析失败率高,需要用LLM解析
        return {
            "needs_llm_parsing": True,
            "raw_text": raw_text,
            "llm_prompt": TEXT_PARSING_PROMPT.format(raw_text=raw_text),
        }

    return {
        "needs_llm_parsing": False,
        "messages": [
            {
                "role": m.role.value,
                "content": m.content,
                "timestamp": m.timestamp,
                "has_emoji": m.has_emoji,
                "has_image": m.has_image,
            }
            for m in messages
        ],
        "parsing_confidence": confidence,
        "warnings": [],
    }


# ============================================================
# 截图OCR处理
# ============================================================

SCREENSHOT_OCR_PROMPT = """
你是一个微信/社交软件聊天截图的OCR和解析引擎。

分析这张聊天截图,提取所有对话消息。

规则:
1. 微信布局: 右侧气泡是"我"发的(user_male),左侧气泡是对方(target_female)
2. 识别并标注:
   - 文字消息的完整内容
   - 表情包(描述表情含义)
   - 图片消息(标注[图片]并简述内容)
   - 语音消息(标注[语音 xx秒])
   - 时间戳
   - 已读/未读状态(如可见)
   - 撤回消息提示
3. 按时间顺序排列
4. 如果截图模糊或部分内容不清晰,在warnings中标注

输出JSON:
{{
  "messages": [
    {{
      "role": "user_male | target_female | system_note",
      "content": "消息内容",
      "timestamp": "时间戳",
      "has_emoji": true/false,
      "has_image": true/false,
      "bubble_position": "left | right"
    }}
  ],
  "app_detected": "微信 | QQ | 其他",
  "parsing_confidence": 0.0-1.0,
  "warnings": []
}}
"""


def process_screenshot(image_data: bytes) -> dict:
    """
    处理截图输入。
    方案A: 使用多模态LLM直接分析截图(推荐,更准确)
    方案B: 先OCR再LLM解析
    """
    # 推荐方案: 直接用GPT-4o / Claude Vision 分析截图
    return {
        "needs_vision_llm": True,
        "image_data": image_data,
        "llm_prompt": SCREENSHOT_OCR_PROMPT,
    }


# ============================================================
# 统一输出 -> 送入分析引擎
# ============================================================

def format_for_analysis(parsed_result: dict) -> str:
    """
    将解析后的结构化对话转为分析引擎需要的文本格式。
    """
    if parsed_result.get("needs_llm_parsing") or parsed_result.get("needs_vision_llm"):
        raise ValueError("需要先完成LLM解析步骤")

    lines = []
    for msg in parsed_result["messages"]:
        role_label = "我" if msg["role"] == "user_male" else "她"
        timestamp = f" ({msg['timestamp']})" if msg.get("timestamp") else ""
        lines.append(f"{role_label}{timestamp}: {msg['content']}")

    return "\n".join(lines)


# ============================================================
# 对话元数据提取 (用于上下文注入)
# ============================================================

def extract_metadata(parsed_result: dict) -> dict:
    """
    从解析后的对话中提取元数据,用于动态上下文注入。
    """
    messages = parsed_result.get("messages", [])
    her_messages = [m for m in messages if m["role"] == "target_female"]
    his_messages = [m for m in messages if m["role"] == "user_male"]

    # 计算基础指标
    her_avg_length = (
        sum(len(m["content"]) for m in her_messages) / len(her_messages)
        if her_messages else 0
    )
    his_avg_length = (
        sum(len(m["content"]) for m in his_messages) / len(his_messages)
        if his_messages else 0
    )

    # 投入度对比 (消息长度比)
    investment_ratio = (
        her_avg_length / his_avg_length if his_avg_length > 0 else 0
    )

    # 消息数量比
    message_count_ratio = (
        len(her_messages) / len(his_messages) if his_messages else 0
    )

    # 表情使用
    her_emoji_count = sum(1 for m in her_messages if m.get("has_emoji"))
    his_emoji_count = sum(1 for m in his_messages if m.get("has_emoji"))

    return {
        "total_messages": len(messages),
        "her_message_count": len(her_messages),
        "his_message_count": len(his_messages),
        "her_avg_length": round(her_avg_length, 1),
        "his_avg_length": round(his_avg_length, 1),
        "investment_ratio": round(investment_ratio, 2),
        "message_count_ratio": round(message_count_ratio, 2),
        "her_emoji_usage": her_emoji_count,
        "his_emoji_usage": his_emoji_count,
        "her_last_message": her_messages[-1]["content"] if her_messages else None,
        "his_last_message": his_messages[-1]["content"] if his_messages else None,
        "ends_with": "her" if messages and messages[-1]["role"] == "target_female" else "him",
    }
