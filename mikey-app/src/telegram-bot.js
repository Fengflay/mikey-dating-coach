/**
 * Telegram Bot - grammY-based
 *
 * Flow:
 * 1. User sends text (the girl's message) to the bot
 * 2. Bot calls AI engine to analyze
 * 3. Bot replies with formatted analysis + 3 response options
 * 4. User taps a button to copy their chosen response
 */

const { Bot, InlineKeyboard } = require('grammy');
const { getConfig } = require('./config');
const { analyzeMessage } = require('./ai-engine');

let bot = null;
let botStatus = 'stopped'; // stopped | starting | running | error

async function startBot() {
  const config = getConfig();
  if (!config.telegramBotToken) {
    throw new Error('Telegram bot token not set');
  }
  if (!config.claudeApiKey) {
    throw new Error('Claude API key not set');
  }

  // Stop existing bot if any
  await stopBot();

  botStatus = 'starting';

  try {
    bot = new Bot(config.telegramBotToken);

    // /start command
    bot.command('start', async (ctx) => {
      await ctx.reply(
        `兄弟 我是你的Mikey情感导师\n\n` +
        `把她发给你的消息发过来 我帮你分析潜台词 给你三个回复选项\n\n` +
        `直接粘贴她的话 发送就行`,
        { parse_mode: 'Markdown' }
      );
    });

    // /help command
    bot.command('help', async (ctx) => {
      await ctx.reply(
        `*使用方法:*\n\n` +
        `1. 她给你发了消息\n` +
        `2. 复制她的消息发到这里\n` +
        `3. 我给你分析潜台词+三个回复选项\n` +
        `4. 选一个你喜欢的发给她\n\n` +
        `*命令:*\n` +
        `/start - 欢迎\n` +
        `/help - 使用帮助\n` +
        `/status - 机器人状态`,
        { parse_mode: 'Markdown' }
      );
    });

    // /status command
    bot.command('status', async (ctx) => {
      await ctx.reply(`运行中 AI模型: ${config.claudeModel || 'claude-sonnet-4-20250514'}`);
    });

    // Handle text messages - the core feature
    bot.on('message:text', async (ctx) => {
      const userMessage = ctx.message.text;

      // Ignore if it looks like a command
      if (userMessage.startsWith('/')) return;

      // Send "analyzing" indicator
      await ctx.replyWithChatAction('typing');

      try {
        // Get user's chat history for context (from simple in-memory store)
        const userId = ctx.from.id;
        const history = getUserHistory(userId);

        const result = await analyzeMessage(userMessage, { history });

        // Store in history
        addToHistory(userId, userMessage, result);

        // Format and send response
        const formatted = formatTelegramResponse(userMessage, result);
        await ctx.reply(formatted, { parse_mode: 'HTML' });

      } catch (err) {
        console.error('[Telegram] Analysis error:', err.message);
        await ctx.reply(
          `分析失败: ${err.message}\n\n请检查管理后台的Claude API密钥设置`
        );
      }
    });

    // Handle callback queries (button presses)
    bot.on('callback_query:data', async (ctx) => {
      await ctx.answerCallbackQuery({ text: 'Copied to clipboard!' });
    });

    // Error handler
    bot.catch((err) => {
      console.error('[Telegram] Bot error:', err.message);
    });

    // Start polling
    bot.start({
      onStart: () => {
        botStatus = 'running';
        console.log('  [Telegram] Bot is polling for messages');
      }
    });

  } catch (err) {
    botStatus = 'error';
    throw err;
  }
}

async function stopBot() {
  if (bot) {
    try {
      await bot.stop();
    } catch {
      // Ignore stop errors
    }
    bot = null;
  }
  botStatus = 'stopped';
}

function getBotStatus() {
  return botStatus;
}

/**
 * Format analysis result for Telegram (HTML mode)
 */
function formatTelegramResponse(originalMessage, result) {
  const d = result.diagnosis || {};
  const responses = result.responses || [];

  let text = '';

  // Header
  text += `<b>Mikey分析结果</b>\n\n`;

  // Original message
  text += `<i>她说:</i> "${escapeHtml(originalMessage)}"\n\n`;

  // Diagnosis
  if (d.stage) text += `<b>阶段:</b> ${escapeHtml(d.stage)}\n`;
  if (d.temperature) text += `<b>温度:</b> ${d.temperature}/10 ${getTemperatureEmoji(d.temperature)}\n`;
  if (d.subtext) text += `<b>潜台词:</b> ${escapeHtml(d.subtext)}\n`;
  text += '\n';

  // Mines
  if (d.mines && d.mines.length > 0) {
    text += `<b>排雷区:</b>\n`;
    for (const mine of d.mines) {
      text += `  ${escapeHtml(mine)}\n`;
    }
    text += '\n';
  }

  // Response options
  text += `<b>回复选项:</b>\n\n`;

  for (const r of responses) {
    const emoji = r.type === 'humor' ? 'A' : r.type === 'empathy' ? 'B' : 'C';
    const label = r.type === 'humor' ? '幽默' : r.type === 'empathy' ? '共情' : '引导';
    text += `<b>${emoji}. ${label}</b>\n`;
    text += `<code>${escapeHtml(r.text)}</code>\n`;
    if (r.why) text += `<i>${escapeHtml(r.why)}</i>\n`;
    text += '\n';
  }

  // Recommendation
  if (result.recommendation) {
    text += `<b>Mikey建议:</b> ${escapeHtml(result.recommendation)}\n`;
  }

  // Tip: tap code block to copy
  text += `\n<i>点击代码块可以复制回复</i>`;

  return text;
}

function getTemperatureEmoji(temp) {
  if (temp <= 3) return '(冷淡)';
  if (temp <= 5) return '(一般)';
  if (temp <= 7) return '(偏暖)';
  return '(火热)';
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// =========================================
// Simple in-memory chat history per user
// =========================================
const userHistories = new Map();

function getUserHistory(userId) {
  return userHistories.get(userId) || [];
}

function addToHistory(userId, message, result) {
  const history = userHistories.get(userId) || [];
  history.push({
    role: 'her',
    text: message,
    timestamp: Date.now(),
    analysis: {
      stage: result.diagnosis?.stage,
      temperature: result.diagnosis?.temperature
    }
  });

  // Keep only last N entries
  const config = getConfig();
  const max = config.maxHistoryPerUser || 20;
  if (history.length > max) {
    history.splice(0, history.length - max);
  }

  userHistories.set(userId, history);
}

module.exports = { startBot, stopBot, getBotStatus };
