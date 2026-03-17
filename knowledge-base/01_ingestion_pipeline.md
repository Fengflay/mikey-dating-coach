# Knowledge Base Ingestion Pipeline

## Architecture Overview

```
Raw Upload (PDF/Text/Video/Audio)
       |
       v
  [1] File Reception & Storage (Supabase Storage)
       |
       v
  [2] Format Extraction (text extraction per format)
       |
       v
  [3] AI Pre-Processing (segmentation + topic detection)
       |
       v
  [4] AI Compression (summarize -> principles + techniques + examples)
       |
       v
  [5] Chunking (semantic chunking with metadata)
       |
       v
  [6] Embedding Generation (OpenAI text-embedding-3-small)
       |
       v
  [7] Deduplication Check (cosine similarity against existing chunks)
       |
       v
  [8] Admin Review Queue (human-in-the-loop before publish)
       |
       v
  [9] Index & Publish (pgvector + full-text search index)
```

---

## Step-by-Step Pipeline

### Step 1: File Reception & Storage

**Endpoint**: `POST /api/knowledge/upload`

```typescript
// app/api/knowledge/upload/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const coachName = formData.get('coach_name') as string;
  const contentType = formData.get('content_type') as string;
  // content_type: 'video_transcript' | 'article' | 'book_chapter' | 'audio_transcript' | 'course_notes' | 'chat_example'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Upload raw file to Supabase Storage
  const filePath = `knowledge-raw/${coachName}/${Date.now()}_${file.name}`;
  const { data: storageData, error: storageError } = await supabase
    .storage
    .from('knowledge-base')
    .upload(filePath, file);

  if (storageError) throw storageError;

  // 2. Create knowledge_sources record with status = 'uploaded'
  const { data: source, error: dbError } = await supabase
    .from('knowledge_sources')
    .insert({
      coach_name: coachName,
      content_type: contentType,
      original_filename: file.name,
      storage_path: filePath,
      file_size_bytes: file.size,
      mime_type: file.type,
      processing_status: 'uploaded',
    })
    .select()
    .single();

  if (dbError) throw dbError;

  // 3. Trigger async processing pipeline
  // Option A: Supabase Edge Function via pg_net
  // Option B: Next.js background job via Inngest/Trigger.dev
  await triggerProcessingPipeline(source.id);

  return NextResponse.json({ source_id: source.id, status: 'uploaded' });
}
```

**Libraries**:
- `@supabase/supabase-js` for storage and DB
- `inngest` or `trigger.dev` for async job orchestration (recommended over raw Edge Functions for retry/observability)

---

### Step 2: Format Extraction

Each format requires a different extraction strategy. This step produces raw plain text from any input format.

```typescript
// lib/knowledge/extractors.ts

import pdfParse from 'pdf-parse';

type ExtractionResult = {
  raw_text: string;
  metadata: {
    word_count: number;
    char_count: number;
    language: string;
    extraction_method: string;
    duration_seconds?: number; // for audio/video
    page_count?: number;       // for PDF
  };
};

// --- PDF Extraction ---
export async function extractFromPDF(buffer: Buffer): Promise<ExtractionResult> {
  const data = await pdfParse(buffer);
  return {
    raw_text: data.text,
    metadata: {
      word_count: data.text.split(/\s+/).length,
      char_count: data.text.length,
      language: 'zh',
      extraction_method: 'pdf-parse',
      page_count: data.numpages,
    },
  };
}

// --- Plain Text / Markdown ---
export async function extractFromText(text: string): Promise<ExtractionResult> {
  return {
    raw_text: text,
    metadata: {
      word_count: text.length, // Chinese: 1 char ~ 1 word
      char_count: text.length,
      language: 'zh',
      extraction_method: 'direct',
    },
  };
}

// --- Video Transcript (pre-transcribed .srt/.vtt/.txt) ---
export async function extractFromVideoTranscript(text: string): Promise<ExtractionResult> {
  // Strip SRT/VTT formatting: timestamps, sequence numbers
  const cleaned = text
    .replace(/^\d+\s*$/gm, '')                    // sequence numbers
    .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/gm, '') // timestamps
    .replace(/<[^>]+>/g, '')                       // HTML tags
    .replace(/\n{3,}/g, '\n\n')                    // excessive newlines
    .trim();

  return {
    raw_text: cleaned,
    metadata: {
      word_count: cleaned.length,
      char_count: cleaned.length,
      language: 'zh',
      extraction_method: 'srt_strip',
    },
  };
}

// --- Audio Transcription (raw audio file -> text via Whisper) ---
export async function extractFromAudio(audioBuffer: Buffer): Promise<ExtractionResult> {
  // Use OpenAI Whisper API for transcription
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), 'audio.mp3');
  formData.append('model', 'whisper-1');
  formData.append('language', 'zh');
  formData.append('response_format', 'verbose_json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });

  const result = await response.json();
  return {
    raw_text: result.text,
    metadata: {
      word_count: result.text.length,
      char_count: result.text.length,
      language: result.language || 'zh',
      extraction_method: 'whisper-1',
      duration_seconds: result.duration,
    },
  };
}
```

