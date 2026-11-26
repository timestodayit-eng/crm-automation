// SMS পাঠানো — সাইটের সেটিংসে যে কোম্পানি বেছে নেওয়া আছে, সেটা দিয়ে।
// প্রতিটা কোম্পানির send() একই রকম উত্তর দেয়: { ok, error?, raw, fatal? }
// fatal = true মানে কনফিগারেশন/ব্যালেন্সের সমস্যা — এবারের বাকি SMS চেষ্টা করে লাভ নেই।

const MOBILE_RE = /^01[3-9]\d{8}$/;

// "01712345678" / "+8801712345678" / "8801712345678" → "01712345678"
function localNumber(raw) {
  let n = String(raw || '').replace(/[^\d]/g, '');
  if (n.startsWith('880')) n = n.slice(2);
  else if (n.startsWith('88') && n.length === 13) n = n.slice(2);
  return n;
}

function isMobile(raw) {
  return MOBILE_RE.test(localNumber(raw));
}

function render(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

async function readJson(res) {
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* JSON নয় */
  }
  return { text, body };
}

// উত্তরে কোনো বার্তা না থাকলে HTTP কোডের সাথে উত্তরের প্রথম অংশটুকু দেখানো (HTML হলে ট্যাগ বাদ দিয়ে)
function httpFallback(res, text) {
  const snippet = String(text || '')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return `HTTP ${res.status}${snippet ? ` — ${snippet}` : ''}`;
}

// ---------- Softcents (sms.softcents.com) ----------
// ওদের ডকুমেন্টের "API Status & Error Codes" তালিকা অনুযায়ী
const SOFTCENTS_ERRORS = {
  1001: 'Client ID বা Client Secret ভুল — Softcents প্যানেল থেকে মিলিয়ে দেখুন',
  1002: 'সার্ভারের IP অনুমোদিত তালিকায় নেই — Softcents-এর Security Settings-এ VPS-এর IP যোগ করুন',
  1003: 'প্রয়োজনীয় তথ্য বা SMS-এর লেখা খালি',
  1004: 'নাম্বারের ফরম্যাট সঠিক নয়',
  1005: 'Softcents ব্যালেন্স শেষ — রিচার্জ করুন',
  1007: 'এই Sender ID-র গেটওয়ে এখন বন্ধ — Softcents সাপোর্টে যোগাযোগ করুন',
  1008: 'অপারেটরের নেটওয়ার্কে সাময়িক সমস্যা — কিছুক্ষণ পরে নিজে আবার চেষ্টা করবে',
};
const SOFTCENTS_FATAL = new Set([1001, 1002, 1005, 1007]); // বাকি SMS চেষ্টা করে লাভ নেই
const SOFTCENTS_RETRY = new Set([1008]); // সাময়িক — ব্যর্থ না ধরে পরে আবার

