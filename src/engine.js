// মূল কাজ: কল টানা → নতুন মিসড কল ধরা → SMS লাইনে রাখা → সময় হলে এজেন্ট বেছে SMS পাঠানো
const dbm = require('./db');
const time = require('./time');
const mconnex = require('./mconnex');
const sms = require('./sms');

const running = new Set();

function db() {
  return dbm.get();
}

function getSite(id) {
  return db().prepare('SELECT * FROM sites WHERE id = ?').get(id);
}

function hotlineSet(site) {
  return new Set(
    String(site.hotlines || '')
      .split(/[,\s]+/)
      .map((h) => sms.localNumber(h))
      .filter(Boolean)
  );
}

// ---------- এজেন্ট বেছে নেওয়া (স্টিকি + রাউন্ড রবিন) ----------
function activeAgents(siteId) {
  return db()
    .prepare('SELECT * FROM agents WHERE site_id = ? AND active = 1 ORDER BY sort_order, id')
    .all(siteId);
}

function assignAgent(site, callerNumber) {
  const d = db();
  const caller = d.prepare('SELECT * FROM callers WHERE site_id = ? AND number = ?').get(site.id, callerNumber);
  if (caller && caller.agent_id) {
    const current = d.prepare('SELECT * FROM agents WHERE id = ? AND site_id = ?').get(caller.agent_id, site.id);
    if (current && current.active) return current; // আগের এজেন্টই থাকবে
  }
  const list = activeAgents(site.id);
  if (!list.length) return null;

  // রাউন্ড রবিন: শেষবার যাকে দেওয়া হয়েছিল তার পরের জন
  const fresh = d.prepare('SELECT rr_last_agent_id FROM sites WHERE id = ?').get(site.id);
  const last = fresh.rr_last_agent_id
    ? d.prepare('SELECT * FROM agents WHERE id = ?').get(fresh.rr_last_agent_id)
    : null;
  let next = list[0];
  if (last) {
    const after = list.find(
      (a) => a.sort_order > last.sort_order || (a.sort_order === last.sort_order && a.id > last.id)
    );
    if (after) next = after;
  }
  d.prepare('UPDATE sites SET rr_last_agent_id = ? WHERE id = ?').run(next.id, site.id);
  d.prepare(
    `INSERT INTO callers (site_id, number, agent_id, first_seen) VALUES (?, ?, ?, ?)
     ON CONFLICT(site_id, number) DO UPDATE SET agent_id = excluded.agent_id`
  ).run(site.id, callerNumber, next.id, time.now());
  if (caller && caller.agent_id && caller.agent_id !== next.id) {
    dbm.logEvent(site.id, 'info', `${callerNumber}: আগের এজেন্ট বন্ধ থাকায় নতুন এজেন্ট ${next.name} দেওয়া হলো`);
  }
  return next;
}

// ---------- কুলডাউন ----------
function inCooldown(site, callerNumber) {
  const days = Number(site.cooldown_days) || 0;
  if (days <= 0) return false;
  const statuses = site.dry_run ? "('sent','dry_run')" : "('sent')";
  const row = db()
    .prepare(
      `SELECT 1 FROM sms_log WHERE site_id = ? AND caller = ? AND status IN ${statuses} AND sent_at >= ? LIMIT 1`
    )
    .get(site.id, callerNumber, time.daysAgo(days));
  return !!row;
}

function logSms(site, fields) {
  db()
    .prepare(
      `INSERT INTO sms_log (site_id, caller, status, reason, missed_at, due_at, created_at, sent_at)
       VALUES (@site_id, @caller, @status, @reason, @missed_at, @due_at, @created_at, @sent_at)`
    )
    .run({
      site_id: site.id,
      reason: null,
      missed_at: null,
      due_at: null,
      sent_at: null,
      created_at: time.now(),
      ...fields,
    });
}

// ---------- নতুন মিসড কল ----------
function handleMissed(site, call, hotlines) {
  const d = db();
  const called = sms.localNumber(call.called);
  if (hotlines.size && !hotlines.has(called)) return 'other_hotline';

  const caller = sms.localNumber(call.caller);
  if (!caller) return 'no_number';

  d.prepare(
    `INSERT INTO callers (site_id, number, first_seen, last_missed_at, missed_count) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(site_id, number) DO UPDATE SET
       missed_count = missed_count + 1,
       last_missed_at = MAX(COALESCE(last_missed_at, ''), excluded.last_missed_at)`
  ).run(site.id, caller, call.date, call.date);

  if (site.mobile_only && !sms.isMobile(caller)) {
    logSms(site, { caller, status: 'skipped', reason: 'মোবাইল নাম্বার নয়', missed_at: call.date });
    return 'not_mobile';
  }

  const pending = d
    .prepare("SELECT id FROM sms_log WHERE site_id = ? AND caller = ? AND status = 'queued' LIMIT 1")
    .get(site.id, caller);
  if (pending) return 'already_queued'; // একই নাম্বারের SMS তো লাইনে আছেই

  if (inCooldown(site, caller)) {
    logSms(site, {
      caller,
      status: 'skipped',
      reason: `${site.cooldown_days} দিনের মধ্যে আগেই SMS গেছে`,
      missed_at: call.date,
    });
    return 'cooldown';
  }

  logSms(site, {
    caller,
    status: 'queued',
    missed_at: call.date,
    due_at: time.addMinutes(call.date, Number(site.sms_delay_minutes) || 0),
  });
  return 'queued';
}

