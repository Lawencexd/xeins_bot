const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { requireAdmin } = require("../../permissions");
const { getGuildConfig } = require("../../config/guildConfig");
const { logModeration } = require("../../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Adminler için hızlı anket (✅/❌).")
    .addStringOption((o) => o.setName("soru").setDescription("Anket sorusu").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const question = interaction.options.getString("soru", true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const embed = new EmbedBuilder()
        .setTitle("📊 Anket")
        .setDescription(question)
        .setColor(0xff2d55)
        .setFooter({ text: `Oylama başlatan: ${interaction.user.tag}` })
        .setTimestamp();

      const msg = await interaction.channel.send({ embeds: [embed] });
      await msg.react("✅");
      await msg.react("❌");

      await interaction.editReply("✅ Anket oluşturuldu.");

      const cfg = await getGuildConfig(interaction.guildId);
      const logEmbed = new EmbedBuilder()
        .setTitle("📊 /poll")
        .setColor(0xff2d55)
        .addFields(
          { name: "Yetkili", value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: false },
          { name: "Kanal", value: `${interaction.channel} (\`${interaction.channelId}\`)`, inline: false },
          { name: "Soru", value: question.slice(0, 1024), inline: false }
        )
        .setTimestamp();
      await logModeration(interaction.guild, cfg.MODLOG_CHANNEL_ID, logEmbed);
    } catch (err) {
      console.error("[poll] error:", err);
      await interaction.editReply("❌ Anket oluşturulamadı.");
    }
  },
};
