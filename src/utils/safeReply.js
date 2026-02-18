/**
 * Stabil interaction helpers:
 * - Prevents "InteractionAlreadyReplied"
 * - Keeps responses ephemeral-safe
 */

async function safeDefer(interaction, { ephemeral = true } = {}) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
      return true;
    }
  } catch (_) {}
  return false;
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (_) {
    return null;
  }
}

async function safeEdit(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply(payload);
  } catch (_) {
    return null;
  }
}

module.exports = { safeDefer, safeReply, safeEdit };