// ---------- mConnex থেকে কল টানা ----------
async function pollSite(siteId) {
  const site = getSite(siteId);
  if (!site) return;
  const d = db();
  const endDate = time.now();
  const startDate = time.minutesAgo(Number(site.lookback_minutes) || 180);
  const rows = await mconnex.fetchCalls(site, startDate, endDate);

  const insert = d.prepare(
    `INSERT OR IGNORE INTO calls (site_id, linked_id, call_date, caller, called, status, answered_duration, total_duration, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const hotlines = hotlineSet(site);
  const counts = { new_calls: 0, missed: 0, queued: 0 };

  d.transaction(() => {
    const fresh = [];
    for (const r of rows) {
      if (!r || !r.linkedId || !r.caller) continue;
      const info = insert.run(
        site.id,
        String(r.linkedId),
        String(r.date),
        sms.localNumber(r.caller),
        String(r.called || ''),
        String(r.status || ''),
        Number(r.answeredDuration) || 0,
        Number(r.totalDuration) || 0,
        time.now()
      );
      if (info.changes) fresh.push(r);
    }
    counts.new_calls = fresh.length;
    fresh.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (!site.baseline_done) {
      // প্রথমবার: আগের কলগুলো শুধু রেকর্ড হবে, পুরনো কলারদের SMS যাবে না
      d.prepare('UPDATE sites SET baseline_done = 1 WHERE id = ?').run(site.id);
      dbm.logEvent(site.id, 'info', `প্রথম সিঙ্ক: ${fresh.length}টি পুরনো কল রেকর্ড হলো, এগুলোতে SMS যাবে না`);
      return;
    }
    for (const r of fresh) {
      if (String(r.status).toUpperCase() !== 'MISSED CALL') continue;
      counts.missed++;
      if (handleMissed(site, r, hotlines) === 'queued') counts.queued++;
    }
  })();

  d.prepare('UPDATE sites SET last_poll_at = ?, last_poll_status = ? WHERE id = ?').run(
    time.now(),
    `ঠিক আছে — ${rows.length}টি কল দেখা, ${counts.new_calls}টি নতুন, ${counts.missed}টি নতুন মিসড কল, ${counts.queued}টি SMS লাইনে`,
    site.id
  );
  return counts;
}

// ---------- লাইনের SMS পাঠানো ----------
async function processQueue(siteId) {
  const site = getSite(siteId);
  if (!site) return { sent: 0 };
  if (time.inQuietHours(site.quiet_start, site.quiet_end)) return { sent: 0, quiet: true };
  const d = db();
  const due = d
    .prepare(
      "SELECT * FROM sms_log WHERE site_id = ? AND status = 'queued' AND due_at <= ? ORDER BY due_at, id LIMIT ?"
    )
    .all(site.id, time.now(), Math.max(1, Number(site.max_sms_per_run) || 30));

  const update = d.prepare(
    `UPDATE sms_log SET status = @status, reason = @reason, agent_id = @agent_id, agent_name = @agent_name,
       agent_number = @agent_number, message = @message, provider_response = @provider_response, sent_at = @sent_at
     WHERE id = @id`
  );
  const base = { reason: null, agent_id: null, agent_name: null, agent_number: null, message: null, provider_response: null, sent_at: null };
  let sent = 0;

  for (const item of due) {
    if (site.skip_if_answered) {
      const talked = d
        .prepare(
          "SELECT 1 FROM calls WHERE site_id = ? AND caller = ? AND UPPER(status) = 'ANSWERED' AND call_date > ? LIMIT 1"
        )
        .get(site.id, item.caller, item.missed_at || '');
      if (talked) {
        update.run({ ...base, id: item.id, status: 'skipped', reason: 'পরে কলারের সাথে কথা হয়েছে', sent_at: time.now() });
        continue;
      }
    }
    if (inCooldown(site, item.caller)) {
      update.run({ ...base, id: item.id, status: 'skipped', reason: `${site.cooldown_days} দিনের মধ্যে আগেই SMS গেছে`, sent_at: time.now() });
      continue;
    }

    const agent = assignAgent(site, item.caller);
    if (!agent) {
      dbm.logEvent(site.id, 'error', 'কোনো সক্রিয় এজেন্ট নেই — SMS লাইনে অপেক্ষা করছে');
      break;
    }
    const firstHotline = [...hotlineSet(site)][0] || '';
    const message = sms.render(site.sms_template, {
      agent_name: agent.name,
      agent_number: agent.number,
      site_name: site.name,
      hotline: firstHotline,
      caller: item.caller,
    });
    const agentFields = { agent_id: agent.id, agent_name: agent.name, agent_number: agent.number, message };

    if (site.dry_run) {
      update.run({ ...base, ...agentFields, id: item.id, status: 'dry_run', reason: 'টেস্ট মোড — আসলে পাঠানো হয়নি', sent_at: time.now() });
      sent++;
      continue;
    }

    const result = await sms.send(site, item.caller, message);
    if (result.ok) {
      update.run({ ...base, ...agentFields, id: item.id, status: 'sent', provider_response: result.raw, sent_at: time.now() });
      d.prepare(
        'UPDATE callers SET last_sms_at = ?, sms_count = sms_count + 1 WHERE site_id = ? AND number = ?'
      ).run(time.now(), site.id, item.caller);
      sent++;
    } else {
      update.run({ ...base, ...agentFields, id: item.id, status: 'failed', reason: result.error, provider_response: result.raw, sent_at: time.now() });
      dbm.logEvent(site.id, 'error', `${item.caller}-এ SMS ব্যর্থ: ${result.error}`);
      // ব্যালেন্স বা কনফিগারেশনের সমস্যা হলে বাকিগুলো এখন আর চেষ্টা করে লাভ নেই
      if (/ব্যালেন্স|API Key|Sender ID|হোয়াইটলিস্ট|পৌঁছানো/.test(result.error)) break;
    }
  }
  return { sent };
}

// ---------- নিয়মিত চলা ----------
// কল টানা (mConnex ধীর, কয়েক মিনিট লাগতে পারে) আর SMS পাঠানো আলাদাভাবে চলে,
// যাতে mConnex-এর অপেক্ষায় লাইনের SMS আটকে না থাকে।
const polling = new Map(); // siteId → শুরুর সময় (ms)

function pollDue(site) {
  const lastPollMs = site.last_poll_at ? time.parse(site.last_poll_at) : 0;
  return Date.now() - lastPollMs >= (Number(site.poll_minutes) || 5) * 60 * 1000;
}

// ব্যাকগ্রাউন্ডে কল টানা শুরু করে; আগে থেকে চলতে থাকলে আবার শুরু করে না
function startPoll(siteId) {
  if (polling.has(siteId)) return { busy: true, since: polling.get(siteId) };
  polling.set(siteId, Date.now());
  const promise = pollSite(siteId)
    .catch((e) => {
      db().prepare('UPDATE sites SET last_poll_at = ?, last_poll_status = ? WHERE id = ?').run(
        time.now(),
        `ত্রুটি: ${e.message}`,
        siteId
      );
      dbm.logEvent(siteId, 'error', `কল টানতে সমস্যা: ${e.message}`);
      return null;
    })
    .finally(() => polling.delete(siteId));
  return { started: true, promise };
}

function pollStatus(siteId) {
  return polling.has(siteId) ? { running: true, since: polling.get(siteId) } : { running: false };
}

async function sendQueue(siteId) {
  if (running.has(siteId)) return { busy: true };
  running.add(siteId);
  try {
    return await processQueue(siteId);
  } finally {
    running.delete(siteId);
  }
}

// একবারে পুরোটা (কল টানা শেষ হওয়া পর্যন্ত অপেক্ষা করে, তারপর SMS) — টেস্ট ও স্ক্রিপ্টের জন্য
async function runSite(siteId, { force = false } = {}) {
  const site = getSite(siteId);
  if (!site || (!site.enabled && !force)) return { skipped: true };
  let poll = null;
  if (force || pollDue(site)) {
    const p = startPoll(siteId);
    if (p.busy) return { busy: true };
    poll = await p.promise;
  }
  const queue = await sendQueue(siteId);
  return { poll, queue };
}

let timer = null;
function start(intervalMs = 30000) {
  const tick = async () => {
    const sites = db().prepare('SELECT * FROM sites WHERE enabled = 1').all();
    for (const s of sites) {
      try {
        if (pollDue(s)) startPoll(s.id); // অপেক্ষা করে না
        await sendQueue(s.id);
      } catch (e) {
        dbm.logEvent(s.id, 'error', `অপ্রত্যাশিত ত্রুটি: ${e.message}`);
      }
    }
  };
  timer = setInterval(tick, intervalMs);
  setTimeout(tick, 2000);
}

function stop() {
  if (timer) clearInterval(timer);
}

module.exports = { start, stop, runSite, startPoll, pollStatus, sendQueue, pollSite, processQueue, assignAgent, handleMissed, inCooldown };
