const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

const { requireAdmin } = require("../../permissions");
const { getGuild } = require("../../store/settings");
const state = require("../../state");
const { tail } = require("../../utils/persistLog");

function mb(n) {
  return Math.round((n / 1024 / 1024) * 10) / 10;
}

function shortBool(v) {
  return v ? "✅" : "❌";
}

function fmtChannel(id) {
  if (!id) return "(yok)";
  return `<#${id}> (\`${id}\`)`;
}


function lastLogLineForTag(text, tag) {
  try {
    const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      // format: [date] tag
      if (l.includes(`] ${tag}`)) return l;
    }
    return "Yok";
  } catch {
    return "Yok";
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("doctor")
    .setDescription("Bot tanılama: komutlar, ayarlar ve bağlantı durumu")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const client = interaction.client;
    const cfg = getGuild(interaction.guildId) || {};

    const mem = process.memoryUsage();
    const ping = Number.isFinite(client.ws.ping) ? client.ws.ping : -1;
    const wsStatus = client.ws && typeof client.ws.status !== "undefined" ? String(client.ws.status) : "?";
    const upSec = Math.floor(process.uptime());

    const env = {
      TOKEN: !!process.env.TOKEN,
      CLIENT_ID: !!process.env.CLIENT_ID,
      DEV_GUILD_ID: !!process.env.DEV_GUILD_ID,
      LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID || null,
      MODLOG_CHANNEL_ID: process.env.MODLOG_CHANNEL_ID || null,
      THANKS_CHANNEL_ID: process.env.THANKS_CHANNEL_ID || null,
      TEXT_CHANNEL_ID: process.env.TEXT_CHANNEL_ID || null
    };

    const loadedCommands = Array.from((client.commands || new Map()).keys()).sort();
    const cmdPreview = loadedCommands.slice(0, 50);
    const more = loadedCommands.length > cmdPreview.length ? `\n… ve ${loadedCommands.length - cmdPreview.length} daha` : "";

    const listenerCounts = {
      interactionCreate: client.listenerCount("interactionCreate"),
      guildMemberUpdate: client.listenerCount("guildMemberUpdate"),
      guildMemberAdd: client.listenerCount("guildMemberAdd"),
      ready: client.listenerCount("ready")
    };

    const storeChannels = (cfg.channels || {});
    const storeVoice = (cfg.voice || {});
    const storeFeatures = (cfg.features || {});

    
      // crash.log tail (kalıcı log) - Replit kapansa bile görülür
      const crashTailRaw = tail(200);
      const lastWatchdog = lastLogLineForTag(crashTailRaw, "watchdogReconnect");
      const lastReconnected = lastLogLineForTag(crashTailRaw, "watchdogReconnected");
      const lastDisconnect = lastLogLineForTag(crashTailRaw, "shardDisconnect");

      const crashTail = (crashTailRaw || "").toString().slice(0, 950) || "Yok";

const embed = new EmbedBuilder()
      .setTitle("🩺 Xein Bot Doctor")
      .setDescription("Bu komut, botun şu anki durumunu ve kritik ayarları gösterir.")
      .addFields(
        {
          name: "🧾 Son Crash Log (tail)",
          value: "```" + crashTail + "```",
          inline: false
        },
{
          name: "Çalışma Durumu",
          value:
            `Node: \`${process.version}\`\n` +
            `Uptime: \`${upSec}s\`\n` +
            `WS Ping: \`${ping >= 0 ? ping + "ms" : "?"}\`\n` +
            `WS Status: \`${wsStatus}\`\n` +
            `RAM: \`rss ${mb(mem.rss)}MB\` • \`heap ${mb(mem.heapUsed)}/${mb(mem.heapTotal)}MB\``,
          inline: false
        },
        {
          name: "Ayarlar (store/settings)",
          value:
            `privacyMode: **${storeFeatures.privacyMode ? "ON" : "OFF"}**\n` +
            `LOG_CHANNEL_ID: ${fmtChannel(storeChannels.LOG_CHANNEL_ID)}\n` +
            `MODLOG_CHANNEL_ID: ${fmtChannel(storeChannels.MODLOG_CHANNEL_ID)}\n` +
            `THANKS_CHANNEL_ID: ${fmtChannel(storeChannels.THANKS_CHANNEL_ID)}\n` +
            `voice.enabled: **${storeVoice.enabled ? "ON" : "OFF"}** • mascot: ${storeVoice.mascotChannelId ? fmtChannel(storeVoice.mascotChannelId) : "(yok)"}`,
          inline: false
        },
        {
          name: "Env / Secrets (değerler)",
          value:
            `TOKEN ${shortBool(env.TOKEN)}  CLIENT_ID ${shortBool(env.CLIENT_ID)}  DEV_GUILD_ID ${shortBool(env.DEV_GUILD_ID)}\n` +
            `LOG_CHANNEL_ID: ${fmtChannel(env.LOG_CHANNEL_ID)}\n` +
            `MODLOG_CHANNEL_ID: ${fmtChannel(env.MODLOG_CHANNEL_ID)}\n` +
            `THANKS_CHANNEL_ID: ${fmtChannel(env.THANKS_CHANNEL_ID)}\n` +
            `TEXT_CHANNEL_ID: ${fmtChannel(env.TEXT_CHANNEL_ID)}`,
          inline: false
        },
        {
          name: "Event dinleyicileri",
          value:
            `interactionCreate: **${listenerCounts.interactionCreate}**\n` +
            `guildMemberUpdate: **${listenerCounts.guildMemberUpdate}**\n` +
            `guildMemberAdd: **${listenerCounts.guildMemberAdd}**\n` +
            `ready: **${listenerCounts.ready}**`,
          inline: true
        },
        {
          name: `Yüklenen komutlar (${loadedCommands.length})`,
          value: cmdPreview.length ? cmdPreview.map((c) => `\`/${c}\``).join(" ") + more : "(komut yok)",
          inline: false
        }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
