# Input Format Handling

## Supported Formats Matrix

| Format | Extension | Extraction Method | Library/API | Pre-processing Needed |
|--------|-----------|-------------------|-------------|----------------------|
| Plain Text | .txt | Direct read | Built-in | None |
| Markdown | .md | Direct read | Built-in | Strip formatting optionally |
| PDF | .pdf | Text extraction | `pdf-parse` | OCR fallback for scanned PDFs |
| SRT Subtitles | .srt | Regex timestamp strip | Built-in regex | Remove timestamps + sequence numbers |
| VTT Subtitles | .vtt | Regex timestamp strip | Built-in regex | Remove timestamps + headers |
| Audio | .mp3/.m4a/.wav/.ogg | Whisper API | OpenAI Whisper | Chunk audio if > 25MB |
| Video | .mp4/.mov/.webm | Extract audio -> Whisper | `ffmpeg` + Whisper | Extract audio track first |
| Word Doc | .docx | Text extraction | `mammoth` | Convert to plain text |
| HTML | .html | Strip tags | `cheerio` | Extract article body, remove nav/ads |

---

## Format-Specific Handlers

### 1. Plain Text (.txt, .md)

The simplest path. Content is read directly.

```typescript
// lib/knowledge/extractors/text-extractor.ts
export async function extractText(buffer: Buffer): Promise<ExtractionResult> {
  const text = buffer.toString('utf-8');
  return {
    raw_text: text,
    metadata: {
      char_count: text.length,
      word_count: text.length, // Chinese: ~1 char per word
      language: detectLanguage(text),
      extraction_method: 'direct_read',
    },
  };
}

function detectLanguage(text: string): string {
  const chineseChars = text.match(/[\u4e00-\u9fff]/g);
  const ratio = (chineseChars?.length || 0) / text.length;
  return ratio > 0.3 ? 'zh' : 'en';
}
```

**Edge cases**:
- Files with BOM (byte order mark): Strip `\uFEFF` from start
- Mixed encoding: Force UTF-8, replace unmappable chars with placeholder
- Extremely long files (> 100K chars): Warn admin, process in batches

### 2. PDF (.pdf)

Two extraction paths depending on whether the PDF contains selectable text or is a scanned image.

```typescript
// lib/knowledge/extractors/pdf-extractor.ts
import pdfParse from 'pdf-parse';

export async function extractPDF(buffer: Buffer): Promise<ExtractionResult> {
  const data = await pdfParse(buffer);

  // Check if extraction succeeded (scanned PDFs return minimal text)
  if (data.text.trim().length < 50 && data.numpages > 0) {
    // Likely a scanned PDF - fall back to OCR
    return await extractPDFWithOCR(buffer, data.numpages);
  }

  // Clean common PDF artifacts
  let text = data.text;
  text = text.replace(/\f/g, '\n\n');        // form feed -> paragraph break
  text = text.replace(/\n{4,}/g, '\n\n\n');  // excessive newlines
  text = text.replace(/(?<=[^\n])\n(?=[^\n])/g, ''); // remove mid-paragraph line breaks
  // (PDF wraps lines at column width, not at sentence boundaries)

  return {
    raw_text: text,
    metadata: {
      char_count: text.length,
      word_count: text.length,
      language: 'zh',
      extraction_method: 'pdf-parse',
      page_count: data.numpages,
    },
  };
}

// OCR fallback for scanned PDFs
// Uses OpenAI GPT-4o vision to OCR each page
async function extractPDFWithOCR(buffer: Buffer, pageCount: number): Promise<ExtractionResult> {
  // Convert PDF pages to images using pdf2pic or similar
  // Then send each page image to GPT-4o vision for OCR
  // This is expensive but handles scanned books/handouts

  // Implementation note: For MVP, can use a cheaper OCR service
  // like Google Cloud Vision or Azure Computer Vision
  // GPT-4o vision is the fallback for complex layouts

  throw new Error('Scanned PDF OCR not yet implemented - upload text version instead');
}
```

**npm dependency**: `pdf-parse` (MIT license, no native dependencies)

**Edge cases**:
- Password-protected PDFs: Reject with clear error message
- PDFs with columns: `pdf-parse` reads columns left-to-right which can interleave text. For column layouts, consider `pdf.js` with layout analysis
- PDFs with tables: Tables become garbled text. Flag for admin review
- Very large PDFs (> 50 pages): Process page by page, combine results

