require('dotenv').config();
// কিছু VPS-এ IPv6 ঠিকমতো কাজ করে না, তখন সংযোগ ঝুলে থাকে — আগে IPv4 চেষ্টা করা
require('dns').setDefaultResultOrder('ipv4first');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const dbm = require('./db');
const engine = require('./engine');
const mconnex = require('./mconnex');
const sms = require('./sms');
const time = require('./time');
const { esc, layout, siteTabs, statusPill, settingField } = require('./views');

function createApp() {
  const db = dbm.get();
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(
    session({
      secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', maxAge: 12 * 3600 * 1000 },
    })
  );

  // অন্য সাইট থেকে ফর্ম জমা ঠেকানো
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).send('Forbidden');
      } catch {
        return res.status(403).send('Forbidden');
      }
    }
    next();
  });

  const render = (req, res, title, body, status = 200) => {
    const flash = req.session.flash;
    delete req.session.flash;
    res.status(status).send(layout({ title, body, flash, user: req.session.user }));
  };
  const flash = (req, type, text) => (req.session.flash = { type, text });

  // ---------- লগইন ----------
  const attempts = new Map();
  app.get('/login', (req, res) => {
    render(req, res, 'লগইন', `<div class="login card"><h2>প্যানেলে লগইন</h2>
<form method="post" action="/login"><label class="f"><span>ইউজারনেম</span><input type="text" name="user" autofocus></label>
<label class="f"><span>পাসওয়ার্ড</span><input type="password" name="password"></label><button class="btn">লগইন</button></form></div>`);
  });
  app.post('/login', (req, res) => {
    const ip = req.ip;
    const a = attempts.get(ip) || { n: 0, until: 0 };
    if (a.until > Date.now()) {
      flash(req, 'err', 'অনেকবার ভুল হয়েছে, ১৫ মিনিট পরে চেষ্টা করুন');
      return res.redirect('/login');
    }
    const okUser = process.env.ADMIN_USER || 'admin';
    const okPass = process.env.ADMIN_PASSWORD || '';
    const same = (x, y) => {
      const bx = Buffer.from(String(x));
      const by = Buffer.from(String(y));
      return bx.length === by.length && crypto.timingSafeEqual(bx, by);
    };
    if (okPass && same(req.body.user, okUser) && same(req.body.password, okPass)) {
      attempts.delete(ip);
      return req.session.regenerate(() => {
        req.session.user = okUser;
        res.redirect('/');
      });
    }
    a.n++;
    if (a.n >= 5) Object.assign(a, { n: 0, until: Date.now() + 15 * 60 * 1000 });
    attempts.set(ip, a);
    flash(req, 'err', okPass ? 'ইউজারনেম বা পাসওয়ার্ড ভুল' : '.env ফাইলে ADMIN_PASSWORD দেওয়া নেই');
    res.redirect('/login');
  });
  app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

  app.use((req, res, next) => (req.session.user ? next() : res.redirect('/login')));

  // ---------- সাহায্যকারী ----------
  const today = () => time.now().slice(0, 10) + ' 00:00:00';
  function siteStats(siteId) {
    const one = (sql, ...p) => db.prepare(sql).get(siteId, ...p).c;
    return {
      missedToday: one("SELECT COUNT(*) c FROM calls WHERE site_id = ? AND UPPER(status) = 'MISSED CALL' AND call_date >= ?", today()),
      sentToday: one("SELECT COUNT(*) c FROM sms_log WHERE site_id = ? AND status = 'sent' AND sent_at >= ?", today()),
      dryToday: one("SELECT COUNT(*) c FROM sms_log WHERE site_id = ? AND status = 'dry_run' AND sent_at >= ?", today()),
      failedToday: one("SELECT COUNT(*) c FROM sms_log WHERE site_id = ? AND status = 'failed' AND sent_at >= ?", today()),
      queued: one("SELECT COUNT(*) c FROM sms_log WHERE site_id = ? AND status = 'queued'"),
      activeAgents: one('SELECT COUNT(*) c FROM agents WHERE site_id = ? AND active = 1'),
      totalAgents: one('SELECT COUNT(*) c FROM agents WHERE site_id = ?'),
      callers: one('SELECT COUNT(*) c FROM callers WHERE site_id = ?'),
    };
  }
  function pollingNote(siteId) {
    const p = engine.pollStatus(siteId);
    if (!p.running) return '';
    const min = Math.floor((Date.now() - p.since) / 60000);
    return `<div class="warn">এখন mConnex থেকে কল টানা চলছে (${min ? `${min} মিনিট ধরে` : 'এইমাত্র শুরু'})। শেষ হলে নিচের অবস্থা বদলাবে — পেজটা রিফ্রেশ করুন।</div>`;
  }
  function loadSite(req, res, next) {
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(Number(req.params.id));
    if (!site) return res.redirect('/');
    req.site = site;
    next();
  }
  const back = (req, res, path) => res.redirect(`/sites/${req.site.id}${path || ''}`);

  // ---------- সব সাইট ----------
  app.get('/', (req, res) => {
    const sites = db.prepare('SELECT * FROM sites ORDER BY id').all();
    const cards = sites
      .map((s) => {
        const st = siteStats(s.id);
        const err = String(s.last_poll_status || '').startsWith('ত্রুটি');
        return `<div class="card site-card"><h2><a href="/sites/${s.id}">${esc(s.name)}</a>
${s.enabled ? '<span class="pill green">চালু</span>' : '<span class="pill gray">বন্ধ</span>'}${s.dry_run ? '<span class="pill blue">টেস্ট মোড</span>' : ''}</h2>
<div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
<div><b>${st.missedToday}</b><br><small class="muted">আজ মিসড কল</small></div>
<div><b>${s.dry_run ? st.dryToday : st.sentToday}</b><br><small class="muted">${s.dry_run ? 'আজ টেস্ট SMS' : 'আজ SMS গেছে'}</small></div>
<div><b>${st.activeAgents}/${st.totalAgents}</b><br><small class="muted">সক্রিয় এজেন্ট</small></div></div>
${engine.pollStatus(s.id).running ? '<div class="help" style="color:var(--amber)">এখন কল টানা চলছে…</div>' : ''}
<div class="help ${err ? '' : 'muted'}" style="${err ? 'color:var(--red)' : ''}">শেষ চেক: ${esc(s.last_poll_at || 'এখনো হয়নি')}${s.last_poll_status ? ' — ' + esc(s.last_poll_status) : ''}</div></div>`;
      })
      .join('');
    render(req, res, 'সব সাইট', `<h1>সব সাইট</h1><p class="sub">প্রতিটা সাইট আলাদা mConnex হটলাইন, আলাদা এজেন্ট আর আলাদা SMS নিয়ে চলে।</p>
<div class="sites">${cards || '<div class="card muted">এখনো কোনো সাইট নেই। নিচে প্রথম সাইটটা যোগ করুন।</div>'}</div>
<div class="card" style="max-width:520px"><h2>নতুন সাইট যোগ করুন</h2><form method="post" action="/sites" class="row">
<input type="text" name="name" placeholder="যেমন: Coastal Manpower" required style="flex:1"><button class="btn">যোগ করুন</button></form></div>`);
  });

  app.post('/sites', (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 80);
    if (!name) return res.redirect('/');
    const info = db.prepare('INSERT INTO sites (name, created_at) VALUES (?, ?)').run(name, time.now());
    flash(req, 'ok', 'সাইট যোগ হয়েছে। এবার mConnex লগইন, হটলাইন আর SMS-এর তথ্য দিন।');
    res.redirect(`/sites/${info.lastInsertRowid}/settings`);
  });

  // ---------- সারাংশ ----------
  app.get('/sites/:id', loadSite, (req, res) => {
    const s = req.site;
    const st = siteStats(s.id);
    const recent = db.prepare('SELECT * FROM sms_log WHERE site_id = ? ORDER BY id DESC LIMIT 10').all(s.id);
    const missing = [];
    if (!s.mconnex_login || !s.mconnex_password) missing.push('mConnex লগইন');
    if (!s.sms_api_key || !s.sms_sender_id) missing.push('BulkSMSBD API Key/Sender ID');
    if (!st.activeAgents) missing.push('অন্তত একজন সক্রিয় এজেন্ট');
    if (!s.hotlines) missing.push('হটলাইন নাম্বার (না দিলে সব নাম্বারের মিসড কল ধরবে)');
    const body = `${siteTabs(s, '')}
${missing.length ? `<div class="warn">বাকি আছে: ${missing.map(esc).join(', ')}</div>` : ''}
${s.dry_run && s.enabled ? '<div class="warn">টেস্ট মোড চালু — SMS আসলে যাচ্ছে না, শুধু লগে দেখাচ্ছে কাকে কী যেত। সব ঠিক দেখলে সেটিংস থেকে টেস্ট মোড বন্ধ করুন।</div>' : ''}
<div class="grid" style="margin-bottom:18px">
<div class="stat"><b>${st.missedToday}</b><small>আজ মিসড কল</small></div>
<div class="stat"><b>${st.sentToday}</b><small>আজ SMS গেছে</small></div>
<div class="stat"><b>${st.dryToday}</b><small>আজ টেস্ট SMS</small></div>
<div class="stat"><b>${st.queued}</b><small>লাইনে আছে</small></div>
<div class="stat"><b>${st.failedToday}</b><small>আজ ব্যর্থ</small></div>
<div class="stat"><b>${st.callers}</b><small>মোট কলার</small></div></div>
<div class="card"><h2>অবস্থা</h2>${pollingNote(s.id)}<p>শেষ চেক: <b>${esc(s.last_poll_at || 'এখনো হয়নি')}</b><br><span class="muted">${esc(s.last_poll_status || '')}</span></p>
<div class="row"><form method="post" action="/sites/${s.id}/poll"><button class="btn">এখনই কল চেক করুন</button></form>
<form method="post" action="/sites/${s.id}/test-login"><button class="btn ghost">mConnex লগইন টেস্ট</button></form></div></div>
<div class="card"><h2>টেস্ট SMS পাঠান</h2><p class="help">এটা টেস্ট মোড চালু থাকলেও আসল SMS পাঠায় — নিজের নাম্বার দিয়ে দেখুন লেখাটা কেমন যায়।</p>
<form method="post" action="/sites/${s.id}/test-sms" class="row"><input type="text" name="number" placeholder="01XXXXXXXXX" style="max-width:220px" required><button class="btn ghost">পাঠান</button></form></div>
<div class="card"><h2>সাম্প্রতিক SMS</h2>${smsTable(recent)}<p><a href="/sites/${s.id}/sms">সব দেখুন →</a></p></div>`;
    render(req, res, s.name, body);
  });

  function smsTable(rows, { actions = false, siteId } = {}) {
    if (!rows.length) return '<p class="muted">এখনো কিছু নেই।</p>';
    return `<div class="scroll"><table><tr><th>কলার</th><th>অবস্থা</th><th>এজেন্ট</th><th>মিসড কল</th><th>পাঠানো/সিদ্ধান্ত</th><th>মেসেজ / কারণ</th>${actions ? '<th></th>' : ''}</tr>
${rows
  .map(
    (r) => `<tr><td class="nowrap">${esc(r.caller)}</td><td>${statusPill(r.status)}</td>
<td>${r.agent_name ? `${esc(r.agent_name)}<br><span class="muted">${esc(r.agent_number)}</span>` : '—'}</td>
<td class="nowrap">${esc(r.missed_at || '—')}${r.status === 'queued' ? `<br><span class="muted">যাবে ${esc(r.due_at)} এর পরে</span>` : ''}</td>
<td class="nowrap">${esc(r.sent_at || '—')}</td>
<td><div class="msg">${esc(r.message || '')}${r.reason ? `<div class="help">${esc(r.reason)}</div>` : ''}</div></td>
${actions ? `<td>${r.status === 'failed' ? `<form method="post" action="/sites/${siteId}/sms/${r.id}/retry"><button class="btn small ghost">আবার চেষ্টা</button></form>` : r.status === 'queued' ? `<form method="post" action="/sites/${siteId}/sms/${r.id}/cancel"><button class="btn small ghost">বাতিল</button></form>` : ''}</td>` : ''}</tr>`
  )
  .join('')}</table></div>`;
  }

  app.post('/sites/:id/poll', loadSite, (req, res) => {
    const r = engine.startPoll(req.site.id);
    if (r.busy) flash(req, 'ok', 'কল টানা আগে থেকেই চলছে — শেষ হলে এখানে ফলাফল দেখাবে');
    else {
      // শেষ হলে লাইনের SMS-ও পাঠিয়ে দেয়
      r.promise.then(() => engine.sendQueue(req.site.id)).catch(() => {});
      flash(req, 'ok', 'কল টানা শুরু হয়েছে। mConnex ধীর, তাই কয়েক মিনিট লাগতে পারে — একটু পরে পেজটা রিফ্রেশ করুন।');
    }
    back(req, res);
  });

  app.post('/sites/:id/test-login', loadSite, async (req, res) => {
    try {
      const { user } = await mconnex.login(req.site);
      flash(req, 'ok', `mConnex লগইন সফল — ${user.companyname || user.name || ''}${user.hotline ? `, হটলাইন ${user.hotline}` : ''}`);
      if (user.hotline && !req.site.hotlines) {
        db.prepare('UPDATE sites SET hotlines = ? WHERE id = ?').run(String(user.hotline), req.site.id);
      }
    } catch (e) {
      flash(req, 'err', e.message);
    }
    back(req, res);
  });

  app.post('/sites/:id/test-sms', loadSite, async (req, res) => {
    const number = sms.localNumber(req.body.number);
    if (!sms.isMobile(number)) {
      flash(req, 'err', 'সঠিক মোবাইল নাম্বার দিন (01XXXXXXXXX)');
      return back(req, res);
    }
    const agent = db.prepare('SELECT * FROM agents WHERE site_id = ? AND active = 1 ORDER BY sort_order, id LIMIT 1').get(req.site.id);
    const msg = sms.render(req.site.sms_template, {
      agent_name: agent ? agent.name : 'টেস্ট এজেন্ট',
      agent_number: agent ? agent.number : '01XXXXXXXXX',
      site_name: req.site.name,
      hotline: String(req.site.hotlines).split(/[,\s]+/)[0] || '',
      caller: number,
    });
    const r = await sms.send(req.site, number, msg);
    flash(req, r.ok ? 'ok' : 'err', r.ok ? `টেস্ট SMS পাঠানো হয়েছে ${number}-এ` : `টেস্ট SMS ব্যর্থ: ${r.error}`);
    back(req, res);
  });

  // ---------- মিসড কল ----------
  app.get('/sites/:id/calls', loadSite, (req, res) => {
    const s = req.site;
    const view = ['missed', 'answered', 'all'].includes(req.query.view) ? req.query.view : 'missed';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : time.now().slice(0, 10);
    const q = String(req.query.q || '').replace(/[^\d]/g, '');
    const cond = view === 'missed' ? "AND UPPER(k.status) = 'MISSED CALL'" : view === 'answered' ? "AND UPPER(k.status) = 'ANSWERED'" : '';
    const rows = db
      .prepare(
        `SELECT k.*, a.name agent_name, a.number agent_number,
           (SELECT l.status FROM sms_log l WHERE l.site_id = k.site_id AND l.caller = k.caller ORDER BY l.id DESC LIMIT 1) sms_status
         FROM calls k
         LEFT JOIN callers c ON c.site_id = k.site_id AND c.number = k.caller
         LEFT JOIN agents a ON a.id = c.agent_id
         WHERE k.site_id = ? AND k.call_date >= ? AND k.call_date <= ? AND k.caller LIKE ? ${cond}
         ORDER BY k.call_date DESC LIMIT 500`
      )
      .all(s.id, `${date} 00:00:00`, `${date} 23:59:59`, `%${q}%`);
    const unique = new Set(rows.map((r) => r.caller)).size;
    const tab = (k, l) => `<a class="btn small ${view === k ? '' : 'ghost'}" href="/sites/${s.id}/calls?view=${k}&date=${date}${q ? `&q=${q}` : ''}">${l}</a>`;
    render(
      req,
      res,
      'মিসড কল',
      `${siteTabs(s, '/calls')}
<div class="card"><form class="row" method="get"><input type="hidden" name="view" value="${view}">
<input type="date" name="date" value="${date}" style="max-width:180px;font:inherit;border:1px solid #cdd2cc;border-radius:7px;padding:6px 10px">
<input type="search" name="q" value="${esc(q)}" placeholder="নাম্বার দিয়ে খুঁজুন" style="max-width:220px"><button class="btn ghost">দেখুন</button></form>
<div class="row" style="margin-top:12px">${tab('missed', 'মিসড কল')}${tab('answered', 'রিসিভ হওয়া')}${tab('all', 'সব কল')}</div></div>
<div class="card"><h2>${esc(date)} — ${rows.length}টি কল, ${unique} জন আলাদা কলার</h2>
<p class="help">mConnex থেকে বট যতবার কল টেনেছে, সব এখানে জমা হয়। সিস্টেম চালুর আগের পুরনো কলও দেখাবে, তবে সেগুলোতে SMS যায় না।</p>
<div class="scroll"><table><tr><th>সময়</th><th>কলার</th><th>কোন নাম্বারে</th><th>অবস্থা</th><th>সময় (সেকেন্ড)</th><th>এজেন্ট</th><th>SMS</th></tr>
${
  rows
    .map(
      (r) => `<tr><td class="nowrap">${esc(r.call_date.slice(11))}</td><td class="nowrap">${esc(r.caller)}</td><td class="nowrap">${esc(r.called)}</td>
<td>${/missed/i.test(r.status) ? '<span class="pill amber">মিসড কল</span>' : /answer/i.test(r.status) ? '<span class="pill green">রিসিভ</span>' : esc(r.status)}</td>
<td>${r.total_duration ?? '—'}${r.answered_duration ? ` / কথা ${r.answered_duration}` : ''}</td>
<td>${r.agent_name ? `${esc(r.agent_name)}<br><span class="muted">${esc(r.agent_number)}</span>` : '—'}</td>
<td>${r.sms_status ? statusPill(r.sms_status) : '—'}</td></tr>`
    )
    .join('') || '<tr><td colspan="7" class="muted">এই দিনে কোনো কল নেই। সারাংশ ট্যাব থেকে "এখনই কল চেক করুন" চাপুন।</td></tr>'
}</table></div><p class="help">সর্বোচ্চ ৫০০টি দেখানো হচ্ছে।</p></div>`
    );
  });

  // ---------- এজেন্ট ----------
  app.get('/sites/:id/agents', loadSite, (req, res) => {
    const s = req.site;
    const agents = db
      .prepare(
        `SELECT a.*, (SELECT COUNT(*) FROM callers c WHERE c.agent_id = a.id) callers,
           (SELECT COUNT(*) FROM sms_log l WHERE l.agent_id = a.id AND l.status = 'sent') sent
         FROM agents a WHERE a.site_id = ? ORDER BY a.sort_order, a.id`
      )
      .all(s.id);
    const rows = agents
      .map(
        (a, i) => `<tr><td>${i + 1}</td>
<td><form method="post" action="/sites/${s.id}/agents/${a.id}/edit" class="row" style="flex-wrap:nowrap">
<input type="text" name="name" value="${esc(a.name)}" style="min-width:120px"><input type="text" name="number" value="${esc(a.number)}" style="min-width:130px">
<input type="number" name="sort_order" value="${a.sort_order}" title="ক্রম" style="width:70px"><button class="btn small ghost">সেভ</button></form></td>
<td>${a.active ? '<span class="pill green">চালু</span>' : '<span class="pill gray">বন্ধ</span>'}</td>
<td>${a.callers}</td><td>${a.sent}</td>
<td><div class="row" style="flex-wrap:nowrap"><form method="post" action="/sites/${s.id}/agents/${a.id}/toggle"><button class="btn small ${a.active ? 'ghost' : ''}">${a.active ? 'বন্ধ করুন' : 'চালু করুন'}</button></form>
<form method="post" action="/sites/${s.id}/agents/${a.id}/delete" onsubmit="return confirm('এই এজেন্টকে মুছে ফেলবেন? তার কলাররা পরের বার নতুন এজেন্ট পাবেন।')"><button class="btn small danger">মুছুন</button></form></div></td></tr>`
      )
      .join('');
    render(
      req,
      res,
      'এজেন্ট',
      `${siteTabs(s, '/agents')}
<div class="card"><h2>এজেন্ট তালিকা</h2><p class="help">রাউন্ড রবিনে নতুন কলাররা ক্রম অনুযায়ী একজন একজন করে এজেন্ট পান। একবার যে কলার যে এজেন্ট পেয়েছেন, পরেও তিনিই পাবেন। কোনো এজেন্ট বন্ধ করলে তার কলাররা পরের মিসড কলে নতুন একজন সক্রিয় এজেন্ট পাবেন।</p>
<div class="scroll"><table><tr><th>#</th><th>নাম · নাম্বার · ক্রম</th><th>অবস্থা</th><th>কলার</th><th>SMS গেছে</th><th></th></tr>${rows || '<tr><td colspan="6" class="muted">কোনো এজেন্ট নেই</td></tr>'}</table></div></div>
<div class="form-grid"><div class="card"><h2>একজন এজেন্ট যোগ</h2><form method="post" action="/sites/${s.id}/agents">
<label class="f"><span>নাম</span><input type="text" name="name" required></label><label class="f"><span>নাম্বার</span><input type="text" name="number" placeholder="01XXXXXXXXX" required></label>
<button class="btn">যোগ করুন</button></form></div>
<div class="card"><h2>একসাথে অনেক এজেন্ট যোগ</h2><form method="post" action="/sites/${s.id}/agents/bulk">
<label class="f"><span>প্রতি লাইনে একজন: নাম, নাম্বার</span><textarea name="list" rows="8" placeholder="রহিম, 01711000001&#10;করিম, 01811000002"></textarea>
<div class="help">Google Sheet বা Excel থেকে দুই কলাম কপি করে পেস্ট করলেও চলবে।</div></label><button class="btn">সব যোগ করুন</button></form></div></div>`
    );
  });

  const cleanNumber = (n) => sms.localNumber(n);
  app.post('/sites/:id/agents', loadSite, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const number = cleanNumber(req.body.number);
    if (!name || !sms.isMobile(number)) {
      flash(req, 'err', 'নাম আর সঠিক মোবাইল নাম্বার দিন');
      return back(req, res, '/agents');
    }
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) m FROM agents WHERE site_id = ?').get(req.site.id).m;
    db.prepare('INSERT INTO agents (site_id, name, number, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(req.site.id, name, number, max + 1, time.now());
    flash(req, 'ok', `${name} যোগ হয়েছে`);
    back(req, res, '/agents');
  });

  app.post('/sites/:id/agents/bulk', loadSite, (req, res) => {
    const lines = String(req.body.list || '').split(/\r?\n/);
    let max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) m FROM agents WHERE site_id = ?').get(req.site.id).m;
    const ins = db.prepare('INSERT INTO agents (site_id, name, number, sort_order, created_at) VALUES (?, ?, ?, ?, ?)');
    let added = 0;
    const bad = [];
    db.transaction(() => {
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(/[,\t;|]+/).map((p) => p.trim()).filter(Boolean);
        const numIdx = parts.findIndex((p) => sms.isMobile(p));
        if (numIdx === -1) {
          bad.push(line.trim());
          continue;
        }
        const number = cleanNumber(parts[numIdx]);
        const name = parts.filter((_, i) => i !== numIdx).join(' ').slice(0, 60) || number;
        ins.run(req.site.id, name, number, ++max, time.now());
        added++;
      }
    })();
    flash(req, bad.length ? 'err' : 'ok', `${added} জন এজেন্ট যোগ হয়েছে${bad.length ? `। এই লাইনগুলোতে সঠিক নাম্বার পাওয়া যায়নি: ${bad.slice(0, 5).join(' / ')}` : ''}`);
    back(req, res, '/agents');
  });

  const agentOf = (req) => db.prepare('SELECT * FROM agents WHERE id = ? AND site_id = ?').get(Number(req.params.aid), req.site.id);
  app.post('/sites/:id/agents/:aid/toggle', loadSite, (req, res) => {
    const a = agentOf(req);
    if (a) db.prepare('UPDATE agents SET active = ? WHERE id = ?').run(a.active ? 0 : 1, a.id);
    back(req, res, '/agents');
  });
  app.post('/sites/:id/agents/:aid/edit', loadSite, (req, res) => {
    const a = agentOf(req);
    const number = cleanNumber(req.body.number);
    if (a && req.body.name && sms.isMobile(number)) {
      db.prepare('UPDATE agents SET name = ?, number = ?, sort_order = ? WHERE id = ?').run(
        String(req.body.name).trim().slice(0, 60),
        number,
        Number(req.body.sort_order) || 0,
        a.id
      );
      flash(req, 'ok', 'সেভ হয়েছে');
    } else flash(req, 'err', 'নাম আর সঠিক মোবাইল নাম্বার দিন');
    back(req, res, '/agents');
  });
  app.post('/sites/:id/agents/:aid/delete', loadSite, (req, res) => {
    const a = agentOf(req);
    if (a) db.prepare('DELETE FROM agents WHERE id = ?').run(a.id);
    back(req, res, '/agents');
  });

  // ---------- কলার ----------
  app.get('/sites/:id/callers', loadSite, (req, res) => {
    const s = req.site;
    const q = String(req.query.q || '').replace(/[^\d]/g, '');
    const rows = db
      .prepare(
        `SELECT c.*, a.name agent_name, a.number agent_number, a.active agent_active FROM callers c LEFT JOIN agents a ON a.id = c.agent_id
         WHERE c.site_id = ? AND c.number LIKE ? ORDER BY COALESCE(c.last_missed_at, c.first_seen) DESC LIMIT 300`
      )
      .all(s.id, `%${q}%`);
    const agents = db.prepare('SELECT id, name FROM agents WHERE site_id = ? ORDER BY sort_order, id').all(s.id);
    const opts = (sel) => `<option value="">— কেউ না —</option>` + agents.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    render(
      req,
      res,
      'কলার',
      `${siteTabs(s, '/callers')}
<div class="card"><form class="row" method="get"><input type="search" name="q" value="${esc(q)}" placeholder="নাম্বার দিয়ে খুঁজুন" style="max-width:260px"><button class="btn ghost">খুঁজুন</button></form></div>
<div class="card"><h2>কলার ও তাদের এজেন্ট</h2><p class="help">দরকার হলে এখান থেকে কোনো কলারের এজেন্ট হাতে বদলে দিতে পারেন।</p><div class="scroll"><table>
<tr><th>নাম্বার</th><th>এজেন্ট</th><th>মিসড কল</th><th>শেষ মিসড কল</th><th>SMS গেছে</th><th>শেষ SMS</th></tr>
${
  rows
    .map(
      (c) => `<tr><td class="nowrap">${esc(c.number)}</td>
<td><form method="post" action="/sites/${s.id}/callers/${encodeURIComponent(c.number)}/agent" class="row" style="flex-wrap:nowrap"><select name="agent_id">${opts(c.agent_id)}</select><button class="btn small ghost">বদলান</button></form>
${c.agent_id && !c.agent_active ? '<div class="help" style="color:var(--amber)">এই এজেন্ট বন্ধ — পরের বার নতুন এজেন্ট পাবেন</div>' : ''}</td>
<td>${c.missed_count}</td><td class="nowrap">${esc(c.last_missed_at || '—')}</td><td>${c.sms_count}</td><td class="nowrap">${esc(c.last_sms_at || '—')}</td></tr>`
    )
    .join('') || '<tr><td colspan="6" class="muted">কোনো কলার নেই</td></tr>'
}</table></div><p class="help">সর্বশেষ ৩০০ জন দেখানো হচ্ছে।</p></div>`
    );
  });
  app.post('/sites/:id/callers/:num/agent', loadSite, (req, res) => {
    const agentId = Number(req.body.agent_id) || null;
    if (agentId && !db.prepare('SELECT 1 FROM agents WHERE id = ? AND site_id = ?').get(agentId, req.site.id)) return back(req, res, '/callers');
    db.prepare('UPDATE callers SET agent_id = ? WHERE site_id = ? AND number = ?').run(agentId, req.site.id, req.params.num);
    flash(req, 'ok', `${req.params.num}-এর এজেন্ট বদলানো হয়েছে`);
    back(req, res, '/callers');
  });

  // ---------- SMS লগ ----------
  app.get('/sites/:id/sms', loadSite, (req, res) => {
    const s = req.site;
    const status = ['queued', 'sent', 'dry_run', 'failed', 'skipped'].includes(req.query.status) ? req.query.status : '';
    const rows = db
      .prepare(`SELECT * FROM sms_log WHERE site_id = ? ${status ? 'AND status = ?' : ''} ORDER BY id DESC LIMIT 300`)
      .all(...(status ? [s.id, status] : [s.id]));
    const f = [['', 'সব'], ['queued', 'লাইনে'], ['sent', 'পাঠানো'], ['dry_run', 'টেস্ট'], ['failed', 'ব্যর্থ'], ['skipped', 'বাদ']];
    render(
      req,
      res,
      'SMS লগ',
      `${siteTabs(s, '/sms')}
<div class="card"><div class="row" style="justify-content:space-between"><div class="row">${f
        .map(([k, l]) => `<a class="btn small ${status === k ? '' : 'ghost'}" href="/sites/${s.id}/sms${k ? `?status=${k}` : ''}">${l}</a>`)
        .join('')}</div>
<form method="post" action="/sites/${s.id}/sms/retry-failed"><button class="btn small ghost">সব ব্যর্থ SMS আবার চেষ্টা</button></form></div></div>
<div class="card">${smsTable(rows, { actions: true, siteId: s.id })}<p class="help">সর্বশেষ ৩০০টি দেখানো হচ্ছে।</p></div>`
    );
  });
  app.post('/sites/:id/sms/:sid/retry', loadSite, (req, res) => {
    db.prepare("UPDATE sms_log SET status = 'queued', reason = NULL, due_at = ? WHERE id = ? AND site_id = ? AND status = 'failed'").run(time.now(), Number(req.params.sid), req.site.id);
    flash(req, 'ok', 'আবার লাইনে রাখা হয়েছে');
    back(req, res, '/sms');
  });
  app.post('/sites/:id/sms/:sid/cancel', loadSite, (req, res) => {
    db.prepare("UPDATE sms_log SET status = 'skipped', reason = 'হাতে বাতিল করা হয়েছে', sent_at = ? WHERE id = ? AND site_id = ? AND status = 'queued'").run(time.now(), Number(req.params.sid), req.site.id);
    back(req, res, '/sms');
  });
  app.post('/sites/:id/sms/retry-failed', loadSite, (req, res) => {
    const r = db.prepare("UPDATE sms_log SET status = 'queued', reason = NULL, due_at = ? WHERE site_id = ? AND status = 'failed'").run(time.now(), req.site.id);
    flash(req, 'ok', `${r.changes}টি SMS আবার লাইনে রাখা হয়েছে`);
    back(req, res, '/sms');
  });

  // ---------- ইভেন্ট ----------
  app.get('/sites/:id/events', loadSite, (req, res) => {
    const rows = db.prepare('SELECT * FROM events WHERE site_id = ? ORDER BY id DESC LIMIT 200').all(req.site.id);
    render(
      req,
      res,
      'ইভেন্ট',
      `${siteTabs(req.site, '/events')}<div class="card"><h2>ইভেন্ট ও ত্রুটি</h2><div class="scroll"><table><tr><th>সময়</th><th>ধরন</th><th>বিবরণ</th></tr>
${rows.map((e) => `<tr><td class="nowrap">${esc(e.created_at)}</td><td>${e.level === 'error' ? '<span class="pill red">ত্রুটি</span>' : '<span class="pill gray">তথ্য</span>'}</td><td>${esc(e.message)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">কিছু নেই</td></tr>'}
</table></div></div>`
    );
  });

  // ---------- সেটিংস ----------
  app.get('/sites/:id/settings', loadSite, (req, res) => {
    const s = req.site;
    const groups = [
      ['সাধারণ', ['name', 'enabled', 'dry_run']],
      ['mConnex', ['mconnex_login', 'mconnex_password', 'hotlines']],
      ['কল চেক', ['poll_minutes', 'lookback_minutes', 'page_limit', 'request_timeout_minutes']],
      ['SMS-এর নিয়ম', ['sms_delay_minutes', 'skip_if_answered', 'cooldown_days', 'quiet_start', 'quiet_end', 'mobile_only', 'max_sms_per_run']],
      ['SMS-এর লেখা ও BulkSMSBD', ['sms_template', 'sms_api_key', 'sms_sender_id']],
    ];
    const byKey = Object.fromEntries(dbm.SITE_SETTINGS.map((x) => [x.key, x]));
    const body = `${siteTabs(s, '/settings')}<form method="post" action="/sites/${s.id}/settings">
${groups.map(([title, keys]) => `<div class="card"><h2>${title}</h2><div class="form-grid">${keys.map((k) => settingField(byKey[k], s[k])).join('')}</div></div>`).join('')}
<button class="btn">সেটিংস সেভ করুন</button></form>
<div class="card" style="margin-top:30px;border-color:var(--red-bg)"><h2>সাইট মুছে ফেলা</h2><p class="help">এই সাইটের সব এজেন্ট, কলার আর SMS লগ মুছে যাবে, ফেরত আনা যাবে না।</p>
<form method="post" action="/sites/${s.id}/delete" onsubmit="return confirm('সত্যিই ${esc(s.name)} মুছে ফেলবেন? সব ডেটা চলে যাবে।')"><button class="btn danger">সাইট মুছুন</button></form></div>`;
    render(req, res, 'সেটিংস', body);
  });

  app.post('/sites/:id/settings', loadSite, (req, res) => {
    const sets = [];
    const vals = [];
    const errors = [];
    for (const s of dbm.SITE_SETTINGS) {
      let v = req.body[s.key];
      if (Array.isArray(v)) v = v[v.length - 1]; // checkbox: hidden 0 + checked 1
      if (v === undefined) continue;
      if (s.type === 'secret') {
        if (!String(v).trim()) continue; // খালি রাখলে আগেরটাই থাকবে
        v = String(v).trim();
      } else if (s.type === 'bool') v = v === '1' ? 1 : 0;
      else if (s.type === 'int') {
        const n = Math.round(Number(v));
        if (!Number.isFinite(n) || n < s.min || n > s.max) {
          errors.push(`${s.label}: ${s.min} থেকে ${s.max} এর মধ্যে দিন`);
          continue;
        }
        v = n;
      } else if (s.type === 'time') {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
          errors.push(`${s.label}: সময় ঠিক নেই`);
          continue;
        }
      } else v = String(v).trim();
      if (s.key === 'name' && !v) continue;
      if (s.key === 'mconnex_login' && v !== req.site.mconnex_login) {
        sets.push('mconnex_token = NULL');
      }
      sets.push(`${s.key} = ?`);
      vals.push(v);
    }
    if (req.body.mconnex_password && String(req.body.mconnex_password).trim()) sets.push('mconnex_token = NULL');
    if (sets.length) db.prepare(`UPDATE sites SET ${[...new Set(sets)].join(', ')} WHERE id = ?`).run(...vals, req.site.id);
    flash(req, errors.length ? 'err' : 'ok', errors.length ? `বাকিগুলো সেভ হয়েছে, তবে: ${errors.join('; ')}` : 'সেটিংস সেভ হয়েছে');
    back(req, res, '/settings');
  });

  app.post('/sites/:id/delete', loadSite, (req, res) => {
    db.prepare('DELETE FROM sites WHERE id = ?').run(req.site.id);
    flash(req, 'ok', 'সাইট মুছে ফেলা হয়েছে');
    res.redirect('/');
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send(layout({ title: 'ত্রুটি', body: `<div class="card"><h2>কিছু একটা ভুল হয়েছে</h2><p>${esc(err.message)}</p><a href="/">ফিরে যান</a></div>`, user: true }));
  });

  return app;
}

if (require.main === module) {
  dbm.init();
  if (!process.env.ADMIN_PASSWORD) console.warn('সতর্কতা: .env ফাইলে ADMIN_PASSWORD দেওয়া নেই — প্যানেলে লগইন করা যাবে না');
  const port = Number(process.env.PORT) || 3100;
  createApp().listen(port, () => console.log(`প্যানেল চলছে: http://localhost:${port}`));
  engine.start();
}

module.exports = { createApp };
