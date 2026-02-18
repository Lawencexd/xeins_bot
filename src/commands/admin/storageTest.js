const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { guildDoc, load, set, get, flushNow } = require("../../core/storage");
const { requireAdmin } = require("../../permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("storage-test")
    .setDescription("Core storage test (admin-only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const doc = guildDoc(interaction.guildId, "stage1_test");
    await load(doc, { counter: 0, lastBy: null, updatedAt: null });

    await set(doc, (d) => ({
      ...d,
      counter: (d.counter || 0) + 1,
      lastBy: interaction.user.id,
      updatedAt: new Date().toISOString(),
    }));

    await flushNow(doc);
    const data = get(doc);

    await interaction.editReply(
      `✅ Storage OK\n` +
      `• doc: \`${doc}\`\n` +
      `• counter: \`${data.counter}\`\n` +
      `• lastBy: <@${data.lastBy}>\n`
    );
  },
};