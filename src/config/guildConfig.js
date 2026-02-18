const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "guild-config.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({}, null, 2), "utf8");
}

function readAll() {
  ensureFile();
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function writeAll(obj) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), "utf8");
}

function getGuildConfig(guildId) {
  const all = readAll();
  return all[guildId] || {};
}

function setGuildConfig(guildId, patch) {
  const all = readAll();
  const current = all[guildId] || {};
  all[guildId] = { ...current, ...patch, updatedAt: Date.now() };
  writeAll(all);
  return all[guildId];
}

module.exports = { getGuildConfig, setGuildConfig };