**Libraries**:
- `pdf-parse` for PDF text extraction
- OpenAI Whisper API for audio transcription
- For video files that need audio extraction first: `ffmpeg` via `fluent-ffmpeg` to extract audio track, then send to Whisper

---

### Step 3: AI Pre-Processing (Segmentation + Topic Detection)

After extracting raw text, use an LLM to segment the content into logical sections and detect topics.

```typescript
// lib/knowledge/preprocessor.ts
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const SegmentationSchema = z.object({
  segments: z.array(z.object({
    title: z.string().describe('该段落的简短标题'),
    content: z.string().describe('该段落的完整内容'),
    scenario: z.enum([
      'opening', 'daily_chat', 'flirting', 'conflict',
      'rejection', 'escalation', 'texting_rules', 'mindset', 'attraction'
    ]).describe('一级分类: 场景类型'),
    stage: z.array(z.enum([
      'stranger', 'acquaintance', 'ambiguous', 'cooling',
      'conflict', 'dating', 'relationship'
    ])).describe('二级分类: 适用的关系阶段(可多选)'),
    knowledge_type: z.enum([
      'principle', 'technique', 'case_study', 'anti_pattern', 'mindset', 'signal_reading'
    ]).describe('三级分类: 知识类型'),
    tags: z.array(z.string()).describe('四级标签: 情境标签'),
    has_dialogue_example: z.boolean().describe('是否包含对话示例'),
    importance: z.enum(['core', 'supplementary', 'filler']).describe('重要程度'),
  })),
  source_summary: z.string().describe('整篇素材的一句话总结'),
  total_actionable_techniques: z.number().describe('提取出的可操作技巧数量'),
});

export async function preprocessContent(rawText: string, coachName: string) {
  const result = await generateObject({
    model: openai('gpt-4o'),
    schema: SegmentationSchema,
    prompt: SEGMENTATION_PROMPT.replace('{{raw_text}}', rawText)
                                .replace('{{coach_name}}', coachName),
    temperature: 0.1,
  });

  return result.object;
}

const SEGMENTATION_PROMPT = `你是一个情感教育内容结构化引擎。

来源教练: {{coach_name}}

请分析以下情感/社交技巧的原始素材,将其分割为独立的知识段落。

## 分割规则:
1. 每个独立的技巧、原理、案例、或场景作为一个segment
2. 如果一个段落既包含原理又包含案例,拆分为两个segment(原理+案例各一个)
3. 对话示例必须完整保留在同一个segment中,不要拆开
4. 去除无意义的口水话、重复内容、广告推广
5. 保留教练的核心表达方式和关键金句

## 分类体系:

### scenario (一级分类):
- opening: 破冰/开场白
- daily_chat: 日常聊天维护
- flirting: 暧昧升温
- conflict: 冲突处理
- rejection: 被拒绝/被冷落应对
- escalation: 关系推进(约见面/表白)
- texting_rules: 聊天节奏与规则
- mindset: 心态建设与内功
- attraction: 吸引力原理

### stage (二级分类,可多选):
- stranger: 完全陌生
- acquaintance: 初识
- ambiguous: 暧昧期
- cooling: 冷淡期
- conflict: 冲突期
- dating: 约会中
- relationship: 恋爱中

### knowledge_type (三级分类):
- principle: 核心原理/理论
- technique: 具体技巧/话术模板
- case_study: 实战案例分析
- anti_pattern: 常见错误/反面教材
- mindset: 心态与认知
- signal_reading: 信号解读方法

### tags (四级标签,从以下选取或自定义):
她的行为: late_reply, short_reply, emoji_heavy, question_asking, selfie_sharing, daily_sharing, mood_sharing, testing, ghosting, hot_cold, jealousy_play
用户问题: needy, over_texting, boring_chat, too_serious, friend_zone, simp_behavior, no_escalation, premature_confession

## 重要程度判断:
- core: 核心技巧/原理,对用户最有直接帮助
- supplementary: 补充说明,有一定参考价值
- filler: 填充内容,信息密度低

---

原始素材:
{{raw_text}}`;
```

---

### Step 4: AI Compression (Summarize into Principles + Techniques + Examples)

