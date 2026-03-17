#!/usr/bin/env node

/**
 * Mikey Dating Coach - Standalone App Entry Point
 *
 * Launches:
 * 1. Express web server (admin UI + API) on localhost:3456
 * 2. Telegram bot (when configured)
 * 3. Opens browser to setup page on first run
 */

const path = require('path');
const { app } = require('./app');
const { startBot, stopBot } = require('./telegram-bot');
const { getConfig, isConfigured } = require('./config');

// Resolve base directory (works both in dev and pkg binary)
const BASE_DIR = process.pkg
  ? path.dirname(process.execPath)
  : path.resolve(__dirname, '..');

// Make BASE_DIR available everywhere
process.env.MIKEY_BASE_DIR = BASE_DIR;

const PORT = process.env.PORT || 3456;

async function main() {
  console.log('');
  console.log('  ===================================');
  console.log('  Mikey Dating Coach v1.0.0');
  console.log('  ===================================');
  console.log('');

  // Start web server
  const server = app.listen(PORT, () => {
    console.log(`  [Web]      http://localhost:${PORT}`);
    console.log(`  [Admin]    http://localhost:${PORT}/admin`);
    console.log('');
  });

  // Open browser on first launch or always
  const config = getConfig();
  if (!isConfigured()) {
    console.log('  First run detected - opening setup page...');
    console.log('');
    openBrowser(`http://localhost:${PORT}/setup`);
  } else {
    openBrowser(`http://localhost:${PORT}`);
    // Start Telegram bot if configured
    try {
      await startBot();
      console.log('  [Telegram] Bot started successfully');
    } catch (err) {
      console.error('  [Telegram] Failed to start:', err.message);
      console.log('  [Telegram] Check your bot token in Settings');
    }
  }

  console.log('  Press Ctrl+C to stop');
  console.log('');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n  Shutting down...');
    await stopBot();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function openBrowser(url) {
  try {
    // Dynamic import for ESM module 'open'
    const open = require('open');
    await open(url);
  } catch {
    console.log(`  Open in browser: ${url}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
