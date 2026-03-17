# Chunking Strategy for Mikey Knowledge Base

## Design Principles

The chunking strategy must serve two masters:
1. **Embedding quality**: Chunks must be semantically coherent for accurate vector similarity search
2. **RAG retrieval utility**: Each chunk must be independently useful when injected into the LLM context

Chinese text has different token economics than English. One Chinese character is roughly 1 token (vs English where 1 token is roughly 0.75 words). This affects all sizing decisions.

---

## Chunk Size Parameters

| Parameter | Value | Chinese Chars | Rationale |
|-----------|-------|---------------|-----------|
| Target size | 300-500 tokens | 300-500 chars | Sweet spot for embedding quality. Large enough to carry context, small enough for precise retrieval |
| Max size (hard limit) | 800 tokens | 800 chars | Beyond this, embedding quality degrades and retrieval becomes imprecise |
| Min size | 100 tokens | 100 chars | Below this, chunk lacks standalone meaning |
| Overlap | 50 tokens | 50 chars | Prevents boundary information loss |

---

## Chunking Rules by Knowledge Type

### 1. Principle (核心原理)

```
Target: 200-400 chars
Structure:
  [原理标题]
  [原理描述: 1-2句核心论点]
  [要点列表: 3-5条]
  [为什么重要: 1句话]

Example chunk:
  标题: 推拉原理 - 制造张力的核心
  原理: 吸引力来自于不确定性。当你的态度在"感兴趣"和"无所谓"之间切换时,
        会激发对方的好奇心和追逐欲。
  要点:
  - 推: 轻微的否定、忽视、或不在意的表现
  - 拉: 关注、认可、暗示好感的信号
  - 推拉比例建议: 先推后拉,推70%拉30%(冷淡期相反)
  - 频率: 不要在同一条消息里同时推拉,至少隔一个回合
```

**Rule**: Principles are self-contained. Never split a principle across chunks. If a principle exceeds 500 chars, split the supporting examples into a separate chunk linked via `related_chunk_id`.

### 2. Technique (具体技巧/话术模板)

```
Target: 300-500 chars
Structure:
  [技巧名称]
  [适用场景: 1句话]
  [具体操作: 步骤或模板]
  [示例对话: good + bad response]
  [注意事项: 1-2条]

Example chunk:
  标题: 曲解法 - 把她的话往暧昧方向解读
  适用: 暧昧期,她发了任何可以多重理解的消息
  操作: 故意"误解"她的话,往有趣或暧昧的方向引导
  示例:
    她: 我今天买了条裙子
    好: 穿给我看啊 我帮你参谋参谋(暗示见面)
    差: 好看吗？发照片看看(直球索要,需求感)
  注意: 曲解要自然,不能太刻意。如果她没接,不要强行解释
```

**Rule**: Every technique chunk MUST include at least one dialogue example. Dialogues are never split. If the example is long (> 200 chars), the example itself becomes its own chunk with `knowledge_type = 'case_study'`.

### 3. Case Study (实战案例)

```
Target: 400-600 chars (allowed to exceed 500 for dialogue integrity)
Structure:
  [案例标题]
  [背景: 关系阶段 + 渠道 + 核心问题]
  [完整对话: 保持连续性]
  [分析: 关键转折点标注]
  [正确做法总结]

Example chunk:
  标题: 暧昧期女生突然变冷 - 实战拆解
  背景: 探探认识2周,暧昧期,连续3天她回复变慢变短
  对话:
    他: 在忙吗
    她: 嗯(3小时后回)
    他: 那你忙完了找我 我有个好玩的事想跟你说
    她: 啥事(10分钟后回复,注意节奏变快)
    他: 见面再跟你说 周六下午你有空吗
    她: 看情况吧
    他: 行 不强求 反正我自己去也挺好的
    她: 去哪？
  分析: 关键转折在"我有个好玩的事" - 制造悬念收回主动权
  正确做法: 不追问不解释,给悬念+轻松邀约+洒脱框架
```

**Rule**: Case study dialogues have an absolute integrity constraint. A dialogue exchange (her message + his response + outcome) is NEVER split across chunks. If the full case exceeds 800 chars, split into Part 1 (background + first half of dialogue) and Part 2 (second half + analysis), with cross-references.

### 4. Anti-Pattern (常见错误)

```
Target: 200-400 chars
Structure:
  [错误名称]
  [表现形式: 具体行为描述]
  [为什么是错的: 她的心理反应]
  [错误示例 vs 正确做法]

Example chunk:
  标题: 查岗式聊天 - 最快的劝退方式
  表现: 频繁问"在干嘛""吃了吗""到家了吗""跟谁出去"
  问题: 这传递的信号是"我在监视你的生活",控制欲+需求感双杀
  错误: 你: 今天去哪了？/ 跟谁一起？/ 怎么不发朋友圈了
  正确: 不问,等她主动分享。如果想聊天,用分享自己的方式开场
```

### 5. Signal Reading (信号解读)

```
Target: 200-400 chars
Structure:
  [信号描述]
  [含义分析]
  [应对策略]
  [常见误判]
```

---

## Semantic Chunking Algorithm

The pipeline does NOT use naive fixed-size splitting. Instead it follows a 3-stage semantic chunking process:

### Stage 1: AI Segmentation (Step 3 in pipeline)
GPT-4o segments the raw text into logical sections based on topic boundaries. Each segment is a candidate chunk.

