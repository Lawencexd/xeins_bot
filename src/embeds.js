const { EmbedBuilder } = require("discord.js");

function basicEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

module.exports = { basicEmbed };
