const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Kullanıcının avatarını gösterir")
    .addUserOption(o => o.setName("user").setDescription("Kullanıcı").setRequired(false)),

  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });
    await interaction.reply({ content: url });
  }
};
