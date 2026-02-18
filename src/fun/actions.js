const {
  EmbedBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const Activity = require("./activity");
const Rel = require("./relationship");

// Panel-only action system (no slash spam).
// Note: keep text friendly / non-explicit.

const ACTIONS = [
  { key: "hug", label: "🤗 Hug", style: ButtonStyle.Primary, multi: 1 },
  { key: "kiss", label: "😚 Kiss", style: ButtonStyle.Secondary, multi: 1 },
  { key: "pat", label: "🐾 Pat", style: ButtonStyle.Primary, multi: 1 },
  { key: "cheer", label: "👏 Cheer", style: ButtonStyle.Success, multi: 1 },
  { key: "slap", label: "🖐️ Slap", style: ButtonStyle.Secondary, multi: 1 },
  { key: "protect", label: "🛡️ Protect", style: ButtonStyle.Success, multi: 1 },
  { key: "adopt", label: "🧸 Adopt", style: ButtonStyle.Primary, multi: 1 },
  { key: "ship", label: "🛳️ Ship", style: ButtonStyle.Primary, multi: 2 },
];

function homeEmbed() {
  return new EmbedBuilder()
    .setTitle("🤝 Eylemler")
    .setDescription("Bir eylem seç ve kullanıcı(ları) seç. (Panel içi, slash spam yok.)")
    .addFields(
      { name: "Sosyal", value: "Hug • Kiss • Pat • Cheer", inline: false },
      { name: "Eğlence", value: "Slap • Protect • Adopt • Ship", inline: false }
    )
    .setFooter({ text: "Actions panel • Stabil" });
}

function chunkButtons(ownerId, start, end) {
  const row = new ActionRowBuilder();
  ACTIONS.slice(start, end).forEach((a) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`fun:act:pick:${a.key}:${ownerId}`)
        .setLabel(a.label)
        .setStyle(a.style)
    );
  });
  return row;
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
    components: [chunkButtons(ownerId, 0, 4), chunkButtons(ownerId, 4, 8), navRow(ownerId)],
    content: "",
  });
}

async function openPicker(interaction, ownerId, actionKey) {
  const action = ACTIONS.find((a) => a.key === actionKey);
  if (!action) {
    return interaction.reply({ content: "❌ Bu eylem bulunamadı.", flags: MessageFlags.Ephemeral });
  }

  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`fun:act:do:${actionKey}:${ownerId}`)
      .setPlaceholder(action.multi === 2 ? "2 kullanıcı seç…" : "1 kullanıcı seç…")
      .setMinValues(action.multi)
      .setMaxValues(action.multi)
  );

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:act:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({
    embeds: [],
    components: [row, nav],
    content: `Seçim: **${actionKey}** → ${action.multi === 2 ? "2 kişi" : "1 kişi"} seç.`,
  });
}

function pickLine(action, from, toA, toB) {
  const lines = {
    hug: [
      `${from} ${toA}'e kocaman bir **hug** attı 🤗`,
      `${from} ${toA} ile sarıldı 🤗`,
    ],
    kiss: [
      `${from} ${toA}'e tatlı bir **kiss** gönderdi 😚`,
      `${from} ${toA}'e "öpücük!" dedi 😚`,
    ],
    pat: [
      `${from} ${toA} için yumuşacık bir **pat** bıraktı 🐾`,
      `${from} ${toA}'i **pat pat** yaptı 😄`,
    ],
    cheer: [
      `${from} ${toA}'i destekliyor: **"Yaparsın!"** 👏`,
      `${from} ${toA} için tezahürat yaptı 🎉`,
    ],
    slap: [
      `${from} ${toA}'e şaka amaçlı minicik bir **slap** attı 🖐️`,
      `${from} ${toA}'e "kendine gel" dedi 😅🖐️`,
    ],
    protect: [
      `${from} ${toA}'i korumaya aldı 🛡️`,
      `${from} ${toA} için kalkan oldu 🛡️`,
    ],
    adopt: [
      `${from} ${toA}'i "evlat edindi" 🧸 (tamamen eğlencesine)`,
      `${from} ${toA}'i ekibine kattı 🧸`,
    ],
    ship: [
      `${from} gemiyi sürdü: ${toA} + ${toB} = **ship** 🛳️✨`,
      `${from} ${toA} ve ${toB} için ship yaptı 🛳️`,
    ],
  };

  const arr = lines[action] || [`${from} bir eylem yaptı.`];
  return arr[Math.floor(Math.random() * arr.length)];
}

async function doAction(interaction, guildId, ownerId, actionKey, targetIds) {
  const ids = Array.isArray(targetIds) ? targetIds : [targetIds].filter(Boolean);

  const action = ACTIONS.find((a) => a.key === actionKey);
  if (!action) return interaction.reply({ content: "❌ Bu eylem bulunamadı.", flags: MessageFlags.Ephemeral });

  if (ids.length !== action.multi) {
    return interaction.reply({ content: "❌ Seçim sayısı hatalı.", flags: MessageFlags.Ephemeral });
  }

  const from = `<@${ownerId}>`;
  const toA = `<@${ids[0]}>`;
  const toB = ids[1] ? `<@${ids[1]}>` : null;

  // Activity tracking (lightweight)
  try { await Activity.markActive(guildId, ownerId); } catch {}
  try { if (actionKey === "hug") await Activity.bump(guildId, ownerId, "hugs", 1); } catch {}

  // Relationship interaction tracking (pair-based)
  try {
    if (action.multi === 1) {
      Rel.recordInteraction?.(guildId, ownerId, ids[0]).catch?.(() => {});
    } else if (actionKey === "ship") {
      // ship counts as pair interaction (owner ships pair)
      Rel.recordInteraction?.(guildId, ids[0], ids[1]).catch?.(() => {});
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle("🤝 Eylem")
    .setDescription(pickLine(actionKey, from, toA, toB));

  // Publicly post to channel so everyone can see (panel itself may be ephemeral)
  try {
    if (interaction.channel) await interaction.channel.send({ embeds: [embed] });
  } catch {}

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fun:act:pick:${actionKey}:${ownerId}`).setLabel("Tekrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fun:act:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [], components: [row], content: "✅ Gönderildi." });
}

module.exports = { renderHome, openPicker, doAction };