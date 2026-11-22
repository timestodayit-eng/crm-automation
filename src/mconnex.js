// mConnex প্যানেলের ভেতরের API — ব্রাউজার যে রিকোয়েস্টগুলো পাঠায়, ঠিক সেগুলোই।
const dbm = require('./db');

function baseUrl() {
  return (process.env.MCONNEX_BASE_URL || 'https://mconnex.ebsbd.com/blmconnexapi/api/v1').replace(/\/+$/, '');
}

const HEADERS = {
  Accept: 'application/json;charset=UTF-8',
  'Content-Type': 'application/json;charset=UTF-8',
  Origin: 'https://mconnex.ebsbd.com',
  Referer: 'https://mconnex.ebsbd.com/',
};

class AuthError extends Error {}

function timeoutMs() {
  return Math.max(5000, Number(process.env.MCONNEX_TIMEOUT_MS) || 60000);
}

async function request(url, options = {}, step = 'mConnex') {
  let res;
  let text;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs()) });
    text = await res.text();
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error(`${step}: ${Math.round(timeoutMs() / 1000)} সেকেন্ডেও mConnex উত্তর দেয়নি`);
    }
    throw new Error(`${step}: mConnex-এ পৌঁছানো যায়নি (${e.cause?.code || e.message})`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (res.status === 401 || res.status === 403) throw new AuthError(`mConnex ${res.status}`);
  if (!res.ok) throw new Error(`mConnex HTTP ${res.status}: ${text.slice(0, 200)}`);
  if (!body) throw new Error(`mConnex অপ্রত্যাশিত উত্তর: ${text.slice(0, 200)}`);
  return body;
}

async function login(site) {
  if (!site.mconnex_login || !site.mconnex_password) {
    throw new Error('mConnex লগইন নাম বা পাসওয়ার্ড সেটিংসে দেওয়া নেই');
  }
  const body = await request(`${baseUrl()}/user/login`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ loginName: site.mconnex_login, password: site.mconnex_password }),
  }, 'লগইন').catch((e) => {
    if (e instanceof AuthError) throw new Error('mConnex লগইন ব্যর্থ — নাম বা পাসওয়ার্ড ভুল');
    throw e;
  });
  if (!body.success || !body.token) {
    throw new Error(`mConnex লগইন ব্যর্থ: ${body.message || 'টোকেন পাওয়া যায়নি'}`);
  }
  dbm.get().prepare('UPDATE sites SET mconnex_token = ? WHERE id = ?').run(body.token, site.id);
  site.mconnex_token = body.token;
  return { token: body.token, user: body.user || {} };
}

function reportUrl({ page, limit, startDate, endDate }) {
  const q = [
    ['page', page],
    ['limit', limit],
    ['reportType', 'incoming_call_history'],
    ['startDate', startDate],
    ['endDate', endDate],
    ['search', ''],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${baseUrl()}/company/user-report?${q}`;
}

async function fetchPage(site, params) {
  if (!site.mconnex_token) await login(site);
  const doFetch = () =>
    request(reportUrl(params), {
      headers: { ...HEADERS, Authorization: `Bearer ${site.mconnex_token}` },
    }, `কল রিপোর্ট (পেজ ${params.page})`);
  let body;
  try {
    body = await doFetch();
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    await login(site); // টোকেনের মেয়াদ শেষ — আবার লগইন করে একবার চেষ্টা
    body = await doFetch();
  }
  if (body.success === false) {
    const msg = String(body.message || '');
    if (/unauth|token|login/i.test(msg)) {
      await login(site);
      body = await doFetch();
    } else {
      throw new Error(`mConnex রিপোর্ট ব্যর্থ: ${msg}`);
    }
  }
  return { rows: Array.isArray(body.cdr) ? body.cdr : [], total: Number(body.total) || 0 };
}

// নির্দিষ্ট সময়ের মধ্যের সব কল (সব পেজ মিলিয়ে)
async function fetchCalls(site, startDate, endDate) {
  const limit = Math.max(10, Number(site.page_limit) || 100);
  const all = [];
  let total = Infinity;
  for (let page = 1; page <= 50 && all.length < total; page++) {
    const { rows, total: t } = await fetchPage(site, { page, limit, startDate, endDate });
    total = t;
    all.push(...rows);
    if (rows.length < limit) break;
  }
  return all;
}

module.exports = { login, fetchCalls, reportUrl };
