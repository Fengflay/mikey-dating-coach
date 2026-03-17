# Admin Dashboard - Data Flow & Architecture

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 14+ (App Router) | SSR admin pages, API routes |
| UI | shadcn/ui + Tailwind CSS | Component library |
| State | TanStack Query (React Query) | Server state, caching, optimistic updates |
| Auth | Supabase Auth (admin-only) | JWT with `role: admin` claim |
| File Upload | `@supabase/storage-js` + tus protocol | Resumable uploads for large files |
| Real-time | Supabase Realtime | Live pipeline status updates |
| Job Queue | Inngest | Background processing orchestration |
| Charts | Recharts | Dashboard visualizations |

---

## Page Structure

```
/admin
  /admin/dashboard              -- Pipeline overview, stats
  /admin/sources                -- Browse/manage uploaded sources
  /admin/sources/[id]           -- Source detail + extracted segments
  /admin/sources/upload         -- Upload new material
  /admin/review                 -- Review queue (pending chunks)
  /admin/review/[chunk_id]      -- Single chunk review/edit
  /admin/chunks                 -- Browse all published chunks
  /admin/chunks/[id]            -- Chunk detail/edit
  /admin/coaches                -- Coach management
  /admin/coaches/[id]           -- Coach detail + their content
  /admin/topics                 -- Topic/scenario distribution map
  /admin/dedup                  -- Duplicate review queue
  /admin/settings               -- API keys, processing config
```

---

## Data Flow Diagrams

### Flow 1: Upload New Material

```
Admin opens /admin/sources/upload
       |
       v
[Upload Form]
  - Select file (PDF/TXT/SRT/MP3/MP4)
  - Select coach (dropdown from knowledge_coaches)
  - Select content_type (video_transcript/article/book_chapter/etc.)
  - Optional: title, description, tags
       |
       v
POST /api/knowledge/upload
  -> Upload file to Supabase Storage (bucket: knowledge-base)
  -> Insert knowledge_sources record (status: 'uploaded')
  -> Trigger Inngest event: 'knowledge/source.uploaded'
       |
       v
[Redirect to /admin/sources/[id]]
  - Shows "Processing..." status
  - Supabase Realtime subscription on knowledge_sources.processing_status
       |
       v
[Inngest Job Runs in Background]
  Step 1: extract-text       -> status: 'extracting'
  Step 2: preprocess         -> status: 'processing'
  Step 3: compress-segments  -> (still 'processing')
  Step 4: generate-embeddings
  Step 5: dedup-and-queue    -> status: 'review_pending'
       |
       v
[Admin sees status update in real-time]
  - Source card changes from "Processing..." to "Review Ready"
  - Shows: X segments found, Y chunks created, Z duplicates flagged
       |
       v
Admin clicks "Review Chunks" -> navigates to /admin/review?source_id=[id]
```

### Flow 2: Chunk Review

```
Admin opens /admin/review
       |
       v
[Review Queue Table]
  Columns: Title | Scenario | Stage | Type | Coach | Quality Score | Status | Actions
  Filters: By coach, scenario, status, quality score range
  Sort: By created_at (oldest first), quality_score
       |
       v
Admin clicks a chunk -> /admin/review/[chunk_id]
       |
       v
[Chunk Review Page]
  Left panel: Processed chunk (editable)
    - Title (editable)
    - Core principle (editable)
    - Key points (editable, add/remove)
    - Actionable technique (editable)
    - One-liner (editable)
    - Example dialogues (editable, add/remove)
    - Classification (scenario/stage/type dropdowns)
    - Tags (multi-select + free text)
    - Difficulty (dropdown)

  Right panel: Context
    - Original raw text (read-only, for reference)
    - Source info (coach, content_type, filename)
    - Similar chunks (if any flagged by dedup)
    - Quality assessment scores (from AI)

  Bottom: Actions
    [Approve] -> status: 'approved' -> auto-publish
    [Reject]  -> status: 'rejected' (with reason)
    [Merge]   -> opens merge modal (combine with similar chunk)
    [Re-process] -> re-run compression with edited parameters
       |
       v
On Approve:
  -> UPDATE knowledge_chunks SET status = 'published', published_at = now()
  -> UPDATE knowledge_sources SET published_chunks = published_chunks + 1
  -> Invalidate React Query cache for chunks list
```

### Flow 3: Merge Duplicate Chunks

```
Admin on /admin/dedup or /admin/review/[chunk_id] with similar chunks
       |
       v
[Merge Modal]
  Shows: Chunk A (existing) side-by-side with Chunk B (new)
  Highlight: Differences in content, examples, classifications
       |
       v
Admin selects merge strategy:
  Option 1: Keep A, discard B
    -> B.status = 'rejected', B.duplicate_of = A.id
  Option 2: Keep B, archive A
    -> A.status = 'archived', A.duplicate_of = B.id
  Option 3: Merge into new chunk
    -> Admin edits merged content in editor
    -> Create new chunk with merged content
    -> Both A and B get status = 'archived', duplicate_of = new_chunk.id
    -> Insert record into knowledge_chunk_merges
       |
       v
[Save] -> DB updates + cache invalidation
```

### Flow 4: Browse by Coach/Topic/Scenario

