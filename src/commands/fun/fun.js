const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { append } = require("../../utils/persistLog");

function mainEmbed() {
  return new EmbedBuilder()
    .setTitle("🎉 Fun Panel")
    .setDescription("Aşağıdan bir kategori seç. (Hepsi tek panelden, sade.)")
    .addFields(
      { name: "🎮 Games", value: "Mini oyunlar ve challenge'lar", inline: true },
      { name: "🧠 Quiz", value: "Kategori seçmeli quiz'ler", inline: true },
      { name: "🎯 Daily", value: "Günlük görevler ve ödüller", inline: true },
      { name: "💞 Relationship", value: "Etkileşim & bağ sistemi", inline: true },
      { name: "🏆 Leaderboard", value: "Haftalık sıralamalar", inline: true },
      { name: "💎 Booster", value: "Booster özel avantajlar", inline: true }
    );
}

function menuRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`fun:menu:${ownerId}`)
      .setPlaceholder("Bir kategori seç…")
      .addOptions(
        { label: "Actions", value: "actions", emoji: "🤝" },
          { label: "Games", value: "games", emoji: "🎮" },
        { label: "Quiz", value: "quiz", emoji: "🧠" },
        { label: "Daily", value: "daily", emoji: "🎯" },
        { label: "Relationship", value: "rel", emoji: "💞" },
        { label: "Leaderboard", value: "lb", emoji: "🏆" },
        { label: "Booster", value: "booster", emoji: "💎" }
      )
  );
}

function navRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fun:home:${ownerId}`)
      .setLabel("Home")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`fun:close:${ownerId}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fun")
    .setDescription("Eğlence panelini açar (mini oyunlar, quiz, görevler, relationship)."),

  async execute(interaction, client) {
    if (!interaction.inGuild?.() || !interaction.guildId) {
      return interaction.reply({ content: "❌ Bu komut sadece sunucuda kullanılabilir.", flags: MessageFlags.Ephemeral });
    }

    try {
      // lightweight activity mark for watchdog
      try { client.__lastInteractionAt = Date.now(); } catch {}
      await interaction.reply({
        embeds: [mainEmbed()],
        components: [menuRow(interaction.user.id), navRow(interaction.user.id)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      append("funCommandError", String(e?.message || e));
    }
  },
};