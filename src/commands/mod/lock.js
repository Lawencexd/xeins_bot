const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireMod } = require("../../permissions");
const { logModeration } = require("../../logger");
const { getGuild } = require("../../store/settings");
const { buildModlogEmbed } = require("../../utils/modlogEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Bulunduğun kanalı kilitler (mesaj yazmayı kapatır).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!(await requireMod(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      await interaction.editReply("🔒 Kanal kilitlendi.");

      const cfg = getGuild(interaction.guildId);
      const embed = buildModlogEmbed({
        action: "LOCK",
        actor: interaction.user,
        channel: interaction.channel,
      });
      await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
    } catch (err) {
      console.error("[lock] error:", err);
      await interaction.editReply("❌ Kanal kilitleme başarısız oldu. Yetkileri kontrol et.");
    }
  },
};
