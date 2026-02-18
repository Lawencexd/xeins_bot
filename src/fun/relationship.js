const {
  EmbedBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const fs = require("fs/promises");
const path = require("path");

const { guildDoc, load, get, set, flushNow, STORE_DIR } = require("../core/storage");

const REL_DOC = "fun_rel_v2";

function weekKey(date = new Date()) {
  // ISO week key: YYYY-Www
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function ensureRelDoc(guildId) {
  const doc = guildDoc(guildId, REL_DOC);
  await load(doc, {
    favorites: {},
    marriages: {},
    proposals: {},
    // weekly: { [weekKey]: { pairs: { "a|b": n }, users: { "a": n } } }
    weekly: {},
    // lifetime fallback
    interactions: {},
    migratedFromV1: false,
  });

  // One-time migration from v1 if present (best-effort)
  await set(doc, (d) => {
    if (d.migratedFromV1) return d;
    // Nothing to migrate here safely without reading old file; keep flag false and let it stay.
    return d;
  });

  return doc;
}

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}
function diskPath(docName) {
  return path.join(STORE_DIR, `${safeName(docName)}.json`);
}
async function readFromDisk(docName) {
  try {
    const raw = await fs.readFile(diskPath(docName), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pairKey(a, b) {
  return `${a}|${b}`;
}

async function bumpInteraction(guildId, fromId, toId, inc = 1) {
  const doc = await ensureRelDoc(guildId);
  const wk = weekKey();

  await set(doc, (d) => {
    d.weekly[wk] = d.weekly[wk] || { pairs: {}, users: {} };
    const p = pairKey(fromId, toId);
    d.weekly[wk].pairs[p] = (d.weekly[wk].pairs[p] || 0) + inc;
    d.weekly[wk].users[fromId] = (d.weekly[wk].users[fromId] || 0) + inc;

    // also keep a small lifetime counter for fallback
    d.interactions[p] = (d.interactions[p] || 0) + inc;
    return d;
  });
}

async function setFavorite(guildId, userId, targetId) {
  const doc = await ensureRelDoc(guildId);

  await set(
    doc,
    (d) => {
      d.favorites[userId] = targetId;
      return d;
    },
    { flush: true }
  );

  await flushNow(doc);

  // Verify memory then disk
  const mem = get(doc);
  if (mem?.favorites?.[userId] === targetId) return targetId;

  const disk = await readFromDisk(doc);
  if (disk?.favorites?.[userId] === targetId) return targetId;

  // Fallback: direct disk patch (atomic)
  try {
    const next = disk && typeof disk === "object" ? disk : { favorites: {}, weekly: {}, interactions: {} };
    next.favorites = next.favorites || {};
    next.favorites[userId] = targetId;

    const tmp = diskPath(doc) + ".tmp";
    await fs.mkdir(STORE_DIR, { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(tmp, diskPath(doc));

    // refresh cache
    await load(doc, { favorites: {}, weekly: {}, interactions: {} });
    await set(doc, () => next, { flush: true });
    await flushNow(doc);
    return targetId;
  } catch {
    return null;
  }
}

function fmtTopList(entries, limit = 10) {
  if (!entries.length) return "Henüz veri yok.";
  return entries.slice(0, limit).map(([id, n], i) => `**${i + 1}.** <@${id}> — \`${n}\``).join("\n");
}

async function renderHome(interaction, guildId, ownerId) {
  const doc = await ensureRelDoc(guildId);

  const disk = await readFromDisk(doc);
  const fav = disk?.favorites?.[ownerId] ?? get(doc)?.favorites?.[ownerId];

  const wk = weekKey();
  const weeklyUserScore = disk?.weekly?.[wk]?.users?.[ownerId] ?? get(doc)?.weekly?.[wk]?.users?.[ownerId] ?? 0;

  const embed = new EmbedBuilder()
    .setTitle("💞 Relationship")
    .setDescription("Favori seç, etkileşim puanını artır. (/hug, /kiss, quiz ve oyunlar ile büyür)")
    .addFields(
      { name: "⭐ Favorin", value: fav ? `<@${fav}>` : "Yok", inline: true },
      { name: "💍 Eş", value: (disk?.marriages?.[ownerId] ? `<@${disk.marriages[ownerId]}>` : "Yok"), inline: true },
      { name: "📅 Bu hafta puanın", value: `\`${weeklyUserScore}\``, inline: true },
      { name: "🗓 Hafta", value: `\`${wk}\``, inline: true }
    )
    .setFooter({ text: "Aşama 4: haftalık leaderboard eklendi ✅" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:rel:setfav:${ownerId}`).setLabel("Favori Seç").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:rel:stats:${ownerId}`).setLabel("İstatistik").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fun:rel:lb:${ownerId}`).setLabel("Leaderboard").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fun:rel:marry:${ownerId}`).setLabel("Marry").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ embeds: [embed], components: [row], content: "" });
}

async function openFavPicker(interaction, ownerId) {
  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`fun:rel:pickfav:${ownerId}`)
      .setPlaceholder("Favori kullanıcı seç…")
      .setMinValues(1)
      .setMaxValues(1)
  );

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:rel:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ content: "⭐ Favori seç:", embeds: [], components: [row, nav] });
}

