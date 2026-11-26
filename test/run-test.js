// নকল mConnex আর নকল BulkSMSBD সার্ভার দিয়ে পুরো সিস্টেমের টেস্ট
// চালান: npm test
const http = require('http');
const assert = require('assert');

let pass = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  pass++;
  console.log('  ✓', msg);
};

// ---------- নকল mConnex ----------
const mock = { rows: [], validToken: null, logins: 0, reportCalls: 0 };
const smsSent = [];

function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function main() {
  const mconnexSrv = await listen((req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/v1/user/login' && req.method === 'POST') {
        const b = JSON.parse(body);
        if (b.loginName === 'Test_User' && b.password === 'secret') {
          mock.logins++;
          mock.validToken = `tok${mock.logins}`;
          return res.end(JSON.stringify({ success: true, message: 'Login successfull!', token: mock.validToken, user: { companyname: 'Test Co', hotline: '01969918811' } }));
        }
        res.statusCode = 401;
        return res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
      }
      if (url.pathname === '/api/v1/company/user-report' && mock.delay && !req.delayed) {
        req.delayed = true;
        return setTimeout(() => req.emit('end'), mock.delay); // ধীর mConnex-এর নকল
      }
      if (url.pathname === '/api/v1/company/user-report') {
        mock.reportCalls++;
        if (req.headers.authorization !== `Bearer ${mock.validToken}`) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ message: 'Unauthenticated.' }));
        }
        const start = url.searchParams.get('startDate');
        const end = url.searchParams.get('endDate');
        const page = Number(url.searchParams.get('page'));
        const limit = Number(url.searchParams.get('limit'));
        const rows = mock.rows.filter((r) => r.date >= start && r.date <= end).sort((a, b) => b.date.localeCompare(a.date));
        return res.end(JSON.stringify({ success: true, cdr: rows.slice((page - 1) * limit, page * limit), total: rows.length }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  const smsSrv = await listen((req, res) => {
    const url = new URL(req.url, 'http://x');
    smsSent.push(Object.fromEntries(url.searchParams));
    res.end(JSON.stringify({ response_code: 202, success_message: 'SMS Submitted Successfully' }));
  });

  // নকল Softcents: POST /send-sms (JSON), GET /check-balance
  const softSent = [];
  const softMock = { fail: null };
  const softSrv = await listen((req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      const goodCreds = (id, sec) => id === 'CID' && sec === 'CSECRET';
      if (url.pathname === '/api/v1/send-sms' && req.method === 'POST') {
        const b = JSON.parse(body);
        softSent.push({ ...b, contentType: req.headers['content-type'], accept: req.headers.accept });
        if (!goodCreds(b.clientId, b.clientSecret)) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ status: 401, success: false, response_code: 1011, message: 'Invalid client credentials' }));
        }
        if (softMock.fail) {
          res.statusCode = softMock.failStatus || 402;
          return res.end(JSON.stringify({ status: res.statusCode, success: false, response_code: softMock.failCode || 1005, message: softMock.fail }));
        }
        return res.end(JSON.stringify({ status: 200, success: true, response_code: 1000, message: 'SMS sent successfully' }));
      }
      if (url.pathname === '/api/v1/check-balance') {
        if (!goodCreds(url.searchParams.get('clientId'), url.searchParams.get('clientSecret'))) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ success: false, message: 'Invalid client credentials' }));
        }
        return res.end(JSON.stringify({ status: 200, success: true, response_code: 200, balance: 1250.5, currency: 'BDT' }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  process.env.SOFTCENTS_API_URL = `http://127.0.0.1:${softSrv.address().port}/api/v1`;

  process.env.MCONNEX_BASE_URL = `http://127.0.0.1:${mconnexSrv.address().port}/api/v1`;
  process.env.SMS_API_URL = `http://127.0.0.1:${smsSrv.address().port}/api/smsapi`;
  process.env.ADMIN_USER = 'admin';
  process.env.ADMIN_PASSWORD = 'testpass';
  process.env.SESSION_SECRET = 'x'.repeat(40);

  const dbm = require('../src/db');
  const time = require('../src/time');
  const engine = require('../src/engine');
  const db = dbm.init(':memory:');

  let seq = 1000;
  const call = (caller, status = 'MISSED CALL', minsAgo = 1, called = '01969918811') => ({
    linkedId: `17953${seq++}.1`,
    date: time.minutesAgo(minsAgo),
    caller,
    called,
    answeredDuration: status === 'ANSWERED' ? 30 : 0,
    totalDuration: '12',
    status,
  });

  const siteId = db
    .prepare(
      `INSERT INTO sites (name, enabled, dry_run, mconnex_login, mconnex_password, hotlines, sms_delay_minutes, quiet_start, quiet_end,
        cooldown_days, sms_provider, sms_api_key, sms_sender_id, page_limit, created_at)
       VALUES ('Test Site', 1, 0, 'Test_User', 'secret', '01969918811', 0, '00:00', '00:00', 7, 'bulksmsbd', 'KEY', 'SENDER', 10, ?)`
    )
    .run(time.now()).lastInsertRowid;
  const addAgent = (name, number, order) =>
    db.prepare('INSERT INTO agents (site_id, name, number, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(siteId, name, number, order, time.now()).lastInsertRowid;
  const A = addAgent('Agent A', '01711000001', 1);
  const B = addAgent('Agent B', '01711000002', 2);
  const C = addAgent('Agent C', '01711000003', 3);
  const agentOf = (n) => db.prepare('SELECT agent_id FROM callers WHERE site_id = ? AND number = ?').get(siteId, n)?.agent_id;
  const lastSms = (n) => smsSent.filter((s) => s.number === '88' + n).pop();

  console.log('\n১. প্রথম সিঙ্ক — পুরনো কলে SMS যাবে না');
  for (let i = 0; i < 25; i++) mock.rows.push(call(`0170000${String(i).padStart(4, '0')}`, 'MISSED CALL', 30 + i));
  await engine.runSite(siteId, { force: true });
  ok(db.prepare('SELECT COUNT(*) c FROM calls').get().c === 25, '২৫টি পুরনো কল রেকর্ড হয়েছে (৩ পেজ জুড়ে)');
  ok(smsSent.length === 0, 'পুরনো কলারদের কোনো SMS যায়নি');
  ok(mock.logins === 1, 'নিজে থেকে mConnex-এ লগইন করেছে');
  ok(!!db.prepare('SELECT baseline_at FROM sites WHERE id = ?').get(siteId).baseline_at, 'প্রথম সিঙ্কের সময় রেকর্ড হয়েছে');
  // টেস্টের সুবিধার জন্য প্রথম সিঙ্ক এক ঘণ্টা আগে হয়েছে ধরে নেওয়া (নইলে "৩ মিনিট আগের" নকল কলগুলো তার আগের হয়ে যায়)
  db.prepare('UPDATE sites SET baseline_at = ? WHERE id = ?').run(time.minutesAgo(60), siteId);

  console.log('\n২. নতুন মিসড কল — রাউন্ড রবিন ও একজনকে একটাই SMS');
  mock.rows.push(
    call('01810000001', 'MISSED CALL', 3),
    call('01810000001', 'MISSED CALL', 2), // একই কলার দুবার
    call('01810000002'),
    call('01810000003'),
    call('01810000004'),
    call('09639104947'), // মোবাইল নয়
    call('01810000005', 'ANSWERED'), // রিসিভ হওয়া কল
    call('01810000006', 'MISSED CALL', 1, '01958338309') // অন্য হটলাইন
  );
  await engine.runSite(siteId, { force: true });
  ok(smsSent.length === 4, `৪ জন নতুন কলার, ৪টি SMS (পাওয়া গেছে ${smsSent.length})`);
  ok(smsSent.filter((s) => s.number === '8801810000001').length === 1, 'দুবার মিসড কল দেওয়া কলার একটাই SMS পেয়েছেন');
  ok(agentOf('01810000001') === A && agentOf('01810000002') === B && agentOf('01810000003') === C && agentOf('01810000004') === A, 'এজেন্ট রাউন্ড রবিনে বণ্টন: A, B, C, আবার A');
  ok(lastSms('01810000002').message.includes('Agent B') && lastSms('01810000002').message.includes('01711000002'), 'SMS-এ সঠিক এজেন্টের নাম আর নাম্বার বসেছে');
  ok(lastSms('01810000001').senderid === 'SENDER' && lastSms('01810000001').api_key === 'KEY', 'API Key আর Sender ID ঠিকমতো গেছে');
  ok(!smsSent.some((s) => s.number.includes('9639104947')), 'ল্যান্ডলাইন/IP নাম্বারে SMS যায়নি');
  ok(!smsSent.some((s) => s.number.includes('01810000005')), 'রিসিভ হওয়া কলে SMS যায়নি');
  ok(!smsSent.some((s) => s.number.includes('01810000006')), 'অন্য হটলাইনের মিসড কলে SMS যায়নি');

  console.log('\n২ক. পিছনে দেখার সময় বাড়ালেও পুরনো মিসড কলে SMS নয়');
  db.prepare('UPDATE sites SET lookback_minutes = 1440, page_limit = 100 WHERE id = ?').run(siteId);
  for (let i = 0; i < 40; i++) mock.rows.push(call(`0175000${String(i).padStart(4, '0')}`, 'MISSED CALL', 180 + i * 10)); // ৩–৯ ঘণ্টা আগের, আগে কখনো দেখা হয়নি
  mock.rows.push(call('01750009999', 'MISSED CALL', 70)); // প্রথম সিঙ্কের আগের (৭০ মিনিট আগে)
  let before2 = smsSent.length;
  await engine.runSite(siteId, { force: true });
  ok(smsSent.length === before2, `৪১টি পুরনো মিসড কল নতুন ধরা পড়লেও কোনো SMS যায়নি (গেছে ${smsSent.length - before2})`);
  ok(db.prepare("SELECT COUNT(*) c FROM sms_log WHERE caller LIKE '01750%'").get().c === 0, 'পুরনো কলগুলো SMS লাইনেও ওঠেনি');
  ok(db.prepare("SELECT COUNT(*) c FROM calls WHERE caller LIKE '01750%'").get().c === 41, 'তবে কলগুলো মিসড কল তালিকায় রেকর্ড হয়েছে');
  ok(/৪১|41টি পুরনো মিসড কল বাদ/.test(db.prepare('SELECT last_poll_status FROM sites WHERE id = ?').get(siteId).last_poll_status), 'অবস্থায় "পুরনো মিসড কল বাদ" দেখাচ্ছে');
  db.prepare('UPDATE sites SET lookback_minutes = 60, page_limit = 10 WHERE id = ?').run(siteId);

  console.log('\n৩. কুলডাউন — ৭ দিনের মধ্যে আবার SMS যাবে না');
  mock.rows.push(call('01810000002'));
  await engine.runSite(siteId, { force: true });
  ok(smsSent.length === 4, 'আবার মিসড কল দিলেও কুলডাউনের মধ্যে নতুন SMS যায়নি');
  ok(agentOf('01810000002') === B, 'কলারের এজেন্ট আগের মতোই B আছে');

  console.log('\n৪. এজেন্ট বন্ধ করলে কলার নতুন এজেন্ট পান, নইলে সবসময় একই এজেন্ট');
  db.prepare('UPDATE sites SET cooldown_days = 0').run();
  mock.rows.push(call('01810000003'));
  await engine.runSite(siteId, { force: true });
  ok(lastSms('01810000003').message.includes('Agent C'), 'কুলডাউন ছাড়া আবার কল দিলেও একই এজেন্ট C-এর নাম্বার গেছে');
  db.prepare('UPDATE agents SET active = 0 WHERE id = ?').run(B);
  mock.rows.push(call('01810000002'));
  await engine.runSite(siteId, { force: true });
  ok(agentOf('01810000002') !== B && agentOf('01810000002') !== undefined, 'B বন্ধ হওয়ায় কলার নতুন সক্রিয় এজেন্ট পেয়েছেন');
  ok(!lastSms('01810000002').message.includes('Agent B'), 'নতুন SMS-এ বন্ধ এজেন্টের নাম্বার নেই');
  mock.rows.push(call('01810000009'));
  await engine.runSite(siteId, { force: true });
  ok(agentOf('01810000009') !== B, 'নতুন কলাররা বন্ধ এজেন্ট পান না');
  db.prepare('UPDATE sites SET cooldown_days = 7').run();

  console.log('\n৫. মিসড কলের পরে কথা হয়ে গেলে SMS বাদ');
  db.prepare('UPDATE sites SET sms_delay_minutes = 60').run();
  mock.rows.push(call('01810000010', 'MISSED CALL', 3));
  await engine.runSite(siteId, { force: true });
  ok(db.prepare("SELECT COUNT(*) c FROM sms_log WHERE caller = '01810000010' AND status = 'queued'").get().c === 1, 'দেরির সময় পর্যন্ত SMS লাইনে অপেক্ষা করছে');
  mock.rows.push(call('01810000010', 'ANSWERED', 1));
  db.prepare("UPDATE sms_log SET due_at = ? WHERE caller = '01810000010'").run(time.minutesAgo(1));
  const before = smsSent.length;
  await engine.runSite(siteId, { force: true });
  ok(smsSent.length === before, 'কলারের সাথে পরে কথা হওয়ায় SMS যায়নি');
  ok(db.prepare("SELECT status FROM sms_log WHERE caller = '01810000010'").get().status === 'skipped', 'লগে "বাদ" হিসেবে দেখাচ্ছে');
  db.prepare('UPDATE sites SET sms_delay_minutes = 0').run();

  console.log('\n৬. টোকেনের মেয়াদ শেষ হলে নিজে আবার লগইন');
  mock.validToken = 'expired-elsewhere';
  const loginsBefore = mock.logins;
  mock.rows.push(call('01810000011'));
  await engine.runSite(siteId, { force: true });
  ok(mock.logins === loginsBefore + 1, 'নতুন টোকেন নিয়েছে');
  ok(!!lastSms('01810000011'), 'আবার লগইনের পর SMS ঠিকমতো গেছে');

  console.log('\n৭. চুপ থাকার সময় আর টেস্ট মোড');
  const t = time.hhmm();
  const h = Number(t.slice(0, 2));
  const pad = (x) => String((x + 24) % 24).padStart(2, '0') + ':00';
  db.prepare('UPDATE sites SET quiet_start = ?, quiet_end = ?').run(pad(h - 1), pad(h + 1));
  mock.rows.push(call('01810000012'));
  let n = smsSent.length;
  await engine.runSite(siteId, { force: true });
  ok(smsSent.length === n, 'চুপ থাকার সময়ে SMS যায়নি');
  db.prepare("UPDATE sites SET quiet_start = '00:00', quiet_end = '00:00'").run();
  await engine.runSite(siteId, { force: true });
  ok(!!lastSms('01810000012'), 'সময় শেষ হলে লাইনের SMS চলে গেছে');
  db.prepare('UPDATE sites SET dry_run = 1').run();
  mock.rows.push(call('01810000013'));
  n = smsSent.length;
  await engine.runSite(siteId, { force: true });
  ok(smsSent.length === n, 'টেস্ট মোডে আসল SMS যায়নি');
  ok(db.prepare("SELECT status FROM sms_log WHERE caller = '01810000013'").get().status === 'dry_run', 'টেস্ট মোডে লগে মেসেজ দেখাচ্ছে');
  db.prepare('UPDATE sites SET dry_run = 0').run();

  console.log('\n৮. ধীর mConnex — কল টানার সময়েও SMS আটকে থাকে না');
  mock.delay = 1500;
  mock.rows.push(call('01810000020'));
  let p = engine.startPoll(siteId);
  ok(p.started && engine.pollStatus(siteId).running, 'কল টানা ব্যাকগ্রাউন্ডে শুরু হয়েছে');
  ok(engine.startPoll(siteId).busy, 'একই সময়ে দ্বিতীয়বার কল টানা শুরু হয় না');
  db.prepare("INSERT INTO sms_log (site_id, caller, status, missed_at, due_at, created_at) VALUES (?, '01810000021', 'queued', ?, ?, ?)").run(siteId, time.minutesAgo(2), time.minutesAgo(1), time.now());
  n = smsSent.length;
  await engine.sendQueue(siteId);
  ok(smsSent.length === n + 1 && engine.pollStatus(siteId).running, 'mConnex-এর উত্তরের অপেক্ষার মধ্যেই লাইনের SMS চলে গেছে');
  await p.promise;
  await engine.sendQueue(siteId);
  ok(!engine.pollStatus(siteId).running && !!lastSms('01810000020'), 'ধীর উত্তর এলে নতুন মিসড কল ধরা পড়েছে আর SMS গেছে');
  process.env.MCONNEX_TIMEOUT_MS = '500';
  await engine.startPoll(siteId).promise;
  const stTimeout = db.prepare('SELECT last_poll_status FROM sites WHERE id = ?').get(siteId).last_poll_status;
  ok(/ত্রুটি: কল রিপোর্ট .*উত্তর দেয়নি/.test(stTimeout), 'সময়সীমা পেরোলে স্পষ্ট ত্রুটি দেখায়');
  delete process.env.MCONNEX_TIMEOUT_MS;
  mock.delay = 0;
  await new Promise((r) => setTimeout(r, 1200)); // কেটে দেওয়া অনুরোধটা নকল সার্ভারে শেষ হতে দেওয়া

  console.log('\n৯. Softcents দিয়ে SMS');
  const smsMod = require('../src/sms');
  db.prepare("UPDATE sites SET sms_provider = 'softcents', sms_client_id = 'CID', sms_client_secret = 'CSECRET', sms_sender_id = 'COASTAL'").run();
  const bulkBefore = smsSent.length;
  mock.rows.push(call('01810000030'));
  await engine.runSite(siteId, { force: true });
  const sc = softSent[softSent.length - 1];
  ok(sc && sc.numbers === '8801810000030' && sc.senderId === 'COASTAL', 'Softcents-এ সঠিক নাম্বার (88 সহ) আর Sender ID গেছে');
  ok(sc.clientId === 'CID' && sc.clientSecret === 'CSECRET', 'Client ID আর Client Secret JSON-এ গেছে');
  ok(/application\/json/.test(sc.contentType) && /application\/json/.test(sc.accept), 'Accept আর Content-Type হেডার application/json');
  ok(/Agent [A-C]/.test(sc.contents) && /0171100000\d/.test(sc.contents), 'SMS-এর লেখায় এজেন্টের নাম আর নাম্বার বসেছে');
  ok(smsSent.length === bulkBefore, 'Softcents বেছে নিলে BulkSMSBD-তে কিছু যায়নি');
  ok(db.prepare("SELECT status FROM sms_log WHERE caller = '01810000030' ORDER BY id DESC").get().status === 'sent', 'লগে "পাঠানো হয়েছে" দেখাচ্ছে');
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  const bal = await smsMod.balance(site);
  ok(bal.ok && bal.text === '1250.5 BDT', 'Softcents ব্যালেন্স দেখা যাচ্ছে');
  // ভুল Secret হলে: ব্যর্থ, আর এবারের বাকি SMS চেষ্টা বন্ধ
  db.prepare("UPDATE sites SET sms_client_secret = 'WRONG'").run();
  mock.rows.push(call('01810000031'), call('01810000032'));
  let tries = softSent.length;
  await engine.runSite(siteId, { force: true });
  ok(softSent.length === tries + 1, 'ভুল Secret-এ প্রথমটা ব্যর্থ হলে বাকিগুলো আর চেষ্টা করেনি');
  const failed = db.prepare("SELECT status, reason FROM sms_log WHERE caller = '01810000031' ORDER BY id DESC").get();
  ok(failed.status === 'failed' && /Invalid client credentials/.test(failed.reason), 'ব্যর্থ SMS-এ Softcents-এর কারণ লেখা আছে');
  ok(db.prepare("SELECT status FROM sms_log WHERE caller = '01810000032' ORDER BY id DESC").get().status === 'queued', 'বাকি SMS লাইনে অপেক্ষা করছে');
  db.prepare("UPDATE sites SET sms_client_secret = 'CSECRET'").run();
  await engine.runSite(siteId, { force: true });
  ok(!!softSent.find((s) => s.numbers === '8801810000032'), 'Secret ঠিক করার পর লাইনের SMS চলে গেছে');
  softMock.fail = 'Insufficient balance';
  mock.rows.push(call('01810000033'));
  await engine.runSite(siteId, { force: true });
  const balReason = db.prepare("SELECT reason FROM sms_log WHERE caller = '01810000033' ORDER BY id DESC").get().reason;
  ok(/ব্যালেন্স শেষ/.test(balReason) && /1005/.test(balReason), 'ব্যালেন্স শেষ হলে (কোড 1005) বাংলায় কারণ দেখাচ্ছে');
  // 1007: Sender ID-র গেটওয়ে বন্ধ — বাকিগুলো থামবে
  Object.assign(softMock, { fail: 'The SMS gateway associated with the selected sender ID is currently unavailable.', failCode: 1007, failStatus: 200 });
  mock.rows.push(call('01810000034'), call('01810000035'));
  tries = softSent.length;
  await engine.runSite(siteId, { force: true });
  const r1007 = db.prepare("SELECT status, reason FROM sms_log WHERE caller = '01810000034' ORDER BY id DESC").get();
  ok(softSent.length === tries + 1 && r1007.status === 'failed' && /Sender ID-র গেটওয়ে/.test(r1007.reason), 'কোড 1007-এ বাংলা কারণ দেখায় আর বাকি SMS থামে');
  // 1008: সাময়িক সমস্যা — ব্যর্থ নয়, লাইনে থেকে পরে আবার
  Object.assign(softMock, { fail: 'Telecom operator network temporary issue', failCode: 1008, failStatus: 500 });
  db.prepare("UPDATE sms_log SET due_at = ? WHERE caller = '01810000035' AND status = 'queued'").run(time.minutesAgo(1));
  await engine.runSite(siteId, { force: true });
  const r1008 = db.prepare("SELECT status, reason, due_at FROM sms_log WHERE caller = '01810000035' ORDER BY id DESC").get();
  ok(r1008.status === 'queued' && /আবার চেষ্টা করবে/.test(r1008.reason) && r1008.due_at > time.now(), 'কোড 1008-এ SMS ব্যর্থ না হয়ে ১০ মিনিট পরে আবার চেষ্টার জন্য লাইনে থাকে');
  Object.assign(softMock, { fail: null, failCode: null, failStatus: null });
  db.prepare("UPDATE sms_log SET due_at = ? WHERE caller = '01810000035' AND status = 'queued'").run(time.minutesAgo(1));
  await engine.runSite(siteId, { force: true });
  ok(db.prepare("SELECT status FROM sms_log WHERE caller = '01810000035' ORDER BY id DESC").get().status === 'sent', 'সমস্যা মিটলে সেই SMS চলে গেছে');
  db.prepare("UPDATE sites SET sms_client_id = ''").run();
  ok(/Client ID/.test(smsMod.missingConfig(db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId))), 'Client ID না থাকলে কী বাকি সেটা বলে');
  db.prepare("UPDATE sites SET sms_client_id = 'CID'").run();

  console.log('\n১০. প্যানেল');
  const { createApp } = require('../src/server');
  const app = createApp();
  const srv = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (path, form) => {
    const res = await fetch(base + path, {
      method: form ? 'POST' : 'GET',
      redirect: 'manual',
      headers: { cookie, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return res;
  };
  ok((await req('/')).headers.get('location') === '/login', 'লগইন ছাড়া প্যানেলে ঢোকা যায় না');
  ok((await req('/login', { user: 'admin', password: 'wrong' })).headers.get('location') === '/login', 'ভুল পাসওয়ার্ডে লগইন হয় না');
  await req('/login', { user: 'admin', password: 'testpass' });
  const home = await (await req('/')).text();
  ok(home.includes('Test Site'), 'লগইনের পর ড্যাশবোর্ডে সাইট দেখা যাচ্ছে');
  mock.delay = 1500;
  const t0 = Date.now();
  const pollRes = await req(`/sites/${siteId}/poll`, { x: '1' });
  ok(pollRes.status === 302 && Date.now() - t0 < 1000, '"এখনই কল চেক করুন" mConnex-এর অপেক্ষা না করে সাথে সাথে ফেরে');
  ok((await (await req(`/sites/${siteId}`)).text()).includes('কল টানা চলছে'), 'সারাংশে "কল টানা চলছে" দেখাচ্ছে');
  while (engine.pollStatus(siteId).running) await new Promise((r) => setTimeout(r, 100));
  mock.delay = 0;
  const callsHtml = await (await req(`/sites/${siteId}/calls`)).text();
  ok(callsHtml.includes('01810000001') && callsHtml.includes('মিসড কল'), 'মিসড কল ট্যাবে আজকের মিসড কলের নাম্বার দেখা যাচ্ছে');
  for (const p of ['', '/calls?view=all', '/calls?view=answered&q=0181', '/agents', '/callers', '/sms', '/sms?status=sent', '/events', '/settings']) {
    const r = await req(`/sites/${siteId}${p}`);
    ok(r.status === 200, `পেজ খুলছে: /sites/${siteId}${p}`);
  }
  await req(`/sites/${siteId}/agents/bulk`, { list: 'রহিম, 01911000001\nকরিম\t01911000002\nভুল লাইন' });
  ok(db.prepare("SELECT COUNT(*) c FROM agents WHERE number LIKE '0191100000%'").get().c === 2, 'একসাথে অনেক এজেন্ট যোগ হচ্ছে, ভুল লাইন বাদ');
  await req(
    `/sites/${siteId}/settings`,
    new URLSearchParams([['name', 'Coastal'], ['cooldown_days', '5'], ['mconnex_password', ''], ['enabled', '0'], ['enabled', '1'], ['dry_run', '0'], ['quiet_start', '22:00'], ['quiet_end', '08:00']])
  );
  const st = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  ok(st.name === 'Coastal' && st.cooldown_days === 5 && st.enabled === 1, 'সেটিংস সেভ হচ্ছে');
  ok(st.mconnex_password === 'secret', 'পাসওয়ার্ডের ঘর খালি রাখলে আগের পাসওয়ার্ড থাকছে');
  const settingsHtml = await (await req(`/sites/${siteId}/settings`)).text();
  ok(!/value="(secret|KEY)"/.test(settingsHtml) && !settingsHtml.includes('CSECRET'), 'সেটিংস পেজে পাসওয়ার্ড, API Key বা Client Secret দেখা যায় না');
  ok(/<option value="softcents" selected>/.test(settingsHtml), 'সেটিংসে SMS কোম্পানি বাছাইয়ের ঘরে Softcents বেছে রাখা আছে');
  await req(`/sites/${siteId}/settings`, new URLSearchParams([['sms_provider', 'hacked'], ['sms_client_secret', '']]));
  ok(db.prepare('SELECT sms_provider, sms_client_secret FROM sites WHERE id = ?').get(siteId).sms_provider === 'softcents', 'তালিকার বাইরের কোম্পানি সেভ হয় না');
  const balRes = await req(`/sites/${siteId}/sms-balance`, { x: '1' });
  const afterBal = await (await req(balRes.headers.get('location'))).text();
  ok(afterBal.includes('1250.5 BDT'), 'প্যানেলের "SMS ব্যালেন্স দেখুন" বোতাম কাজ করছে');
  const xss = await req('/sites', { name: '<script>x</script>' });
  const page = await (await req(xss.headers.get('location').replace('/settings', ''))).text();
  ok(!page.includes('<script>x</script>'), 'নামের ভেতরের কোড নিরাপদভাবে দেখানো হচ্ছে');

  srv.close();
  mconnexSrv.close();
  smsSrv.close();
  softSrv.close();
  console.log(`\nসব ${pass}টি টেস্ট পাস ✅`);
}

main().catch((e) => {
  console.error('\n❌ টেস্ট ব্যর্থ:', e.message);
  process.exit(1);
});