### 3. Video Transcripts (.srt, .vtt)

Pre-transcribed subtitle files from YouTube or course platforms.

```typescript
// lib/knowledge/extractors/subtitle-extractor.ts

export async function extractSRT(buffer: Buffer): Promise<ExtractionResult> {
  const raw = buffer.toString('utf-8');
  const text = cleanSRT(raw);
  return {
    raw_text: text,
    metadata: {
      char_count: text.length,
      word_count: text.length,
      language: 'zh',
      extraction_method: 'srt_clean',
    },
  };
}

function cleanSRT(srt: string): string {
  return srt
    // Remove sequence numbers (lines that are just digits)
    .replace(/^\d+\s*$/gm, '')
    // Remove timestamps: 00:00:01,234 --> 00:00:05,678
    .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/gm, '')
    // Remove HTML-style tags (<i>, <b>, etc.)
    .replace(/<\/?[^>]+>/g, '')
    // Remove position/alignment tags
    .replace(/\{\\an\d\}/g, '')
    // Collapse excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    // Merge consecutive lines that form one sentence
    // (SRT breaks lines at ~42 chars regardless of sentence boundaries)
    .replace(/([^\n。！？\.\!\?])\n([^\n\d])/g, '$1$2')
    .trim();
}

export async function extractVTT(buffer: Buffer): Promise<ExtractionResult> {
  const raw = buffer.toString('utf-8');
  let text = raw
    // Remove WEBVTT header
    .replace(/^WEBVTT.*\n/m, '')
    // Remove NOTE blocks
    .replace(/^NOTE\n[\s\S]*?\n\n/gm, '')
    // Remove style blocks
    .replace(/^STYLE\n[\s\S]*?\n\n/gm, '');

  // Then apply same cleaning as SRT
  text = cleanSRT(text);

  return {
    raw_text: text,
    metadata: {
      char_count: text.length,
      word_count: text.length,
      language: 'zh',
      extraction_method: 'vtt_clean',
    },
  };
}
```

**Edge cases**:
- Auto-generated subtitles (YouTube auto-caption): Often have poor Chinese recognition. Flag quality warning
- Subtitles in traditional Chinese: Auto-convert to simplified via `opencc` library
- Missing punctuation in auto-captions: The AI preprocessing step (Prompt 1) handles this since GPT-4o can infer sentence boundaries

### 4. Audio Files (.mp3, .m4a, .wav, .ogg)

Raw audio transcription via OpenAI Whisper API.

```typescript
// lib/knowledge/extractors/audio-extractor.ts

const WHISPER_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB limit

export async function extractAudio(buffer: Buffer, filename: string): Promise<ExtractionResult> {
  if (buffer.length > WHISPER_MAX_FILE_SIZE) {
    return await extractLargeAudio(buffer, filename);
  }

  const formData = new FormData();
  formData.append('file', new Blob([buffer]), filename);
  formData.append('model', 'whisper-1');
  formData.append('language', 'zh');
  formData.append('response_format', 'verbose_json');
  // verbose_json gives us segments with timestamps

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Whisper API error: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();

  // Build text with paragraph breaks at natural pauses (> 2s gaps)
  let text = '';
  let lastEnd = 0;
  for (const segment of result.segments || []) {
    const gap = segment.start - lastEnd;
    if (gap > 2.0) {
      text += '\n\n'; // paragraph break at long pauses
    } else if (text.length > 0) {
      text += ' ';
    }
    text += segment.text.trim();
    lastEnd = segment.end;
  }

  return {
    raw_text: text.trim() || result.text,
    metadata: {
      char_count: text.length,
      word_count: text.length,
      language: result.language || 'zh',
      extraction_method: 'whisper-1',
      duration_seconds: result.duration,
    },
  };
}

// For files > 25MB: split into chunks and transcribe separately
async function extractLargeAudio(buffer: Buffer, filename: string): Promise<ExtractionResult> {
  // Use ffmpeg to split audio into 20MB chunks at silence points
  // Each chunk is transcribed separately, then combined

  // Implementation approach:
  // 1. Write buffer to temp file
  // 2. Use fluent-ffmpeg to detect silence points
  // 3. Split at silence points closest to 20MB boundaries
  // 4. Transcribe each chunk
  // 5. Concatenate results

  // For MVP: reject files > 25MB with instructions to use
  // an external tool (e.g., Audacity) to split first
  throw new Error(
    `Audio file too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). ` +
    `Maximum is 25MB. Please split the file or compress the audio quality.`
  );
}
```

