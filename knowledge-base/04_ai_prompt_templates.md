# AI Prompt Templates for Knowledge Base Processing

All prompts are designed for Chinese-language dating/social skills content. They use structured output (JSON) via the Vercel AI SDK `generateObject` function with Zod schemas.

---

## Prompt 1: Content Segmentation (Step 3)

Used in: `lib/knowledge/preprocessor.ts`
Model: `gpt-4o` (temperature: 0.1)
Purpose: Split raw text into logical segments and classify each

```
你是一个情感教育内容结构化引擎。

来源教练: {{coach_name}}

请分析以下情感/社交技巧的原始素材,将其分割为独立的知识段落。

## 分割规则:
1. 每个独立的技巧、原理、案例、或场景作为一个segment
2. 如果一个段落既包含原理又包含案例,拆分为两个segment(原理+案例各一个)
3. 对话示例必须完整保留在同一个segment中,不要拆开
4. 去除无意义的口水话、重复内容、广告推广
5. 保留教练的核心表达方式和关键金句
6. 每个segment标注适用的场景(scenario)、关系阶段(stage)、知识类型(type)和标签(tags)

## 分类体系:

### scenario (一级分类):
- opening: 破冰/开场白相关
- daily_chat: 日常聊天维护和话题技巧
- flirting: 暧昧升温、制造张力
- conflict: 吵架、冷战、冲突化解
- rejection: 被拒绝、被冷落后的应对
- escalation: 约见面、推进关系、表白策略
- texting_rules: 回复速度、频率、节奏控制
- mindset: 自信心态、框架稳定、内在建设
- attraction: 吸引力原理、两性心理学

### stage (二级分类,可多选):
- stranger: 完全陌生,还没开始聊
- acquaintance: 刚认识,基本了解阶段
- ambiguous: 暧昧期,有好感但没确认
- cooling: 冷淡期,兴趣下降或考验
- conflict: 冲突期,产生摩擦
- dating: 约会中,已经见面
- relationship: 确认关系/恋爱中

### knowledge_type (三级分类):
- principle: 核心原理/理论(解释"为什么")
- technique: 具体技巧/话术模板(教你"怎么做")
- case_study: 实战案例分析(真实对话拆解)
- anti_pattern: 常见错误/反面教材(教你"不要做什么")
- mindset: 心态与认知框架
- signal_reading: 女生行为信号解读

### tags (四级标签):
她的行为信号: late_reply(回复慢), short_reply(回复短), emoji_heavy(大量表情),
  question_asking(主动提问), selfie_sharing(发自拍), daily_sharing(分享日常),
  mood_sharing(分享心情), testing(测试你), ghosting(消失不回),
  hot_cold(忽冷忽热), jealousy_play(提到其他男生)
用户问题: needy(需求感强), over_texting(发太多消息), boring_chat(聊天无聊),
  too_serious(太严肃), friend_zone(好人卡), simp_behavior(跪舔),
  no_escalation(不敢推进), premature_confession(过早表白)
(也可以自定义补充标签)

## 重要程度判断:
- core: 核心技巧/原理,男生看了能立刻用到的
- supplementary: 补充说明,有参考价值但不是关键
- filler: 口水话、重复内容、信息密度低

---

原始素材:
{{raw_text}}
```

**Output Schema (Zod)**:
```typescript
z.object({
  segments: z.array(z.object({
    title: z.string(),
    content: z.string(),
    scenario: z.enum([...]),
    stage: z.array(z.enum([...])),
    knowledge_type: z.enum([...]),
    tags: z.array(z.string()),
    has_dialogue_example: z.boolean(),
    importance: z.enum(['core', 'supplementary', 'filler']),
  })),
  source_summary: z.string(),
  total_actionable_techniques: z.number(),
})
```

---

## Prompt 2: Content Compression (Step 4)

Used in: `lib/knowledge/compressor.ts`
Model: `gpt-4o` (temperature: 0.2)
Purpose: Compress each segment into a structured, RAG-optimized knowledge chunk

```
你是Mikey情感导师的知识库压缩引擎。

## 任务
将以下情感教练素材压缩为结构化的知识块,优化为RAG检索系统使用。

## 来源教练: {{coach_name}}
## 原始标题: {{title}}
## 知识类型: {{knowledge_type}}

## 压缩规则:

### 内容要求:
1. title: 10-20字,直击主题,像文章标题一样吸引人
2. core_principle: 用1-2句话概括这段知识的核心论点。要写得像定律一样精炼
3. key_points: 每条不超过30字,动词开头(用"XX"而不是"应该XX"),最多5条
4. actionable_technique: 描述具体怎么操作。不要泛泛而谈"要有自信",
   而是说"在她发自拍时,先关注背景再评价她"
5. one_liner: 这是最重要的字段。用一句话概括整个知识块的精华,
   这句话将用于语义搜索匹配。它应该尽可能覆盖用户可能搜索的表达方式
6. example_dialogues: 如果原文有对话,必须保留并格式化。
   对话要像真实微信聊天:口语化、简短、有表情但不过度

### 风格要求:
- 不要写成教科书,要像一个靠谱的兄弟在跟你传授经验
- 对话示例必须接地气,像真正的微信聊天
- bad_response的explanation要犀利,指出这样回为什么蠢
- good_response的explanation要清晰,说明背后的心理机制

### 质量底线:
- 压缩后的内容必须能让一个男生看完就知道该怎么做
- 每个knowledge chunk必须是独立可理解的,不依赖其他chunk
- 如果原文信息密度太低(纯口水话),返回空的key_points表示这段不值得入库

---

原始内容:
{{content}}
```

