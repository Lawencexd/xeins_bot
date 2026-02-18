const { EmbedBuilder } = require("discord.js");

// Tek format modlog embed'i
// action: "BAN" | "KICK" | "MUTE" | "UNMUTE" | "PURGE" | "LOCK" | "UNLOCK" | "SLOWMODE" | "PANEL"
const ACTION_STYLE = {
  BAN: { emoji: "🔨", color: 0xff3b30, title: "Ban" },
  KICK: { emoji: "👢", color: 0xff9f0a, title: "Kick" },
  MUTE: { emoji: "🔇", color: 0xffcc00, title: "Timeout (Mute)" },
  UNMUTE: { emoji: "🔊", color: 0x34c759, title: "Timeout Kaldırıldı" },
  PURGE: { emoji: "🧹", color: 0x0a84ff, title: "Mesaj Silme" },
  LOCK: { emoji: "🔒", color: 0xff9500, title: "Lock" },
  UNLOCK: { emoji: "🔓", color: 0x34c759, title: "Unlock" },
  SLOWMODE: { emoji: "🐢", color: 0x0a84ff, title: "Slowmode" },
  PANEL: { emoji: "🛠️", color: 0x8e8e93, title: "Panel İşlemi" },
};

function v(v) {
  return v ?? "—";
}

/**
 * @param {Object} p
 * @param {keyof ACTION_STYLE} p.action
 * @param {import('discord.js').User} p.actor
 * @param {import('discord.js').User | import('discord.js').GuildMember | null} [p.target]
 * @param {import('discord.js').GuildChannel | import('discord.js').TextBasedChannel | null} [p.channel]
 * @param {string} [p.reason]
 * @param {string} [p.duration]
 * @param {number} [p.count]
 * @param {Array<{name:string,value:string,inline?:boolean}>} [p.extraFields]
 */
function buildModlogEmbed(p) {
  const style = ACTION_STYLE[p.action] || ACTION_STYLE.PANEL;

  const embed = new EmbedBuilder()
    .setTitle(`${style.emoji} ${style.title}`)
    .setColor(style.color)
    .setTimestamp();

  const fields = [];

  if (p.target) {
    const user = p.target.user ? p.target.user : p.target;
    fields.push({ name: "Kullanıcı", value: `${user} (\`${user.id}\`)`, inline: false });
  }

  fields.push({ name: "Yetkili", value: `${p.actor} (\`${p.actor.id}\`)`, inline: false });

  if (p.channel && p.channel.id) {
    fields.push({ name: "Kanal", value: `<#${p.channel.id}> (\`${p.channel.id}\`)`, inline: false });
  }

  if (typeof p.count === "number") {
    fields.push({ name: "Sayı", value: `${p.count}`, inline: true });
  }

  if (p.duration) {
    fields.push({ name: "Süre", value: v(p.duration), inline: true });
  }

  if (p.reason) {
    fields.push({ name: "Sebep", value: v(p.reason), inline: false });
  }

  if (Array.isArray(p.extraFields) && p.extraFields.length) {
    for (const f of p.extraFields) fields.push(f);
  }

  if (fields.length) embed.addFields(...fields);
  return embed;
}

module.exports = {
  buildModlogEmbed,
};
