#!/usr/bin/env node

/**
 * Create a DMG for macOS distribution
 *
 * Prerequisites: brew install create-dmg
 *
 * This script:
 * 1. Creates a staging folder with the binary + support files
 * 2. Wraps it in a DMG
 *
 * For a simpler approach: just zip the dist/ folder.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'MikeyCoach');
const DMG_OUT = path.join(DIST, 'MikeyCoach-Installer.dmg');

console.log('Creating DMG...');

// Check if binary exists
const binaryName = process.platform === 'darwin' ? 'MikeyCoach-mac-arm64' : 'MikeyCoach-win.exe';
const binaryPath = path.join(DIST, binaryName);

if (!fs.existsSync(binaryPath)) {
  console.error(`Binary not found at ${binaryPath}`);
  console.error('Run "npm run build:mac-arm" first');
  process.exit(1);
}

// Create staging directory
if (fs.existsSync(STAGE)) {
  fs.rmSync(STAGE, { recursive: true });
}
fs.mkdirSync(STAGE, { recursive: true });

// Copy binary
fs.copyFileSync(binaryPath, path.join(STAGE, 'MikeyCoach'));
fs.chmodSync(path.join(STAGE, 'MikeyCoach'), 0o755);

// Copy support directories
for (const dir of ['web', 'knowledge-base', 'prompts']) {
  const src = path.join(ROOT, dir);
  if (fs.existsSync(src)) {
    copyDirSync(src, path.join(STAGE, dir));
  }
}

// Create data directory
fs.mkdirSync(path.join(STAGE, 'data'), { recursive: true });

// Create a simple launcher script
fs.writeFileSync(path.join(STAGE, 'Start MikeyCoach.command'), `#!/bin/bash
cd "$(dirname "$0")"
./MikeyCoach
`, { mode: 0o755 });

console.log(`Staging complete at ${STAGE}`);

// Try create-dmg if available
try {
  if (fs.existsSync(DMG_OUT)) fs.unlinkSync(DMG_OUT);
  execSync(`create-dmg --volname "MikeyCoach" --no-internet-enable "${DMG_OUT}" "${STAGE}"`, { stdio: 'inherit' });
  console.log(`DMG created at ${DMG_OUT}`);
} catch {
  console.log('create-dmg not found. Creating zip instead...');
  const ZIP_OUT = path.join(DIST, 'MikeyCoach.zip');
  execSync(`cd "${DIST}" && zip -r "${ZIP_OUT}" MikeyCoach/`, { stdio: 'inherit' });
  console.log(`ZIP created at ${ZIP_OUT}`);
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
