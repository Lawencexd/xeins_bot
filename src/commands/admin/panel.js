const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { requireAdmin } = require("../../permissions");
const { getGuild } = require("../../store/settings");

function buildPanelEmbed(channel) {
  return new EmbedBuilder()
    .setTitle("🛠️ Xein Panel")
    .setDescription(
      "Butonlarla hızlı moderasyon / kanal kontrolü.\n\n⚠️ Butonlar **sadece adminler** için çalışır."
    )
    .addFields(
      { name: "Kanal", value: `${channel} (\`${channel.id}\`)`, inline: false }
    )
    .setTimestamp();
}

function buildPanelRows(targetId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("panel_lock").setLabel("Lock").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
    new ButtonBuilder().setCustomId("panel_unlock").setLabel("Unlock").setStyle(ButtonStyle.Success).setEmoji("🔓"),
    new ButtonBuilder().setCustomId("panel_purge10").setLabel("Sil 10").setStyle(ButtonStyle.Secondary).setEmoji("🧹"),
    new ButtonBuilder().setCustomId("panel_purge50").setLabel("Sil 50").setStyle(ButtonStyle.Secondary).setEmoji("🧹")
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("panel_slow_off").setLabel("Slow Off").setStyle(ButtonStyle.Secondary).setEmoji("⚡"),
    new ButtonBuilder().setCustomId("panel_slow_5").setLabel("5s").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("panel_slow_15").setLabel("15s").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("panel_slow_30").setLabel("30s").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("panel_close").setLabel("Kapat").setStyle(ButtonStyle.Secondary).setEmoji("✖️")
  );

  return [row1, row2];
}

function buildUserRow(targetId) {
  if (!targetId) return null;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`panel_mute10:${targetId}`).setLabel("Mute 10m").setStyle(ButtonStyle.Secondary).setEmoji("🔇"),
    new ButtonBuilder().setCustomId(`panel_unmute:${targetId}`).setLabel("Unmute").setStyle(ButtonStyle.Secondary).setEmoji("🔊"),
    new ButtonBuilder().setCustomId(`panel_kick:${targetId}`).setLabel("Kick").setStyle(ButtonStyle.Danger).setEmoji("👢"),
    new ButtonBuilder().setCustomId(`panel_ban:${targetId}`).setLabel("Ban").setStyle(ButtonStyle.Danger).setEmoji("🔨")
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Kanal yönetim paneli (butonlu) (admin-only)")
    .addUserOption((o) =>
      o
        .setName("target")
        .setDescription("Hızlı işlem yapılacak kullanıcı (opsiyonel)")
        .setRequired(false)
    )
    .addBooleanOption((o) =>
      o
        .setName("public")
        .setDescription("Paneli kanala açık gönder (varsayılan: gizli)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const cfg = getGuild(interaction.guildId);
    const target = interaction.options.getUser("target");
    const wantsPublic = interaction.options.getBoolean("public") === true;

    const ephemeral = cfg.features && cfg.features.privacyMode ? true : !wantsPublic;

    const embed = buildPanelEmbed(interaction.channel);

    if (target) {
      embed.addFields({
        name: "Hedef",
        value: `${target} (\`${target.id}\`)`,
        inline: false
      });
    }

    const targetId = target ? target.id : null;

    const rows = buildPanelRows(targetId);
    const userRow = buildUserRow(targetId);
    if (userRow) rows.push(userRow);

    return interaction.reply({
      ephemeral: ephemeral,
      embeds: [embed],
      components: rows
    });
  },

  // used by button handler
  buildPanelEmbed: buildPanelEmbed,
  buildPanelRows: buildPanelRows
};
