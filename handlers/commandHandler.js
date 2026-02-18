import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadCommands() {
  const base = path.join(__dirname, "..", "commands");
  const commands = new Map();

  for (const group of fs.readdirSync(base)) {
    const groupPath = path.join(base, group);
    for (const file of fs.readdirSync(groupPath).filter(f => f.endsWith(".js"))) {
      const full = path.join(groupPath, file);
      commands.set(`${group}/${file}`, full);
    }
  }
  return commands;
}
