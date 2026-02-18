const fs = require("fs/promises");
const path = require("path");

/**
 * Small async file-based storage with:
 * - per-file write queue (prevents races/corruption)
 * - debounced flush (reduces disk churn on Replit)
 * - atomic writes (write tmp then rename)
 *
 * Data lives under: <project_root>/store/core/<name>.json
 */

const ROOT = process.cwd();
const STORE_DIR = path.join(ROOT, "store", "core");

const state = {
  // name -> { data: any, dirty: boolean, timer: NodeJS.Timeout|null, loading: Promise|null }
  files: new Map(),
  // name -> Promise queue tail
  queues: new Map(),
};

async function ensureDir() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

function filePath(name) {
  // keep safe filename
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(STORE_DIR, `${safe}.json`);
}

async function readJson(fp, fallback) {
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

async function atomicWriteJson(fp, data) {
  const tmp = fp + ".tmp";
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, json, "utf8");
  // rename is atomic on most platforms for same filesystem
  await fs.rename(tmp, fp);
}

function enqueue(name, fn) {
  const prev = state.queues.get(name) || Promise.resolve();
  const next = prev.then(fn).catch(() => {});
  state.queues.set(name, next);
  return next;
}

async function load(name, defaults = {}) {
  await ensureDir();
  if (!state.files.has(name)) {
    state.files.set(name, { data: defaults, dirty: false, timer: null, loading: null });
  }

  const entry = state.files.get(name);
  if (entry.loading) return entry.loading;

  entry.loading = enqueue(name, async () => {
    const fp = filePath(name);
    const disk = await readJson(fp, defaults);
    entry.data = disk ?? defaults;
    entry.dirty = false;
    entry.loading = null;
    return entry.data;
  });

  return entry.loading;
}

function get(name) {
  const entry = state.files.get(name);
  return entry ? entry.data : null;
}

async function set(name, updater, { flush = false } = {}) {
  await load(name, {});
  const entry = state.files.get(name);

  // Apply update in-memory under queue to avoid concurrent mutation surprises
  await enqueue(name, async () => {
    const current = entry.data ?? {};
    const next = typeof updater === "function" ? updater(current) : updater;
    entry.data = next;
    entry.dirty = true;
  });

  if (flush) {
    await flushNow(name);
  } else {
    scheduleFlush(name);
  }

  return entry.data;
}

function scheduleFlush(name, delayMs = 1500) {
  const entry = state.files.get(name);
  if (!entry) return;
  if (entry.timer) return;

  entry.timer = setTimeout(() => {
    entry.timer = null;
    flushNow(name).catch(() => {});
  }, delayMs);

  // do not keep process alive just for storage
  entry.timer.unref?.();
}

async function flushNow(name) {
  await ensureDir();
  const entry = state.files.get(name);
  if (!entry || !entry.dirty) return;

  await enqueue(name, async () => {
    const fp = filePath(name);
    await atomicWriteJson(fp, entry.data ?? {});
    entry.dirty = false;
  });
}

async function flushAll() {
  const names = Array.from(state.files.keys());
  for (const n of names) {
    await flushNow(n);
  }
}

/**
 * Convenience: per-guild namespaced doc
 */
function guildDoc(guildId, docName) {
  return `${docName}__guild_${guildId}`;
}

module.exports = {
  load,
  get,
  set,
  flushNow,
  flushAll,
  guildDoc,
  STORE_DIR,
};