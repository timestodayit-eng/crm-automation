// প্যানেলের HTML (সার্ভার থেকেই তৈরি, আলাদা বিল্ড লাগে না)

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const bn = (n) => String(n ?? 0).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

const STATUS = {
  queued: ['লাইনে আছে', 'amber'],
  sent: ['পাঠানো হয়েছে', 'green'],
  dry_run: ['টেস্ট (পাঠানো হয়নি)', 'blue'],
  failed: ['ব্যর্থ', 'red'],
  skipped: ['বাদ', 'gray'],
};

function statusPill(s) {
  const [label, color] = STATUS[s] || [s, 'gray'];
  return `<span class="pill ${color}">${esc(label)}</span>`;
}

const CSS = `
:root{--bg:#f4f5f2;--card:#fff;--ink:#1d2421;--muted:#6b736f;--line:#e2e5e0;--accent:#0f6b5c;--accent-ink:#fff;--accent-soft:#e3f1ee;
--green:#1d7a46;--green-bg:#e4f4ea;--red:#b3261e;--red-bg:#fbe7e5;--amber:#8a5a00;--amber-bg:#fdf1d8;--blue:#1f5fa8;--blue-bg:#e5effa;--gray:#5b625e;--gray-bg:#eef0ed}
*{box-sizing:border-box}
body{margin:0;font-family:"Hind Siliguri",system-ui,sans-serif;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.55}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header.top{background:var(--ink);color:#fff;padding:0 16px}
header.top .in{max-width:1180px;margin:0 auto;display:flex;align-items:center;gap:16px;height:56px}
header.top .brand{font-weight:700;font-size:17px;color:#fff}
header.top .brand span{color:#7fd4c3}
header.top form{margin-left:auto}
header.top button{background:transparent;color:#cfd6d2;border:1px solid #3c4642;padding:5px 12px;border-radius:6px;cursor:pointer;font:inherit;font-size:14px}
main{max-width:1180px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:0 0 12px}
.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px;margin-bottom:18px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.stat b{display:block;font-size:26px;line-height:1.2}.stat small{color:var(--muted)}
.sites{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.site-card h2{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin:0 0 20px}
.tabs a{padding:9px 14px;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs a.on{color:var(--ink);border-color:var(--accent);font-weight:600}.tabs a:hover{text-decoration:none;color:var(--ink)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;color:var(--muted);font-size:13px;background:#fafbf9}
.scroll{overflow-x:auto}
.pill{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap}
.green{color:var(--green);background:var(--green-bg)}.red{color:var(--red);background:var(--red-bg)}.amber{color:var(--amber);background:var(--amber-bg)}
.blue{color:var(--blue);background:var(--blue-bg)}.gray{color:var(--gray);background:var(--gray-bg)}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);border:0;border-radius:7px;padding:8px 16px;font:inherit;font-weight:600;cursor:pointer;font-size:14px}
.btn:hover{filter:brightness(1.08);text-decoration:none}
.btn.ghost{background:var(--card);color:var(--ink);border:1px solid var(--line)}
.btn.danger{background:var(--red)}.btn.small{padding:4px 10px;font-size:13px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
input[type=text],input[type=password],input[type=number],input[type=time],input[type=search],textarea,select{font:inherit;border:1px solid #cdd2cc;border-radius:7px;padding:7px 10px;background:#fff;color:var(--ink);width:100%}
textarea{min-height:90px}
label.f{display:block;margin-bottom:14px}label.f>span{display:block;font-weight:600;margin-bottom:4px}
.help{color:var(--muted);font-size:13px;margin-top:3px}
.switch{display:flex;gap:8px;align-items:center;font-weight:600}
.switch input{width:18px;height:18px}
.flash{padding:10px 14px;border-radius:8px;margin-bottom:16px}
.flash.ok{background:var(--green-bg);color:var(--green)}.flash.err{background:var(--red-bg);color:var(--red)}
.form-grid{display:grid;gap:0 20px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.msg{max-width:380px;white-space:pre-wrap;color:#333}
.muted{color:var(--muted)}.nowrap{white-space:nowrap}
.login{max-width:360px;margin:80px auto}
.warn{background:var(--amber-bg);color:var(--amber);border-radius:8px;padding:10px 14px;margin-bottom:16px}
@media (max-width:600px){main{padding:16px 12px}h1{font-size:20px}th,td{padding:7px 6px}}
`;

function layout({ title, body, flash, user }) {
  const fl = flash ? `<div class="flash ${flash.type === 'err' ? 'err' : 'ok'}">${esc(flash.text)}</div>` : '';
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — মিসড কল SMS</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<header class="top"><div class="in"><a class="brand" href="/">মিসড কল <span>অটো-SMS</span></a>
${user ? `<form method="post" action="/logout"><button>লগআউট</button></form>` : ''}</div></header>
<main>${fl}${body}</main></body></html>`;
}

function siteTabs(site, active) {
  const t = [
    ['', 'সারাংশ'],
    ['/calls', 'মিসড কল'],
    ['/agents', 'এজেন্ট'],
    ['/callers', 'কলার'],
    ['/sms', 'SMS লগ'],
    ['/events', 'ইভেন্ট'],
    ['/settings', 'সেটিংস'],
  ];
  return `<div class="row" style="justify-content:space-between;margin-bottom:6px"><div><a href="/" class="muted">← সব সাইট</a>
<h1>${esc(site.name)} ${site.enabled ? '<span class="pill green">চালু</span>' : '<span class="pill gray">বন্ধ</span>'}
${site.dry_run ? '<span class="pill blue">টেস্ট মোড</span>' : ''}</h1></div></div>
<nav class="tabs">${t.map(([p, l]) => `<a href="/sites/${site.id}${p}" class="${active === p ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
}

function settingField(s, value) {
  const name = `name="${s.key}"`;
  const help = s.help ? `<div class="help">${esc(s.help)}</div>` : '';
  if (s.type === 'bool') {
    return `<label class="f"><span class="switch"><input type="hidden" ${name} value="0"><input type="checkbox" ${name} value="1" ${value ? 'checked' : ''}> ${esc(s.label)}</span>${help}</label>`;
  }
  if (s.type === 'select') {
    const opts = s.options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('');
    return `<label class="f"><span>${esc(s.label)}</span><select ${name}>${opts}</select>${help}</label>`;
  }
  if (s.type === 'textarea') {
    return `<label class="f" style="grid-column:1/-1"><span>${esc(s.label)}</span><textarea ${name} rows="4">${esc(value)}</textarea>${help}</label>`;
  }
  if (s.type === 'secret') {
    return `<label class="f"><span>${esc(s.label)}</span><input type="password" ${name} autocomplete="new-password" placeholder="${value ? '•••••••• (রাখা আছে — বদলাতে নতুনটা লিখুন)' : 'দেওয়া নেই'}">${help}</label>`;
  }
  if (s.type === 'url') {
    return `<label class="f" style="grid-column:1/-1"><span>${esc(s.label)}</span><input type="text" ${name} value="${esc(value)}" placeholder="খালি = সাধারণ ঠিকানা" inputmode="url" autocomplete="off">${help}</label>`;
  }
  const type = s.type === 'int' ? 'number' : s.type === 'time' ? 'time' : 'text';
  const extra = s.type === 'int' ? `min="${s.min}" max="${s.max}"` : '';
  return `<label class="f"><span>${esc(s.label)}</span><input type="${type}" ${name} value="${esc(value)}" ${extra}>${help}</label>`;
}

module.exports = { esc, bn, layout, siteTabs, statusPill, settingField };
