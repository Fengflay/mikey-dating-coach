/**
 * Express web server
 * Serves: admin UI, setup page, REST API for config/coaches/knowledge
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { getConfig, updateConfig, isConfigured } = require('./config');
const { startBot, stopBot, getBotStatus } = require('./telegram-bot');
const { analyzeMessage } = require('./ai-engine');
const { listKnowledge, readKnowledge, saveKnowledge, deleteKnowledge } = require('./knowledge');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Resolve web assets directory
function webDir() {
  const base = process.env.MIKEY_BASE_DIR || path.resolve(__dirname, '..');
  return path.join(base, 'web');
}

// Static files (CSS, JS, images)
app.use('/css', express.static(path.join(webDir(), 'css')));
app.use('/js', express.static(path.join(webDir(), 'js')));

// =========================================
// Pages
// =========================================

app.get('/', (req, res) => {
  if (!isConfigured()) return res.redirect('/setup');
  res.sendFile(path.join(webDir(), 'index.html'));
});

app.get('/admin', (req, res) => {
  if (!isConfigured()) return res.redirect('/setup');
  res.sendFile(path.join(webDir(), 'admin.html'));
});

app.get('/setup', (req, res) => {
  res.sendFile(path.join(webDir(), 'setup.html'));
});

// =========================================
// API: Configuration
// =========================================

app.get('/api/config', (req, res) => {
  const config = getConfig();
  // Mask sensitive keys for frontend
  res.json({
    telegramBotToken: config.telegramBotToken ? '***' + config.telegramBotToken.slice(-6) : '',
    claudeApiKey: config.claudeApiKey ? '***' + config.claudeApiKey.slice(-6) : '',
    claudeModel: config.claudeModel,
    language: config.language,
    isConfigured: isConfigured()
  });
});

app.post('/api/config', async (req, res) => {
  const { telegramBotToken, claudeApiKey, claudeModel } = req.body;
  const updates = {};

  if (telegramBotToken && !telegramBotToken.startsWith('***')) {
    updates.telegramBotToken = telegramBotToken;
  }
  if (claudeApiKey && !claudeApiKey.startsWith('***')) {
    updates.claudeApiKey = claudeApiKey;
  }
  if (claudeModel) {
    updates.claudeModel = claudeModel;
  }

  updateConfig(updates);

  // Restart bot if token changed
  if (updates.telegramBotToken) {
    try {
      await stopBot();
      await startBot();
      res.json({ ok: true, message: 'Settings saved. Bot restarted.' });
    } catch (err) {
      res.json({ ok: false, message: `Settings saved but bot failed: ${err.message}` });
    }
  } else {
    // Start bot if it was not running and now we have config
    if (isConfigured() && getBotStatus() !== 'running') {
      try {
        await startBot();
      } catch (err) {
        // silent
      }
    }
    res.json({ ok: true, message: 'Settings saved.' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    configured: isConfigured(),
    botStatus: getBotStatus(),
    version: '1.0.0'
  });
});

// =========================================
// API: Coaches (CRUD)
// =========================================

app.get('/api/coaches', (req, res) => {
  const config = getConfig();
  res.json(config.coaches || []);
});

app.post('/api/coaches', (req, res) => {
  const config = getConfig();
  const coach = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  config.coaches = config.coaches || [];
  config.coaches.push(coach);
  updateConfig({ coaches: config.coaches });
  res.json(coach);
});

app.put('/api/coaches/:id', (req, res) => {
  const config = getConfig();
  const idx = (config.coaches || []).findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Coach not found' });
  config.coaches[idx] = { ...config.coaches[idx], ...req.body, updatedAt: new Date().toISOString() };
  updateConfig({ coaches: config.coaches });
  res.json(config.coaches[idx]);
});

app.delete('/api/coaches/:id', (req, res) => {
  const config = getConfig();
  config.coaches = (config.coaches || []).filter(c => c.id !== req.params.id);
  updateConfig({ coaches: config.coaches });
  res.json({ ok: true });
});

// =========================================
// API: Knowledge Base (filesystem-backed)
// =========================================

app.get('/api/knowledge', (req, res) => {
  const files = listKnowledge(req.query.coach);
  res.json(files);
});

app.get('/api/knowledge/:coach/:filename', (req, res) => {
  const content = readKnowledge(req.params.coach, req.params.filename);
  if (content === null) return res.status(404).json({ error: 'Not found' });
  res.json({ filename: req.params.filename, coach: req.params.coach, content });
});

app.post('/api/knowledge/:coach', (req, res) => {
  const { filename, content } = req.body;
  if (!filename || !content) return res.status(400).json({ error: 'filename and content required' });
  const safeName = filename.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_') + '.md';
  saveKnowledge(req.params.coach, safeName, content);
  res.json({ ok: true, filename: safeName });
});

app.delete('/api/knowledge/:coach/:filename', (req, res) => {
  deleteKnowledge(req.params.coach, req.params.filename);
  res.json({ ok: true });
});

// =========================================
// API: Analyze (used by web UI for testing)
// =========================================

app.post('/api/analyze', async (req, res) => {
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  if (!isConfigured()) return res.status(400).json({ error: 'Not configured. Set API keys first.' });

  try {
    const result = await analyzeMessage(message, context || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { app };
