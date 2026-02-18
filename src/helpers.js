const fs = require("fs");
const path = require("path");

function safeReply(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

function loadEvents(client, eventsDir) {
  const files = fs.readdirSync(eventsDir).filter(f => f.endsWith(".js"));
  for (const file of files) {
    const event = require(path.join(eventsDir, file));
    if (!event?.name || !event?.execute) continue;

    if (event.once) client.once(event.name, (...args) => event.execute(client, ...args));
    else client.on(event.name, (...args) => event.execute(client, ...args));
  }
}

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function loadCommands(client, commandsDir) {
  const files = walk(commandsDir);
  for (const file of files) {
    const cmd = require(file);
    if (!cmd?.data?.name || !cmd?.execute) continue;
    client.commands.set(cmd.data.name, cmd);
  }
}

module.exports = { safeReply, loadEvents, loadCommands, walk };
