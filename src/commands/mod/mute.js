const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireMod } = require("../../permissions");
const { logModeration } = require("../../logger");
const { getGuild } = require("../../store/settings");
const { buildModlogEmbed } = require("../../utils/modlogEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Bir kullanıcıyı süreli olarak susturur (timeout).")
    .addUserOption((o) => o.setName("kullanici").setDescription("Susturulacak kullanıcı").setRequired(true))
    .addIntegerOption((o) => o.setName("dakika").setDescription("Süre (dakika)").setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption((o) => o.setName("sebep").setDescription("Sebep (opsiyonel)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!(await requireMod(interaction))) return;

    const user = interaction.options.getUser("kullanici", true);
    const minutes = interaction.options.getInteger("dakika", true);
    const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi.";

    await interaction.deferReply({ ephemeral: true });

    try {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.editReply("❌ Kullanıcı sunucuda bulunamadı.");
      if (!member.moderatable) return interaction.editReply("❌ Bu kullanıcıya timeout atamıyorum (rol hiyerarşisi / yetki).");

      const ms = minutes * 60 * 1000;
      await member.timeout(ms, reason);

      await interaction.editReply(`✅ **${user.tag}** ${minutes} dk timeout aldı.
Sebep: **${reason}**`);

      const cfg = getGuild(interaction.guildId);
      const embed = buildModlogEmbed({
        action: "MUTE",
        actor: interaction.user,
        target: member,
        reason,
        duration: `${minutes} dakika`,
        channel: interaction.channel,
      });
      await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
    } catch (err) {
      console.error("[mute] error:", err);
      await interaction.editReply("❌ Mute/timeout işlemi başarısız oldu.");
    }
  },
};
