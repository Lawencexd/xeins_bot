require("dotenv").config();

module.exports = {
  TOKEN: process.env.TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  DEV_GUILD_ID: process.env.DEV_GUILD_ID,
  TEXT_CHANNEL_ID: process.env.TEXT_CHANNEL_ID,
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID || null,

    // Watchdog ayarları
    WATCHDOG_INTERVAL_MS: 30_000,
    DEAD_AFTER_MS: 90_000,
    RECONNECT_ATTEMPTS: 2,
    RECONNECT_WAIT_MS: 8_000,
  
  DEFAULT_CHANNELS: {
    log: "1469689684031701044",
    modlog: "1469733655198040115",
    thanks: "1273634278294425772",
  },

  DEFAULT_LINKS: {
    roblox: "https://www.roblox.com/communities/35779489/Xeins#!/about",
    discord: "https://discord.gg/xeins",
    tiktok: "https://www.tiktok.com/@xeinsclan",
  }
};