### Stage 2: Size Validation & Splitting
```typescript
function validateAndSplitChunks(segments: Segment[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const segment of segments) {
    const charCount = segment.content.length;

    if (charCount <= 800) {
      // Within limits, use as-is
      chunks.push(segment);
    } else if (segment.has_dialogue_example) {
      // Oversized but contains dialogue - split carefully
      const { preDialogue, dialogue, postDialogue } = splitAroundDialogue(segment);
      if (preDialogue.length >= 100) chunks.push(preDialogue);
      chunks.push(dialogue); // dialogue chunk, may exceed 500 but never exceeds 800
      if (postDialogue.length >= 100) chunks.push(postDialogue);
    } else {
      // Oversized, no dialogue - split at paragraph boundaries
      const subChunks = splitAtParagraphBoundaries(segment.content, {
        targetSize: 400,
        maxSize: 800,
        overlap: 50,
      });
      chunks.push(...subChunks);
    }
  }

  // Remove chunks below minimum
  return chunks.filter(c => c.content.length >= 100);
}

function splitAtParagraphBoundaries(
  text: string,
  opts: { targetSize: number; maxSize: number; overlap: number }
): Chunk[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: Chunk[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + para).length > opts.maxSize && currentChunk.length >= 100) {
      chunks.push({ content: currentChunk.trim() });
      // Overlap: start next chunk with end of current
      currentChunk = currentChunk.slice(-opts.overlap) + '\n\n' + para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk.trim().length >= 100) {
    chunks.push({ content: currentChunk.trim() });
  }

  return chunks;
}
```

### Stage 3: Metadata Enrichment
Each chunk inherits metadata from its parent segment (scenario, stage, tags) and gets additional computed metadata:

```typescript
type ChunkMetadata = {
  // Inherited from AI segmentation
  scenario: ScenarioType;
  stages: StageType[];
  knowledge_type: KnowledgeType;
  tags: string[];
  importance: 'core' | 'supplementary' | 'filler';

  // Computed
  char_count: number;
  token_count_estimate: number;  // chars * 1.1 for Chinese
  has_dialogue: boolean;
  dialogue_count: number;
  coach_name: string;
  source_id: string;
  chunk_position: number;       // position within source
  total_chunks_in_source: number;
};
```

---

## Embedding Input Construction

What gets embedded is NOT the raw chunk content. Instead, we construct an optimized embedding input that combines structured metadata with content for better retrieval:

```typescript
function buildEmbeddingInput(chunk: ProcessedChunk): string {
  const parts = [
    `标题: ${chunk.title}`,
    `场景: ${SCENARIO_LABELS[chunk.scenario]}`,
    `阶段: ${chunk.stages.map(s => STAGE_LABELS[s]).join('、')}`,
    `类型: ${TYPE_LABELS[chunk.knowledge_type]}`,
  ];

  if (chunk.core_principle) {
    parts.push(`原理: ${chunk.core_principle}`);
  }

  if (chunk.key_points.length > 0) {
    parts.push(`要点: ${chunk.key_points.join('; ')}`);
  }

  if (chunk.actionable_technique) {
    parts.push(`技巧: ${chunk.actionable_technique}`);
  }

  parts.push(`精华: ${chunk.one_liner}`);

  if (chunk.tags.length > 0) {
    parts.push(`标签: ${chunk.tags.join(', ')}`);
  }

  return parts.join('\n');
}

// Chinese labels for better embedding quality
const SCENARIO_LABELS: Record<string, string> = {
  opening: '破冰开场白',
  daily_chat: '日常聊天',
  flirting: '暧昧升温',
  conflict: '冲突处理',
  rejection: '被拒绝应对',
  escalation: '关系推进',
  texting_rules: '聊天规则',
  mindset: '心态建设',
  attraction: '吸引力原理',
};

const STAGE_LABELS: Record<string, string> = {
  stranger: '陌生',
  acquaintance: '初识',
  ambiguous: '暧昧期',
  cooling: '冷淡期',
  conflict: '冲突期',
  dating: '约会中',
  relationship: '恋爱中',
};
```

---

## Overlap Strategy

Overlap is applied ONLY for paragraph-boundary splits (Stage 2 fallback), NOT for AI-segmented chunks. The rationale:

- AI-segmented chunks are already topically coherent; overlap would introduce noise
- Paragraph splits may cut mid-concept; overlap preserves continuity

Overlap size: **50 Chinese characters** (~50 tokens). This is roughly 1-2 sentences, enough to maintain context without inflating storage.

---

## Quality Checks on Chunks

Before entering the review queue, each chunk passes automated quality checks:

```typescript
function qualityCheck(chunk: ProcessedChunk): QualityReport {
  const issues: string[] = [];
  let score = 1.0;

  // Size checks
  if (chunk.content.length < 100) {
    issues.push('Chunk too short (< 100 chars)');
    score -= 0.3;
  }
  if (chunk.content.length > 800) {
    issues.push('Chunk exceeds max size (> 800 chars)');
    score -= 0.2;
  }

  // Content checks
  if (!chunk.title || chunk.title.length < 4) {
    issues.push('Title too short or missing');
    score -= 0.1;
  }
  if (!chunk.one_liner || chunk.one_liner.length < 10) {
    issues.push('One-liner summary too short');
    score -= 0.1;
  }
  if (chunk.key_points.length === 0) {
    issues.push('No key points extracted');
    score -= 0.1;
  }

  // Technique chunks must have examples
  if (chunk.knowledge_type === 'technique' && (!chunk.example_dialogues || chunk.example_dialogues.length === 0)) {
    issues.push('Technique chunk missing dialogue example');
    score -= 0.2;
  }

  // Classification completeness
  if (chunk.stages.length === 0) {
    issues.push('No relationship stages assigned');
    score -= 0.1;
  }
  if (chunk.tags.length === 0) {
    issues.push('No tags assigned');
    score -= 0.05;
  }

  return { score: Math.max(0, score), issues, passesMinimum: score >= 0.6 };
}
```
