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

// ---------- আইকন (ইনলাইন SVG, বাইরের কিছু লাগে না) ----------
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  phoneMissed:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/><path d="m22 2-6 6M16 2l6 6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  contact: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
  x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  hourglass: '<path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};

function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// লোগো: ফোন + মেসেজ বাবল
let logoN = 0;
const LOGO = () => {
  const id = `lg${++logoN}`;
  return `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="url(#${id})"/><defs><linearGradient id="${id}" x1="0" y1="0" x2="32" y2="32"><stop offset="0" stop-color="#2fc4a2"/><stop offset="1" stop-color="#0b6b59"/></linearGradient></defs><path d="M10 9.5h12a2.5 2.5 0 0 1 2.5 2.5v6.5A2.5 2.5 0 0 1 22 21h-6.5L11 24.5V21h-1a2.5 2.5 0 0 1-2.5-2.5V12A2.5 2.5 0 0 1 10 9.5z" fill="#fff"/><circle cx="12.5" cy="15.3" r="1.3" fill="#0e7a66"/><circle cx="16" cy="15.3" r="1.3" fill="#0e7a66"/><circle cx="19.5" cy="15.3" r="1.3" fill="#0e7a66"/></svg>`;
};

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

// ছোট একটা পরিসংখ্যান কার্ড
function stat(iconName, value, label, tone = 'teal') {
  return `<div class="stat tone-${tone}"><div class="stat-ic">${icon(iconName)}</div><div><b>${esc(value)}</b><small>${esc(label)}</small></div></div>`;
}

function siteState(s) {
  if (!s.enabled) return ['off', 'বন্ধ'];
  if (s.dry_run) return ['test', 'টেস্ট মোড'];
  return ['on', 'চালু'];
}

function initials(name) {
  const t = String(name || '?').trim();
  return esc([...t][0] || '?').toUpperCase();
}

