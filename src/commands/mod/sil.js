const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireMod } = require("../../permissions");
const { buildConfirmMessage } = require("../../utils/confirmUI");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sil")
    .setDescription("Bulunduğun kanalda mesaj siler (1-100). (2 adımlı onay)")
    .addIntegerOption((o) =>
      o.setName("adet").setDescription("Kaç mesaj silinsin? (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!(await requireMod(interaction))) return;

    const amount = interaction.options.getInteger("adet", true);

    const key = `${interaction.id}:${interaction.user.id}:purge:${interaction.channelId}`;
    const msg = buildConfirmMessage(interaction, {
      key,
      title: "🧹 Silme Onayı",
      description: `Bu kanalda **${amount}** mesaj silinecek.\nBu işlem geri alınamaz.`,
      payload: {
        type: "purge",
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        moderatorId: interaction.user.id,
        amount
      }
    });

    return interaction.reply(msg);
  },
};