For each segment from Step 3, produce a compressed, RAG-optimized knowledge chunk.

```typescript
// lib/knowledge/compressor.ts
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const CompressedChunkSchema = z.object({
  title: z.string().describe('知识块标题,10-20字'),
  core_principle: z.string().describe('核心原理,1-2句话概括'),
  key_points: z.array(z.string()).describe('要点列表,每条一句话'),
  actionable_technique: z.string().optional().describe('具体可操作的技巧描述'),
  example_dialogues: z.array(z.object({
    context: z.string().describe('场景描述'),
    her: z.string().describe('她说的话'),
    good_response: z.string().describe('推荐回复'),
    bad_response: z.string().describe('错误回复'),
    explanation: z.string().describe('为什么好/为什么差'),
  })).optional().describe('对话示例'),
  common_mistakes: z.array(z.string()).optional().describe('常见错误'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).describe('难度等级'),
  one_liner: z.string().describe('一句话精华摘要,用于RAG检索时的快速理解'),
});

export async function compressSegment(
  segment: { title: string; content: string; knowledge_type: string },
  coachName: string
) {
  const result = await generateObject({
    model: openai('gpt-4o'),
    schema: CompressedChunkSchema,
    prompt: COMPRESSION_PROMPT
      .replace('{{content}}', segment.content)
      .replace('{{title}}', segment.title)
      .replace('{{coach_name}}', coachName)
      .replace('{{knowledge_type}}', segment.knowledge_type),
    temperature: 0.2,
  });

  return result.object;
}

const COMPRESSION_PROMPT = `你是Mikey情感导师的知识库压缩引擎。

## 任务
将以下情感教练素材压缩为结构化的知识块,用于RAG检索系统。

## 来源教练: {{coach_name}}
## 原始标题: {{title}}
## 知识类型: {{knowledge_type}}

## 压缩规则:
1. 保留核心原理和可操作技巧,去除冗余解释
2. 对话示例必须保持自然的微信聊天风格(口语化、简短)
3. 如果原文有对话示例,必须保留并结构化为 good_response/bad_response 格式
4. key_points 每条不超过30字,直击要害
5. one_liner 是整个知识块的精华,用于语义搜索时快速匹配用户场景
6. 保留教练的风格特征,但去除口水话
7. common_mistakes 要具体,给出错误示例而不是泛泛而谈

## 质量标准:
- 压缩后的知识块应该是一个男生看完就能立刻使用的指南
- 不要写成教科书,要像一个兄弟在跟你说大实话
- 对话示例要真实、接地气,像真正的微信聊天

---

原始内容:
{{content}}`;
```

---

### Step 5: Chunking Strategy

See `03_chunking_strategy.md` for full details. Key parameters:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Target chunk size | 300-500 tokens (600-1000 Chinese chars) | Optimal for embedding quality and RAG retrieval precision |
| Max chunk size | 800 tokens (hard limit) | Prevents context window waste |
| Min chunk size | 100 tokens | Below this, chunk lacks standalone meaning |
| Overlap | 50 tokens (~100 Chinese chars) | Prevents information loss at boundaries |
| Dialogue preservation | Never split a dialogue example | Broken dialogues are useless for RAG |

---

### Step 6: Embedding Generation

```typescript
// lib/knowledge/embedder.ts
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: text,
  });
  return embedding; // 1536 dimensions
}

// For batch processing
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: texts,
  });
  return embeddings;
}
```

**Embedding input construction** (what gets embedded):

```typescript
function buildEmbeddingInput(chunk: CompressedChunk, metadata: ChunkMetadata): string {
  // Combine structured fields into a single embedding-friendly string
  // This produces better retrieval than embedding raw content alone
  return [
    `标题: ${chunk.title}`,
    `场景: ${metadata.scenario}`,
    `阶段: ${metadata.stage.join(', ')}`,
    `核心原理: ${chunk.core_principle}`,
    `要点: ${chunk.key_points.join('; ')}`,
    chunk.actionable_technique ? `技巧: ${chunk.actionable_technique}` : '',
    `精华: ${chunk.one_liner}`,
  ].filter(Boolean).join('\n');
}
```

---

### Step 7: Deduplication

```typescript
// lib/knowledge/deduplicator.ts
import { createClient } from '@supabase/supabase-js';

export async function checkDuplicate(
  embedding: number[],
  threshold: number = 0.92 // cosine similarity threshold
): Promise<{ isDuplicate: boolean; similarChunks: any[] }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Use pgvector cosine similarity search
  const { data: similarChunks } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: 3,
  });

  return {
    isDuplicate: similarChunks && similarChunks.length > 0,
    similarChunks: similarChunks || [],
  };
}
```

