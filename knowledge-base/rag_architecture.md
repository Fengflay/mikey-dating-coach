# 知识库RAG架构设计

## 1. 知识分类体系 (Taxonomy)

知识库按以下维度组织,每条知识片段都打上多维标签用于精准检索。

### 一级分类: 场景类型 (scenario)
```
opening          # 破冰/开场白
daily_chat       # 日常聊天维护
flirting         # 暧昧升温
conflict         # 冲突处理
rejection        # 被拒绝/被冷落应对
escalation       # 关系推进(约见面/表白)
texting_rules    # 聊天节奏与规则
mindset          # 心态建设与内功
attraction       # 吸引力原理
```

### 二级分类: 关系阶段 (stage)
```
stranger         # 完全陌生
acquaintance     # 初识
ambiguous        # 暧昧期
cooling          # 冷淡期
conflict         # 冲突期
dating           # 约会中
relationship     # 恋爱中
```

### 三级分类: 知识类型 (type)
```
principle        # 核心原理/理论
technique        # 具体技巧/话术模板
case_study       # 实战案例分析
anti_pattern     # 常见错误/反面教材
mindset          # 心态与认知
signal_reading   # 信号解读方法
```

### 四级标签: 情境标签 (tags)
```
# 她的行为信号
late_reply, short_reply, emoji_heavy, question_asking,
selfie_sharing, daily_sharing, mood_sharing, testing,
ghosting, hot_cold, jealousy_play

# 用户常见问题
needy, over_texting, boring_chat, too_serious,
friend_zone, simp_behavior, no_escalation,
premature_confession
```

## 2. 知识块结构 (Chunk Schema)

每条知识以如下JSON结构存储:

```json
{
  "id": "kb_001",
  "title": "暧昧期女生发自拍的正确回应",
  "scenario": "flirting",
  "stage": ["ambiguous"],
  "type": "technique",
  "tags": ["selfie_sharing", "暧昧期", "回复策略"],
  "content": "当暧昧期女生主动发自拍给你时,这是明确的IOI(兴趣指标)...",
  "key_points": [
    "不要直接说好看,要曲解或关注细节",
    "可以用对比制造张力: 关注背景而非她本人",
    "适时推拉: 先损后夸"
  ],
  "example_dialogues": [
    {
      "her": "[发了一张自拍]",
      "good_response": "你背后那个咖啡店我知道 他家拿铁巨难喝",
      "bad_response": "好好看啊！！！",
      "explanation": "关注背景制造意外感,暗示你有生活经验,同时没有直接夸她避免需求感外露"
    }
  ],
  "source": "field_experience",
  "difficulty": "intermediate",
  "embedding": [0.123, -0.456, ...]  // 向量嵌入
}
```

## 3. 分块策略 (Chunking Strategy)

### 教练素材分块规则:
1. **按场景切分**: 每个独立场景/案例作为一个chunk,目标300-500 tokens
2. **保留上下文**: 每个chunk包含场景描述+核心要点+示例对话
3. **重叠窗口**: 相邻chunk之间保留50 token重叠,避免信息断裂
4. **对话完整性**: 示例对话不拆分,作为整体保留在chunk内

### 素材来源处理:

#### 视频/音频课程:
1. 语音转文字 (Whisper API)
2. 按主题分段 (基于时间戳+语义断点)
3. 提取核心观点,去除口水话
4. 结构化为 chunk schema

#### 文章/书籍:
1. 按章节/段落分割
2. 提取核心论点+支撑案例
3. 标注适用场景和阶段

#### 实战案例:
1. 一个完整案例 = 一个chunk
2. 包含: 背景、对话记录、分析、正确做法
3. 标注关键转折点

## 4. 检索策略 (Retrieval Strategy)

### 查询构建:
从用户提交的聊天记录中提取以下信号,构建检索query:

```python
def build_retrieval_query(analysis_result):
    """
    基于初步分析结果构建检索查询
    """
    query_components = []

    # 1. 关系阶段
    query_components.append(f"stage:{analysis_result['stage']}")

    # 2. 检测到的信号
    for signal in analysis_result['detected_signals']:
        query_components.append(f"tag:{signal}")

    # 3. 用户问题(如有)
    for issue in analysis_result['user_issues']:
        query_components.append(f"tag:{issue}")

    # 4. 语义查询 - 用她最后几条消息的语义
    semantic_query = analysis_result['her_last_messages_summary']

    return {
        "semantic_query": semantic_query,
        "filters": {
            "stage": analysis_result['stage'],
            "tags": analysis_result['detected_signals'],
        },
        "top_k": 5,
        "score_threshold": 0.75
    }
```

### 检索流程:
1. **阶段过滤**: 先按关系阶段缩小范围
2. **标签匹配**: 用检测到的信号标签做精确匹配
3. **语义搜索**: 在过滤后的子集中做向量相似度搜索
4. **重排序**: 结合标签匹配分+语义分+新鲜度做最终排序
5. **去重**: 合并高度相似的知识块

### 向量数据库选型建议:
- **小规模 (<10K chunks)**: Chroma (本地部署, 零成本)
- **中规模 (10K-100K)**: Qdrant (自托管或云端)
- **大规模 (>100K)**: Pinecone (全托管, 低延迟)

## 5. 知识库冷启动内容规划

### Phase 1: 核心知识 (必须有)
- 各阶段聊天基本原则 x 20条
- 常见女生信号解读 x 30条
- 常见用户错误诊断 x 20条
- 基础回复技巧 x 30条

### Phase 2: 场景扩展
- 破冰/开场白模板库 x 50条
- 约会邀约策略 x 20条
- 冲突处理案例 x 20条
- 被冷落后的应对 x 20条

### Phase 3: 高级内容
- 长期关系维护 x 30条
- 心态与内功建设 x 20条
- 特殊场景处理 x 30条 (如: 她提到前任, 她说"你是好人", 等)
