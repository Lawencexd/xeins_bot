const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");

const Daily = require("./daily");

/**
 * Stage 5: Mini games (panel-only)
 * - memory state
 * - timeout protected
 * - one active game per user
 */

const active = new Map(); // ownerId -> { type, data, timeout }

function clear(ownerId) {
  const s = active.get(ownerId);
  if (s?.timeout) clearTimeout(s.timeout);
  active.delete(ownerId);
}

function setState(ownerId, state, ttlMs = 60000) {
  clear(ownerId);
  const timeout = setTimeout(() => clear(ownerId), ttlMs);
  timeout.unref?.();
  active.set(ownerId, { ...state, timeout });
}

function homeEmbed() {
  return new EmbedBuilder()
    .setTitle("🎮 Mini Oyunlar")
    .setDescription("Bir oyun seç. Hepsi panel içi, hızlı ve stabil.")
    .addFields(
      { name: "⚡ Reaction", value: "En hızlı tıklayan kazanır.", inline: true },
      { name: "🔢 Guess 1–20", value: "5 hakta sayıyı bul.", inline: true },
      { name: "🧮 Quick Math", value: "10 saniyede doğru cevabı seç.", inline: true },
      { name: "🪙 Coinflip", value: "Yazı / Tura.", inline: true },
      { name: "🎲 Dice", value: "1–6 zar at.", inline: true },
      { name: "✂️ RPS", value: "Taş-Kağıt-Makas.", inline: true },
      { name: "🃏 Blackjack", value: "21'e yaklaş.", inline: true },
      { name: "⚔️ Duel", value: "Hızlı düello.", inline: true },
      { name: "🧩 Riddle", value: "Bilmece.", inline: true }
    )
    .setFooter({ text: "Aşama 5 • Memory state + timeout korumalı" });
}

function menuRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`fun:game:pick:${ownerId}`)
      .setPlaceholder("Oyun seç…")
      .addOptions(
        { label: "Reaction", value: "reaction", emoji: "⚡" },
        { label: "Guess 1–20", value: "guess", emoji: "🔢" },
        { label: "Quick Math", value: "math", emoji: "🧮" },
        { label: "Coinflip", value: "coinflip", emoji: "🪙" },
        { label: "Dice", value: "dice", emoji: "🎲" },
        { label: "RPS", value: "rps", emoji: "✂️" },
        { label: "Blackjack", value: "blackjack", emoji: "🃏" },
        { label: "Duel", value: "duel", emoji: "⚔️" },
        { label: "Riddle", value: "riddle", emoji: "🧩" }
      )
  );
}

function navRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fun:close:${ownerId}`).setLabel("Close").setStyle(ButtonStyle.Danger)
  );
}

async function renderHome(interaction, ownerId) {
  return interaction.update({
    embeds: [homeEmbed()],
    components: [menuRow(ownerId), navRow(ownerId)],
    content: "",
  });
}

// ===== Reaction =====
function reactionStartEmbed() {
  return new EmbedBuilder()
    .setTitle("⚡ Reaction")
    .setDescription("Hazır ol… Yeşil buton görününce **hemen bas!**")
    .setFooter({ text: "Buton erken basılırsa kaybedersin." });
}

async function startReaction(interaction, ownerId) {
  // random delay then enable button
  const delay = 2000 + Math.floor(Math.random() * 3000); // 2-5s
  setState(ownerId, { type: "reaction", data: { phase: "wait", startedAt: Date.now() } }, 20000);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fun:game:react:${ownerId}`)
      .setLabel("Bekle…")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ embeds: [reactionStartEmbed()], components: [row], content: "" });

  // after delay, enable button by editing message
  const s = active.get(ownerId);
  if (!s || s.type !== "reaction") return;

  s.data.phase = "go";
  s.data.goAt = Date.now();

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fun:game:react:${ownerId}`)
      .setLabel("ŞİMDİ!")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  // defer using interaction.message edit when possible
  try {
    setTimeout(async () => {
      const st = active.get(ownerId);
      if (!st || st.type !== "reaction" || st.data.phase !== "go") return;
      try {
        await interaction.editReply({ components: [row2] });
      } catch {}
    }, delay).unref?.();
  } catch {}
}

async function react(interaction, ownerId) {
  const st = active.get(ownerId);
  if (!st || st.type !== "reaction") {
    return interaction.reply({ content: "❌ Aktif Reaction oyunun yok.", flags: MessageFlags.Ephemeral });
  }
  if (st.data.phase !== "go" || !st.data.goAt) {
    clear(ownerId);
    return interaction.reply({ content: "❌ Erken bastın! (Kaybettin)", flags: MessageFlags.Ephemeral });
  }
  const ms = Date.now() - st.data.goAt;
  clear(ownerId);
  try { Daily.bumpProgress(interaction.guildId, ownerId, "gamesPlayed", 1).catch(() => {}); } catch {}

  const embed = new EmbedBuilder()
    .setTitle("⚡ Reaction • Sonuç")
    .setDescription(`Süren: **${ms}ms**\n🎯 Günlük görev ilerledi.`)
    .setFooter({ text: "Aşama 5" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:start:reaction:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row], content: "" });
}

// ===== Guess 1–20 =====
function guessEmbed(hp, hint) {
  const desc = hint ? `İpucu: **${hint}**\n\n` : "";
  return new EmbedBuilder()
    .setTitle("🔢 Guess 1–20")
    .setDescription(desc + `Kalan hak: **${hp}**\n1–20 arasında sayı seç.`)
    .setFooter({ text: "5 hak • Timeout 60s" });
}

function guessMenu(ownerId) {
  const opts = [];
  for (let i = 1; i <= 20; i++) opts.push({ label: String(i), value: String(i) });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`fun:game:guess:${ownerId}`)
      .setPlaceholder("Tahmin seç…")
      .addOptions(opts)
  );
}

async function startGuess(interaction, ownerId) {
  const secret = 1 + Math.floor(Math.random() * 20);
  setState(ownerId, { type: "guess", data: { secret, hp: 5 } }, 60000);

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({
    embeds: [guessEmbed(5, null)],
    components: [guessMenu(ownerId), nav],
    content: "",
  });
}

async function pickGuess(interaction, ownerId, value) {
  const st = active.get(ownerId);
  if (!st || st.type !== "guess") {
    return interaction.reply({ content: "❌ Aktif Guess oyunun yok.", flags: MessageFlags.Ephemeral });
  }
  const n = Number(value);
  st.data.hp -= 1;

  if (n === st.data.secret) {
    clear(ownerId);
    try { Daily.bumpProgress(interaction.guildId, ownerId, "gamesPlayed", 1).catch(() => {}); } catch {}
    const embed = new EmbedBuilder()
      .setTitle("🔢 Guess • Kazandın!")
      .setDescription(`Doğru sayı: **${n}**\n🎯 Günlük görev ilerledi.`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun:game:start:guess:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row], content: "" });
  }

  if (st.data.hp <= 0) {
    const secret = st.data.secret;
    clear(ownerId);
    const embed = new EmbedBuilder()
      .setTitle("🔢 Guess • Bitti")
      .setDescription(`Hakların bitti 😅 Doğru sayı: **${secret}**`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun:game:start:guess:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row], content: "" });
  }

  const hint = n < st.data.secret ? "Daha büyük" : "Daha küçük";
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );
  return interaction.update({ embeds: [guessEmbed(st.data.hp, hint)], components: [guessMenu(ownerId), nav], content: "" });
}

// ===== Quick Math =====
function makeMath() {
  const a = 2 + Math.floor(Math.random() * 20);
  const b = 2 + Math.floor(Math.random() * 20);
  const op = Math.random() < 0.5 ? "+" : "-";
  const ans = op === "+" ? a + b : a - b;
  return { a, b, op, ans };
}

function mathEmbed(m) {
  return new EmbedBuilder()
    .setTitle("🧮 Quick Math")
    .setDescription(`**${m.a} ${m.op} ${m.b} = ?**\n10 saniyede cevapla.`)
    .setFooter({ text: "Timeout 10s" });
}

function mathChoices(correct) {
  const set = new Set([correct]);
  while (set.size < 4) {
    set.add(correct + (-5 + Math.floor(Math.random() * 11)));
  }
  return Array.from(set).sort(() => Math.random() - 0.5);
}

async function startMath(interaction, ownerId) {
  const m = makeMath();
  const choices = mathChoices(m.ans);
  setState(ownerId, { type: "math", data: { correct: m.ans } }, 10000);

  const row = new ActionRowBuilder().addComponents(
    ...choices.map((v) =>
      new ButtonBuilder()
        .setCustomId(`fun:game:math:${ownerId}:${v}:${m.ans}`)
        .setLabel(String(v))
        .setStyle(ButtonStyle.Primary)
    )
  );
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [mathEmbed(m)], components: [row, nav], content: "" });
}

async function answerMath(interaction, ownerId, choice, correct) {
  const st = active.get(ownerId);
  if (!st || st.type !== "math") {
    return interaction.reply({ content: "❌ Aktif Math oyunun yok.", flags: MessageFlags.Ephemeral });
  }
  clear(ownerId);

  const isCorrect = Number(choice) === Number(correct);
  if (isCorrect) {
    try { Daily.bumpProgress(interaction.guildId, ownerId, "gamesPlayed", 1).catch(() => {}); } catch {}
  }

  const embed = new EmbedBuilder()
    .setTitle(isCorrect ? "✅ Doğru!" : "❌ Yanlış!")
    .setDescription(isCorrect ? "🎯 Günlük görev ilerledi." : `Doğru cevap: **${correct}**`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:start:math:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row], content: "" });
}



// ===== Coinflip / Dice / RPS =====
async function startCoinflip(interaction, ownerId) {
  try { Daily.bumpProgress(interaction.guildId, ownerId, "gamesPlayed", 1).catch(() => {}); } catch {}
  const flip = Math.random() < 0.5 ? "Yazı" : "Tura";

  const embed = new EmbedBuilder()
    .setTitle("🪙 Coinflip")
    .setDescription(`Sonuç: **${flip}**`)
    .setFooter({ text: "Panel içi" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:coinflip:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row], content: "" });
}

async function startDice(interaction, ownerId) {
  try { Daily.bumpProgress(interaction.guildId, ownerId, "gamesPlayed", 1).catch(() => {}); } catch {}
  const roll = 1 + Math.floor(Math.random() * 6);

  const embed = new EmbedBuilder()
    .setTitle("🎲 Dice")
    .setDescription(`Zar: **${roll}**`)
    .setFooter({ text: "Panel içi" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:dice:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row], content: "" });
}

async function startRps(interaction, ownerId) {
  const embed = new EmbedBuilder()
    .setTitle("✂️ RPS")
    .setDescription("Seçimini yap:")
    .setFooter({ text: "Taş / Kağıt / Makas" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:rps:${ownerId}:rock`).setLabel("🪨 Taş").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:rps:${ownerId}:paper`).setLabel("📄 Kağıt").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:rps:${ownerId}:scissors`).setLabel("✂️ Makas").setStyle(ButtonStyle.Primary)
  );

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row, nav], content: "" });
}