When duplicates are found:
- If similarity > 0.95: Skip the chunk, mark as "duplicate_of" in the source record
- If similarity 0.92-0.95: Flag for admin review (might be same advice from different coach)
- If similarity < 0.92: Proceed with insertion

---

### Step 8: Admin Review Queue

All processed chunks enter a review queue before being published to the live knowledge base.

Status flow: `uploaded -> extracting -> processing -> review_pending -> approved -> published`

Alternative: `uploaded -> extracting -> processing -> review_pending -> rejected`

Admin can:
- Approve chunks as-is
- Edit the compressed content before approving
- Merge similar chunks from different coaches
- Reject low-quality or duplicate content
- Re-classify (change scenario/stage/tags)

---

### Step 9: Index & Publish

On approval, the chunk is:
1. Inserted into `knowledge_chunks` with `status = 'published'`
2. Embedding stored in the `embedding` vector column
3. Full-text search index auto-updated via the `fts_document` generated column
4. The `knowledge_sources` record updated with chunk count and processing stats

---

## Job Orchestration (Inngest)

```typescript
// lib/knowledge/pipeline-jobs.ts
import { inngest } from '@/lib/inngest';

export const processKnowledgeSource = inngest.createFunction(
  {
    id: 'process-knowledge-source',
    retries: 3,
    concurrency: { limit: 5 },
  },
  { event: 'knowledge/source.uploaded' },
  async ({ event, step }) => {
    const sourceId = event.data.source_id;

    // Step 1: Extract text
    const extracted = await step.run('extract-text', async () => {
      // ... call appropriate extractor based on content_type
      return extractedResult;
    });

    // Step 2: AI Preprocess (segment + classify)
    const segments = await step.run('preprocess', async () => {
      return await preprocessContent(extracted.raw_text, event.data.coach_name);
    });

    // Step 3: Compress each segment
    const chunks = await step.run('compress-segments', async () => {
      return await Promise.all(
        segments.segments
          .filter(s => s.importance !== 'filler')
          .map(s => compressSegment(s, event.data.coach_name))
      );
    });

    // Step 4: Generate embeddings
    const embeddings = await step.run('generate-embeddings', async () => {
      return await generateEmbeddings(
        chunks.map(c => buildEmbeddingInput(c, c.metadata))
      );
    });

    // Step 5: Dedup check + insert into review queue
    await step.run('dedup-and-queue', async () => {
      for (let i = 0; i < chunks.length; i++) {
        const { isDuplicate, similarChunks } = await checkDuplicate(embeddings[i]);
        // Insert with appropriate status
        await insertChunk(chunks[i], embeddings[i], sourceId, {
          status: isDuplicate ? 'duplicate_review' : 'review_pending',
          similar_chunk_ids: similarChunks.map(c => c.id),
        });
      }
    });

    // Step 6: Update source status
    await step.run('update-source-status', async () => {
      await updateSourceStatus(sourceId, 'review_pending', {
        total_segments: segments.segments.length,
        total_chunks: chunks.length,
        filler_discarded: segments.segments.filter(s => s.importance === 'filler').length,
      });
    });
  }
);
```

---

## Error Handling & Retry Strategy

| Stage | Error Type | Retry | Fallback |
|-------|-----------|-------|----------|
| Upload | Storage failure | 3x with exponential backoff | Alert admin |
| Extraction | PDF parse error | 1x | Flag as 'extraction_failed', admin manual review |
| Whisper API | Rate limit / timeout | 3x, 30s backoff | Queue for retry in 5 min |
| LLM (GPT-4o) | Rate limit | 5x, exponential backoff | Fallback to GPT-4o-mini |
| LLM (GPT-4o) | Content filter | 0 | Flag for manual processing |
| Embedding | API failure | 3x | Queue for retry |
| DB insert | Constraint violation | 0 | Log and alert |

---

## Cost Estimation

For processing 100 knowledge sources averaging 5,000 Chinese characters each:

| Component | Unit Cost | Quantity | Total |
|-----------|-----------|----------|-------|
| GPT-4o (preprocessing) | ~$0.01/1K input tokens | 500K tokens | ~$5.00 |
| GPT-4o (compression) | ~$0.01/1K input + $0.03/1K output | 300K in + 150K out | ~$7.50 |
| text-embedding-3-small | $0.02/1M tokens | ~200K tokens | ~$0.01 |
| Whisper (if audio) | $0.006/minute | varies | varies |
| Supabase Storage | $0.021/GB | <1GB | ~$0.02 |

**Total per 100 sources: ~$12-15** (text-only, no audio transcription)
