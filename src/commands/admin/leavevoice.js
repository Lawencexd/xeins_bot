const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireAdmin } = require("../../permissions");
const voiceManager = require("../../voice/voiceManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leavevoice")
    .setDescription("Botun ses kanalından çıkmasını sağlar (admin-only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    if (!(await requireAdmin(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    await voiceManager.disconnect(client, interaction.guildId);
    return interaction.editReply("✅ Ses maskotu kapatıldı, kanaldan çıktım.");
  },
};
