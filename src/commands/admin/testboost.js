const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { requireAdmin } = require("../../permissions");
const { getGuild } = require("../../store/settings");

// events/guildMemberUpdate exports helper(s)
const guildMemberUpdate = require("../../events/guildMemberUpdate");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("testboost")
    .setDescription("Boost teşekkür mesajını test eder (admin-only).")
    .addUserOption((o) =>
      o
        .setName("kullanici")
        .setDescription("Teşekkür edilecek kişi (opsiyonel)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const cfg = getGuild(interaction.guildId);
      const thanksId = (cfg && cfg.channels && cfg.channels.THANKS_CHANNEL_ID) || process.env.THANKS_CHANNEL_ID;

      if (!thanksId) {
        return interaction.editReply("❌ THANKS_CHANNEL_ID ayarlı değil. `/setchannels thanks:#kanal` ile ayarla ya da Secrets'a THANKS_CHANNEL_ID ekle.");
      }

      const targetUser = interaction.options.getUser("kullanici") || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return interaction.editReply("❌ Kullanıcı sunucuda bulunamadı.");

      const helper = guildMemberUpdate && guildMemberUpdate.sendBoosterThanks;
      if (typeof helper !== "function") {
        return interaction.editReply(
          `❌ Boost teşekkür sistemi bağlı değil (sendBoosterThanks bulunamadı).
✅ events/guildMemberUpdate.js içinde 'module.exports = { name, execute, sendBoosterThanks }' olmalı.`
        );
      }

      await helper({
        guild: interaction.guild,
        member,
        thanksChannelId: thanksId,
        messageOverride: guildMemberUpdate.BOOST_THANKS_MESSAGE(`${member}`),
      });

      await interaction.editReply(`✅ Test mesajı gönderildi: <#${thanksId}>`);
    } catch (err) {
      console.error("[testboost] error:", err);
      await interaction.editReply("❌ Testboost başarısız oldu.");
    }
  },
};
