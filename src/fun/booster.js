const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

function renderBooster(interaction, ownerId) {
  const embed = new EmbedBuilder()
    .setTitle("💎 Booster Özel")
    .setDescription(
      "Sunucu booster’larına özel avantajlar:\n\n" +
      "• Özel Booster Rolü\n" +
      "• 2 Emoji / Ses ekletme hakkı\n" +
      "• Öncelikli konuşmacı\n" +
      "• Özel etkinlik erişimi"
    )
    .setFooter({ text: "Xeins 4.0 • Booster System Stable" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fun:home:${ownerId}`)
      .setLabel("Home")
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds: [embed], components: [row], content: "" });
}

module.exports = { renderBooster };