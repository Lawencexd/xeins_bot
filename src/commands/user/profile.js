const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Kullanıcı profil kartı")
    .addUserOption(o =>
      o.setName("kullanici")
        .setDescription("Bir kullanıcı seç (boş bırakırsan sen)")
        .setRequired(false)
    ),

  defer: true,
  ephemeral: true,

  async execute(interaction) {
    const user = interaction.options.getUser("kullanici") || interaction.user;

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    // User banner / accent color
    const fetchedUser = await user.fetch().catch(() => user);
    const avatar = fetchedUser.displayAvatarURL({ size: 1024 });
    const banner = fetchedUser.bannerURL?.({ size: 1024 });

    const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
    const joinedAt = member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Bilinmiyor";

    const isBooster = Boolean(member?.premiumSinceTimestamp);
    const boosterSince = member?.premiumSinceTimestamp
      ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`
      : "—";

    const roles = member
      ? member.roles.cache
          .filter(r => r.id !== interaction.guild.id)
          .map(r => r.toString())
          .slice(0, 15)
      : [];

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${user.username} Profil`)
      .setDescription(`${user} (\`${user.id}\`)`)
      .setThumbnail(avatar)
      .addFields(
        { name: "Hesap Oluşturma", value: createdAt, inline: true },
        { name: "Sunucuya Katılım", value: joinedAt, inline: true },
        { name: "Boost", value: isBooster ? `✅ Booster (${boosterSince})` : "❌ Booster değil", inline: false }
      )
      .setFooter({ text: "Xein Bot • Profile" })
      .setTimestamp();

    if (roles.length) {
      embed.addFields({ name: `Roller (${Math.min(roles.length, 15)} gösteriliyor)`, value: roles.join(" "), inline: false });
    }

    if (banner) embed.setImage(banner);

    await interaction.editReply({ embeds: [embed] });
  }
};
