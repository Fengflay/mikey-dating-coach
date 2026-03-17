/**
 * AI Engine - Claude API integration
 *
 * Single-stage for MVP (not two-stage as in the architecture doc).
 * Reason: Two-stage adds latency and cost. For a Telegram bot where
 * users expect fast replies, one well-crafted prompt is better.
 * Can upgrade to two-stage later if quality needs improvement.
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');
const { getKnowledgeContext } = require('./knowledge');

// Cache the client instance
let _client = null;

function getClient() {
  const config = getConfig();
  if (!config.claudeApiKey) {
    throw new Error('Claude API key not configured');
  }
  if (!_client || _client._apiKey !== config.claudeApiKey) {
    _client = new Anthropic({ apiKey: config.claudeApiKey });
    _client._apiKey = config.claudeApiKey;
  }
  return _client;
}

function loadSystemPrompt() {
  const base = process.env.MIKEY_BASE_DIR || path.resolve(__dirname, '..');
  const promptFile = path.join(base, 'prompts', 'system_prompt_main.md');
  if (fs.existsSync(promptFile)) {
    return fs.readFileSync(promptFile, 'utf-8');
  }
  // Fallback built-in prompt
  return BUILT_IN_PROMPT;
}

/**
 * Analyze a message and return structured advice
 * @param {string} message - The girl's message text
 * @param {object} context - Optional context (stage, history, etc.)
 * @returns {object} Analysis result with diagnosis + 3 response options
 */
async function analyzeMessage(message, context = {}) {
  const client = getClient();
  const config = getConfig();

  // Build knowledge context from active coaches
  const activeCoaches = (config.coaches || [])
    .filter(c => c.isActive)
    .map(c => c.id || c.name.toLowerCase());
  const knowledgeContext = getKnowledgeContext(activeCoaches);

  const systemPrompt = loadSystemPrompt();

  // Build user message
  let userMessage = `She sent this message:\n"${message}"`;

  if (context.history && context.history.length > 0) {
    userMessage = `Chat history:\n${context.history.map(h => `${h.role}: ${h.text}`).join('\n')}\n\nHer latest message:\n"${message}"`;
  }

  if (knowledgeContext) {
    userMessage += `\n\n[Reference Knowledge]\n${knowledgeContext}`;
  }

  const response = await client.messages.create({
    model: config.claudeModel || 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: systemPrompt + RESPONSE_FORMAT_INSTRUCTION,
    messages: [
      { role: 'user', content: userMessage }
    ]
  });

  const text = response.content[0].text;

  // Try to parse structured JSON from the response
  const parsed = parseAIResponse(text);
  return parsed;
}

/**
 * Parse the AI response into structured format.
 * The AI is instructed to return JSON, but we handle both
 * JSON and markdown gracefully.
 */
function parseAIResponse(text) {
  // Try JSON first
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      if (parsed.diagnosis && parsed.responses) {
        return parsed;
      }
    }
  } catch {
    // Fall through to text parsing
  }

  // Parse markdown-style response
  return parseMarkdownResponse(text);
}

function parseMarkdownResponse(text) {
  // Extract what we can from free-form text
  const result = {
    diagnosis: {
      stage: extractBetween(text, '**stage**:', '\n') || extractBetween(text, 'stage:', '\n') || 'unknown',
      temperature: parseInt(extractBetween(text, 'temperature:', '\n') || '5'),
      temperatureLabel: extractBetween(text, 'temperature_label:', '\n') || 'moderate',
      subtext: extractBetween(text, 'subtext:', '\n') || extractBetween(text, 'real intent:', '\n') || '',
      mines: []
    },
    responses: [
      { type: 'humor', tag: 'A humor', text: '', why: '' },
      { type: 'empathy', tag: 'B empathy', text: '', why: '' },
      { type: 'guidance', tag: 'C guidance', text: '', why: '' }
    ],
    recommendation: '',
    rawText: text
  };

  // Try to extract mines/warnings
  const mineMatches = text.match(/(?:avoid|dont|do not|warning|mine).*?[:\n](.*?)(?:\n\n|\n(?=[A-Z#]))/gis);
  if (mineMatches) {
    result.diagnosis.mines = mineMatches.slice(0, 3).map(m => m.trim());
  }

  return result;
}

function extractBetween(text, start, end) {
  const lower = text.toLowerCase();
  const startIdx = lower.indexOf(start.toLowerCase());
  if (startIdx === -1) return null;
  const afterStart = startIdx + start.length;
  const endIdx = text.indexOf(end, afterStart);
  if (endIdx === -1) return text.slice(afterStart).trim();
  return text.slice(afterStart, endIdx).trim();
}

const RESPONSE_FORMAT_INSTRUCTION = `

IMPORTANT: You must respond in valid JSON format with this exact structure:

\`\`\`json
{
  "diagnosis": {
    "stage": "string - relationship stage",
    "temperature": 1-10,
    "temperatureLabel": "string - e.g. warm, cold, hot",
    "subtext": "string - what she really means",
    "mines": ["string - thing to avoid 1", "thing to avoid 2", "thing to avoid 3"]
  },
  "responses": [
    {
      "type": "humor",
      "tag": "A humor",
      "text": "the suggested reply text",
      "why": "one sentence explanation"
    },
    {
      "type": "empathy",
      "tag": "B empathy",
      "text": "the suggested reply text",
      "why": "one sentence explanation"
    },
    {
      "type": "guidance",
      "tag": "C guidance",
      "text": "the suggested reply text",
      "why": "one sentence explanation"
    }
  ],
  "recommendation": "which option is best for this situation and why"
}
\`\`\`

Reply ONLY with the JSON block. No other text.
All text content should be in Simplified Chinese.
`;

const BUILT_IN_PROMPT = `You are Mikey, a professional dating coach for men. You analyze chat messages from women and provide 3 response options.

Your style:
- Direct, no-BS, like a trusted older brother
- Anti-simp: never encourage desperate or needy behavior
- Practical: every suggestion should be natural and usable in real texting
- Chinese social context aware

Analysis framework:
1. Determine relationship stage (new/flirting/cold/conflict)
2. Decode her real intent behind the message
3. Rate conversation temperature (1-10)
4. Identify mines (things NOT to say)
5. Generate 3 response styles: humor, empathy, guidance

Keep suggested replies SHORT (under 30 chars), natural, like real WeChat messages.`;

module.exports = { analyzeMessage };
