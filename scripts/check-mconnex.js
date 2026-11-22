// mConnex সংযোগ যাচাই: node scripts/check-mconnex.js [সাইট-আইডি]
// পাসওয়ার্ড বা টোকেন কিছুই স্ক্রিনে দেখায় না।
require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const dbm = require('../src/db');
const mconnex = require('../src/mconnex');
const time = require('../src/time');

async function step(label, fn) {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`✓ ${label} — ${((Date.now() - t) / 1000).toFixed(1)}s${out ? ` — ${out}` : ''}`);
    return true;
  } catch (e) {
    console.log(`✗ ${label} — ${((Date.now() - t) / 1000).toFixed(1)}s — ${e.message}`);
    return false;
  }
}

(async () => {
  const db = dbm.init();
  const id = Number(process.argv[2]) || null;
  const site = id
    ? db.prepare('SELECT * FROM sites WHERE id = ?').get(id)
    : db.prepare("SELECT * FROM sites WHERE mconnex_login != '' ORDER BY id LIMIT 1").get();
  if (!site) return console.log('কোনো সাইটে mConnex লগইন দেওয়া নেই');
  console.log(`সাইট: ${site.name} (id ${site.id}), লগইন: ${site.mconnex_login}\n`);

  await step('DNS', async () => {
    const all = await dns.promises.lookup('mconnex.ebsbd.com', { all: true });
    return all.map((a) => a.address).join(', ');
  });
  await step('ওয়েবসাইট খোলা', async () => `HTTP ${(await fetch('https://mconnex.ebsbd.com/', { signal: AbortSignal.timeout(20000) })).status}`);
  site.mconnex_token = null;
  const loggedIn = await step('লগইন', async () => {
    const { user } = await mconnex.login(site);
    return `${user.companyname || ''} ${user.hotline || ''}`.trim();
  });
  if (!loggedIn) return;
  await step('শেষ ১ ঘণ্টার কল (১৫টা)', async () => {
    const rows = await mconnex.fetchCalls({ ...site, page_limit: 15 }, time.minutesAgo(60), time.now());
    return `${rows.length}টি কল`;
  });
  await step(`শেষ ${site.lookback_minutes} মিনিটের সব কল (প্রতি পেজে ${site.page_limit}টা)`, async () => {
    const rows = await mconnex.fetchCalls(site, time.minutesAgo(site.lookback_minutes), time.now());
    return `${rows.length}টি কল`;
  });
})();
