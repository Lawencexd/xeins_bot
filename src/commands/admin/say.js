const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { requireAdmin } = require("../../permissions");
const { getGuildConfig } = require("../../config/guildConfig");
const { logModeration } = require("../../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot seçtiğin kanala (veya bulunduğun kanala) mesaj gönderir.")
    .addStringOption((o) => o.setName("mesaj").setDescription("Gönderilecek mesaj").setRequired(true))
    .addChannelOption((o) => o.setName("kanal").setDescription("Mesajın gideceği kanal (opsiyonel)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const text = interaction.options.getString("mesaj", true);
    const channel = interaction.options.getChannel("kanal") || interaction.channel;

    await interaction.deferReply({ ephemeral: true });

    try {
      if (!channel.isTextBased?.()) return interaction.editReply("❌ Seçtiğin kanal metin kanalı değil.");
      await channel.send({ content: text });
      await interaction.editReply(`✅ Mesaj gönderildi: ${channel}`);

      const cfg = await getGuildConfig(interaction.guildId);
      const embed = new EmbedBuilder()
        .setTitle("📣 /say")
        .setColor(0x0a84ff)
        .addFields(
          { name: "Yetkili", value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: false },
          { name: "Kanal", value: `${channel} (\`${channel.id}\`)`, inline: false },
          { name: "Mesaj", value: text.slice(0, 1024), inline: false }
        )
        .setTimestamp();
      await logModeration(interaction.guild, cfg.MODLOG_CHANNEL_ID, embed);
    } catch (err) {
      console.error("[say] error:", err);
      await interaction.editReply("❌ Mesaj gönderilemedi.");
    }
  },
};
