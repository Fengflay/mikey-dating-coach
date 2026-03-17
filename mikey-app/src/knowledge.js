/**
 * Knowledge base - filesystem-backed markdown storage
 *
 * Structure:
 *   knowledge-base/
 *     mikey/
 *       opening-lines.md
 *       flirting-techniques.md
 *       ...
 *     custom-coach/
 *       ...
 */

const fs = require('fs');
const path = require('path');

function kbDir() {
  const base = process.env.MIKEY_BASE_DIR || path.resolve(__dirname, '..');
  return path.join(base, 'knowledge-base');
}

/**
 * List all knowledge files, optionally filtered by coach
 */
function listKnowledge(coach) {
  const baseDir = kbDir();
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
    return [];
  }

  const results = [];

  const coaches = coach
    ? [coach]
    : fs.readdirSync(baseDir).filter(f =>
        fs.statSync(path.join(baseDir, f)).isDirectory()
      );

  for (const coachName of coaches) {
    const coachDir = path.join(baseDir, coachName);
    if (!fs.existsSync(coachDir)) continue;

    const files = fs.readdirSync(coachDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const fullPath = path.join(coachDir, file);
      const stat = fs.statSync(fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      results.push({
        coach: coachName,
        filename: file,
        title: extractTitle(content) || file.replace('.md', ''),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        preview: content.slice(0, 200)
      });
    }
  }

  return results;
}

/**
 * Read a single knowledge file
 */
function readKnowledge(coach, filename) {
  const filePath = path.join(kbDir(), coach, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Save/overwrite a knowledge file
 */
function saveKnowledge(coach, filename, content) {
  const coachDir = path.join(kbDir(), coach);
  if (!fs.existsSync(coachDir)) {
    fs.mkdirSync(coachDir, { recursive: true });
  }
  fs.writeFileSync(path.join(coachDir, filename), content, 'utf-8');
}

/**
 * Delete a knowledge file
 */
function deleteKnowledge(coach, filename) {
  const filePath = path.join(kbDir(), coach, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Get all knowledge content for AI context (simple concat, no vector DB)
 * For MVP: just load all files for the active coaches and concatenate
 */
function getKnowledgeContext(coaches) {
  const allCoaches = coaches || [];
  let context = '';

  for (const coachName of allCoaches) {
    const files = listKnowledge(coachName);
    for (const file of files) {
      const content = readKnowledge(coachName, file.filename);
      if (content) {
        context += `\n\n--- [${coachName}] ${file.title} ---\n${content}`;
      }
    }
  }

  // Truncate to ~8000 chars to leave room for system prompt and user message
  if (context.length > 8000) {
    context = context.slice(0, 8000) + '\n\n[... truncated]';
  }

  return context;
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : null;
}

module.exports = {
  listKnowledge,
  readKnowledge,
  saveKnowledge,
  deleteKnowledge,
  getKnowledgeContext
};
