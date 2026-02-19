// src/index.js

require("dotenv").config();
const { startMonitorServer } = require("./monitor/server");

// ---- process crash & warning hooks (safe) ----
process.on("unhandledRejection", (reason) => {
  console.error("🔥 unhandledRejection:", reason);
  try { append("unhandledRejection", reason); } catch {}
});
process.on("uncaughtException", (err) => {
  console.error("🔥 uncaughtException:", err);
  try { append("uncaughtException", err); } catch {}
});
process.on("warning", (w) => {
  console.warn("⚠️ process warning:", w);
});
const { flushAll } = require("./core/storage");
const fs = require("fs");
const path = require("path");
const {
  Client,
  Collection,
  GatewayIntentBits,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection();


// ✅ Start local monitor server (health/stats)
try {
  startMonitorServer(client);
} catch (e) {
  console.error("[monitor] failed to start:", e);
}


// ----------------------
// Stability hooks (full)
// ----------------------
client.on("error", (err) => {
  console.error("⚠️ client error:", err);
  append("client error", err);
});
client.on("warn", (info) => {
  console.warn("⚠️ client warn:", info);
  append("client warn", info);
});
client.on("shardDisconnect", (event, shardId) => {
  append("shardDisconnect", { shardId, code: event?.code, reason: event?.reason });
});
client.on("shardReconnecting", (shardId) => {
  append("shardReconnecting", { shardId });
});
client.on("shardResume", (shardId, replayed) => {
  append("shardResume", { shardId, replayed });
});

// Event loop lag detector (donma tespiti)
let __lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const drift = now - __lastTick - 1000;
  __lastTick = now;
  if (drift > 5000) {
    console.warn(`[health] Event loop lag detected: +${drift}ms`);
    append("eventLoopLag", { driftMs: drift });
  }
}, 1000).unref();

// Zombie watchdog: online görünüp çalışmama durumunu toparlar
client.__lastReconnectAt = 0;
setInterval(async () => {
  try {
    const st = require("./state");
    const now = Date.now();
    const inactiveMs = now - (st.lastInteractionAt || now);
    const ping = Number.isFinite(client.ws?.ping) ? client.ws.ping : -1;
    const wsStatus = client.ws?.status;

    const shouldRecover =
      inactiveMs > 10 * 60 * 1000 &&
      (ping < 0 || ping > 2000 || wsStatus !== 0);

    if (!shouldRecover) return;

    if (now - (client.__lastReconnectAt || 0) < 5 * 60 * 1000) return;
    client.__lastReconnectAt = now;

    const payload = {
      inactiveSec: Math.floor(inactiveMs / 1000),
      ping,
      wsStatus,
    };
    console.warn("[watchdog] Zombie suspected. Reconnecting...", payload);
    append("watchdogReconnect", payload);

    try { await client.destroy(); } catch {}
    try {
      await client.login(process.env.TOKEN);
      append("watchdogReconnected", { ok: true });
    } catch (e) {
      console.error("[watchdog] Reconnect failed:", e);
      append("watchdogReconnected", { ok: false, error: String(e?.message || e) });
    }
  } catch (e) {
    append("watchdogLoopError", String(e?.message || e));
  }
}, 30 * 1000).unref();


// Gateway aktivitesi (watchdog için)
const state = require("./state");
client.on("raw", () => {
  state.lastGatewayActivityAt = Date.now();
});