const CSS = `
:root{
--bg:#f4f6f3;--surface:#fff;--surface-2:#f8faf7;--ink:#16201c;--ink-2:#34403b;--muted:#6a746f;--line:#e3e8e2;--line-strong:#cfd6ce;
--accent:#0e7a66;--accent-strong:#0a5f50;--accent-ink:#fff;--accent-soft:#e1f3ed;--ring:rgba(14,122,102,.25);
--green:#16794a;--green-bg:#e3f5ea;--red:#b4271f;--red-bg:#fce8e6;--amber:#8f5b00;--amber-bg:#fdf1d6;--blue:#1f5fa8;--blue-bg:#e6effb;--gray:#5b645f;--gray-bg:#eef1ed;--violet:#6941c6;--violet-bg:#f0ebfc;
--side:#0f1916;--side-2:#16231f;--side-ink:#c3cfca;--side-muted:#7d8c86;--side-accent:#5fd6ba;
--shadow:0 1px 2px rgba(16,24,20,.04),0 1px 3px rgba(16,24,20,.06);--shadow-lg:0 10px 30px -10px rgba(16,24,20,.18);
--radius:14px;color-scheme:light}
:root[data-theme=dark]{
--bg:#0b110f;--surface:#121a17;--surface-2:#16201c;--ink:#e6ece9;--ink-2:#c3cdc8;--muted:#8e9b95;--line:#222e29;--line-strong:#2f3d37;
--accent:#33c3a2;--accent-strong:#5fd6ba;--accent-ink:#06231c;--accent-soft:rgba(51,195,162,.13);--ring:rgba(51,195,162,.3);
--green:#5bd497;--green-bg:rgba(91,212,151,.12);--red:#ff8a80;--red-bg:rgba(255,138,128,.12);--amber:#f2c063;--amber-bg:rgba(242,192,99,.12);--blue:#86b6f5;--blue-bg:rgba(134,182,245,.12);--gray:#a3afa9;--gray-bg:rgba(163,175,169,.12);--violet:#b9a0f7;--violet-bg:rgba(185,160,247,.12);
--side:#080d0b;--side-2:#111a17;
--shadow:0 1px 2px rgba(0,0,0,.3);--shadow-lg:0 10px 30px -10px rgba(0,0,0,.6);color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:"Hind Siliguri","Inter",system-ui,sans-serif;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.ic{width:18px;height:18px;flex:none;vertical-align:-3px}
.logo{width:34px;height:34px;flex:none}

/* ---- কাঠামো ---- */
.app{display:grid;grid-template-columns:256px minmax(0,1fr);min-height:100vh;background:linear-gradient(to right,var(--side) 256px,transparent 256px)}
.sidebar{background:var(--side);color:var(--side-ink);position:sticky;top:0;height:100vh;display:flex;flex-direction:column;padding:18px 14px;overflow-y:auto}
.brand{display:flex;align-items:center;gap:11px;padding:4px 8px 20px;color:#fff;font-weight:700;font-size:16.5px;line-height:1.15}
.brand:hover{text-decoration:none}
.brand small{display:block;color:var(--side-muted);font-weight:500;font-size:12.5px}
.nav-label{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--side-muted);padding:16px 10px 6px;font-weight:600}
.nav a{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;color:var(--side-ink);font-size:14.5px;margin-bottom:2px}
.nav a:hover{background:var(--side-2);text-decoration:none;color:#fff}
.nav a.on{background:var(--side-2);color:#fff;box-shadow:inset 3px 0 0 var(--side-accent)}
.nav a .ic{color:var(--side-muted)}.nav a.on .ic{color:var(--side-accent)}
.nav .site-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.dot{width:8px;height:8px;border-radius:50%;flex:none;background:#6b7a74}
.dot.on{background:#3ddc97;box-shadow:0 0 0 3px rgba(61,220,151,.18)}.dot.test{background:#6aa8f7;box-shadow:0 0 0 3px rgba(106,168,247,.18)}.dot.err{background:#ff6b5e;box-shadow:0 0 0 3px rgba(255,107,94,.2)}
.side-foot{margin-top:auto;padding-top:16px;border-top:1px solid var(--side-2);display:flex;gap:8px}
.side-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:transparent;color:var(--side-ink);border:1px solid var(--side-2);padding:8px 10px;border-radius:9px;cursor:pointer;font:inherit;font-size:13.5px}
.side-btn:hover{background:var(--side-2);color:#fff}
.side-btn.icon-only{flex:none;width:40px;padding:8px 0}
.theme-dark{display:none}:root[data-theme=dark] .theme-dark{display:inline}:root[data-theme=dark] .theme-light{display:none}
.topbar{display:none}
.nav-toggle,.backdrop{display:none}
.content{min-width:0}
main{max-width:1200px;margin:0 auto;padding:30px 32px 80px}

/* ---- শিরোনাম ---- */
h1{font-size:25px;line-height:1.25;margin:0;letter-spacing:-.01em}
h2{font-size:17px;margin:0 0 12px;display:flex;align-items:center;gap:9px}
h2 .ic{color:var(--accent)}
.sub{color:var(--muted);margin:6px 0 22px}
.page-head{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.crumb{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:14px;margin-bottom:12px}
.crumb:hover{color:var(--accent);text-decoration:none}
.avatar{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-weight:700;font-size:20px;color:#fff;background:linear-gradient(135deg,#2fc4a2,#0b6b59);flex:none;box-shadow:var(--shadow)}
.avatar.sm{width:38px;height:38px;font-size:16px;border-radius:10px}
.title-pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}

/* ---- ট্যাব ---- */
.tabs{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--line);margin:0 0 24px;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tabs a{display:flex;align-items:center;gap:7px;padding:10px 14px;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;font-weight:500}
.tabs a:hover{text-decoration:none;color:var(--ink)}
.tabs a.on{color:var(--accent);border-color:var(--accent);font-weight:600}
.seg{display:inline-flex;gap:2px;padding:3px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;flex-wrap:wrap}
.seg a{padding:5px 13px;border-radius:7px;color:var(--muted);font-size:14px;font-weight:500}
.seg a:hover{color:var(--ink);text-decoration:none}
.seg a.on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow);font-weight:600}

/* ---- কার্ড ---- */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:20px;margin-bottom:18px;box-shadow:var(--shadow)}
.card.flush{padding:0;overflow:hidden}.card.flush>h2,.card.flush>.card-head{padding:18px 20px 0}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.card-head h2{margin:0}
.card-foot{padding:12px 20px;border-top:1px solid var(--line);background:var(--surface-2);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.cols{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));margin-bottom:18px}.cols>.card{margin-bottom:0}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.stat{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow)}
.stat b{display:block;font-size:26px;line-height:1.1;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.stat small{color:var(--muted);font-size:13.5px}
.stat-ic{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;flex:none}
.stat-ic .ic{width:21px;height:21px}
.tone-teal .stat-ic{background:var(--accent-soft);color:var(--accent)}.tone-green .stat-ic{background:var(--green-bg);color:var(--green)}.tone-blue .stat-ic{background:var(--blue-bg);color:var(--blue)}
.tone-amber .stat-ic{background:var(--amber-bg);color:var(--amber)}.tone-red .stat-ic{background:var(--red-bg);color:var(--red)}.tone-violet .stat-ic{background:var(--violet-bg);color:var(--violet)}
.stats{margin-bottom:22px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}

/* ---- সাইট কার্ড (ড্যাশবোর্ড) ---- */
.sites{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));margin-bottom:22px}
.site-card{display:flex;flex-direction:column;padding:0;overflow:hidden;margin:0;transition:box-shadow .15s,transform .15s,border-color .15s}
.site-card:hover{box-shadow:var(--shadow-lg);transform:translateY(-1px);border-color:var(--line-strong)}
.site-top{display:flex;gap:12px;align-items:center;padding:18px 18px 14px}
.site-top h2{margin:0;font-size:17px;display:block}
.site-top h2 a{color:var(--ink)}.site-top h2 a::after{content:"";position:absolute;inset:0}
.site-card{position:relative}
.mini{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.mini div{padding:12px 16px}.mini div+div{border-left:1px solid var(--line)}
.mini b{display:block;font-size:21px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2}
.mini small{color:var(--muted);font-size:12.5px}
.site-foot{padding:11px 18px;font-size:13px;color:var(--muted);display:flex;gap:8px;align-items:flex-start;background:var(--surface-2);flex:1}
.site-foot .dot{margin-top:6px}
.site-foot.err{color:var(--red)}
.add-card{display:flex;flex-direction:column;justify-content:center;border:1.5px dashed var(--line-strong);background:transparent;box-shadow:none;margin:0}
.add-card h2 .ic{background:var(--accent-soft);border-radius:8px;padding:5px;width:28px;height:28px}

/* ---- টেবিল ---- */
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:11px;background:var(--surface)}
.card.flush .scroll{border:0;border-radius:0;border-top:1px solid var(--line);margin-top:14px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
th{font-weight:600;color:var(--muted);font-size:12.5px;background:var(--surface-2);white-space:nowrap;letter-spacing:.01em}
tbody tr:hover td,table tr:hover td{background:var(--surface-2)}
table tr:first-child:hover th{background:var(--surface-2)}

/* ---- পিল ---- */
.pill{display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 8px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap;line-height:1.6;vertical-align:middle}
.pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.85}
.green{color:var(--green);background:var(--green-bg)}.red{color:var(--red);background:var(--red-bg)}.amber{color:var(--amber);background:var(--amber-bg)}
.blue{color:var(--blue);background:var(--blue-bg)}.gray{color:var(--gray);background:var(--gray-bg)}

/* ---- বোতাম ---- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;background:var(--accent);color:var(--accent-ink);border:1px solid transparent;border-radius:9px;padding:8px 16px;font:inherit;font-weight:600;cursor:pointer;font-size:14px;line-height:1.5;transition:background .15s,box-shadow .15s,border-color .15s;white-space:nowrap}
.btn:hover{background:var(--accent-strong);text-decoration:none}
.btn:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ring)}
.btn .ic{width:16px;height:16px}
.btn.ghost{background:var(--surface);color:var(--ink-2);border-color:var(--line-strong);box-shadow:var(--shadow)}
.btn.ghost:hover{background:var(--surface-2);border-color:var(--muted)}
.btn.danger{background:var(--red);color:#fff}.btn.danger:hover{filter:brightness(.92)}
:root[data-theme=dark] .btn.danger{color:#2a0b08}
.btn.small{padding:4px 11px;font-size:13px;border-radius:8px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.row form{margin:0}

/* ---- ফর্ম ---- */
input[type=text],input[type=password],input[type=number],input[type=time],input[type=search],input[type=date],textarea,select{font:inherit;font-size:14.5px;border:1px solid var(--line-strong);border-radius:9px;padding:8px 12px;background:var(--surface);color:var(--ink);width:100%;transition:border-color .15s,box-shadow .15s}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)}
input::placeholder,textarea::placeholder{color:var(--muted);opacity:.8}
select{appearance:none;-webkit-appearance:none;padding-right:34px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a948f' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:16px}
textarea{min-height:96px;resize:vertical;line-height:1.6}
label.f{display:block;margin-bottom:16px}label.f>span{display:block;font-weight:600;margin-bottom:6px;font-size:14px;color:var(--ink-2)}
.help{color:var(--muted);font-size:13px;margin-top:5px;line-height:1.5}
p.help{margin:0 0 10px}
.switch{display:flex !important;gap:11px;align-items:center;font-weight:600;cursor:pointer}
.switch input[type=checkbox]{appearance:none;-webkit-appearance:none;width:40px;height:23px;border-radius:999px;margin:0;flex:none;cursor:pointer;border:0;
background:radial-gradient(circle at 11.5px 50%,#fff 8px,transparent 8.6px),var(--line-strong);box-shadow:inset 0 1px 2px rgba(0,0,0,.08)}
.switch input[type=checkbox]:checked{background:radial-gradient(circle at 28.5px 50%,#fff 8px,transparent 8.6px),var(--accent)}
.switch input[type=checkbox]:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ring)}
.toggle-field{padding:12px 14px;border:1px solid var(--line);border-radius:11px;background:var(--surface-2)}
.form-grid{display:grid;gap:0 22px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.setting-card>h2{padding-bottom:12px;border-bottom:1px solid var(--line);margin-bottom:18px}
.setting-card .ic-box{width:30px;height:30px;border-radius:8px;background:var(--accent-soft);display:grid;place-items:center}
.setting-card .ic-box .ic{width:16px;height:16px}
.save-bar{position:sticky;bottom:0;z-index:5;margin:6px -4px 0;padding:14px 4px;background:linear-gradient(to top,var(--bg) 70%,transparent);display:flex;justify-content:flex-end}
.save-bar .btn{padding:10px 22px;box-shadow:var(--shadow-lg)}
.danger-zone{border-color:var(--red-bg);margin-top:28px}
.danger-zone h2 .ic{color:var(--red)}

/* ---- বার্তা ---- */
.flash,.warn{display:flex;gap:10px;align-items:flex-start;padding:12px 16px;border-radius:11px;margin-bottom:18px;font-size:14.5px;border:1px solid transparent}
.flash .ic,.warn::before{margin-top:2px}
.flash.ok{background:var(--green-bg);color:var(--green);border-color:color-mix(in srgb,var(--green) 20%,transparent)}
.flash.err{background:var(--red-bg);color:var(--red);border-color:color-mix(in srgb,var(--red) 20%,transparent)}
.warn{background:var(--amber-bg);color:var(--amber);border-color:color-mix(in srgb,var(--amber) 22%,transparent)}
.warn::before{content:"";width:18px;height:18px;flex:none;background:currentColor;
-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/%3E%3Cpath d='M12 9v4M12 17h.01'/%3E%3C/svg%3E") center/contain no-repeat;
mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/%3E%3Cpath d='M12 9v4M12 17h.01'/%3E%3C/svg%3E") center/contain no-repeat}
.msg{max-width:400px;white-space:pre-wrap;color:var(--ink-2)}
.muted{color:var(--muted)}.nowrap{white-space:nowrap}
.mono{font-variant-numeric:tabular-nums}
.status-line{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;background:var(--surface-2);border:1px solid var(--line);border-radius:11px;margin-bottom:14px}
.status-line .ic{color:var(--muted);margin-top:3px}
.status-line b{font-weight:600}
.link-more{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:14px}
.link-more .ic{width:15px;height:15px}

/* ---- লগইন ---- */
.auth{min-height:100vh;display:grid;place-items:center;padding:24px 16px;
background:radial-gradient(1200px 600px at 10% -10%,rgba(47,196,162,.22),transparent 60%),radial-gradient(900px 500px at 110% 110%,rgba(14,122,102,.18),transparent 60%),var(--bg)}
.auth-box{width:100%;max-width:400px}
.auth-brand{display:flex;align-items:center;gap:12px;justify-content:center;margin-bottom:22px;font-weight:700;font-size:19px}
.auth-brand .logo{width:42px;height:42px}
.auth .card{padding:28px;box-shadow:var(--shadow-lg)}
.auth h2{font-size:20px;justify-content:center;margin-bottom:4px}
.auth .sub{text-align:center;margin:0 0 22px;font-size:14px}
.auth .btn{width:100%;padding:10px}
.login{max-width:400px;margin:0 auto}
.auth-foot{text-align:center;color:var(--muted);font-size:12.5px;margin-top:18px;display:flex;gap:6px;justify-content:center;align-items:center}
.auth-foot .ic{width:14px;height:14px}

/* ---- মোবাইল ---- */
@media (max-width:900px){
.app{display:block;background:none}
.topbar{display:flex;position:sticky;top:0;z-index:20;align-items:center;gap:12px;height:58px;padding:0 16px;background:var(--side);color:#fff}
.topbar .brand{padding:0;font-size:15.5px}.topbar .logo{width:30px;height:30px}
.topbar label{margin-left:auto;display:grid;place-items:center;width:40px;height:40px;border-radius:10px;cursor:pointer;color:var(--side-ink)}
.topbar label:hover{background:var(--side-2)}
.topbar label .ic{width:22px;height:22px}
.sidebar{position:fixed;z-index:40;left:0;top:0;width:280px;max-width:85vw;transform:translateX(-102%);transition:transform .22s ease;box-shadow:var(--shadow-lg)}
.nav-toggle:checked~.sidebar{transform:none}
.backdrop{display:none;position:fixed;inset:0;z-index:30;background:rgba(5,10,8,.5)}
.nav-toggle:checked~.backdrop{display:block}
main{padding:20px 16px 60px}
}
@media (max-width:600px){
h1{font-size:21px}.avatar{width:40px;height:40px;font-size:17px}
th,td{padding:9px 10px}
.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.stat{padding:12px;gap:10px}.stat-ic{width:36px;height:36px}.stat b{font-size:21px}
.sites,.cols{grid-template-columns:minmax(0,1fr)}
.card{padding:16px}
.form-grid{grid-template-columns:minmax(0,1fr)}
}
@media (prefers-reduced-motion:reduce){*{transition:none !important}}
`;

