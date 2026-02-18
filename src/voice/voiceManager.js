const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const { getGuild, setGuild } = require("../store/settings");
const { sendLog } = require("../utils/log");

const connections = new Map(); // guildId -> { connection, channelId, ghostMode, retries }

async function connect(client, guildId, channelId, { ghostMode = true } = {}) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { ok: false, reason: "Guild bulunamadı." };

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return { ok: false, reason: "Kanal bulunamadı." };

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: Boolean(ghostMode),
  });

  // Watchdog
  const entry = { connection, channelId: channel.id, ghostMode: Boolean(ghostMode), retries: 0 };
  connections.set(guild.id, entry);

  connection.on("stateChange", async (oldState, newState) => {
    if (newState.status === VoiceConnectionStatus.Disconnected) {
      // Reconnect strategy: try a few times, then give up + log
      await handleDisconnect(client, guild.id);
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 12_000);
    return { ok: true, channelName: channel.name };
  } catch (e) {
    try { connection.destroy(); } catch {}
    connections.delete(guild.id);
    return { ok: false, reason: "Ready timeout (voice/UDP veya izin sorunu olabilir)." };
  }
}

async function handleDisconnect(client, guildId) {
  const entry = connections.get(guildId);
  if (!entry) return;

  entry.retries += 1;

  const cfg = getGuild(guildId);
  if (!cfg.voice.enabled || !cfg.voice.mascotChannelId) {
    try { entry.connection.destroy(); } catch {}
    connections.delete(guildId);
    return;
  }

  if (entry.retries > 3) {
    await sendLog(client, `🎧 Voice watchdog: **${guildId}** 3 kez bağlantı düştü. Otomatik denemeyi bıraktım.`);
    try { entry.connection.destroy(); } catch {}
    connections.delete(guildId);
    return;
  }

  await sendLog(client, `🎧 Voice watchdog: bağlantı düştü, tekrar deniyorum... (${entry.retries}/3)`);

  // Backoff
  await new Promise(r => setTimeout(r, 3000 * entry.retries));

  // Try reconnect
  await connect(client, guildId, cfg.voice.mascotChannelId, { ghostMode: cfg.voice.ghostMode });
}

async function restoreAll(client) {
  for (const [guildId, data] of Object.entries(require("../store/settings").getGuild ? {} : {})) {
    // not used
  }
  // We only restore for guilds the bot is in by reading settings.json keys
  const fs = require("fs");
  const path = require("path");
  const FILE = path.join(__dirname, "..", "store", "settings.json");
  let all = {};
  try { all = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { all = {}; }

  for (const guildId of Object.keys(all)) {
    const cfg = getGuild(guildId);
    if (cfg.voice?.enabled && cfg.voice?.mascotChannelId) {
      await connect(client, guildId, cfg.voice.mascotChannelId, { ghostMode: cfg.voice.ghostMode })
        .then(res => {
          if (res.ok) sendLog(client, `🎧 Voice restore: **${guildId}** kanala bağlandım.`);
        })
        .catch(() => {});
    }
  }
}

async function disconnect(client, guildId) {
  const entry = connections.get(guildId);
  if (entry) {
    try { entry.connection.destroy(); } catch {}
    connections.delete(guildId);
  }
  const cfg = getGuild(guildId);
  setGuild(guildId, { voice: { ...cfg.voice, enabled: false, mascotChannelId: null } });
  await sendLog(client, `🎧 Voice: **${guildId}** mascot kapatıldı.`);
}

module.exports = { connect, restoreAll, disconnect };
