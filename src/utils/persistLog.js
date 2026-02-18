const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(process.cwd(), "logs");
const CRASH_LOG = path.join(LOG_DIR, "crash.log");

function ensureDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {}
}

function stamp() {
  return new Date().toLocaleString("tr-TR");
}

function toStringSafe(x) {
  try {
    if (x instanceof Error) return x.stack || x.message || String(x);
    if (typeof x === "string") return x;
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function append(tag, payload) {
  ensureDir();
  const line =
    `\n[${stamp()}] ${tag}\n` +
    `${toStringSafe(payload)}\n` +
    `----------------------------------------\n`;
  try {
    fs.appendFileSync(CRASH_LOG, line, "utf8");
  } catch {}
}

function tail(lines = 30) {
  try {
    ensureDir();
    if (!fs.existsSync(CRASH_LOG)) return "crash.log henüz oluşmadı.";
    const content = fs.readFileSync(CRASH_LOG, "utf8");
    const arr = content.split("\n");
    return arr.slice(Math.max(0, arr.length - lines)).join("\n");
  } catch (e) {
    return `crash.log okunamadı: ${String(e?.message || e)}`;
  }
}

module.exports = { append, tail, CRASH_LOG };