async function renderStats(interaction, guildId, ownerId) {
  const doc = await ensureRelDoc(guildId);
  const disk = await readFromDisk(doc);
  const fav = disk?.favorites?.[ownerId] ?? get(doc)?.favorites?.[ownerId];

  const wk = weekKey();
  const d = disk || get(doc) || { weekly: {}, interactions: {} };
  const weekly = d.weekly?.[wk] || { pairs: {}, users: {} };
  const score = weekly.users?.[ownerId] || 0;

  const p = fav ? pairKey(ownerId, fav) : null;
  const pairScore = p ? (weekly.pairs?.[p] || 0) : 0;

  const embed = new EmbedBuilder()
    .setTitle("💞 Relationship • Stats")
    .setDescription("Bu hafta istatistiklerin:")
    .addFields(
      { name: "⭐ Favorin", value: fav ? `<@${fav}>` : "Yok", inline: true },
      { name: "💍 Eş", value: (disk?.marriages?.[ownerId] ? `<@${disk.marriages[ownerId]}>` : "Yok"), inline: true },
      { name: "💬 Toplam Puan", value: `\`${score}\``, inline: true },
      { name: "🤝 Favori ile Puan", value: `\`${pairScore}\``, inline: true }
    )
    .setFooter({ text: "Aşama 4" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:rel:setfav:${ownerId}`).setLabel("Favori Seç").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:rel:lb:${ownerId}`).setLabel("Leaderboard").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fun:rel:marry:${ownerId}`).setLabel("Marry").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:rel:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ embeds: [embed], components: [row], content: "" });
}

async function renderLeaderboard(interaction, guildId, ownerId) {
  const doc = await ensureRelDoc(guildId);
  const disk = await readFromDisk(doc);
  const d = disk || get(doc) || { weekly: {} };

  const wk = weekKey();
  const weekly = d.weekly?.[wk] || { pairs: {}, users: {} };

  const topUsers = Object.entries(weekly.users || {}).sort((a, b) => b[1] - a[1]);
  const topPairs = Object.entries(weekly.pairs || {}).sort((a, b) => b[1] - a[1]);

  const embed = new EmbedBuilder()
    .setTitle("🏆 Relationship Leaderboard")
    .setDescription(`Hafta: \`${wk}\``)
    .addFields(
      { name: "👑 Top Users", value: topUsers.length ? topUsers.slice(0, 10).map(([id, n], i) => `**${i + 1}.** <@${id}> — \`${n}\``).join("\n") : "Henüz veri yok." },
      { name: "🤝 Top Pairs", value: topPairs.length ? topPairs.slice(0, 10).map(([k, n], i) => {
          const [a, b] = k.split("|");
          return `**${i + 1}.** <@${a}> → <@${b}> — \`${n}\``;
        }).join("\n") : "Henüz veri yok." }
    )
    .setFooter({ text: "Aşama 4: haftalık leaderboard" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:rel:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ embeds: [embed], components: [row], content: "" });
}


async function propose(guildId, fromId, toId) {
  const doc = await ensureRelDoc(guildId);
  await set(doc, (d) => {
    d.marriages = d.marriages || {};
    d.proposals = d.proposals || {};
    // can't propose if already married
    if (d.marriages[fromId] || d.marriages[toId]) return d;
    d.proposals[toId] = { fromId, at: Date.now() };
    return d;
  }, { flush: true });
  await flushNow(doc);
  const disk = await readFromDisk(doc);
  return disk?.proposals?.[toId] || null;
}