**Cost**: Whisper API charges $0.006/minute. A 1-hour lecture costs ~$0.36.

**Edge cases**:
- Background music in courses: Whisper handles this reasonably but accuracy drops. Consider pre-processing with vocal isolation if quality is poor
- Multiple speakers: Whisper does not differentiate speakers. If the source has Q&A sections, the AI preprocessing step should handle speaker separation contextually
- Low quality audio: Add a quality check on transcription confidence. Whisper's `verbose_json` response includes per-segment confidence scores

### 5. Video Files (.mp4, .mov, .webm)

Extract audio track first, then process as audio.

```typescript
// lib/knowledge/extractors/video-extractor.ts
import ffmpeg from 'fluent-ffmpeg';
import { Readable } from 'stream';
import { extractAudio } from './audio-extractor';

export async function extractVideo(buffer: Buffer, filename: string): Promise<ExtractionResult> {
  // Step 1: Extract audio track from video using ffmpeg
  const audioBuffer = await extractAudioFromVideo(buffer, filename);

  // Step 2: Transcribe audio
  const result = await extractAudio(audioBuffer, filename.replace(/\.\w+$/, '.mp3'));
  result.metadata.extraction_method = 'video_ffmpeg_whisper';

  return result;
}

function extractAudioFromVideo(videoBuffer: Buffer, filename: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    // Write video to temp path for ffmpeg
    const tempPath = `/tmp/kb_video_${Date.now()}_${filename}`;
    require('fs').writeFileSync(tempPath, videoBuffer);

    ffmpeg(tempPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('64k')      // Low bitrate sufficient for speech
      .audioChannels(1)          // Mono (halves file size)
      .audioFrequency(16000)     // 16kHz sufficient for speech recognition
      .format('mp3')
      .on('error', (err) => {
        require('fs').unlinkSync(tempPath);
        reject(err);
      })
      .on('end', () => {
        require('fs').unlinkSync(tempPath);
      })
      .pipe()
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)));
  });
}
```

**npm dependencies**: `fluent-ffmpeg` (requires `ffmpeg` binary installed on the server)

**Deployment note**: On Vercel, you cannot run ffmpeg natively. Options:
1. Process video files in a separate backend service (Docker container with ffmpeg)
2. Use a cloud transcoding service (AWS MediaConvert, Cloudflare Stream)
3. Require admins to upload audio-only or pre-transcribed files for MVP
4. Use Inngest with a self-hosted worker that has ffmpeg installed

### 6. Word Documents (.docx)

```typescript
// lib/knowledge/extractors/docx-extractor.ts
import mammoth from 'mammoth';

export async function extractDOCX(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });

  const text = result.value;
  const warnings = result.messages
    .filter(m => m.type === 'warning')
    .map(m => m.message);

  return {
    raw_text: text,
    metadata: {
      char_count: text.length,
      word_count: text.length,
      language: 'zh',
      extraction_method: 'mammoth',
      extraction_warnings: warnings,
    },
  };
}
```

**npm dependency**: `mammoth` (BSD license)

### 7. HTML Articles

```typescript
// lib/knowledge/extractors/html-extractor.ts
import * as cheerio from 'cheerio';

export async function extractHTML(buffer: Buffer): Promise<ExtractionResult> {
  const html = buffer.toString('utf-8');
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, nav, header, footer, aside, .sidebar, .comments, .ad, .advertisement').remove();

  // Try to find article body
  const articleSelectors = ['article', '.article-body', '.post-content', '.entry-content', 'main', '.content'];
  let text = '';

  for (const selector of articleSelectors) {
    const el = $(selector);
    if (el.length > 0 && el.text().trim().length > 200) {
      text = el.text().trim();
      break;
    }
  }

  // Fallback: use body text
  if (!text) {
    text = $('body').text().trim();
  }

  // Clean up whitespace
  text = text
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    raw_text: text,
    metadata: {
      char_count: text.length,
      word_count: text.length,
      language: 'zh',
      extraction_method: 'cheerio_html',
    },
  };
}
```

**npm dependency**: `cheerio` (MIT license)

---