**Output Schema (Zod)**:
```typescript
z.object({
  title: z.string(),
  core_principle: z.string(),
  key_points: z.array(z.string()),
  actionable_technique: z.string().optional(),
  example_dialogues: z.array(z.object({
    context: z.string(),
    her: z.string(),
    good_response: z.string(),
    bad_response: z.string(),
    explanation: z.string(),
  })).optional(),
  common_mistakes: z.array(z.string()).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  one_liner: z.string(),
})
```

---

## Prompt 3: Deduplication Comparison

Used in: `lib/knowledge/deduplicator.ts`
Model: `gpt-4o-mini` (temperature: 0, cheaper model for binary decision)
Purpose: When vector similarity is 0.92-0.95, use LLM to make final dedup decision

```
你是一个内容去重判断引擎。

请比较以下两条知识块,判断它们是否实质上在说同一件事。

## 知识块A (已入库):
标题: {{chunk_a_title}}
精华: {{chunk_a_one_liner}}
要点: {{chunk_a_key_points}}
教练: {{chunk_a_coach}}

## 知识块B (待入库):
标题: {{chunk_b_title}}
精华: {{chunk_b_one_liner}}
要点: {{chunk_b_key_points}}
教练: {{chunk_b_coach}}

## 判断标准:
- 如果核心原理相同且给出的具体建议也相同 -> duplicate(重复)
- 如果核心原理相同但具体建议/角度/示例不同 -> complementary(互补,建议保留两条)
- 如果主题相关但讲的是不同方面 -> distinct(不同,保留两条)

请输出JSON:
{
  "verdict": "duplicate | complementary | distinct",
  "reasoning": "判断依据",
  "merge_suggestion": "如果是complementary,建议如何合并"
}
```

---

## Prompt 4: Quality Assessment

Used in: `lib/knowledge/quality-check.ts`
Model: `gpt-4o-mini` (temperature: 0)
Purpose: Auto-score processed chunks before admin review

```
你是Mikey情感导师知识库的质量审核员。

请评估以下知识块的质量,从RAG检索实用性的角度打分。

## 知识块:
标题: {{title}}
场景: {{scenario}}
阶段: {{stages}}
类型: {{knowledge_type}}
核心原理: {{core_principle}}
要点: {{key_points}}
技巧: {{actionable_technique}}
示例对话: {{example_dialogues}}
一句话精华: {{one_liner}}

## 评分维度 (每项0-1分):

1. actionability (可操作性): 看完能不能立刻用？还是只是泛泛的理论？
2. specificity (具体程度): 有没有具体场景、具体话术？还是空洞的"要有自信"？
3. example_quality (示例质量): 对话示例是否真实、接地气？good/bad对比是否有说服力？
4. retrieval_fitness (检索匹配度): one_liner和title是否容易被用户的问题匹配到？
5. standalone_value (独立价值): 脱离上下文,这条知识是否有意义？
6. uniqueness (独特性): 这个观点是否有新意？还是老生常谈？

请输出:
{
  "scores": {
    "actionability": 0.0-1.0,
    "specificity": 0.0-1.0,
    "example_quality": 0.0-1.0,
    "retrieval_fitness": 0.0-1.0,
    "standalone_value": 0.0-1.0,
    "uniqueness": 0.0-1.0
  },
  "overall_score": 0.0-1.0,
  "issues": ["具体问题列表"],
  "improvement_suggestions": ["改进建议"]
}
```

---

## Prompt 5: Batch Tag Standardization

Used in: Admin batch processing
Model: `gpt-4o-mini`
Purpose: Normalize and standardize free-form tags from different coaches

```
你是一个标签标准化引擎。

以下是知识库中出现的所有自由标签。请将它们映射到标准标签体系,
合并同义词,去除无意义的标签。

## 当前标签列表:
{{all_tags_with_counts}}

## 标准标签体系:
### 她的行为信号:
late_reply, short_reply, emoji_heavy, question_asking,
selfie_sharing, daily_sharing, mood_sharing, testing,
ghosting, hot_cold, jealousy_play

### 用户常见问题:
needy, over_texting, boring_chat, too_serious,
friend_zone, simp_behavior, no_escalation, premature_confession

## 任务:
1. 将每个非标准标签映射到最接近的标准标签
2. 如果某个非标准标签确实代表了一个新概念(标准体系没有覆盖),建议添加为新标准标签
3. 对于无意义的标签,标记为 "discard"

输出:
{
  "mappings": [
    { "original": "回复慢", "standard": "late_reply", "confidence": 0.99 },
    { "original": "暧昧升温", "standard": "discard", "reason": "这是scenario不是tag" },
    ...
  ],
  "new_tags_suggested": [
    { "tag": "voice_message", "description": "她开始发语音消息,通常是亲密度提升的信号" }
  ]
}
```

---

## Prompt 6: Source Summary Generation

Used after all segments are processed
Model: `gpt-4o-mini`
Purpose: Generate a human-readable summary of the entire source for admin dashboard

```
你是Mikey情感导师的内容管理助手。

以下是从一份情感教练素材中提取的所有知识段落摘要。
请生成一份简洁的素材总结,帮助管理员快速了解这份素材的价值。

## 素材信息:
教练: {{coach_name}}
类型: {{content_type}}
原始文件: {{filename}}

## 提取的知识段落:
{{segments_summary}}
(每个段落的标题和重要程度)

## 请输出:
{
  "summary": "2-3句话总结这份素材的核心内容和价值",
  "highlights": ["这份素材最有价值的3个知识点"],
  "coverage": {
    "scenarios_covered": ["覆盖了哪些场景"],
    "stages_covered": ["覆盖了哪些阶段"],
    "gap_notes": "有什么明显缺失或不足"
  },
  "quality_assessment": "对素材整体质量的简短评价",
  "recommended_action": "approve_all | review_individually | low_quality_skip"
}
```
