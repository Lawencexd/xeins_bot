const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireMod } = require("../../permissions");
const { logModeration } = require("../../logger");
const { getGuild } = require("../../store/settings");
const { buildModlogEmbed } = require("../../utils/modlogEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Bulunduğun kanalın yavaş modunu ayarlar.")
    .addIntegerOption((o) =>
      o.setName("saniye").setDescription("0-21600 saniye").setRequired(true).setMinValue(0).setMaxValue(21600)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!(await requireMod(interaction))) return;
    const seconds = interaction.options.getInteger("saniye", true);

    await interaction.deferReply({ ephemeral: true });

    try {
      await interaction.channel.setRateLimitPerUser(seconds);
      await interaction.editReply(`⏱️ Slowmode: **${seconds}s** olarak ayarlandı.`);

      const cfg = getGuild(interaction.guildId);
      const embed = buildModlogEmbed({
        action: "SLOWMODE",
        actor: interaction.user,
        channel: interaction.channel,
        extraFields: [{ name: "Saniye", value: `${seconds}`, inline: true }],
      });
      await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
    } catch (err) {
      console.error("[slowmode] error:", err);
      await interaction.editReply("❌ Slowmode ayarlanamadı. Yetkileri kontrol et.");
    }
  },
};
