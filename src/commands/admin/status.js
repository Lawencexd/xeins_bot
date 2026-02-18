const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const os = require("os");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Bot durumunu gösterir"),

  async execute(interaction) {
    const up = Math.floor(process.uptime());
    const ping = interaction.client.ws.ping;
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);

    const embed = new EmbedBuilder()
      .setTitle("🟢 Bot Durumu")
      .addFields(
        { name: "Ping", value: `${ping}ms`, inline: true },
        { name: "Uptime", value: `${up}s`, inline: true },
        { name: "RAM", value: `${mem} MB`, inline: true },
        { name: "Node", value: process.version, inline: true },
        { name: "CPU", value: `${os.cpus()[0]?.model || "N/A"}`, inline: false }
      )
      .setFooter({ text: "Xeins Bot" });

    await interaction.reply({ embeds: [embed] });
  }
};
