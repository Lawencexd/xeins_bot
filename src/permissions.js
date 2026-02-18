// src/permissions.js
// Tek yerden yetki kontrolü

function hasPerms(member, permName) {
  try {
    return Boolean(member?.permissions?.has?.(permName));
  } catch {
    return false;
  }
}

function isAdmin(memberOrInteraction) {
  const member = memberOrInteraction?.member ?? memberOrInteraction;
  return hasPerms(member, "Administrator");
}

function isMod(memberOrInteraction) {
  const member = memberOrInteraction?.member ?? memberOrInteraction;
  return (
    isAdmin(member) ||
    hasPerms(member, "ManageGuild") ||
    hasPerms(member, "ManageMessages") ||
    hasPerms(member, "KickMembers") ||
    hasPerms(member, "BanMembers")
  );
}

async function safeEphemeral(interaction, content) {
  const payload = { content, ephemeral: true };
  try {
    if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch {}
}

async function requireAdmin(interaction) {
  if (isAdmin(interaction)) return true;
  await safeEphemeral(interaction, "❌ Bu komut sadece **yöneticiler** içindir.");
  return false;
}

async function requireMod(interaction) {
  if (isMod(interaction)) return true;
  await safeEphemeral(interaction, "❌ Bu komut sadece **yetkililer** içindir.");
  return false;
}

module.exports = { isAdmin, isMod, requireAdmin, requireMod };
