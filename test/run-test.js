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
        cooldown_days, sms_api_key, sms_sender_id, page_limit, created_at)
       VALUES ('Test Site', 1, 0, 'Test_User', 'secret', '01969918811', 0, '00:00', '00:00', 7, 'KEY', 'SENDER', 10, ?)`
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

  console.log('\n৮. প্যানেল');
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
  ok(!settingsHtml.includes('secret') && !settingsHtml.includes('"KEY"'), 'সেটিংস পেজে পাসওয়ার্ড বা API Key দেখা যায় না');
  const xss = await req('/sites', { name: '<script>x</script>' });
  const page = await (await req(xss.headers.get('location').replace('/settings', ''))).text();
  ok(!page.includes('<script>x</script>'), 'নামের ভেতরের কোড নিরাপদভাবে দেখানো হচ্ছে');

  srv.close();
  mconnexSrv.close();
  smsSrv.close();
  console.log(`\nসব ${pass}টি টেস্ট পাস ✅`);
}

main().catch((e) => {
  console.error('\n❌ টেস্ট ব্যর্থ:', e.message);
  process.exit(1);
});
