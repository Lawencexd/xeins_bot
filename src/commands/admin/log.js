const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder
} = require("discord.js");
const { requireAdmin } = require("../../permissions");
const { getGuild } = require("../../store/settings");

function pickTarget(cfg, target) {
  if (target === "modlog") return cfg.channels.MODLOG_CHANNEL_ID;
  return cfg.channels.LOG_CHANNEL_ID;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("Log kanalı araçları (cleanup/export) (admin-only)")
    .addSubcommand(s =>
      s.setName("cleanup")
        .setDescription("Log kanalında eski mesajları temizle")
        .addStringOption(o =>
          o.setName("target")
            .setDescription("log | modlog")
            .setRequired(true)
            .addChoices(
              { name: "log", value: "log" },
              { name: "modlog", value: "modlog" }
            )
        )
        .addIntegerOption(o =>
          o.setName("days")
            .setDescription("Kaç günden eski mesajlar silinsin? (1-30)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(30)
        )
    )
    .addSubcommand(s =>
      s.setName("export")
        .setDescription("Log kanalından son mesajları JSON olarak dışa aktar")
        .addStringOption(o =>
          o.setName("target")
            .setDescription("log | modlog")
            .setRequired(true)
            .addChoices(
              { name: "log", value: "log" },
              { name: "modlog", value: "modlog" }
            )
        )
        .addIntegerOption(o =>
          o.setName("limit")
            .setDescription("Kaç mesaj? (10-200)")
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(200)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    const cfg = getGuild(interaction.guildId);
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getString("target", true);
    const channelId = pickTarget(cfg, target);

    const ch = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased?.()) {
      return interaction.editReply("❌ Hedef kanal bulunamadı veya yazı kanalı değil.");
    }

    if (sub === "cleanup") {
      const days = interaction.options.getInteger("days", true);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      let deletedTotal = 0;
      let lastId = undefined;

      // bulk delete 14 günden eskiyi silemez, o yüzden manuel silme
      for (let i = 0; i < 10; i++) {
        const batch = await ch.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
        if (!batch || batch.size === 0) break;

        const old = batch.filter(m => m.createdTimestamp < cutoff);
        if (old.size === 0) break;

        for (const m of old.values()) {
          await m.delete().catch(() => {});
          deletedTotal++;
        }

        lastId = batch.last()?.id;
      }

      return interaction.editReply(`✅ ${target} kanalında **${deletedTotal}** eski mesaj temizlendi.`);
    }

    if (sub === "export") {
      const limit = interaction.options.getInteger("limit", true);
      const msgs = await ch.messages.fetch({ limit }).catch(() => null);
      if (!msgs) return interaction.editReply("❌ Mesajlar çekilemedi.");

      const rows = [...msgs.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map(m => ({
          id: m.id,
          createdAt: new Date(m.createdTimestamp).toISOString(),
          author: { id: m.author?.id, tag: m.author?.tag },
          content: m.content,
          embeds: (m.embeds || []).map(e => ({
            title: e.title,
            description: e.description,
            fields: e.fields,
            footer: e.footer?.text
          }))
        }));

      const json = Buffer.from(JSON.stringify(rows, null, 2), "utf-8");
      const file = new AttachmentBuilder(json, { name: `${target}-export.json` });

      return interaction.editReply({ content: `✅ ${target} export hazır.`, files: [file] });
    }
  }
};
