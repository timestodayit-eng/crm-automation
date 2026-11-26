// SMS কোম্পানির সংযোগ যাচাই: node scripts/check-sms.js 01XXXXXXXXX [সাইট-আইডি]
// প্যানেলে সেভ করা তথ্য দিয়ে একটা আসল টেস্ট SMS পাঠায় আর কোম্পানির পুরো উত্তর দেখায়।
// Client Secret বা API Key স্ক্রিনে দেখায় না।
require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first');
const dbm = require('../src/db');
const sms = require('../src/sms');

(async () => {
  const number = sms.localNumber(process.argv[2]);
  if (!sms.isMobile(number)) return console.log('ব্যবহার: node scripts/check-sms.js 01XXXXXXXXX [সাইট-আইডি]');
  const db = dbm.init();
  const id = Number(process.argv[3]) || null;
  const site = id ? db.prepare('SELECT * FROM sites WHERE id = ?').get(id) : db.prepare('SELECT * FROM sites ORDER BY id LIMIT 1').get();
  if (!site) return console.log('কোনো সাইট নেই');

  const p = sms.providerOf(site);
  console.log(`সাইট: ${site.name} (id ${site.id})`);
  console.log(`SMS কোম্পানি: ${p.label}`);
  console.log(`Sender ID: "${site.sms_sender_id}"`);
  if (site.sms_provider !== 'bulksmsbd') {
    console.log(`Client ID: "${site.sms_client_id}"`);
    console.log(`Client Secret: ${site.sms_client_secret ? `${site.sms_client_secret.length} অক্ষর, শেষ ৪টি …${site.sms_client_secret.slice(-4)}` : 'দেওয়া নেই'}`);
    console.log(`API ঠিকানা: ${(process.env.SOFTCENTS_API_URL || 'https://sms.softcents.com/api/v1').replace(/\/+$/, '')}/send-sms`);
  }
  console.log(`পাঠানো হচ্ছে: 88${number}\n`);

  const bal = await sms.balance(site);
  console.log(bal.ok ? `ব্যালেন্স: ${bal.text}` : `ব্যালেন্স দেখা যায়নি: ${bal.error}`);
  const r = await sms.send(site, number, `Test SMS from ${site.name}`);
  console.log(r.ok ? '\n✓ SMS পাঠানো হয়েছে' : `\n✗ ব্যর্থ: ${r.error}`);
  console.log(`কোম্পানির উত্তর: ${r.raw || '(খালি)'}`);
})();
