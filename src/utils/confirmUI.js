const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const confirmStore = require("./confirmStore");

/**
 * Create a 2-step confirmation panel.
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {object} opts
 * @param {string} opts.key unique key for store
 * @param {string} opts.title embed title
 * @param {string} opts.description embed desc
 * @param {object} opts.payload store payload (action data)
 */
function buildConfirmMessage(interaction, { key, title, description, payload }) {
  confirmStore.put(key, payload, 60_000);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description + "\n\n⏳ 60 saniye içinde onay vermezsen iptal olur.")
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm_yes:${key}`).setLabel("Onayla").setStyle(ButtonStyle.Danger).setEmoji("✅"),
    new ButtonBuilder().setCustomId(`confirm_no:${key}`).setLabel("İptal").setStyle(ButtonStyle.Secondary).setEmoji("✖️")
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

module.exports = { buildConfirmMessage };
