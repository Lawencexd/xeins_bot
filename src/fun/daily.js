const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { guildDoc, load, get, set, flushNow } = require("../core/storage");

const DAILY_DOC = "fun_daily_v1";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeTasks() {
  // 3 light tasks; progress comes from command usage + quiz correct + hugs/kisses
  const pool = [
    { id: "game1", title: "Bir mini oyun oyna", desc: "Bir kez /coinflip, /dice veya /rps kullan.", target: 1, key: "gamesPlayed" },
    { id: "quiz1", title: "Quiz çöz", desc: "Bir quiz sorusuna doğru cevap ver.", target: 1, key: "quizCorrect" },
    { id: "hug1", title: "Etkileşim kur", desc: "Birine /hug veya /kiss at.", target: 1, key: "affectionSent" },
  ];
  return pool;
}

async function ensureUserDaily(guildId, userId) {
  const doc = guildDoc(guildId, DAILY_DOC);
  await load(doc, { day: todayKey(), users: {} });

  await set(doc, (d) => {
    if (!d || typeof d !== "object") d = { day: todayKey(), users: {} };
    const tk = todayKey();
    if (d.day !== tk) {
      // new day reset (keep minimal)
      d.day = tk;
      d.users = {};
    }
    if (!d.users[userId]) {
      d.users[userId] = {
        tasks: makeTasks(),
        progress: { gamesPlayed: 0, quizCorrect: 0, affectionSent: 0 },
        claimed: false,
        createdAt: Date.now(),
      };
    }
    return d;
  });

  return doc;
}

async function bumpProgress(guildId, userId, key, inc = 1) {
  const doc = await ensureUserDaily(guildId, userId);
  await set(doc, (d) => {
    const u = d.users[userId];
    if (!u) return d;
    u.progress[key] = (u.progress[key] || 0) + inc;
    return d;
  });
}

function progressLine(task, prog) {
  const cur = Math.min(task.target, prog || 0);
  const done = cur >= task.target;
  return `${done ? "✅" : "⬜"} **${task.title}** — \`${cur}/${task.target}\`\n_${task.desc}_`;
}

async function renderDaily(interaction, guildId, userId) {
  const doc = await ensureUserDaily(guildId, userId);
  const data = get(doc);
  const u = data.users[userId];

  const lines = u.tasks.map((t) => progressLine(t, u.progress[t.key]));
  const allDone = u.tasks.every((t) => (u.progress[t.key] || 0) >= t.target);

  const embed = new EmbedBuilder()
    .setTitle("🎯 Günlük Görevler")
    .setDescription(lines.join("\n\n"))
    .addFields(
      { name: "📅 Gün", value: `\`${data.day}\``, inline: true },
      { name: "🎁 Ödül", value: "1 XP + 1 Coin (Aşama 3 temel)", inline: true },
      { name: "✅ Durum", value: allDone ? "Hazır" : "Devam", inline: true }
    )
    .setFooter({ text: "Görevler: mini oyun + quiz + etkileşim. Hafif, stabil." });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:daily:claim:${userId}`).setLabel("Claim").setStyle(ButtonStyle.Success).setDisabled(!allDone || u.claimed),
    new ButtonBuilder().setCustomId(`fun:daily:reroll:${userId}`).setLabel("Reroll").setStyle(ButtonStyle.Secondary).setDisabled(u.claimed),
    new ButtonBuilder().setCustomId(`fun:home:${userId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ embeds: [embed], components: [row], content: "" });
}

async function claim(interaction, guildId, userId) {
  const doc = await ensureUserDaily(guildId, userId);
  const data = get(doc);
  const u = data.users[userId];
  const allDone = u.tasks.every((t) => (u.progress[t.key] || 0) >= t.target);
  if (!allDone) {
    return interaction.reply({ content: "❌ Önce tüm görevleri bitir.", flags: MessageFlags.Ephemeral });
  }
  if (u.claimed) {
    return interaction.reply({ content: "✅ Bugünün ödülünü zaten aldın.", flags: MessageFlags.Ephemeral });
  }

  await set(doc, (d) => {
    d.users[userId].claimed = true;
    return d;
  }, { flush: true });

  return interaction.reply({ content: "🎉 Tebrikler! Günlük ödül alındı: **+1 XP**, **+1 Coin** (Aşama 3 temel).", flags: MessageFlags.Ephemeral });
}

async function reroll(interaction, guildId, userId) {
  const doc = await ensureUserDaily(guildId, userId);
  await set(doc, (d) => {
    const u = d.users[userId];
    if (!u || u.claimed) return d;
    u.tasks = makeTasks(); // simple fixed set for now (stable)
    return d;
  }, { flush: true });

  return renderDaily(interaction, guildId, userId);
}

module.exports = {
  DAILY_DOC,
  todayKey,
  ensureUserDaily,
  bumpProgress,
  renderDaily,
  claim,
  reroll,
};