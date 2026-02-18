const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireMod } = require("../../permissions");
const { logModeration } = require("../../logger");
const { getGuild } = require("../../store/settings");
const { buildModlogEmbed } = require("../../utils/modlogEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Bir kullanıcının timeout'unu kaldırır.")
    .addUserOption((o) => o.setName("kullanici").setDescription("Timeout'u kaldırılacak kullanıcı").setRequired(true))
    .addStringOption((o) => o.setName("sebep").setDescription("Sebep (opsiyonel)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!(await requireMod(interaction))) return;

    const user = interaction.options.getUser("kullanici", true);
    const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi.";

    await interaction.deferReply({ ephemeral: true });

    try {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.editReply("❌ Kullanıcı sunucuda bulunamadı.");
      if (!member.moderatable) return interaction.editReply("❌ Bu kullanıcıdan timeout kaldıramıyorum (rol hiyerarşisi / yetki).");

      await member.timeout(null, reason);
      await interaction.editReply(`✅ **${user.tag}** için timeout kaldırıldı.
Sebep: **${reason}**`);

      const cfg = getGuild(interaction.guildId);
      const embed = buildModlogEmbed({
        action: "UNMUTE",
        actor: interaction.user,
        target: member,
        reason,
        channel: interaction.channel,
      });
      await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
    } catch (err) {
      console.error("[unmute] error:", err);
      await interaction.editReply("❌ Unmute işlemi başarısız oldu.");
    }
  },
};