## Unified Extraction Router

```typescript
// lib/knowledge/extract.ts
import { extractText } from './extractors/text-extractor';
import { extractPDF } from './extractors/pdf-extractor';
import { extractSRT, extractVTT } from './extractors/subtitle-extractor';
import { extractAudio } from './extractors/audio-extractor';
import { extractVideo } from './extractors/video-extractor';
import { extractDOCX } from './extractors/docx-extractor';
import { extractHTML } from './extractors/html-extractor';

type ExtractionResult = {
  raw_text: string;
  metadata: Record<string, any>;
};

const MIME_TO_EXTRACTOR: Record<string, (b: Buffer, f: string) => Promise<ExtractionResult>> = {
  'text/plain': (b) => extractText(b),
  'text/markdown': (b) => extractText(b),
  'application/pdf': (b) => extractPDF(b),
  'text/html': (b) => extractHTML(b),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => extractDOCX(b),
  'audio/mpeg': (b, f) => extractAudio(b, f),
  'audio/mp4': (b, f) => extractAudio(b, f),
  'audio/wav': (b, f) => extractAudio(b, f),
  'audio/ogg': (b, f) => extractAudio(b, f),
  'video/mp4': (b, f) => extractVideo(b, f),
  'video/quicktime': (b, f) => extractVideo(b, f),
  'video/webm': (b, f) => extractVideo(b, f),
};

const EXTENSION_TO_EXTRACTOR: Record<string, (b: Buffer, f: string) => Promise<ExtractionResult>> = {
  '.txt': (b) => extractText(b),
  '.md': (b) => extractText(b),
  '.pdf': (b) => extractPDF(b),
  '.srt': (b) => extractSRT(b),
  '.vtt': (b) => extractVTT(b),
  '.html': (b) => extractHTML(b),
  '.docx': (b) => extractDOCX(b),
  '.mp3': (b, f) => extractAudio(b, f),
  '.m4a': (b, f) => extractAudio(b, f),
  '.wav': (b, f) => extractAudio(b, f),
  '.ogg': (b, f) => extractAudio(b, f),
  '.mp4': (b, f) => extractVideo(b, f),
  '.mov': (b, f) => extractVideo(b, f),
  '.webm': (b, f) => extractVideo(b, f),
};

export async function extractContent(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<ExtractionResult> {
  // Try MIME type first
  if (mimeType && MIME_TO_EXTRACTOR[mimeType]) {
    return MIME_TO_EXTRACTOR[mimeType](buffer, filename);
  }

  // Fallback to extension
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  if (EXTENSION_TO_EXTRACTOR[ext]) {
    return EXTENSION_TO_EXTRACTOR[ext](buffer, filename);
  }

  throw new Error(
    `Unsupported file format: ${mimeType || ext}. ` +
    `Supported: .txt, .md, .pdf, .srt, .vtt, .html, .docx, .mp3, .m4a, .wav, .ogg, .mp4, .mov, .webm`
  );
}
```

---

## File Size Limits

| Format Category | Max Upload Size | Rationale |
|----------------|-----------------|-----------|
| Text (.txt, .md, .srt, .vtt, .html) | 10 MB | Even the longest book chapter fits |
| PDF, DOCX | 50 MB | Large course PDFs with images |
| Audio (.mp3, .m4a, .wav, .ogg) | 100 MB | ~2 hours at reasonable bitrate |
| Video (.mp4, .mov, .webm) | 500 MB | Video is large; extract audio first |

Enforce in the upload endpoint:
```typescript
const MAX_SIZES: Record<string, number> = {
  text: 10 * 1024 * 1024,
  pdf: 50 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  video: 500 * 1024 * 1024,
};
```

---

## Package Dependencies Summary

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "ai": "^4.x",
    "@ai-sdk/openai": "^1.x",
    "inngest": "^3.x",
    "pdf-parse": "^1.x",
    "mammoth": "^1.x",
    "cheerio": "^1.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "fluent-ffmpeg": "^2.x",
    "@types/fluent-ffmpeg": "^2.x"
  }
}
```

Note: `fluent-ffmpeg` requires the `ffmpeg` binary to be available on the system PATH. On a production server, install via:
- Docker: `RUN apt-get install -y ffmpeg`
- Homebrew (local dev): `brew install ffmpeg`
- Vercel: Not available natively; use a separate worker service for video processing