const softcents = {
  label: 'Softcents',
  baseUrl() {
    return (process.env.SOFTCENTS_API_URL || 'https://sms.softcents.com/api/v1').replace(/\/+$/, '');
  },
  missing(site) {
    if (!site.sms_client_id || !site.sms_client_secret) return 'Softcents Client ID বা Client Secret সেটিংসে দেওয়া নেই';
    if (!site.sms_sender_id) return 'Sender ID সেটিংসে দেওয়া নেই';
    return null;
  },
  async send(site, number, message) {
    const params = {
      clientId: site.sms_client_id,
      clientSecret: site.sms_client_secret,
      senderId: site.sms_sender_id,
      numbers: '88' + localNumber(number),
      contents: message,
    };
    let res = await fetch(`${this.baseUrl()}/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30000),
    });
    // POST-এর ঠিকানা না পেলে (404/405) ওদের ডকুমেন্টের "Direct GET URL" পদ্ধতিতে একবার চেষ্টা
    if (res.status === 404 || res.status === 405) {
      await res.text().catch(() => {});
      res = await fetch(`${this.baseUrl()}/send-sms?${new URLSearchParams(params)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
    }
    const { text, body } = await readJson(res);
    const raw = text.slice(0, 500);
    const code = body ? Number(body.response_code) : NaN;
    if (res.ok && body && (body.success === true || code === 1000)) return { ok: true, raw };
    const theirs = (body && (body.message || body.error_code || body.error)) || httpFallback(res, text);
    const ours = SOFTCENTS_ERRORS[code];
    const error = `Softcents: ${ours ? `${ours} (${theirs})` : theirs}${Number.isFinite(code) ? ` [কোড ${code}]` : ''}`;
    const retry = SOFTCENTS_RETRY.has(code) || (!Number.isFinite(code) && res.status >= 500);
    const fatal =
      SOFTCENTS_FATAL.has(code) ||
      res.status === 401 ||
      res.status === 402 ||
      res.status === 403 ||
      res.status === 404 ||
      (!Number.isFinite(code) && /balance|insufficient|credential|unauthori|gateway/i.test(String(theirs)));
    return { ok: false, error, raw, fatal, retry };
  },
  async balance(site) {
    const qs = new URLSearchParams({ clientId: site.sms_client_id, clientSecret: site.sms_client_secret });
    const res = await fetch(`${this.baseUrl()}/check-balance?${qs}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    const { text, body } = await readJson(res);
    if (!body) return { ok: false, error: `Softcents: অপ্রত্যাশিত উত্তর (HTTP ${res.status})` };
    if (body.success === false) return { ok: false, error: `Softcents: ${body.message || `HTTP ${res.status}`}` };
    const bal = body.balance ?? body.data?.balance;
    const cur = body.currency ?? body.data?.currency ?? '';
    return { ok: true, text: bal !== undefined ? `${bal} ${cur}`.trim() : text.slice(0, 200) };
  },
};

// ---------- BulkSMSBD (bulksmsbd.net) — সফল হলে response_code 202 ----------
const BULKSMSBD_ERRORS = {
  1001: 'নাম্বার সঠিক নয়',
  1002: 'Sender ID ভুল বা বন্ধ',
  1003: 'প্রয়োজনীয় তথ্য নেই',
  1005: 'BulkSMSBD-এর ভেতরের ত্রুটি',
  1006: 'ব্যালেন্সের মেয়াদ নেই',
  1007: 'ব্যালেন্স শেষ',
  1011: 'ইউজার পাওয়া যায়নি — API Key ভুল',
  1012: 'মাস্কিং SMS বাংলায় পাঠাতে হবে',
  1032: 'সার্ভারের IP হোয়াইটলিস্টে নেই — BulkSMSBD প্যানেলে IP হোয়াইটলিস্ট বন্ধ করুন বা VPS-এর IP যোগ করুন',
};
const BULKSMSBD_FATAL = new Set([1002, 1003, 1005, 1006, 1007, 1011, 1032]);

const bulksmsbd = {
  label: 'BulkSMSBD',
  missing(site) {
    if (!site.sms_api_key) return 'BulkSMSBD API Key সেটিংসে দেওয়া নেই';
    if (!site.sms_sender_id) return 'Sender ID সেটিংসে দেওয়া নেই';
    return null;
  },
  async send(site, number, message) {
    const qs = new URLSearchParams({
      api_key: site.sms_api_key,
      type: 'text',
      number: '88' + localNumber(number),
      senderid: site.sms_sender_id,
      message,
    });
    const res = await fetch(`${process.env.SMS_API_URL || 'https://bulksmsbd.net/api/smsapi'}?${qs}`, {
      signal: AbortSignal.timeout(30000),
    });
    const { text, body } = await readJson(res);
    const raw = text.slice(0, 500);
    const code = body ? Number(body.response_code) : NaN;
    if (code === 202) return { ok: true, raw };
    const why = BULKSMSBD_ERRORS[code] || (body && (body.error_message || body.success_message)) || `HTTP ${res.status}`;
    return {
      ok: false,
      error: `BulkSMSBD: ${why}${Number.isFinite(code) ? ` (কোড ${code})` : ''}`,
      raw,
      fatal: BULKSMSBD_FATAL.has(code),
    };
  },
  async balance(site) {
    const res = await fetch(
      `${(process.env.SMS_API_URL || 'https://bulksmsbd.net/api/smsapi').replace(/smsapi$/, 'getBalanceApi')}?api_key=${encodeURIComponent(site.sms_api_key)}`,
      { signal: AbortSignal.timeout(30000) }
    );
    const { text, body } = await readJson(res);
    if (body && body.balance !== undefined) return { ok: true, text: `${body.balance} টাকা` };
    return { ok: false, error: `BulkSMSBD: ${BULKSMSBD_ERRORS[body?.response_code] || text.slice(0, 200)}` };
  },
};

const PROVIDERS = { softcents, bulksmsbd };

function providerOf(site) {
  return PROVIDERS[site.sms_provider] || softcents;
}

// সেটিংসে কিছু বাকি থাকলে তার বিবরণ, নইলে null
function missingConfig(site) {
  return providerOf(site).missing(site);
}

async function send(site, number, message) {
  const p = providerOf(site);
  const missing = p.missing(site);
  if (missing) return { ok: false, error: missing, raw: '', fatal: true };
  try {
    return await p.send(site, number, message);
  } catch (e) {
    return { ok: false, error: `${p.label}-এর সার্ভারে পৌঁছানো যায়নি: ${e.cause?.code || e.message}`, raw: '', fatal: true, retry: true };
  }
}

async function balance(site) {
  const p = providerOf(site);
  const missing = p.missing(site);
  if (missing) return { ok: false, error: missing };
  try {
    return await p.balance(site);
  } catch (e) {
    return { ok: false, error: `${p.label}-এর সার্ভারে পৌঁছানো যায়নি: ${e.cause?.code || e.message}` };
  }
}

module.exports = { send, balance, render, isMobile, localNumber, missingConfig, providerOf };
