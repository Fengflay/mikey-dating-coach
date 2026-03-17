-- ============================================================
-- Mikey情感导师 Knowledge Base Schema
-- Database: Supabase (PostgreSQL + pgvector)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;         -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- trigram for fuzzy text search

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE content_type AS ENUM (
  'video_transcript',
  'article',
  'book_chapter',
  'audio_transcript',
  'course_notes',
  'chat_example'
);

CREATE TYPE processing_status AS ENUM (
  'uploaded',
  'extracting',
  'processing',
  'review_pending',
  'approved',
  'published',
  'rejected',
  'extraction_failed',
  'processing_failed'
);

CREATE TYPE scenario_type AS ENUM (
  'opening',        -- 破冰/开场白
  'daily_chat',     -- 日常聊天维护
  'flirting',       -- 暧昧升温
  'conflict',       -- 冲突处理
  'rejection',      -- 被拒绝/被冷落应对
  'escalation',     -- 关系推进(约见面/表白)
  'texting_rules',  -- 聊天节奏与规则
  'mindset',        -- 心态建设与内功
  'attraction'      -- 吸引力原理
);

CREATE TYPE stage_type AS ENUM (
  'stranger',       -- 完全陌生
  'acquaintance',   -- 初识
  'ambiguous',      -- 暧昧期
  'cooling',        -- 冷淡期
  'conflict',       -- 冲突期
  'dating',         -- 约会中
  'relationship'    -- 恋爱中
);

CREATE TYPE knowledge_type AS ENUM (
  'principle',       -- 核心原理/理论
  'technique',       -- 具体技巧/话术模板
  'case_study',      -- 实战案例分析
  'anti_pattern',    -- 常见错误/反面教材
  'mindset',         -- 心态与认知
  'signal_reading'   -- 信号解读方法
);

CREATE TYPE difficulty_level AS ENUM (
  'beginner',
  'intermediate',
  'advanced'
);

CREATE TYPE chunk_status AS ENUM (
  'draft',
  'review_pending',
  'duplicate_review',
  'approved',
  'published',
  'rejected',
  'archived'
);

CREATE TYPE importance_level AS ENUM (
  'core',
  'supplementary',
  'filler'
);

-- ============================================================
-- TABLE: knowledge_coaches (Coach Registry)
-- ============================================================

CREATE TABLE knowledge_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  specialties scenario_type[] DEFAULT '{}',
  source_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed some initial coaches
COMMENT ON TABLE knowledge_coaches IS '教练注册表 - 每个内容来源的教练/作者';

-- ============================================================
-- TABLE: knowledge_sources (Raw Material Registry)
-- ============================================================

CREATE TABLE knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source identification
  coach_id UUID REFERENCES knowledge_coaches(id) ON DELETE SET NULL,
  coach_name TEXT NOT NULL,           -- denormalized for convenience
  content_type content_type NOT NULL,
  title TEXT,                          -- admin-provided or AI-generated title
  description TEXT,                    -- brief description of the source material

  -- File storage
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,          -- Supabase Storage path
  file_size_bytes BIGINT,
  mime_type TEXT,

  -- Extraction results
  raw_text TEXT,                       -- extracted full text (Bronze layer)
  extracted_metadata JSONB DEFAULT '{}', -- word_count, page_count, duration, etc.

  -- Processing pipeline state
  processing_status processing_status DEFAULT 'uploaded',
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_error TEXT,               -- error message if failed
  processing_stats JSONB DEFAULT '{}', -- segments_found, chunks_created, filler_discarded, etc.

  -- AI preprocessing results (stored for admin review)
  ai_summary TEXT,                     -- one-line summary of the entire source
  ai_segments JSONB,                   -- full segmentation result from preprocessing step

  -- Chunk relationships
  total_chunks INTEGER DEFAULT 0,
  published_chunks INTEGER DEFAULT 0,

  -- Audit
  uploaded_by UUID,                    -- admin user who uploaded
  reviewed_by UUID,                    -- admin user who reviewed
  reviewed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_knowledge_sources_coach ON knowledge_sources(coach_name);
