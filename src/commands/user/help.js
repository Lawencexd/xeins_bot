const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

function buildHelpEmbed(category = "home") {
  // Button customId'lerini kategoriye çevir
  const map = { help_home: "home", help_mod: "mod", help_admin: "admin", help_user: "user" };
  if (typeof category === "string" && map[category]) category = map[category];
  const base = new EmbedBuilder()
    .setColor(0x8b0000)
    .setFooter({ text: "Xeİns Bot • Help Panel" });

  if (category === "home") {
    return base
      .setTitle("📖 Xeins Bot Komutları")
      .setDescription(
        "Aşağıdaki butonlardan kategori seç.\n" +
          "Komutlar **slash** olarak kullanılır: `/komut`"
      )
      .addFields(
        { name: "🛡️ Moderasyon", value: "`/kick` `/mute` `/unmute` `/sil` `/slowmode` `/lock` `/unlock`" },
        { name: "👑 Admin", value: "`/settings` `/setchannels` `/panel` `/log` `/poll` `/say` `/testboost` `/joinvoice` `/leavevoice` `/ban`" },
        { name: "🙂 Kullanıcı", value: "`/ping` `/avatar` `/status` `/profile`" }
      );
  }

  if (category === "mod") {
    return base
      .setTitle("🛡️ Moderasyon Komutları")
      .setDescription(
        "**/kick** → kullanıcıyı atar\n" +
          "**/mute** → susturur\n" +
          "**/unmute** → susturmayı kaldırır\n" +
          "**/sil** → mesaj siler\n" +
          "**/slowmode** → kanal yavaş modu\n" +
          "**/lock** → kanalı kilitler\n" +
          "**/unlock** → kilidi açar"
      );
  }

  if (category === "admin") {
    return base
      .setTitle("👑 Admin Komutları")
      .setDescription(
        "**/settings** → sunucu ayarları\n" +
          "**/setchannels** → log/thanks/boost kanal ayarla\n" +
          "**/poll** → anket (admin)\n" +
          "**/say** → bot adına mesaj\n" +
          "**/testboost** → boost/teşekkür test\n" +
          "**/joinvoice** → botu sese sok (maskot)\n**/leavevoice** → botu sesten çıkar\n**/panel** → butonlu admin panel\n**/log** → log cleanup/export\n**/ban** → 2 adımlı ban"
      );
  }

  if (category === "user") {
    return base
      .setTitle("🙂 Kullanıcı Komutları")
      .setDescription(
        "**/ping** → gecikme\n" +
          "**/avatar** → avatar göster\n" +
          "**/status** → bot durumu\n**/profile** → profil kartı"
      );
  }

  return buildHelpEmbed("home");
}

function buildHelpButtons(active = "home") {
  const map = { help_home: "home", help_mod: "mod", help_admin: "admin", help_user: "user" };
  if (typeof active === "string" && map[active]) active = map[active];
  const btn = (id, label, isActive) =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    btn("help_home", "Ana Menü", active === "home"),
    btn("help_mod", "Moderasyon", active === "mod"),
    btn("help_admin", "Admin", active === "admin"),
    btn("help_user", "Kullanıcı", active === "user")
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("help_close")
      .setLabel("Kapat")
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Butonlu komut menüsü"),

  async execute(interaction) {
    const embed = buildHelpEmbed("home");
    const components = buildHelpButtons("home");

    await interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true,
    });
  },

  // Export edelim ki InteractionCreate içinde kolayca kullanalım
  buildHelpEmbed,
  buildHelpButtons,
};
