/**
 * Configuration manager
 * Stores settings in a JSON file next to the executable.
 * No database needed.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = () => path.join(
  process.env.MIKEY_BASE_DIR || path.resolve(__dirname, '..'),
  'data',
  'config.json'
);

let _cache = null;

function ensureDataDir() {
  const dir = path.dirname(CONFIG_FILE());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getConfig() {
  if (_cache) return _cache;
  ensureDataDir();
  const file = CONFIG_FILE();
  if (fs.existsSync(file)) {
    try {
      _cache = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      _cache = defaultConfig();
    }
  } else {
    _cache = defaultConfig();
    saveConfig(_cache);
  }
  return _cache;
}

function saveConfig(config) {
  ensureDataDir();
  _cache = config;
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(config, null, 2), 'utf-8');
}

function updateConfig(partial) {
  const config = getConfig();
  Object.assign(config, partial);
  saveConfig(config);
  return config;
}

function isConfigured() {
  const c = getConfig();
  return !!(c.telegramBotToken && c.claudeApiKey);
}

function defaultConfig() {
  return {
    telegramBotToken: '',
    claudeApiKey: '',
    claudeModel: 'claude-sonnet-4-20250514',
    language: 'zh-CN',
    webPort: 3456,
    maxHistoryPerUser: 20,
    coaches: [
      {
        id: 'mikey',
        name: 'Mikey',
        displayName: 'Mikey',
        isActive: true,
        color: '#D4883A',
        initials: 'MK',
        bio: 'Core coach. Direct, no-BS style. Focuses on building genuine attraction and emotional connection.',
        specialties: ['opening', 'flirting', 'escalation', 'attraction', 'texting_rules'],
        styleTags: ['direct', 'practical', 'anti-simp', 'high-EQ']
      }
    ]
  };
}

module.exports = { getConfig, saveConfig, updateConfig, isConfigured };
