const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const time = require('./time');

const DEFAULT_TEMPLATE =
  'আন্তরিকভাবে দুঃখিত, আপনার কলটি ধরতে পারিনি। আমাদের প্রতিনিধি {agent_name} আপনাকে সাহায্য করবেন, কল করুন: {agent_number} - {site_name}';

// প্রতিটা সাইটের যেসব সেটিংস প্যানেল থেকে বদলানো যায়, তার তালিকা ও ডিফল্ট মান
const SITE_SETTINGS = [
  { key: 'name', label: 'সাইটের নাম', type: 'text', def: '' },
  { key: 'enabled', label: 'সিস্টেম চালু', type: 'bool', def: 0, help: 'বন্ধ থাকলে কল চেক বা SMS কিছুই হবে না' },
  { key: 'dry_run', label: 'টেস্ট মোড (SMS আসলে যাবে না)', type: 'bool', def: 1, help: 'চালু থাকলে শুধু লগে দেখাবে কাকে কী SMS যেত। সব ঠিক দেখলে বন্ধ করুন' },
  { key: 'mconnex_login', label: 'mConnex লগইন নাম', type: 'text', def: '' },
  { key: 'mconnex_password', label: 'mConnex পাসওয়ার্ড', type: 'secret', def: '' },
  { key: 'hotlines', label: 'যে হটলাইনের মিসড কল ধরা হবে', type: 'text', def: '', help: 'কমা দিয়ে একাধিক দেওয়া যায়। খালি রাখলে সব নাম্বারের মিসড কল ধরা হবে' },
  { key: 'poll_minutes', label: 'কত মিনিট পর পর কল চেক করবে', type: 'int', def: 5, min: 1, max: 120 },
  { key: 'lookback_minutes', label: 'প্রতিবার কত মিনিট পিছনের কল দেখবে', type: 'int', def: 180, min: 10, max: 1440, help: 'চেকের বিরতির চেয়ে বড় রাখুন, যাতে সার্ভার কিছুক্ষণ বন্ধ থাকলেও কল বাদ না পড়ে' },
  { key: 'page_limit', label: 'প্রতি পেজে কতটা কল আনবে', type: 'int', def: 100, min: 10, max: 500 },
  { key: 'sms_delay_minutes', label: 'মিসড কলের কত মিনিট পরে SMS যাবে', type: 'int', def: 5, min: 0, max: 240, help: 'এর মধ্যে কলার আবার কল করে কথা বললে SMS যাবে না' },
  { key: 'skip_if_answered', label: 'পরে কল রিসিভ হলে SMS বাদ দেবে', type: 'bool', def: 1 },
  { key: 'cooldown_days', label: 'একই নাম্বারে আবার SMS যাওয়ার আগে কত দিন অপেক্ষা', type: 'int', def: 7, min: 0, max: 365, help: '০ দিলে প্রতিবার মিসড কলে SMS যাবে (সুপারিশ করা হয় না)' },
  { key: 'quiet_start', label: 'SMS বন্ধ থাকার শুরু (২৪ ঘণ্টার সময়)', type: 'time', def: '22:00' },
  { key: 'quiet_end', label: 'SMS বন্ধ থাকার শেষ', type: 'time', def: '08:00', help: 'শুরু আর শেষ একই দিলে সারাদিন SMS যাবে। বন্ধ সময়ের SMS সকালে যাবে' },
  { key: 'mobile_only', label: 'শুধু মোবাইল নাম্বারে SMS (01XXXXXXXXX)', type: 'bool', def: 1, help: '09xxx এর মতো ল্যান্ডলাইন/IP নাম্বার বাদ' },
  { key: 'max_sms_per_run', label: 'প্রতিবারে সর্বোচ্চ কতটা SMS পাঠাবে', type: 'int', def: 30, min: 1, max: 500 },
  { key: 'sms_template', label: 'SMS-এর লেখা', type: 'textarea', def: DEFAULT_TEMPLATE, help: 'ব্যবহার করা যাবে: {agent_name} {agent_number} {site_name} {hotline} {caller}' },
  { key: 'sms_api_key', label: 'BulkSMSBD API Key', type: 'secret', def: '' },
  { key: 'sms_sender_id', label: 'BulkSMSBD Sender ID', type: 'text', def: '' },
];

let db;

function init(dbPath) {
  const file = dbPath || process.env.DB_PATH || './data/app.db';
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const siteCols = SITE_SETTINGS.map((s) => {
    if (s.type === 'int' || s.type === 'bool') return `${s.key} INTEGER NOT NULL DEFAULT ${Number(s.def)}`;
    return `${s.key} TEXT NOT NULL DEFAULT '${String(s.def).replace(/'/g, "''")}'`;
  }).join(',\n      ');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ${siteCols},
      mconnex_token TEXT,
      rr_last_agent_id INTEGER,
      baseline_done INTEGER NOT NULL DEFAULT 0,
      last_poll_at TEXT,
      last_poll_status TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      number TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS callers (
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      number TEXT NOT NULL,
      agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
      first_seen TEXT NOT NULL,
      last_missed_at TEXT,
      missed_count INTEGER NOT NULL DEFAULT 0,
      last_sms_at TEXT,
      sms_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (site_id, number)
    );
    CREATE TABLE IF NOT EXISTS calls (
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      linked_id TEXT NOT NULL,
      call_date TEXT NOT NULL,
      caller TEXT NOT NULL,
      called TEXT,
      status TEXT,
      answered_duration INTEGER,
      total_duration INTEGER,
      created_at TEXT NOT NULL,
      PRIMARY KEY (site_id, linked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(site_id, caller, call_date);
    CREATE TABLE IF NOT EXISTS sms_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      caller TEXT NOT NULL,
      agent_id INTEGER,
      agent_name TEXT,
      agent_number TEXT,
      message TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      provider_response TEXT,
      missed_at TEXT,
      due_at TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_log(site_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_sms_caller ON sms_log(site_id, caller);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // পুরনো ডেটাবেসে নতুন সেটিংস কলাম যোগ হলে নিজে থেকে বসিয়ে দেয়
  const existing = new Set(db.prepare('PRAGMA table_info(sites)').all().map((c) => c.name));
  for (const s of SITE_SETTINGS) {
    if (existing.has(s.key)) continue;
    const def = s.type === 'int' || s.type === 'bool' ? Number(s.def) : `'${String(s.def).replace(/'/g, "''")}'`;
    const type = s.type === 'int' || s.type === 'bool' ? 'INTEGER' : 'TEXT';
    db.exec(`ALTER TABLE sites ADD COLUMN ${s.key} ${type} NOT NULL DEFAULT ${def}`);
  }
  return db;
}

function get() {
  if (!db) throw new Error('DB not initialised');
  return db;
}

function logEvent(siteId, level, message) {
  get()
    .prepare('INSERT INTO events (site_id, level, message, created_at) VALUES (?, ?, ?, ?)')
    .run(siteId, level, String(message).slice(0, 1000), time.now());
  // পুরনো ইভেন্ট ছেঁটে ফেলা, যাতে ডেটাবেস বড় না হয়
  get().prepare('DELETE FROM events WHERE id <= (SELECT MAX(id) - 2000 FROM events)').run();
}

module.exports = { init, get, logEvent, SITE_SETTINGS, DEFAULT_TEMPLATE };