async function acceptProposal(guildId, toId) {
  const doc = await ensureRelDoc(guildId);
  let fromId = null;
  await set(doc, (d) => {
    d.marriages = d.marriages || {};
    d.proposals = d.proposals || {};
    const p = d.proposals[toId];
    if (!p?.fromId) return d;
    fromId = p.fromId;
    if (d.marriages[fromId] || d.marriages[toId]) return d;
    d.marriages[fromId] = toId;
    d.marriages[toId] = fromId;
    delete d.proposals[toId];
    return d;
  }, { flush: true });
  await flushNow(doc);
  return fromId;
}

async function declineProposal(guildId, toId) {
  const doc = await ensureRelDoc(guildId);
  await set(doc, (d) => {
    d.proposals = d.proposals || {};
    delete d.proposals[toId];
    return d;
  }, { flush: true });
  await flushNow(doc);
  return true;
}

async function divorce(guildId, userId) {
  const doc = await ensureRelDoc(guildId);
  let partner = null;
  await set(doc, (d) => {
    d.marriages = d.marriages || {};
    partner = d.marriages[userId] || null;
    if (partner) {
      delete d.marriages[userId];
      delete d.marriages[partner];
    }
    return d;
  }, { flush: true });
  await flushNow(doc);
  return partner;
}



async function openMarry(interaction, guildId, ownerId) {
  const doc = await ensureRelDoc(guildId);
  const disk = await readFromDisk(doc) || {};
  const spouse = disk?.marriages?.[ownerId] || null;
  const incoming = disk?.proposals?.[ownerId] || null;

  const embed = new EmbedBuilder()
    .setTitle("💍 Marry")
    .setDescription("Bu sistem sadece sosyal/oyun içi bir özelliktir. (Roleplay/romantik sahne yok)")
    .addFields(
      { name: "Eş", value: spouse ? `<@${spouse}>` : "Yok", inline: true },
      { name: "Gelen teklif", value: incoming?.fromId ? `<@${incoming.fromId}>` : "Yok", inline: true }
    );

  const rows = [];
  if (incoming?.fromId) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun:rel:accept:${ownerId}`).setLabel("Kabul Et").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`fun:rel:decline:${ownerId}`).setLabel("Reddet").setStyle(ButtonStyle.Danger)
    ));
  } else if (!spouse) {
    rows.push(new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`fun:rel:pickspouse:${ownerId}`)
        .setPlaceholder("Birini seç ve teklif gönder…")
        .setMinValues(1)
        .setMaxValues(1)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:rel:divorce:${ownerId}`).setLabel("Boşan").setStyle(ButtonStyle.Secondary).setDisabled(!spouse),
    new ButtonBuilder().setCustomId(`fun:rel:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
  ));

  return interaction.update({ embeds: [embed], components: rows, content: "" });
}

async function acceptMarry(interaction, guildId, ownerId) {
  const fromId = await acceptProposal(guildId, ownerId);
  if (!fromId) return interaction.reply({ content: "❌ Teklif bulunamadı.", flags: MessageFlags.Ephemeral });
  const embed = new EmbedBuilder().setTitle("💍 Tebrikler!").setDescription(`Artık eşsiniz: <@${fromId}> & <@${ownerId}>`);
  return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:rel:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
  )], content: "" });
}

async function declineMarry(interaction, guildId, ownerId) {
  await declineProposal(guildId, ownerId);
  return interaction.reply({ content: "✅ Teklif reddedildi.", flags: MessageFlags.Ephemeral });
}

async function doDivorce(interaction, guildId, ownerId) {
  const partner = await divorce(guildId, ownerId);
  if (!partner) return interaction.reply({ content: "❌ Eşin yok.", flags: MessageFlags.Ephemeral });
  return interaction.reply({ content: `✅ Boşanıldı: <@${partner}>`, flags: MessageFlags.Ephemeral });
}


module.exports = {
  REL_DOC,
  ensureRelDoc,
  bumpInteraction,
  setFavorite,
  renderHome,
  openFavPicker,
  renderStats,
  renderLeaderboard,
  weekKey,
  propose,
  openMarry,
  acceptMarry,
  declineMarry,
  doDivorce,
};