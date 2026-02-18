const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "settings.json");

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

function defaults() {
  return {
    links: {
      roblox: "https://www.roblox.com/communities/35779489/Xeins#!/about",
      discord: "https://discord.gg/xeins",
      tiktok: "https://www.tiktok.com/@xeinsclan"
    },
    channels: {
      LOG_CHANNEL_ID: "1469689684031701044",
      MODLOG_CHANNEL_ID: "1469733655198040115",
      THANKS_CHANNEL_ID: "1273634278294425772"
    },
    roles: {
      autoRoleId: null
    },
    features: {
      // 8) Admin gizlilik modu: admin/mod komutları default EPHEMERAL + panel default EPHEMERAL
      privacyMode: true,
      boosterThanks: true
    },
    voice: {
      // 13/14) Mascot voice
      mascotChannelId: null,
      ghostMode: true, // selfMute + selfDeaf
      enabled: false
    }
  };
}

function mergeDefaults(current) {
  const d = defaults();
  const merged = { ...d, ...(current || {}) };

  merged.links = { ...d.links, ...((current || {}).links || {}) };
  merged.channels = { ...d.channels, ...((current || {}).channels || {}) };
  merged.roles = { ...d.roles, ...((current || {}).roles || {}) };
  merged.features = { ...d.features, ...((current || {}).features || {}) };
  merged.voice = { ...d.voice, ...((current || {}).voice || {}) };

  return merged;
}

function getGuild(guildId) {
  const all = readAll();
  all[guildId] = mergeDefaults(all[guildId]);
  writeAll(all);
  return all[guildId];
}

function setGuild(guildId, patch) {
  const all = readAll();
  const current = getGuild(guildId);

  const merged = {
    ...current,
    ...patch,
    links: { ...current.links, ...(patch.links || {}) },
    channels: { ...current.channels, ...(patch.channels || {}) },
    roles: { ...current.roles, ...(patch.roles || {}) },
    features: { ...current.features, ...(patch.features || {}) },
    voice: { ...current.voice, ...(patch.voice || {}) }
  };

  all[guildId] = merged;
  writeAll(all);
  return merged;
}


// ===== Extras: audit & snapshot (for Settings Panel) =====
function addAudit(guildId, entry) {
  const all = readAll();
  const cur = mergeDefaults(all[guildId]);
  const audit = Array.isArray(cur.audit) ? cur.audit : [];
  audit.unshift({ ...entry, at: Date.now() });
  cur.audit = audit.slice(0, 30);
  all[guildId] = cur;
  writeAll(all);
  return cur.audit;
}

function getAudit(guildId) {
  const cur = getGuild(guildId);
  return Array.isArray(cur.audit) ? cur.audit : [];
}

function saveSnapshot(guildId, snapshot) {
  const all = readAll();
  const cur = mergeDefaults(all[guildId]);
  cur.snapshot = { ...snapshot, at: Date.now() };
  all[guildId] = cur;
  writeAll(all);
  return cur.snapshot;
}

function getSnapshot(guildId) {
  const cur = getGuild(guildId);
  return cur.snapshot || null;
}

function restoreSnapshot(guildId) {
  const all = readAll();
  const cur = mergeDefaults(all[guildId]);
  if (!cur.snapshot || !cur.snapshot.data) return null;

  const data = cur.snapshot.data;
  // restore only known sections
  const patch = {
    links: data.links || {},
    channels: data.channels || {},
    roles: data.roles || {},
    features: data.features || {},
    voice: data.voice || {}
  };

  const merged = setGuild(guildId, patch);
  return merged;
}

module.exports = { getGuild, setGuild, addAudit, getAudit, saveSnapshot, getSnapshot, restoreSnapshot };