```
/admin/coaches/[id]
  |
  v
[Coach Profile Page]
  Header: Coach name, bio, specialties
  Stats: Total sources, total chunks, avg quality, total retrievals

  Tab 1: Sources
    List of all knowledge_sources for this coach
    Status badges (uploaded/processing/published)
    Click -> /admin/sources/[id]

  Tab 2: Published Chunks
    Grouped by scenario
    Expandable cards showing chunk details
    Inline edit capability

  Tab 3: Analytics
    Retrieval frequency over time (chart)
    Most-retrieved chunks (table)
    Usefulness scores distribution (histogram)

---

/admin/topics
  |
  v
[Topic Distribution Dashboard]
  Grid/heatmap: scenario x knowledge_type
  Each cell shows: chunk count, coverage percentage
  Color coding: green (good coverage) -> red (sparse)

  Click a cell -> filtered view of chunks in that category
  Empty cells highlighted as "content gaps"
```

---

## API Routes

### Source Management

```
POST   /api/knowledge/upload          -- Upload new source
GET    /api/knowledge/sources         -- List sources (with filters)
GET    /api/knowledge/sources/[id]    -- Get source detail
PATCH  /api/knowledge/sources/[id]    -- Update source metadata
DELETE /api/knowledge/sources/[id]    -- Delete source + its chunks
POST   /api/knowledge/sources/[id]/reprocess  -- Re-run pipeline
```

### Chunk Management

```
GET    /api/knowledge/chunks          -- List chunks (with filters + pagination)
GET    /api/knowledge/chunks/[id]     -- Get chunk detail
PATCH  /api/knowledge/chunks/[id]     -- Update chunk (content or status)
DELETE /api/knowledge/chunks/[id]     -- Delete chunk
POST   /api/knowledge/chunks/[id]/approve   -- Approve + publish
POST   /api/knowledge/chunks/[id]/reject    -- Reject with reason
POST   /api/knowledge/chunks/merge    -- Merge multiple chunks
```

### Review Queue

```
GET    /api/knowledge/review          -- Get review queue
GET    /api/knowledge/review/stats    -- Review queue stats
POST   /api/knowledge/review/bulk     -- Bulk approve/reject
```

### Coach Management

```
GET    /api/knowledge/coaches         -- List coaches
POST   /api/knowledge/coaches         -- Create coach
PATCH  /api/knowledge/coaches/[id]    -- Update coach
GET    /api/knowledge/coaches/[id]/stats  -- Coach analytics
```

### Search & Test

```
POST   /api/knowledge/search          -- Test RAG search (semantic + filters)
POST   /api/knowledge/search/hybrid   -- Test hybrid search (semantic + FTS)
GET    /api/knowledge/stats           -- Overall knowledge base stats
GET    /api/knowledge/gaps            -- Content gap analysis
```

---

## Real-time Updates (Supabase Realtime)

```typescript
// In admin dashboard, subscribe to pipeline status changes
const channel = supabase
  .channel('knowledge-pipeline')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'knowledge_sources',
      filter: `processing_status=neq.published`,
    },
    (payload) => {
      // Update the source card status in real-time
      queryClient.invalidateQueries(['knowledge-sources']);
    }
  )
  .subscribe();
```

---

## Key Admin Dashboard Components

### 1. PipelineStatusCard
Shows current pipeline activity:
- Sources in each stage (uploaded/extracting/processing/review_pending)
- Processing queue depth
- Average processing time
- Error count

### 2. ReviewQueueTable
Sortable, filterable table for chunk review:
- Inline approve/reject buttons
- Bulk selection + bulk actions
- Quality score color coding (green > 0.8, yellow 0.6-0.8, red < 0.6)
- Click-to-expand for quick preview without leaving the list

### 3. ChunkEditor
Rich editor for chunk content:
- JSON-based dialogue example editor (add/remove/reorder)
- Tag autocomplete with existing tags
- Classification dropdowns with label descriptions
- Side-by-side raw vs compressed view
- One-click "Re-compress with AI" button

### 4. ContentGapMatrix
scenario x stage heatmap:
- Cell shows chunk count
- Color intensity = coverage level
- Click to see details or upload material for that gap
- Export as CSV for content planning

### 5. SearchTester
Admin tool to test RAG retrieval quality:
- Input: simulated user query (e.g., "她突然不回我消息了怎么办")
- Output: top-K retrieved chunks with similarity scores
- Side panel: which filters were applied, which chunks were returned
- Useful for tuning retrieval parameters without deploying to production

---

## Pagination & Performance

All list endpoints use cursor-based pagination:

```typescript
// API query params
type ListParams = {
  cursor?: string;      // last item's created_at timestamp
  limit?: number;       // default 20, max 100
  sort_by?: 'created_at' | 'quality_score' | 'retrieval_count';
  sort_order?: 'asc' | 'desc';
  // Filters
  coach_name?: string;
  scenario?: ScenarioType;
  stage?: StageType;
  knowledge_type?: KnowledgeType;
  status?: ChunkStatus;
  quality_min?: number;
  quality_max?: number;
  search?: string;      // full-text search
};
```

React Query configuration for admin pages:
```typescript
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['knowledge-chunks', filters],
  queryFn: ({ pageParam }) => fetchChunks({ ...filters, cursor: pageParam }),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  staleTime: 30_000,  // 30 seconds for admin (frequent updates expected)
});
```
