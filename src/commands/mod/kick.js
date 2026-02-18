const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireMod } = require("../../permissions");
const { logModeration } = require("../../logger");
const { getGuild } = require("../../store/settings");
const { buildModlogEmbed } = require("../../utils/modlogEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Bir kullanıcıyı sunucudan atar (kick).")
    .addUserOption((opt) => opt.setName("kullanici").setDescription("Atılacak kullanıcı").setRequired(true))
    .addStringOption((opt) => opt.setName("sebep").setDescription("Sebep (opsiyonel)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    if (!(await requireMod(interaction))) return;

    const user = interaction.options.getUser("kullanici", true);
    const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi.";

    await interaction.deferReply({ ephemeral: true });

    try {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.editReply("❌ Kullanıcı sunucuda bulunamadı.");
      if (!member.kickable) return interaction.editReply("❌ Bu kullanıcıyı kickleyemiyorum (rol hiyerarşisi / yetki).");

      await member.kick(reason);

      await interaction.editReply(`✅ **${user.tag}** sunucudan atıldı.
Sebep: **${reason}**`);

      const cfg = getGuild(interaction.guildId);
      const embed = buildModlogEmbed({
        action: "KICK",
        actor: interaction.user,
        target: member,
        reason,
        channel: interaction.channel,
      });
      await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
    } catch (err) {
      console.error("[kick] error:", err);
      await interaction.editReply("❌ Kick işlemi başarısız oldu. Yetkilerimi kontrol et.");
    }
  },
};