// পেজ লোডের আগেই থিম বসানো, যাতে সাদা ঝলক না দেখায়
const THEME_HEAD = `<script>(function(){try{var t=localStorage.getItem('theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()</script>`;
const THEME_TOGGLE = `<script>function toggleTheme(){var r=document.documentElement,t=r.dataset.theme==='dark'?'light':'dark';r.dataset.theme=t;try{localStorage.setItem('theme',t)}catch(e){}}</script>`;

function sidebar({ sites = [], activeSiteId, title }) {
  const siteLinks = sites
    .map((s) => {
      const [state] = siteState(s);
      const err = String(s.last_poll_status || '').startsWith('ত্রুটি');
      return `<a href="/sites/${s.id}" class="${s.id === activeSiteId ? 'on' : ''}" title="${esc(s.name)}"><span class="dot ${err && s.enabled ? 'err' : state}"></span><span class="site-name">${esc(s.name)}</span></a>`;
    })
    .join('');
  const home = activeSiteId == null && title === 'সব সাইট';
  return `<aside class="sidebar">
<a class="brand" href="/">${LOGO()}<span>মিসড কল অটো-SMS<small>কল ম্যানেজমেন্ট প্যানেল</small></span></a>
<nav class="nav"><a href="/" class="${home ? 'on' : ''}">${icon('dashboard')}<span>ড্যাশবোর্ড</span></a>
${sites.length ? `<div class="nav-label">সাইট</div>${siteLinks}` : ''}</nav>
<div class="side-foot"><button type="button" class="side-btn icon-only" onclick="toggleTheme()" title="থিম বদলান" aria-label="থিম বদলান"><span class="theme-light">${icon('moon')}</span><span class="theme-dark">${icon('sun')}</span></button>
<form method="post" action="/logout" style="flex:1;display:flex;margin:0"><button class="side-btn">${icon('logout')}লগআউট</button></form></div>
</aside>`;
}

