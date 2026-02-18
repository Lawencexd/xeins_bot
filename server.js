const express = require("express");
const { LOG_CHANNEL_ID, PING_TIMEOUT_MS, KEEPALIVE_CHECK_EVERY_MS } = require("./src/config");
const state = require("./src/state");

module.exports = (client) => {
  const app = express();

  app.get("/", async (req, res) => {
    res.send("Bot ayakta 🚀");

    state.lastPingTime = Date.now();
    state.keepAliveWarned = false;

    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (!logChannel) return;

      const now = Math.floor(Date.now() / 1000);
      const content =
`🟢 **Bot aktif**
Son ping: <t:${now}:R>
Sunucu uyarıldı, bot kapanmayacak.`;

      if (!state.lastPingLogMessage) {
        state.lastPingLogMessage = await logChannel.send(content);
      } else {
        await state.lastPingLogMessage.edit(content);
      }
    } catch {}
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, "0.0.0.0", () => console.log(`🌐 Ping server aktif | Port: ${PORT}`));

  setInterval(async () => {
    const now = Date.now();
    if (now - state.lastPingTime > PING_TIMEOUT_MS && !state.keepAliveWarned) {
      state.keepAliveWarned = true;
      try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (logChannel) {
          const secs = Math.floor(state.lastPingTime / 1000);
          logChannel.send(`🔴 **UYARI:** 5 dakikadır ping alınmadı! Son ping: <t:${secs}:R>`);
        }
      } catch {}
    }
  }, KEEPALIVE_CHECK_EVERY_MS);
};
