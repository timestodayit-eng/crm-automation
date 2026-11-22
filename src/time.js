// সব সময় বাংলাদেশ সময়ে (UTC+6, ডে-লাইট সেভিং নেই) "YYYY-MM-DD HH:mm:ss" ফরম্যাটে রাখা হয়,
// কারণ mConnex-ও এই ফরম্যাটেই তারিখ দেয়। একই ফরম্যাট হওয়ায় স্ট্রিং তুলনাই যথেষ্ট।
const OFFSET_MS = 6 * 60 * 60 * 1000;

function fmt(ms) {
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

function now() {
  return fmt(Date.now());
}

function minutesAgo(min) {
  return fmt(Date.now() - min * 60 * 1000);
}

function daysAgo(days) {
  return fmt(Date.now() - days * 24 * 60 * 60 * 1000);
}

// "YYYY-MM-DD HH:mm:ss" (ঢাকা) → epoch ms
function parse(str) {
  return Date.parse(String(str).replace(' ', 'T') + '+06:00');
}

function addMinutes(str, min) {
  return fmt(parse(str) + min * 60 * 1000);
}

function hhmm() {
  return now().slice(11, 16);
}

// "22:00" থেকে "08:00" — রাত পেরোনো সময়সীমাও ঠিকমতো ধরে
function inQuietHours(start, end, current = hhmm()) {
  if (!start || !end || start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

module.exports = { now, minutesAgo, daysAgo, parse, addMinutes, hhmm, inQuietHours, fmt };