// ----------------------
// Heartbeat (no-spam)
// ----------------------
const HEARTBEAT_FILE = path.join(__dirname, "store", "heartbeat.json");

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readHeartbeatState() {
  try {
    if (!fs.existsSync(HEARTBEAT_FILE)) return null;
    const raw = fs.readFileSync(HEARTBEAT_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeHeartbeatState(state) {
  try {
    ensureDirForFile(HEARTBEAT_FILE);
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.warn("⚠️ Heartbeat state yazılamadı:", e?.message || e);
  }
}

function formatUptime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  const parts = [];
  if (d) parts.push(`${d}g`);
  if (h) parts.push(`${h}s`);
  if (m) parts.push(`${m}d`);
  parts.push(`${s}sn`);
  return parts.join(" ");
}

function buildHeartbeatEmbed() {
  const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const ping = Number.isFinite(client.ws.ping) ? client.ws.ping : -1;
  const up = formatUptime(process.uptime());

  const now = Date.now();
  const state = require("./state");
  const lastIntAgo = Math.floor((now - (state.lastInteractionAt || now)) / 1000);
  const lastGwAgo = Math.floor((now - (state.lastGatewayActivityAt || now)) / 1000);
  const wsStatus = client.ws?.status ?? "?";

  return new EmbedBuilder()
    .setTitle("🫀 Bot Heartbeat")
    .setDescription("Bu mesaj **editlenerek** güncellenir (spam yok).")
    .addFields(
      { name: "WS Ping", value: ping >= 0 ? `${ping}ms` : "?", inline: true },
      { name: "WS Status", value: String(wsStatus), inline: true },
      { name: "RAM", value: `${memMb} MB`, inline: true },
      { name: "Uptime", value: up, inline: true },
      { name: "Son Interaction", value: `${lastIntAgo}s önce`, inline: true },
      { name: "Son Gateway Aktivitesi", value: `${lastGwAgo}s önce`, inline: true }
    )
    .setFooter({ text: `Xeins Bot • ${new Date().toLocaleString()}` });
}

async function getLogChannel() {
  const id = process.env.LOG_CHANNEL_ID;
  if (!id) return null;

  try {
    const ch = await client.channels.fetch(id);
    if (!ch) return null;

    // Sadece yazı kanalı gibi şeylere yazalım
    const okTypes = [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
    ];
    if (!okTypes.includes(ch.type)) return null;

    return ch;
  } catch {
    return null;
  }
}

async function upsertHeartbeatMessage() {
  const logChannel = await getLogChannel();
  if (!logChannel) {
    console.warn("⚠️ LOG_CHANNEL_ID yok/kanal bulunamadı. Heartbeat kanala yazılmayacak.");
    return { message: null, channelId: null };
  }

  const state = readHeartbeatState();
  const embed = buildHeartbeatEmbed();

  // 1) Önceden mesaj kaydı varsa onu bulup edit dene
  if (state?.channelId === logChannel.id && state?.messageId) {
    try {
      const oldMsg = await logChannel.messages.fetch(state.messageId);
      if (oldMsg) {
        await oldMsg.edit({ embeds: [embed] });
        return { message: oldMsg, channelId: logChannel.id };
      }
    } catch {
      // Mesaj silinmiş olabilir -> aşağıda yenisini atacağız
    }
  }

  // 2) Yoksa yeni mesaj at
  try {
    const msg = await logChannel.send({ embeds: [embed] });
    writeHeartbeatState({ channelId: logChannel.id, messageId: msg.id });
    return { message: msg, channelId: logChannel.id };
  } catch (e) {
    console.warn("⚠️ Heartbeat mesajı gönderilemedi:", e?.message || e);
    return { message: null, channelId: logChannel.id };
  }
}

let heartbeatMsg = null;
async function startHeartbeatLoop() {
  // İlk "upsert"
  const res = await upsertHeartbeatMessage();
  heartbeatMsg = res.message;

  // Sürekli edit döngüsü
  setInterval(async () => {
    const embed = buildHeartbeatEmbed();

    // Eğer mesaj yoksa tekrar upsert dene
    if (!heartbeatMsg) {
      const again = await upsertHeartbeatMessage();
      heartbeatMsg = again.message;
      return;
    }

    try {
      await heartbeatMsg.edit({ embeds: [embed] });
    } catch {
      // Mesaj kaybolduysa yeniden oluştur
      heartbeatMsg = null;
    }
  }, 60_000);
}

// ----------------------
// Ready (v14 uyum)
// ----------------------
let booted = false;
let isRestarting = false;
async function onBotReady() {
  if (booted) return;
  booted = true;

  console.log(`🤖 Bot hazır: ${client.user.tag}`);

  // Konsola da heartbeat bas (istersen kapatırız)
  setInterval(() => {
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const ping = Number.isFinite(client.ws.ping) ? client.ws.ping : -1;
    console.log(`💓 heartbeat | ping=${ping}ms ram=${mem}MB uptime=${Math.floor(process.uptime())}s`);
  }, 60_000);

  // LOG kanalına spam olmadan heartbeat
  startHeartbeatLoop().catch((e) => console.error("Heartbeat loop error:", e));

  // 🎧 Voice mascot restore (13/14)
  try {
    const voiceManager = require("./voice/voiceManager");
    await voiceManager.restoreAll(client);
  } catch (e) {
    console.log("voice restore error:", e?.message || e);
  }


  // 🛡️ WATCHDOG: Gateway aktivitesi uzun süre yoksa kendini yeniden başlat (Replit restart eder)
  setInterval(async () => {
    const now = Date.now();
    const gwAgo = now - (state.lastGatewayActivityAt || now);
    const intAgo = now - (state.lastInteractionAt || now);
    const ping = Number.isFinite(client.ws.ping) ? client.ws.ping : -1;

    // 2 dakikadan fazla gateway aktivitesi yok + ping bozuksa "hayalet bot" olabilir
    if (gwAgo > 120_000 && (ping < 0 || ping > 10_000)) {
      if (isRestarting) return;
      isRestarting = true;

      console.error("🧨 Watchdog: gateway aktivitesi yok, yeniden bağlanma deneniyor.", { gwAgo, intAgo, ping });

      try {
        // Bağlantıyı temizle
        await client.destroy();
      } catch (e) {
        console.warn("⚠️ Watchdog destroy error:", e?.message || e);
      }

      // Kısa bekle ve tekrar login dene
      setTimeout(async () => {
        try {
          await client.login(process.env.TOKEN);
          console.log("✅ Watchdog: yeniden login denendi.");
        } catch (e) {
          console.error("❌ Watchdog: yeniden login başarısız:", e?.message || e);
        } finally {
          isRestarting = false;
        }
      }, 5_000);
    }
  }, 30_000);

}
client.once("ready", onBotReady);
client.once("clientReady", onBotReady);

// ----------------------
// Komutları yükle
// ----------------------
const commandsRoot = path.join(__dirname, "commands");
if (fs.existsSync(commandsRoot)) {
  for (const category of fs.readdirSync(commandsRoot)) {
    const categoryPath = path.join(commandsRoot, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      const fullPath = path.join(categoryPath, file);

      try {
        // Cache temizle (varsa)
        const resolved = require.resolve(fullPath);
        if (require.cache[resolved]) delete require.cache[resolved];

        const cmd = require(fullPath);

        // Optional chaining yok: eski Node uyumlu
        if (cmd && cmd.data && cmd.data.name && typeof cmd.execute === "function") {
          client.commands.set(cmd.data.name, cmd);
          console.log(`✅ Komut yüklendi: /${cmd.data.name} (${category}/${file})`);
        } else {
          console.warn(`⚠ Komut formatı hatalı: ${category}/${file}`);
        }
      } catch (err) {
        console.error(`❌ Komut yüklenemedi: ${category}/${file}`, err);
      }
    }

  }
} else {
  console.warn("⚠️ src/commands klasörü bulunamadı.");
}

// ----------------------
// Eventleri yükle
// ----------------------
const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
  for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"))) {
    const fullPath = path.join(eventsPath, file);

    delete require.cache[require.resolve(fullPath)];
    const event = require(fullPath);

    if (!event?.name || typeof event.execute !== "function") {
      console.warn(`⚠️ Event formatı hatalı: events/${file}`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }

    console.log(`✅ Event yüklendi: ${event.name} (${file})`);
  }
} else {
  console.warn("⚠️ src/events klasörü bulunamadı.");
}

// ----------------------
// Login
// ----------------------
if (!process.env.TOKEN) {
  console.error("❌ TOKEN yok! Replit Secrets içine TOKEN eklemelisin.");
  process.exit(1);
}

client.login(process.env.TOKEN);


// ===== RECONNECT LOOP BREAKER + EXTRA HEALTH LOGS =====
try {
  client.__reconnectEvents = client.__reconnectEvents || []; // timestamps (ms)
  client.__lastHardReconnectAt = client.__lastHardReconnectAt || 0;

  const pruneReconnectEvents = () => {
    const now = Date.now();
    client.__reconnectEvents = (client.__reconnectEvents || []).filter((t) => now - t < 5 * 60 * 1000);
  };

  const wsInfo = () => ({
    ping: Number.isFinite(client.ws?.ping) ? client.ws.ping : -1,
    status: client.ws?.status ?? null,
  });

  client.on("shardReconnecting", (shardId) => {
    try {
      const now = Date.now();
      client.__reconnectEvents.push(now);
      pruneReconnectEvents();

      append("shardReconnecting", { shardId, ...wsInfo(), windowCount: client.__reconnectEvents.length });

      const looping = client.__reconnectEvents.length >= 3;
      const canHardReconnect = now - client.__lastHardReconnectAt > 5 * 60 * 1000;

      if (looping && canHardReconnect) {
        client.__lastHardReconnectAt = now;
        append("watchdogReconnect", { reason: "reconnectLoop", shardId, ...wsInfo(), windowCount: client.__reconnectEvents.length });

        Promise.resolve()
          .then(() => client.destroy())
          .catch(() => {})
          .then(() => client.login(process.env.TOKEN))
          .then(() => append("watchdogReconnected", { ok: true, reason: "reconnectLoop" }))
          .catch((e) => append("watchdogReconnected", { ok: false, reason: "reconnectLoop", error: String(e?.message || e) }));
      }
    } catch (e) {
      append("watchdogSetupError", String(e?.message || e));
    }
  });

  client.on("shardResume", (shardId, replayed) => {
    append("shardResume", { shardId, replayed, ...wsInfo() });
  });

  client.on("shardDisconnect", (event, shardId) => {
    append("shardDisconnect", { shardId, code: event?.code, reason: event?.reason, ...wsInfo() });
  });

  client.__lastLagLogAt = client.__lastLagLogAt || 0;
  let __lastTick2 = Date.now();
  setInterval(() => {
    const now = Date.now();
    const drift = now - __lastTick2 - 1000;
    __lastTick2 = now;

    if (drift > 2000 && now - client.__lastLagLogAt > 60 * 1000) {
      client.__lastLagLogAt = now;
      append("eventLoopLag", { driftMs: drift, ...wsInfo() });
    }
  }, 1000).unref();
} catch (e) {}
// ===== END RECONNECT LOOP BREAKER =====


// ===== CORE STORAGE FLUSH (graceful) =====
async function __flushAndExit(code = 0) {
  try { await flushAll(); } catch {}
  process.exit(code);
}

process.on("SIGINT", () => __flushAndExit(0));
process.on("SIGTERM", () => __flushAndExit(0));
// ===== END CORE STORAGE FLUSH =====
