const Activity = require("../fun/activity");

const cooldown = new Map(); // key guildId:userId -> ts

function canRun(key, ms = 30_000) {
  const now = Date.now();
  const last = cooldown.get(key) || 0;
  if (now - last < ms) return false;
  cooldown.set(key, now);
  return true;
}

async function applyActivityRoles(guild, member) {
  try {
    const guildId = guild.id;
    const userId = member.id;
    const key = `${guildId}:${userId}`;
    if (!canRun(key)) return;

    const rules = await Activity.getRules(guildId);
    if (!rules?.enabled) return;

    const stats = await Activity.getUserStats(guildId, userId);

    for (const entry of rules.entries || []) {
      if (!entry?.roleId) continue;
      const need = Number(entry.threshold || 0);
      let have = 0;
      if (entry.metric === "activeDays") have = Number(stats.activeDays || 0);
      if (entry.metric === "hugs") have = Number(stats.hugs || 0);
      if (entry.metric === "quizWins") have = Number(stats.quizWins || 0);

      if (have >= need && !member.roles.cache.has(entry.roleId)) {
        await member.roles.add(entry.roleId).catch(() => {});
      }
    }
  } catch {}
}

module.exports = { applyActivityRoles };