CREATE INDEX idx_knowledge_sources_status ON knowledge_sources(processing_status);
CREATE INDEX idx_knowledge_sources_type ON knowledge_sources(content_type);
CREATE INDEX idx_knowledge_sources_created ON knowledge_sources(created_at DESC);

COMMENT ON TABLE knowledge_sources IS '知识库原始素材表 (Bronze层) - 存储上传的原始文件和提取的文本';

-- ============================================================
-- TABLE: knowledge_chunks (Processed Knowledge Chunks)
-- ============================================================

CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source linkage
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  coach_name TEXT NOT NULL,            -- denormalized from source

  -- Classification (multi-dimensional taxonomy)
  scenario scenario_type NOT NULL,
  stages stage_type[] NOT NULL DEFAULT '{}',  -- can apply to multiple stages
  knowledge_type knowledge_type NOT NULL,
  tags TEXT[] DEFAULT '{}',            -- free-form + standardized tags
  difficulty difficulty_level DEFAULT 'intermediate',
  importance importance_level DEFAULT 'core',

  -- Core content (compressed by AI)
  title TEXT NOT NULL,                 -- 10-20 chars, concise
  core_principle TEXT,                 -- 1-2 sentence principle
  key_points TEXT[] DEFAULT '{}',      -- bullet points, each < 30 chars
  actionable_technique TEXT,           -- concrete technique description
  one_liner TEXT NOT NULL,             -- single-line summary for quick RAG matching

  -- Structured examples
  example_dialogues JSONB DEFAULT '[]',
  -- Format: [{ context, her, good_response, bad_response, explanation }]

  common_mistakes TEXT[] DEFAULT '{}',

  -- Original content reference
  original_content TEXT,               -- the raw segment text before compression
  content_hash TEXT,                   -- SHA-256 of original_content for exact dedup

  -- Vector embedding (pgvector)
  embedding vector(1536),             -- text-embedding-3-small output

  -- Full-text search (auto-generated tsvector)
  fts_document tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(core_principle, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(one_liner, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(actionable_technique, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(key_points, ' '), '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'C')
  ) STORED,

  -- Quality & dedup
  quality_score REAL,                  -- 0-1, AI-assessed quality
  duplicate_of UUID REFERENCES knowledge_chunks(id) ON DELETE SET NULL,
  similar_chunk_ids UUID[] DEFAULT '{}',

  -- Status & lifecycle
  status chunk_status DEFAULT 'draft',
  published_at TIMESTAMPTZ,

  -- Admin review
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Usage stats (updated by the RAG system)
  retrieval_count INTEGER DEFAULT 0,
  last_retrieved_at TIMESTAMPTZ,
  usefulness_score REAL DEFAULT 0,     -- computed from user feedback

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_chunks_source ON knowledge_chunks(source_id);
CREATE INDEX idx_chunks_coach ON knowledge_chunks(coach_name);
CREATE INDEX idx_chunks_scenario ON knowledge_chunks(scenario);
CREATE INDEX idx_chunks_stages ON knowledge_chunks USING GIN(stages);
CREATE INDEX idx_chunks_type ON knowledge_chunks(knowledge_type);
CREATE INDEX idx_chunks_tags ON knowledge_chunks USING GIN(tags);
CREATE INDEX idx_chunks_status ON knowledge_chunks(status);
CREATE INDEX idx_chunks_importance ON knowledge_chunks(importance);
CREATE INDEX idx_chunks_difficulty ON knowledge_chunks(difficulty);
CREATE INDEX idx_chunks_published ON knowledge_chunks(published_at DESC) WHERE status = 'published';
CREATE INDEX idx_chunks_content_hash ON knowledge_chunks(content_hash);

-- Vector similarity search index (IVFFlat for < 1M rows, switch to HNSW if needed)
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
-- NOTE: After 100K+ chunks, consider switching to HNSW:
-- CREATE INDEX idx_chunks_embedding_hnsw ON knowledge_chunks
--   USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);

-- Full-text search index
CREATE INDEX idx_chunks_fts ON knowledge_chunks USING GIN(fts_document);

COMMENT ON TABLE knowledge_chunks IS '知识块表 (Silver/Gold层) - AI压缩后的结构化知识,用于RAG检索';

-- ============================================================
-- TABLE: knowledge_chunk_merges (Merge History)
-- ============================================================

CREATE TABLE knowledge_chunk_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merged_chunk_id UUID REFERENCES knowledge_chunks(id) ON DELETE CASCADE,  -- the surviving chunk
  absorbed_chunk_ids UUID[] NOT NULL,     -- chunks that were merged into merged_chunk_id
  merge_reason TEXT,
  merged_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE knowledge_chunk_merges IS '知识块合并历史 - 追踪去重合并操作';

-- ============================================================
-- FUNCTIONS: Vector Similarity Search
-- ============================================================

-- Primary RAG retrieval function: semantic search with metadata filters
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 5,
  filter_scenario scenario_type DEFAULT NULL,
  filter_stages stage_type[] DEFAULT NULL,
  filter_tags TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  core_principle TEXT,
  key_points TEXT[],
  actionable_technique TEXT,
  one_liner TEXT,
  example_dialogues JSONB,
  common_mistakes TEXT[],
  scenario scenario_type,
  stages stage_type[],
  knowledge_type knowledge_type,
  tags TEXT[],
  coach_name TEXT,
  difficulty difficulty_level,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.title,
    kc.core_principle,
    kc.key_points,
    kc.actionable_technique,
    kc.one_liner,
    kc.example_dialogues,
    kc.common_mistakes,
    kc.scenario,
    kc.stages,
    kc.knowledge_type,
    kc.tags,
    kc.coach_name,
    kc.difficulty,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.status = 'published'
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
    AND (filter_scenario IS NULL OR kc.scenario = filter_scenario)
    AND (filter_stages IS NULL OR kc.stages && filter_stages)
    AND (filter_tags IS NULL OR kc.tags && filter_tags)
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Hybrid search: combines vector similarity with full-text relevance
CREATE OR REPLACE FUNCTION hybrid_search_knowledge(
  query_text TEXT,
  query_embedding vector(1536),
  match_count INT DEFAULT 5,
  semantic_weight FLOAT DEFAULT 0.7,  -- 70% semantic, 30% full-text
  filter_scenario scenario_type DEFAULT NULL,
  filter_stages stage_type[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  core_principle TEXT,
  key_points TEXT[],
  one_liner TEXT,
  example_dialogues JSONB,
  scenario scenario_type,
  stages stage_type[],
  coach_name TEXT,
  semantic_score FLOAT,
  fts_score FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic_results AS (
    SELECT
      kc.id,
      1 - (kc.embedding <=> query_embedding) AS sem_score
    FROM knowledge_chunks kc
    WHERE kc.status = 'published'
      AND (filter_scenario IS NULL OR kc.scenario = filter_scenario)
      AND (filter_stages IS NULL OR kc.stages && filter_stages)
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count * 3  -- oversample for reranking
  ),
  fts_results AS (
    SELECT
      kc.id,
      ts_rank_cd(kc.fts_document, plainto_tsquery('simple', query_text)) AS text_score
    FROM knowledge_chunks kc
    WHERE kc.status = 'published'
      AND kc.fts_document @@ plainto_tsquery('simple', query_text)
      AND (filter_scenario IS NULL OR kc.scenario = filter_scenario)
      AND (filter_stages IS NULL OR kc.stages && filter_stages)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      COALESCE(sr.id, fr.id) AS chunk_id,
      COALESCE(sr.sem_score, 0) AS sem_score,
      COALESCE(fr.text_score, 0) AS text_score,
      (semantic_weight * COALESCE(sr.sem_score, 0)) +
      ((1 - semantic_weight) * COALESCE(fr.text_score, 0)) AS combo_score
    FROM semantic_results sr
    FULL OUTER JOIN fts_results fr ON sr.id = fr.id
  )
  SELECT
    kc.id,
    kc.title,
    kc.core_principle,
    kc.key_points,
    kc.one_liner,
    kc.example_dialogues,
    kc.scenario,
    kc.stages,
    kc.coach_name,
    c.sem_score,
    c.text_score,
    c.combo_score
  FROM combined c
  JOIN knowledge_chunks kc ON kc.id = c.chunk_id
  ORDER BY c.combo_score DESC
  LIMIT match_count;
END;
$$;

-- ============================================================
-- FUNCTIONS: Update retrieval stats (called by RAG pipeline)
-- ============================================================

CREATE OR REPLACE FUNCTION increment_retrieval_count(chunk_ids UUID[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE knowledge_chunks
  SET
    retrieval_count = retrieval_count + 1,
    last_retrieved_at = now()
  WHERE id = ANY(chunk_ids);
END;
$$;

-- ============================================================
-- TRIGGERS: Auto-update timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_knowledge_sources_updated
  BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_knowledge_chunks_updated
  BEFORE UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_knowledge_coaches_updated
  BEFORE UPDATE ON knowledge_coaches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGERS: Auto-update coach stats
-- ============================================================

CREATE OR REPLACE FUNCTION update_coach_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update source count
  UPDATE knowledge_coaches
  SET
    source_count = (SELECT COUNT(*) FROM knowledge_sources WHERE coach_name = NEW.coach_name),
    chunk_count = (SELECT COUNT(*) FROM knowledge_chunks WHERE coach_name = NEW.coach_name AND status = 'published')
  WHERE name = NEW.coach_name;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sources_coach_stats
  AFTER INSERT OR DELETE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION update_coach_stats();

CREATE TRIGGER trg_chunks_coach_stats
  AFTER INSERT OR UPDATE OF status OR DELETE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION update_coach_stats();

-- ============================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_coaches ENABLE ROW LEVEL SECURITY;

-- Admin users can do everything (via service_role or admin JWT claim)
CREATE POLICY admin_all_sources ON knowledge_sources
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY admin_all_chunks ON knowledge_chunks
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY admin_all_coaches ON knowledge_coaches
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Public read access to published chunks (for the RAG system)
CREATE POLICY public_read_published_chunks ON knowledge_chunks
  FOR SELECT
  USING (status = 'published');

-- Public read access to active coaches
CREATE POLICY public_read_coaches ON knowledge_coaches
  FOR SELECT
  USING (is_active = true);

-- ============================================================
-- VIEWS: Admin Dashboard
-- ============================================================

-- Pipeline overview
CREATE VIEW v_pipeline_overview AS
SELECT
  processing_status,
  content_type,
  COUNT(*) AS source_count,
  SUM(total_chunks) AS total_chunks,
  SUM(published_chunks) AS published_chunks,
  AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at))) AS avg_processing_seconds
FROM knowledge_sources
GROUP BY processing_status, content_type
ORDER BY processing_status, content_type;

-- Coach leaderboard
CREATE VIEW v_coach_stats AS
SELECT
  kc.name,
  kc.display_name,
  kc.source_count,
  kc.chunk_count,
  COALESCE(AVG(ch.quality_score), 0) AS avg_quality_score,
  COALESCE(SUM(ch.retrieval_count), 0) AS total_retrievals,
  COALESCE(AVG(ch.usefulness_score), 0) AS avg_usefulness
FROM knowledge_coaches kc
LEFT JOIN knowledge_chunks ch ON ch.coach_name = kc.name AND ch.status = 'published'
GROUP BY kc.id, kc.name, kc.display_name, kc.source_count, kc.chunk_count;

-- Review queue
CREATE VIEW v_review_queue AS
SELECT
  kc.id,
  kc.title,
  kc.one_liner,
  kc.scenario,
  kc.stages,
  kc.knowledge_type,
  kc.coach_name,
  kc.status,
  kc.quality_score,
  kc.similar_chunk_ids,
  kc.created_at,
  ks.title AS source_title,
  ks.content_type
FROM knowledge_chunks kc
JOIN knowledge_sources ks ON ks.id = kc.source_id
WHERE kc.status IN ('review_pending', 'duplicate_review')
ORDER BY kc.created_at ASC;

-- Topic distribution
CREATE VIEW v_topic_distribution AS
SELECT
  scenario,
  knowledge_type,
  COUNT(*) AS chunk_count,
  COUNT(*) FILTER (WHERE status = 'published') AS published_count,
  ARRAY_AGG(DISTINCT coach_name) AS coaches
FROM knowledge_chunks
GROUP BY scenario, knowledge_type
ORDER BY scenario, knowledge_type;
