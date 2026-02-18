const { EmbedBuilder } = require("discord.js");
const { getGuild } = require("../store/settings");

// Aynı kişiye tekrar teşekkür etmemek için (bot açık kaldığı sürece)
// Key: `${guildId}:${userId}`
const thankedBoosters = new Set();

// Tek kaynak booster teşekkür mesajı (ana metin değiştirilmedi)
const BOOST_THANKS_MESSAGE = (memberMention) =>
  `💜 **Welcome, our new booster!**\n` +
  `${memberMention}\n\n` +
  `Thanks a ton for boosting **Xein**, we really appreciate it!\n` +
  `You’ve unlocked some awesome **Booster perks**:\n\n` +
  `• A special booster role\n` +
  `• Sharing images, videos, and voice messages in chat\n` +
  `• Adding up to **2 emojis or sounds** to the server\n` +
  `• Priority speaker in voice channels\n\n` +
  `We’re happy to have you here — hope you enjoy your time with us! ✨`;


async function guildMemberUpdate(oldMember, newMember) {
  try {
    if (!oldMember || !newMember) return;

    // Boost durumu değişmediyse çık
    if (oldMember.premiumSince === newMember.premiumSince) return;

    const key = `${newMember.guild.id}:${newMember.id}`;

    // Boost çekildiyse -> tekrar boost atarsa yeniden teşekkür edebilsin
    if (oldMember.premiumSince && !newMember.premiumSince) {
      thankedBoosters.delete(key);
      return;
    }

    // Boost başladıysa (premiumSince null -> date)
    if (!oldMember.premiumSince && newMember.premiumSince) {
      // Aynı kişiye bir daha atma
      if (thankedBoosters.has(key)) return;

      const cfg = getGuild(newMember.guild.id);

    // Feature toggle: Booster Thanks
    if (cfg?.features?.boosterThanks === false) return;
      const thanksId = (cfg && cfg.channels && cfg.channels.THANKS_CHANNEL_ID) || process.env.THANKS_CHANNEL_ID;
      if (!thanksId) return;

      const messageOverride = BOOST_THANKS_MESSAGE(`${newMember}`);

      const ok = await sendBoosterThanks({
        guild: newMember.guild,
        member: newMember,
        thanksChannelId: thanksId,
        messageOverride,
      });

      if (ok) thankedBoosters.add(key);
    }
  } catch (err) {
    console.error("[guildMemberUpdate] error:", err);
  }
}

/**
 * Sends a boost thank-you message.
 * Backwards compatible:
 * - sendBoosterThanks(guild, member, cfg)
 * - sendBoosterThanks({ guild, member, thanksChannelId, messageOverride })
 */
async function sendBoosterThanks(arg1, arg2, arg3) {
  try {
    // old signature
    if (arg1 && arg1.id && arg2 && arg2.user && arg3) {
      const guild = arg1;
      const member = arg2;
      const cfg = arg3;
      return sendBoosterThanks({
        guild,
        member,
        thanksChannelId: cfg.THANKS_CHANNEL_ID,
      });
    }

    const { guild, member, thanksChannelId, messageOverride } = arg1 || {};
    if (!messageOverride) return false;
    if (!guild || !member || !thanksChannelId) return false;

    const ch = await guild.channels.fetch(thanksChannelId).catch(() => null);
    if (!ch) return false;

    const isText = typeof ch.isTextBased === "function" ? ch.isTextBased() : !!ch.send;
    if (!isText) return false;

    const embed = new EmbedBuilder()
      .setTitle("💎 Boost için teşekkürler!")
      .setDescription(
        messageOverride
      )
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setTimestamp();

    await ch.send({ embeds: [embed] });
    return true;
  } catch (err) {
    console.error("[sendBoosterThanks] error:", err);
    return false;
  }
}

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember, client) {
    return guildMemberUpdate(oldMember, newMember, client);
  },
  sendBoosterThanks,
  BOOST_THANKS_MESSAGE
};
