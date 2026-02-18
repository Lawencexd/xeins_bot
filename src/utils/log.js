async function sendLog(client, text) {
  try {
    const channelId = require("../config").LOG_CHANNEL_ID;
    if (!channelId) return;

    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    await ch.send(text).catch(() => {});
  } catch (_) {}
}

module.exports = { sendLog };
