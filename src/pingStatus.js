let lastMessageId = null;

async function upsertPingMessage(channel, content) {
  try {
    if (lastMessageId) {
      const msg = await channel.messages.fetch(lastMessageId).catch(() => null);
      if (msg) return await msg.edit(content);
    }
    const newMsg = await channel.send(content);
    lastMessageId = newMsg.id;
    return newMsg;
  } catch {
    // sessiz geç (rate limit / perms)
  }
}

module.exports = { upsertPingMessage };