async function playRps(interaction, ownerId, choice) {
  try { Daily.bumpProgress(interaction.guildId, ownerId, "gamesPlayed", 1).catch(() => {}); } catch {}

  const map = { rock: "🪨 Taş", paper: "📄 Kağıt", scissors: "✂️ Makas" };
  const botChoices = ["rock", "paper", "scissors"];
  const bot = botChoices[Math.floor(Math.random() * botChoices.length)];

  let result = "Berabere!";
  if (choice === bot) result = "Berabere!";
  else if (
    (choice === "rock" && bot === "scissors") ||
    (choice === "paper" && bot === "rock") ||
    (choice === "scissors" && bot === "paper")
  ) result = "Kazandın! 🎉";
  else result = "Kaybettin 😅";

  const embed = new EmbedBuilder()
    .setTitle("✂️ RPS • Sonuç")
    .setDescription(`Sen: **${map[choice] || choice}**\nBot: **${map[bot]}**\n\n**${result}**`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:start:rps:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row], content: "" });
}




// ===== Blackjack =====
function drawCard() {
  const vals = [2,3,4,5,6,7,8,9,10,10,10,10,11]; // 11 = Ace
  return vals[Math.floor(Math.random()*vals.length)];
}
function handValue(hand) {
  let sum = hand.reduce((a,b)=>a+b,0);
  let aces = hand.filter(x=>x===11).length;
  while (sum > 21 && aces > 0) {
    sum -= 10; // Ace 11 -> 1
    aces -= 1;
  }
  return sum;
}

