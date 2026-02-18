const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireMod } = require("../../permissions");
const { logModeration } = require("../../logger");
const { getGuild } = require("../../store/settings");
const { buildModlogEmbed } = require("../../utils/modlogEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Bulunduğun kanalın kilidini açar (mesaj yazmayı açar).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!(await requireMod(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      await interaction.editReply("🔓 Kanalın kilidi açıldı.");

      const cfg = getGuild(interaction.guildId);
      const embed = buildModlogEmbed({
        action: "UNLOCK",
        actor: interaction.user,
        channel: interaction.channel,
      });
      await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
    } catch (err) {
      console.error("[unlock] error:", err);
      await interaction.editReply("❌ Kanal kilidi açma başarısız oldu. Yetkileri kontrol et.");
    }
  },
};
