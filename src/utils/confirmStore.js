/**
 * In-memory confirmation store with TTL.
 * Used for 2-step actions (ban, bulk delete, etc.).
 */

const store = new Map();

function put(key, value, ttlMs = 60_000) {
  const expiresAt = Date.now() + ttlMs;
  store.set(key, { value, expiresAt });
}

function get(key) {
  const row = store.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    store.delete(key);
    return null;
  }
  return row.value;
}

function del(key) {
  store.delete(key);
}

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (now > v.expiresAt) store.delete(k);
  }
}

setInterval(cleanup, 30_000).unref?.();

module.exports = { put, get, del };