async function startBlackjack(interaction, ownerId) {
  const player = [drawCard(), drawCard()];
  const dealer = [drawCard()];
  setState(ownerId, { type: "blackjack", data: { player, dealer } }, 60000);

  const embed = new EmbedBuilder()
    .setTitle("🃏 Blackjack")
    .setDescription(`Sen: **${player.join(", ")}** (=${handValue(player)})\nBot: **${dealer.join(", ")}**`)
    .setFooter({ text: "Hit / Stand • Timeout 60s" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:bj:${ownerId}:hit`).setLabel("Hit").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:bj:${ownerId}:stand`).setLabel("Stand").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row], content: "" });
}

async function blackjackAction(interaction, ownerId, action) {
  const st = active.get(ownerId);
  if (!st || st.type !== "blackjack") {
    return interaction.reply({ content: "❌ Aktif Blackjack oyunun yok.", flags: MessageFlags.Ephemeral });
  }
  const { player, dealer } = st.data;

  if (action === "hit") {
    player.push(drawCard());
    const v = handValue(player);
    if (v > 21) {
      clear(ownerId);
      const embed = new EmbedBuilder().setTitle("🃏 Blackjack").setDescription(`Bust! 😵\nSen: **${v}**`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun:game:start:blackjack:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({ embeds: [embed], components: [row], content: "" });
    }
  }

  if (action === "stand") {
    // dealer draws to 17
    while (handValue(dealer) < 17) dealer.push(drawCard());
    const pv = handValue(player);
    const dv = handValue(dealer);
    clear(ownerId);

    let result = "Berabere!";
    if (dv > 21 || pv > dv) result = "Kazandın! 🎉";
    else if (pv < dv) result = "Kaybettin 😅";

    if (result.includes("Kazandın")) {
      try { Daily.bumpProgress(interaction.guildId, ownerId, "gamesPlayed", 1).catch(() => {}); } catch {}
    }

    const embed = new EmbedBuilder()
      .setTitle("🃏 Blackjack • Sonuç")
      .setDescription(`Sen: **${player.join(", ")}** (=${pv})\nBot: **${dealer.join(", ")}** (=${dv})\n\n**${result}**`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun:game:start:blackjack:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row], content: "" });
  }

  // update view
  const embed = new EmbedBuilder()
    .setTitle("🃏 Blackjack")
    .setDescription(`Sen: **${player.join(", ")}** (=${handValue(player)})\nBot: **${dealer.join(", ")}**`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:bj:${ownerId}:hit`).setLabel("Hit").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:bj:${ownerId}:stand`).setLabel("Stand").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row], content: "" });
}

