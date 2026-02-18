module.exports = {
  name: "clientReady",
  once: true,
  execute(client) {
    console.log(`✅ Bot aktif: ${client.user.tag}`);

    const { joinVoiceChannel } = require("@discordjs/voice");
    const voiceState = require("../store/voiceState");
    
    client.on("shardDisconnect", (event, id) => console.log("❌ shardDisconnect", id, event?.reason));
    client.on("shardReconnecting", (id) => console.log("🔁 shardReconnecting", id));
    client.on("shardResume", (id) => console.log("✅ shardResume", id));
    client.on("error", (e) => console.log("🔥 client error", e));

    module.exports = {
      name: "clientReady",
      once: true,
      execute(client) {
        if (!voiceState.channelId) return;

        const channel = client.channels.cache.get(voiceState.channelId);
        if (!channel) return;

        joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
          selfDeaf: true,
        });

        console.log("🎧 Maskot ses kanalına geri bağlandı");
      },
    };

    
  }
};
