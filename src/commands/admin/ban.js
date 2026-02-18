const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireAdmin } = require("../../permissions");
const { buildConfirmMessage } = require("../../utils/confirmUI");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bir kullanıcıyı sunucudan yasaklar (ban). (2 adımlı onay)")
    .addUserOption((opt) => opt.setName("kullanici").setDescription("Banlanacak kullanıcı").setRequired(true))
    .addStringOption((opt) => opt.setName("sebep").setDescription("Sebep (opsiyonel)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const user = interaction.options.getUser("kullanici", true);
    const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi.";

    const key = `${interaction.id}:${interaction.user.id}:ban:${user.id}`;
    const msg = buildConfirmMessage(interaction, {
      key,
      title: "🔨 Ban Onayı",
      description: `**${user.tag}** kullanıcısını banlamak üzeresin.\nSebep: **${reason}**`,
      payload: {
        type: "ban",
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        moderatorId: interaction.user.id,
        targetId: user.id,
        reason
      }
    });

    return interaction.reply(msg);
  },
};