function layout({ title, body, flash, user, sites, activeSiteId }) {
  const fl = flash
    ? `<div class="flash ${flash.type === 'err' ? 'err' : 'ok'}">${icon(flash.type === 'err' ? 'x' : 'check')}<div>${esc(flash.text)}</div></div>`
    : '';
  const head = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — মিসড কল SMS</title>
<meta name="theme-color" content="#0f1916">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(LOGO().replace('class="logo" ', 'xmlns="http://www.w3.org/2000/svg" '))}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
${THEME_HEAD}<style>${CSS}</style>${THEME_TOGGLE}</head><body>`;
  if (!user) {
    return `${head}<div class="auth"><div class="auth-box"><div class="auth-brand">${LOGO()}<span>মিসড কল অটো-SMS</span></div>${fl}${body}
<div class="auth-foot">${icon('lock')}নিরাপদ সংযোগ · শুধু অনুমোদিত ব্যবহারকারীর জন্য</div></div></div></body></html>`;
  }
  return `${head}<div class="app"><input type="checkbox" id="nav-toggle" class="nav-toggle">
<header class="topbar"><a class="brand" href="/">${LOGO()}<span>মিসড কল অটো-SMS</span></a><label for="nav-toggle" aria-label="মেনু">${icon('menu')}</label></header>
${sidebar({ sites, activeSiteId, title })}<label for="nav-toggle" class="backdrop"></label>
<div class="content"><main>${fl}${body}</main></div></div></body></html>`;
}

function siteTabs(site, active) {
  const t = [
    ['', 'সারাংশ', 'dashboard'],
    ['/calls', 'মিসড কল', 'phoneMissed'],
    ['/agents', 'এজেন্ট', 'users'],
    ['/callers', 'কলার', 'contact'],
    ['/sms', 'SMS লগ', 'message'],
    ['/events', 'ইভেন্ট', 'activity'],
    ['/settings', 'সেটিংস', 'settings'],
  ];
  return `<a href="/" class="crumb">${icon('back')}সব সাইট</a>
<div class="page-head"><div class="avatar">${initials(site.name)}</div><div><h1>${esc(site.name)}</h1>
<div class="title-pills">${site.enabled ? '<span class="pill green">চালু</span>' : '<span class="pill gray">বন্ধ</span>'}${site.dry_run ? '<span class="pill blue">টেস্ট মোড</span>' : ''}</div></div></div>
<nav class="tabs">${t.map(([p, l, ic]) => `<a href="/sites/${site.id}${p}" class="${active === p ? 'on' : ''}">${icon(ic)}${l}</a>`).join('')}</nav>`;
}

function settingField(s, value) {
  const name = `name="${s.key}"`;
  const help = s.help ? `<div class="help">${esc(s.help)}</div>` : '';
  if (s.type === 'bool') {
    return `<label class="f toggle-field"><span class="switch"><input type="hidden" ${name} value="0"><input type="checkbox" ${name} value="1" ${value ? 'checked' : ''}> ${esc(s.label)}</span>${help}</label>`;
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

module.exports = { esc, bn, icon, stat, siteState, initials, layout, siteTabs, statusPill, settingField };
