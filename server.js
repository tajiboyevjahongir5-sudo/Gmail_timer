require('dotenv').config();
const express = require('express');
const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = typeof TelegramBotModule === 'function' ? TelegramBotModule : (TelegramBotModule.TelegramBot || TelegramBotModule.default);
const path = require('path');
const fs = require('fs');

// Global error handling to prevent process crashes on network/API errors
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });
const DATA_FILE = path.join(__dirname, 'data.json');

// ─── Persistent storage ────────────────────────────────────────────────────
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { chatId: null, entries: [] };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { chatId: null, entries: [] }; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let db = loadData();
const timers = new Map(); // in-memory timer handles

// ─── Telegram Bot ──────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  db.chatId = msg.chat.id;
  saveData(db);

  // Railway might provide custom domain under PUBLIC_DOMAIN or STATIC_URL
  const domainRaw = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
  const domain = domainRaw
    ? `https://${domainRaw}`
    : `http://localhost:${process.env.PORT || 3000}`;

  const isHttps = domain.startsWith('https://');

  const inlineKeyboard = [];

  if (isHttps) {
    inlineKeyboard.push([
      { text: '📱 Telegram ichida ochish', web_app: { url: domain } }
    ]);
  } else {
    // Localhost fallback over HTTP
    inlineKeyboard.push([
      { text: '🌐 Veb-ilovaga o\'tish (Brauzerda)', url: domain }
    ]);
  }

  bot.sendMessage(db.chatId,
    '👋 *Salom! Timer Bot tayyor.*\n\n✅ Siz ulangansiz!\nQuyidagi tugmani bosib Gmail + timer boshqaruv panelini oching:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    }
  ).catch(err => {
    console.error('⚠️ bot.sendMessage error:', err.message);
  });
  console.log(`✅ Bot ulandi. Chat ID: ${db.chatId}`);
});

// ─── Timer helpers ─────────────────────────────────────────────────────────
function scheduleTimer(entry) {
  if (timers.has(entry.id)) clearTimeout(timers.get(entry.id));

  const elapsed = Date.now() - entry.startedAt;
  const remaining = entry.totalMs - elapsed;
  if (remaining <= 0) { fireTimer(entry.id); return; }

  const handle = setTimeout(() => fireTimer(entry.id), remaining);
  timers.set(entry.id, handle);
}

async function fireTimer(id) {
  timers.delete(id);
  const entry = db.entries.find(e => e.id === id);
  if (!entry) return;
  entry.status = 'notified';
  entry.notifiedAt = Date.now();
  saveData(db);

  if (db.chatId) {
    const text =
      `⏰ *Limit Yangilandi!* ⏰\n\n` +
      `📧 Gmail: \`${entry.gmail}\`\n` +
      `✅ Ushbu Gmail uchun limit ochildi! 🚀`;
    try {
      await bot.sendMessage(db.chatId, text, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Xabar yuborishda xatolik:', err.message);
    }
  }
}

// ─── Restore timers on startup ─────────────────────────────────────────────
db.entries.forEach(entry => {
  if (entry.status === 'active') scheduleTimer(entry);
});

// ─── API Routes ────────────────────────────────────────────────────────────

// GET all entries
app.get('/api/entries', (req, res) => {
  res.json({ entries: db.entries, connected: !!db.chatId });
});

// POST add new entry (gmail + optional timer)
app.post('/api/entries', (req, res) => {
  const { gmail, totalSeconds } = req.body;
  if (!gmail) return res.status(400).json({ error: 'Gmail kerak!' });

  // Prevent duplicate
  if (db.entries.find(e => e.gmail === gmail)) {
    return res.status(400).json({ error: 'Bu Gmail allaqachon qo\'shilgan!' });
  }

  const entry = {
    id: Date.now().toString(),
    gmail,
    status: 'idle',       // idle | active | notified
    totalMs: totalSeconds ? totalSeconds * 1000 : 0,
    startedAt: null,
    notifiedAt: null,
    createdAt: Date.now()
  };

  if (totalSeconds && totalSeconds > 0) {
    entry.status = 'active';
    entry.startedAt = Date.now();
    scheduleTimer(entry);
  }

  db.entries.unshift(entry);
  saveData(db);
  res.json({ success: true, entry });
});

// POST start/restart timer for existing entry
app.post('/api/entries/:id/start', (req, res) => {
  const { totalSeconds } = req.body;
  const entry = db.entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Topilmadi' });

  entry.status = 'active';
  entry.totalMs = totalSeconds * 1000;
  entry.startedAt = Date.now();
  entry.notifiedAt = null;
  scheduleTimer(entry);
  saveData(db);
  res.json({ success: true, entry });
});

// POST cancel timer
app.post('/api/entries/:id/cancel', (req, res) => {
  const entry = db.entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Topilmadi' });
  if (timers.has(entry.id)) { clearTimeout(timers.get(entry.id)); timers.delete(entry.id); }
  entry.status = 'idle';
  entry.startedAt = null;
  entry.totalMs = 0;
  saveData(db);
  res.json({ success: true });
});

// DELETE entry
app.delete('/api/entries/:id', (req, res) => {
  const idx = db.entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Topilmadi' });
  if (timers.has(req.params.id)) { clearTimeout(timers.get(req.params.id)); timers.delete(req.params.id); }
  db.entries.splice(idx, 1);
  saveData(db);
  res.json({ success: true });
});

// GET status
app.get('/api/status', (req, res) => {
  res.json({ connected: !!db.chatId });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
});
