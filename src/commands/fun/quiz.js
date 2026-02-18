const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const state = require("../../state");

function ensureMaps() {
  if (!state.quizSessions) state.quizSessions = new Map(); // nonce -> { ownerId, correct, createdAt }
}

const QUESTIONS = [
  { q: "Türkiye'nin başkenti neresidir?", a: ["İstanbul", "Ankara", "İzmir", "Bursa"], c: 1 },
  { q: "Güneş Sistemi'ndeki en büyük gezegen hangisidir?", a: ["Mars", "Venüs", "Jüpiter", "Merkür"], c: 2 },
  { q: "Bir dakikada kaç saniye vardır?", a: ["30", "60", "90", "100"], c: 1 },
  { q: "Hangi hayvan 'miyav' der?", a: ["Kedi", "Köpek", "Kuş", "At"], c: 0 },
  { q: "Dünya'nın uydusunun adı nedir?", a: ["Ay", "Mars", "Europa", "Titan"], c: 0 },
  { q: "RGB renk modelinde 'G' neyi temsil eder?", a: ["Gold", "Green", "Gray", "Glow"], c: 1 },
  { q: "Bir üçgende iç açılar toplamı kaç derecedir?", a: ["90", "180", "270", "360"], c: 1 },
  { q: "Su kaç derecede donar? (Deniz seviyesi)", a: ["0°C", "10°C", "50°C", "100°C"], c: 0 },
  { q: "En hızlı kara hayvanı hangisidir?", a: ["Aslan", "Çita", "At", "Kurt"], c: 1 },
  { q: "Minecraft'ta 'Creeper' ne yapar?", a: ["Uçar", "Patlar", "Yüzer", "Şarkı söyler"], c: 1 },
  { q: "Bilgisayarda CTRL+Z genelde ne yapar?", a: ["Kopyala", "Yapıştır", "Geri al", "Kaydet"], c: 2 },
  { q: "Dünya'nın en büyük okyanusu hangisidir?", a: ["Atlas", "Hint", "Pasifik", "Arktik"], c: 2 },
];

function makeNonce() {
  return Math.random().toString(36).slice(2, 8);
}

function buildRows(nonce, disabled) {
  const letters = ["A", "B", "C", "D"];
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`quiz:${nonce}:0`).setLabel("A").setStyle(ButtonStyle.Primary).setDisabled(!!disabled),
    new ButtonBuilder().setCustomId(`quiz:${nonce}:1`).setLabel("B").setStyle(ButtonStyle.Primary).setDisabled(!!disabled)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`quiz:${nonce}:2`).setLabel("C").setStyle(ButtonStyle.Primary).setDisabled(!!disabled),
    new ButtonBuilder().setCustomId(`quiz:${nonce}:3`).setLabel("D").setStyle(ButtonStyle.Primary).setDisabled(!!disabled)
  );
  return [row1, row2];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Hızlı quiz! 1 soru, 4 seçenek (butonlu)."),

  async execute(interaction) {
    ensureMaps();

    const item = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    const nonce = makeNonce();

    state.quizSessions.set(nonce, {
      ownerId: interaction.user.id,
      correct: item.c,
      createdAt: Date.now(),
      q: item.q,
      a: item.a,
    });

    // 2 dakika sonra temizle
    setTimeout(() => {
      try { state.quizSessions.delete(nonce); } catch (_) {}
    }, 2 * 60 * 1000);

    const embed = new EmbedBuilder()
      .setTitle("🧠 Quiz Zamanı!")
      .setDescription(
        `**${item.q}**\n\n` +
        `A) ${item.a[0]}\n` +
        `B) ${item.a[1]}\n` +
        `C) ${item.a[2]}\n` +
        `D) ${item.a[3]}\n\n` +
        `Seçimini butonlardan yap, ${interaction.user}!`
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: buildRows(nonce, false) });
  },
};
