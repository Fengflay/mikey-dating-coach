"""
Mikey情感导师 - 编排引擎
两阶段LLM调用 + RAG检索的完整pipeline
"""

import json
from typing import Optional
from dataclasses import dataclass


@dataclass
class PipelineConfig:
    """Pipeline配置"""
    # LLM配置
    analysis_model: str = "gpt-4o"          # 分析阶段模型
    generation_model: str = "gpt-4o"         # 生成阶段模型
    parsing_model: str = "gpt-4o-mini"       # 解析阶段模型(省成本)

    # RAG配置
    retrieval_top_k: int = 5
    retrieval_score_threshold: float = 0.72
    max_knowledge_tokens: int = 1500

    # 上下文配置
    max_history_sessions: int = 3
    context_window_budget: int = 8000


class MikeyPipeline:
    """
    完整的分析pipeline:
    1. 输入解析 (文本/截图 -> 结构化对话)
    2. 第一阶段LLM: 结构化分析
    3. RAG检索: 基于分析结果检索知识库
    4. 第二阶段LLM: 生成最终输出
    """

    def __init__(self, config: PipelineConfig, llm_client, vector_db, user_store):
        self.config = config
        self.llm = llm_client           # LLM API客户端
        self.vector_db = vector_db       # 向量数据库客户端
        self.user_store = user_store     # 用户数据存储

    async def run(
        self,
        user_id: str,
        raw_input: str,
        input_type: str = "text_paste",
        target_id: Optional[str] = None,
        image_data: Optional[bytes] = None,
    ) -> dict:
        """主入口"""

        # ---- Step 1: 输入解析 ----
        parsed = await self._parse_input(raw_input, input_type, image_data)

        # ---- Step 2: 加载用户上下文 ----
        user_context = await self._load_user_context(user_id, target_id)

        # ---- Step 3: 第一阶段 - 结构化分析 ----
        analysis = await self._analyze(parsed, user_context)

        # ---- Step 4: RAG检索 ----
        knowledge = await self._retrieve_knowledge(analysis)

        # ---- Step 5: 第二阶段 - 生成输出 ----
        output = await self._generate(parsed, analysis, knowledge, user_context)

        # ---- Step 6: 保存会话记录 ----
        await self._save_session(user_id, target_id, parsed, analysis, output)

        return output

    async def _parse_input(self, raw_input, input_type, image_data):
        """Step 1: 解析输入为结构化对话"""
        if input_type == "screenshot" and image_data:
            # 多模态LLM直接解析截图
            response = await self.llm.chat(
                model=self.config.parsing_model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": SCREENSHOT_OCR_PROMPT},
                        {"type": "image", "data": image_data},
                    ],
                }],
                response_format={"type": "json_object"},
            )
            return json.loads(response.content)
        else:
            # 文本解析: 先尝试正则,失败则用LLM
            from input_processing import parse_text_input
            result = parse_text_input(raw_input)

            if result.get("needs_llm_parsing"):
                response = await self.llm.chat(
                    model=self.config.parsing_model,
                    messages=[{
                        "role": "user",
                        "content": result["llm_prompt"],
                    }],
                    response_format={"type": "json_object"},
                )
                return json.loads(response.content)

            return result

    async def _load_user_context(self, user_id, target_id):
        """Step 2: 加载用户画像和历史上下文"""
        user_profile = await self.user_store.get_profile(user_id)
        history = []

        if target_id:
            sessions = await self.user_store.get_sessions(
                user_id=user_id,
                target_id=target_id,
                limit=self.config.max_history_sessions,
            )
            history = [
                {
                    "date": s["timestamp"],
                    "stage": s["analysis_result"]["stage"],
                    "temperature": s["analysis_result"]["temperature"],
                    "finding": s["analysis_result"].get("key_finding", ""),
                }
                for s in sessions
            ]

        return {
            "user_profile": user_profile,
            "target_history": history,
        }

    async def _analyze(self, parsed, user_context):
        """Step 3: 第一阶段LLM调用 - 结构化分析"""
        # 构建对话文本
        from input_processing import format_for_analysis
        chat_text = format_for_analysis(parsed)

        # 构建上下文字符串
        context_parts = []
        if user_context.get("target_history"):
            context_parts.append("历史分析记录:")
            for h in user_context["target_history"]:
                context_parts.append(
                    f"  - {h['date']}: 阶段={h['stage']}, "
                    f"温度={h['temperature']}, {h['finding']}"
                )

        if user_context.get("user_profile", {}).get("recurring_issues"):
            issues = user_context["user_profile"]["recurring_issues"]
            context_parts.append(f"用户常见问题: {', '.join(issues)}")

        context_str = "\n".join(context_parts) if context_parts else "无历史记录"

        # 调用LLM
        from prompts_loader import load_analysis_prompt
        analysis_prompt = load_analysis_prompt(
            chat_messages=chat_text,
            context=context_str,
        )

        response = await self.llm.chat(
            model=self.config.analysis_model,
            messages=[
                {"role": "system", "content": "你是一个情感对话分析引擎。"},
                {"role": "user", "content": analysis_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,   # 分析阶段用低温度保证一致性
        )

        return json.loads(response.content)

    async def _retrieve_knowledge(self, analysis):
        """Step 4: RAG检索"""
        # 构建查询
        semantic_query = analysis.get("her_last_messages_summary", "")

        # 过滤条件
        stage_map = {
            "初识": "acquaintance",
            "暧昧期": "ambiguous",
            "冷淡期": "cooling",
            "冲突期": "conflict",
        }
        stage_filter = stage_map.get(analysis.get("stage"), "acquaintance")

        # 执行向量搜索
        results = await self.vector_db.search(
            query=semantic_query,
            filter={
                "stage": {"$in": [stage_filter, "all"]},  # 包含通用知识
            },
            top_k=self.config.retrieval_top_k,
            score_threshold=self.config.retrieval_score_threshold,
        )

        # 如果检测到用户问题,额外检索纠错知识
        user_issues = analysis.get("user_issues", [])
        if user_issues:
            issue_tags = [i["issue"] for i in user_issues]
            issue_query = " ".join(issue_tags)
            issue_results = await self.vector_db.search(
                query=issue_query,
                filter={"type": "anti_pattern"},
                top_k=2,
            )
            results.extend(issue_results)

        # 格式化为注入模板
        knowledge_blocks = []
        for r in results:
            knowledge_blocks.append({
                "source": r.metadata.get("source", "unknown"),
                "scenario": r.metadata.get("scenario", "general"),
                "key_points": r.metadata.get("key_points", r.text[:200]),
            })

        return knowledge_blocks

    async def _generate(self, parsed, analysis, knowledge, user_context):
        """Step 5: 第二阶段LLM调用 - 生成最终输出"""
        from input_processing import format_for_analysis
        chat_text = format_for_analysis(parsed)

        # 构建知识注入文本
        knowledge_text = ""
        if knowledge:
            knowledge_text = "[参考知识]\n"
            for k in knowledge:
                knowledge_text += (
                    f"---\n来源: {k['source']}\n"
                    f"场景: {k['scenario']}\n"
                    f"要点: {k['key_points']}\n---\n"
                )

        # 加载系统提示词
        from prompts_loader import load_system_prompt, load_generation_prompt
        system_prompt = load_system_prompt()

        # 加载动态上下文
        dynamic_context = self._build_dynamic_context(analysis, user_context)

        # 构建生成提示词
        generation_prompt = load_generation_prompt(
            analysis_json=json.dumps(analysis, ensure_ascii=False, indent=2),
            retrieved_knowledge=knowledge_text,
            chat_messages=chat_text,
        )

        response = await self.llm.chat(
            model=self.config.generation_model,
            messages=[
                {"role": "system", "content": system_prompt + "\n\n" + dynamic_context},
                {"role": "user", "content": generation_prompt},
            ],
            temperature=0.7,   # 生成阶段用稍高温度保证创造性
            max_tokens=2000,
        )

        return {
            "analysis": analysis,
            "output": response.content,
            "knowledge_used": len(knowledge),
        }

    def _build_dynamic_context(self, analysis, user_context):
        """构建动态上下文注入"""
        parts = []

        # 特殊场景指令
        special = analysis.get("special_scenarios", [])
        if "conflict" in special:
            parts.append(
                "[特殊指令-冲突场景] "
                "当前检测到冲突信号。优先安抚情绪,不要急于推进关系。"
            )
        if "cooling" in special or "ghosting" in special:
            temp = analysis.get("temperature", 5)
            if temp <= 3:
                parts.append(
                    "[特殊指令-冷淡场景] "
                    "温度极低,建议用户降低投入频率。"
                    "不要给用户虚假希望,如实评估。"
                )
        if analysis.get("escalation_window"):
            parts.append(
                "[特殊指令-升级窗口] "
                "检测到关系推进窗口,至少一个回复选项应引导线下见面。"
            )

        # 用户历史问题提醒
        profile = user_context.get("user_profile", {})
        recurring = profile.get("recurring_issues", [])
        if recurring:
            parts.append(
                f"[用户历史问题] 该用户反复出现以下问题: "
                f"{', '.join(recurring)}。分析时重点检查这些方面。"
            )

        return "\n\n".join(parts)

    async def _save_session(self, user_id, target_id, parsed, analysis, output):
        """Step 6: 保存会话记录"""
        session = {
            "user_id": user_id,
            "target_id": target_id,
            "parsed_messages": parsed.get("messages", []),
            "analysis_result": analysis,
            "output_text": output.get("output", ""),
        }
        await self.user_store.save_session(session)


# ============================================================
# Prompt加载辅助 (实际项目中从文件加载)
# ============================================================

SCREENSHOT_OCR_PROMPT = """你是一个微信聊天截图的OCR和解析引擎..."""  # 见 input_processing.py


def load_prompts_example():
    """展示prompt加载的参考实现"""
    import pathlib

    prompts_dir = pathlib.Path(__file__).parent.parent / "prompts"

    system_prompt = (prompts_dir / "system_prompt_main.md").read_text()
    dynamic_template = (prompts_dir / "dynamic_context_template.md").read_text()
    analysis_template = (prompts_dir / "analysis_prompt_template.md").read_text()

    return {
        "system": system_prompt,
        "dynamic": dynamic_template,
        "analysis": analysis_template,
    }
