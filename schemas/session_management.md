# 会话管理与对话历史架构

## 1. 数据模型

### 用户档案 (User Profile)
```json
{
  "user_id": "usr_abc123",
  "created_at": "2026-03-17T10:00:00Z",
  "total_sessions": 15,
  "recurring_issues": ["需求感外露", "不会制造张力"],
  "improvement_notes": ["第8次会话开始学会推拉", "约会邀约成功率提升"],
  "targets": {
    "target_001": {
      "nickname": "小鱼",
      "how_met": "探探",
      "first_contact": "2026-03-01",
      "met_offline": false,
      "session_ids": ["sess_001", "sess_003", "sess_007"],
      "latest_stage": "暧昧期",
      "latest_temperature": 6,
      "notes": "她是护士,作息不规律,回复慢不一定是不感兴趣"
    }
  }
}
```

### 会话记录 (Session Record)
```json
{
  "session_id": "sess_007",
  "user_id": "usr_abc123",
  "target_id": "target_001",
  "timestamp": "2026-03-17T14:30:00Z",
  "input_type": "text_paste",
  "raw_input": "原始用户输入",
  "parsed_messages": [
    {"role": "user_male", "content": "今天忙吗", "timestamp_approx": null},
    {"role": "target_female", "content": "还好 刚下班", "timestamp_approx": null}
  ],
  "analysis_result": {
    "stage": "暧昧期",
    "temperature": 6,
    "temperature_trend": "平稳",
    "detected_signals": ["daily_sharing"],
    "user_issues": [],
    "escalation_window": false
  },
  "recommended_response": "B",
  "response_options": {
    "A": "刚下班？你们医院是不是有个潜规则 越好看的护士越要加班",
    "B": "辛苦了 刚下班肯定累 先去吃点好的犒劳自己",
    "C": "正好 我发现一家新开的日料 周末一起去试试"
  },
  "user_feedback": null,
  "follow_up_result": null
}
```

## 2. 上下文窗口构建策略

每次新会话时,按以下优先级组装上下文:

### 优先级1: 当前输入 (必须)
- 用户本次提交的聊天记录

### 优先级2: 同一目标历史 (高优)
- 该目标最近3次会话的分析摘要
- 温度变化趋势
- 之前给出的建议和后续结果

### 优先级3: 用户画像 (中优)
- 用户的常见问题模式
- 改进记录

### 优先级4: RAG检索结果 (中优)
- 与当前场景匹配的知识块 (top 3-5)

### Token预算分配 (以8K上下文窗口为例):
```
系统提示词:        ~2000 tokens (固定)
动态上下文:        ~1000 tokens (用户画像+历史摘要)
当前聊天记录:      ~1500 tokens (用户输入)
RAG知识:          ~1500 tokens (检索结果)
输出空间:          ~2000 tokens (分析+回复)
```

## 3. 历史摘要压缩

当同一目标的会话超过5次时,对早期会话进行摘要压缩:

```
[历史摘要压缩提示词]

请将以下多次会话记录压缩为一段简洁的关系发展摘要,保留以下关键信息:
1. 关系阶段变化轨迹
2. 温度变化趋势
3. 关键转折点事件
4. 用户的改进和仍存在的问题
5. 之前建议的效果反馈

会话记录:
{{sessions_to_compress}}

输出格式:
"与{{nickname}}的关系发展: 从{{initial_stage}}发展到{{current_stage}}。
 温度趋势: {{trend_description}}。
 关键节点: {{key_events}}。
 用户待改进: {{issues}}。
 有效策略: {{what_worked}}。"
```

## 4. 反馈循环

### 用户反馈收集:
每次给出建议后,可选收集:
- 用户实际发送了哪个选项 (A/B/C/自定义)
- 她的回复是什么
- 用户对建议的满意度 (1-5)

### 反馈用途:
1. 更新该目标的关系画像
2. 评估建议质量,优化提示词
3. 识别哪类建议对该用户最有效
4. 长期追踪关系发展结果

## 5. 存储方案建议

### MVP阶段:
- **用户档案 + 会话记录**: Supabase (PostgreSQL) 或 Firebase Firestore
- **向量知识库**: Chroma (嵌入到后端服务)
- **会话缓存**: Redis (存活跃会话的上下文)

### 规模化阶段:
- **用户数据**: PostgreSQL + pgvector
- **知识库**: Qdrant 或 Pinecone
- **缓存**: Redis Cluster
- **会话存储**: 分冷热存储,近期会话在Redis,历史在PostgreSQL