// ===== Duel (quick pick) =====
async function startDuel(interaction, ownerId) {
  setState(ownerId, { type: "duel", data: { } }, 30000);
  const embed = new EmbedBuilder()
    .setTitle("⚔️ Duel")
    .setDescription("Seçimini yap (10 sn):")
    .setFooter({ text: "Taş / Kağıt / Makas • Solo duel" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:duel:pick:${ownerId}:rock`).setLabel("🪨 Taş").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:duel:pick:${ownerId}:paper`).setLabel("📄 Kağıt").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:duel:pick:${ownerId}:scissors`).setLabel("✂️ Makas").setStyle(ButtonStyle.Primary)
  );
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );
  return interaction.update({ embeds: [embed], components: [row, nav], content: "" });
}

async function duelPick(interaction, ownerId, choice) {
  const st = active.get(ownerId);
  if (!st || st.type !== "duel") {
    return interaction.reply({ content: "❌ Aktif Duel oyunun yok.", flags: MessageFlags.Ephemeral });
  }
  clear(ownerId);
  const botChoices = ["rock","paper","scissors"];
  const bot = botChoices[Math.floor(Math.random()*3)];
  let result="Berabere!";
  if (choice===bot) result="Berabere!";
  else if ((choice==="rock"&&bot==="scissors")||(choice==="paper"&&bot==="rock")||(choice==="scissors"&&bot==="paper")) result="Kazandın! 🎉";
  else result="Kaybettin 😅";

  if (result.includes("Kazandın")) {
    try { Daily.bumpProgress(interaction.guildId, ownerId, "gamesPlayed", 1).catch(() => {}); } catch {}
  }

  const map={rock:"🪨 Taş",paper:"📄 Kağıt",scissors:"✂️ Makas"};
  const embed = new EmbedBuilder()
    .setTitle("⚔️ Duel • Sonuç")
    .setDescription(`Sen: **${map[choice]}**\nBot: **${map[bot]}**\n\n**${result}**`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:start:duel:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );
  return interaction.update({ embeds: [embed], components: [row], content: "" });
}

// ===== Riddle =====
const RIDDLES = [
  { q: "Ne kadar çok alırsan, o kadar büyür. Nedir?", a: ["Borç", "Delik", "Para", "Sıcaklık"], c: 1 },
  { q: "Konuşur ama ağzı yoktur. Nedir?", a: ["Rüzgar", "Saat", "Kitap", "Gölge"], c: 1 },
  { q: "Beni kırmadan kullanamazsın. Nedir?", a: ["Yumurta", "Cam", "Kalem", "Kilit"], c: 0 },
];

async function startRiddle(interaction, ownerId) {
  const item = RIDDLES[Math.floor(Math.random()*RIDDLES.length)];
  setState(ownerId, { type: "riddle", data: { correct: item.c } }, 20000);

  const embed = new EmbedBuilder()
    .setTitle("🧩 Riddle")
    .setDescription(`**${item.q}**\nButonla cevapla.`)
    .setFooter({ text: "Timeout 20s" });

  const row = new ActionRowBuilder().addComponents(
    ...item.a.map((txt, i) => new ButtonBuilder()
      .setCustomId(`fun:game:riddle:ans:${ownerId}:${i}:${item.c}`)
      .setLabel(txt)
      .setStyle(ButtonStyle.Primary)
    )
  );

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row, nav], content: "" });
}

async function riddleAnswer(interaction, ownerId, choice, correct) {
  const st = active.get(ownerId);
  if (!st || st.type !== "riddle") {
    return interaction.reply({ content: "❌ Aktif Riddle oyunun yok.", flags: MessageFlags.Ephemeral });
  }
  clear(ownerId);
  const isCorrect = Number(choice) === Number(correct);
  if (isCorrect) {
    try { Daily.bumpProgress(interaction.guildId, ownerId, "gamesPlayed", 1).catch(() => {}); } catch {}
  }
  const embed = new EmbedBuilder()
    .setTitle(isCorrect ? "✅ Doğru!" : "❌ Yanlış!")
    .setDescription(isCorrect ? "🎯 Günlük görev ilerledi." : "Bir dahakine 🙂");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:game:start:riddle:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:game:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
  );
  return interaction.update({ embeds: [embed], components: [row], content: "" });
}


module.exports = {
  renderHome,
  startReaction,
  react,
  startGuess,
  pickGuess,
  startMath,
  answerMath,
  startCoinflip,
  startDice,
  startRps,
  playRps,
  startBlackjack,
  blackjackAction,
  startDuel,
  duelPick,
  startRiddle,
  riddleAnswer,
};