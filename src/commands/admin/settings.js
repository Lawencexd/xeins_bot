const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const { getGuild } = require("../../store/settings");
const { requireAdmin } = require("../../permissions");
const state = require("../../state");

// NOTE: This command only opens the Settings Panel.
// All actions (show / setlink / autorole / privacy / voice) are handled via component interactions
// inside events/InteractionCreate.js. This keeps the slash command list clean.

function buildSettingsEmbed(cfg) {
  const privacy = cfg?.features?.privacyMode ? "ON" : "OFF";
  const voiceEnabled = cfg?.voice?.enabled ? "ON" : "OFF";
  const ghost = cfg?.voice?.ghostMode ? "ON" : "OFF";

  return new EmbedBuilder()
    .setTitle("⚙️ Xein Settings")
    .setDescription("Aşağıdan bir ayar seç. (Sadece adminler)")
    .addFields(
      { name: "Privacy", value: privacy, inline: true },
      { name: "Voice", value: `Enabled: ${voiceEnabled}\nGhost: ${ghost}`, inline: true },
    )
    .setTimestamp();
}

function buildSettingsMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("settings:menu")
      .setPlaceholder("Bir ayar seç…")
      .addOptions(
        { label: "Ayarları Göster", value: "show", emoji: "📋" },
        { label: "Link Güncelle", value: "links", emoji: "🔗" },
        { label: "Auto Role", value: "autorole", emoji: "🎭" },
        { label: "Privacy Mode", value: "privacy", emoji: "🔒" },
        { label: "Voice (Maskot)", value: "voice", emoji: "🔊" },
        { label: "Channels", value: "channels", emoji: "📡" },
        { label: "Features", value: "features", emoji: "🎛️" },
        { label: "System", value: "system", emoji: "🧠" },
        { label: "History", value: "history", emoji: "🕓" },
      )
  );
}

function buildFooterRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("settings:close")
      .setLabel("Kapat")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✖️")
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Sunucu ayarlarını panel üzerinden yönet (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const cfg = getGuild(interaction.guildId);

    const msg = await interaction.reply({
      embeds: [buildSettingsEmbed(cfg)],
      components: [buildSettingsMenu(), buildFooterRow()],
      flags: MessageFlags.Ephemeral,
      fetchReply: true
    });

    try {
      if (msg && msg.id) {
        state.settingsPanels.set(msg.id, {
          ownerId: interaction.user.id,
          guildId: interaction.guildId,
          createdAt: Date.now(),
        });
      }
    } catch (_) {}

    return;
  },
};
