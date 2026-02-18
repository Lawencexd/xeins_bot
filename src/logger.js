async function logToChannel(guild, channelId, text) {
  try {
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (!ch) return;
    await ch.send({ content: text });
  } catch (e) {
    console.log("logToChannel error:", e?.message || e);
  }
}

async function sendToChannelById(guild, channelId, payload) {
  try {
    if (!guild || !channelId) return false;
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return false;
    await ch.send(payload);
    return true;
  } catch (e) {
    return false;
  }
}

async function logModeration(guild, channelId, embed) {
  return sendToChannelById(guild, channelId, { embeds: [embed] });
}


module.exports = {
  sendToChannelById,
  logModeration,
logToChannel,
};
