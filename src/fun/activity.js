const { guildDoc, load, get, set } = require("../core/storage");

const DOC = "activity_v1";

async function ensureDoc(guildId) {
  const doc = guildDoc(guildId, DOC);
  await load(doc, { users: {}, rules: { enabled: false, entries: [] } });
  return doc;
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function markActive(guildId, userId) {
  const doc = await ensureDoc(guildId);
  const today = todayKey();

  await set(doc, (d) => {
    d.users[userId] = d.users[userId] || { lastDay: null, activeDays: 0, hugs: 0, quizWins: 0 };
    if (d.users[userId].lastDay !== today) {
      d.users[userId].lastDay = today;
      d.users[userId].activeDays += 1;
    }
    return d;
  });
}

async function bump(guildId, userId, field, inc = 1) {
  const doc = await ensureDoc(guildId);
  await set(doc, (d) => {
    d.users[userId] = d.users[userId] || { lastDay: null, activeDays: 0, hugs: 0, quizWins: 0 };
    d.users[userId][field] = (d.users[userId][field] || 0) + inc;
    return d;
  });
}

async function getUserStats(guildId, userId) {
  const doc = await ensureDoc(guildId);
  const d = get(doc) || {};
  return d.users?.[userId] || { lastDay: null, activeDays: 0, hugs: 0, quizWins: 0 };
}

async function getRules(guildId) {
  const doc = await ensureDoc(guildId);
  const d = get(doc) || {};
  return d.rules || { enabled: false, entries: [] };
}

async function setRules(guildId, rules) {
  const doc = await ensureDoc(guildId);
  await set(doc, (d) => {
    d.rules = rules;
    return d;
  }, { flush: true });
}

module.exports = { DOC, ensureDoc, markActive, bump, getUserStats, getRules, setRules };