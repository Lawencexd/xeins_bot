const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const { requireAdmin } = require("../../permissions");
const { getGuild, setGuild } = require("../../store/settings");
const voiceManager = require("../../voice/voiceManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("joinvoice")
    .setDescription("Botu seçtiğin ses kanalına bağlar ve maskot gibi içeride tutar (admin-only).")
    .addChannelOption(opt =>
      opt
        .setName("kanal")
        .setDescription("Bağlanılacak ses kanalı")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .addBooleanOption(opt =>
      opt
        .setName("ghost")
        .setDescription("Ghost mod (önerilen): selfMute + selfDeaf (kimseyi rahatsız etmez)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    if (!(await requireAdmin(interaction))) return;

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel("kanal", true);
    const ghost = interaction.options.getBoolean("ghost");
    const ghostMode = ghost === null ? true : Boolean(ghost);

    const cfg = getGuild(interaction.guildId);
    setGuild(interaction.guildId, {
      voice: { ...cfg.voice, enabled: true, mascotChannelId: channel.id, ghostMode }
    });

    const res = await voiceManager.connect(client, interaction.guildId, channel.id, { ghostMode });
    if (!res.ok) {
      return interaction.editReply(`❌ Bağlanamadım: ${res.reason}`);
    }

    return interaction.editReply(
      `✅ **${res.channelName}** kanalına bağlandım.
` +
      `Mod: **${ghostMode ? "Ghost" : "Normal"}**
` +
      `Voice Watchdog: **Açık** (düşersem geri girmeyi denerim)`
    );
  },
};
