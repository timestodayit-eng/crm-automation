// BulkSMSBD (bulksmsbd.net) দিয়ে SMS পাঠানো
// সফল হলে উত্তরে response_code 202 আসে।

const ERRORS = {
  1001: 'নাম্বার সঠিক নয়',
  1002: 'Sender ID ভুল বা বন্ধ',
  1003: 'প্রয়োজনীয় তথ্য নেই',
  1005: 'BulkSMSBD-এর ভেতরের ত্রুটি',
  1006: 'ব্যালেন্সের মেয়াদ নেই',
  1007: 'ব্যালেন্স শেষ',
  1011: 'ইউজার পাওয়া যায়নি',
  1012: 'মাস্কিং SMS বাংলায় পাঠাতে হবে',
  1032: 'সার্ভারের IP হোয়াইটলিস্টে নেই — BulkSMSBD প্যানেলে IP হোয়াইটলিস্ট বন্ধ করুন বা VPS-এর IP যোগ করুন',
};

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

function apiUrl() {
  return process.env.SMS_API_URL || 'https://bulksmsbd.net/api/smsapi';
}

async function send(site, number, message) {
  if (!site.sms_api_key || !site.sms_sender_id) {
    return { ok: false, error: 'BulkSMSBD API Key বা Sender ID সেটিংসে দেওয়া নেই', raw: '' };
  }
  const to = '88' + localNumber(number);
  const qs = new URLSearchParams({
    api_key: site.sms_api_key,
    type: 'text',
    number: to,
    senderid: site.sms_sender_id,
    message,
  });
  let text = '';
  try {
    const res = await fetch(`${apiUrl()}?${qs.toString()}`, { signal: AbortSignal.timeout(30000) });
    text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* নিচে দেখা হচ্ছে */
    }
    const code = body ? Number(body.response_code) : NaN;
    if (code === 202) return { ok: true, raw: text.slice(0, 500) };
    const why = ERRORS[code] || (body && (body.error_message || body.success_message)) || `HTTP ${res.status}`;
    return { ok: false, error: `${why}${Number.isFinite(code) ? ` (কোড ${code})` : ''}`, raw: text.slice(0, 500) };
  } catch (e) {
    return { ok: false, error: `SMS সার্ভারে পৌঁছানো যায়নি: ${e.message}`, raw: text.slice(0, 500) };
  }
}

function render(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

module.exports = { send, render, isMobile, localNumber };
