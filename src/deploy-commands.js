require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
// NOTE: ./config exports the config object directly (not { CONFIG })
const CONFIG = require("./config");

/**
 * Kullanım:
 *  node src/deploy-commands.js hybrid   -> /help GLOBAL, diğerleri DEV_GUILD_ID (önerilen)
 *  node src/deploy-commands.js guild    -> Hepsi DEV_GUILD_ID
 *  node src/deploy-commands.js global   -> Hepsi GLOBAL (önerilmez, yayılması uzun sürebilir)
 *
 * Not: Daha önce hem global hem guild deploy yaptıysan, Discord arayüzünde aynı komut iki kez görünebilir.
 * Çözüm: "guild" deploy yapıp sonra globalden kaldırmak için global deploy'u sadece istediğin komutlarla tekrar çalıştır.
 */

const mode = (process.argv[2] || "hybrid").toLowerCase(); // hybrid | guild | global

function collectCommands({ only } = {}) {
  const commands = [];
  const commandsRoot = path.join(__dirname, "commands");

  for (const category of fs.readdirSync(commandsRoot)) {
    const categoryPath = path.join(commandsRoot, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    for (const file of fs.readdirSync(categoryPath).filter((f) => f.endsWith(".js"))) {
      const filePath = path.join(categoryPath, file);
      let command;
      try {
        // Fresh load (in case you run deploy multiple times)
        const resolved = require.resolve(filePath);
        if (require.cache[resolved]) delete require.cache[resolved];
        command = require(filePath);
      } catch (e) {
        console.warn(`⚠️ Komut dosyası okunamadı: ${category}/${file} -> ${e?.message || e}`);
        continue;
      }

      if (!command || !command.data || !command.data.name) continue;

      if (only && !only.includes(command.data.name)) continue;

      commands.push(command.data.toJSON());
    }
  }
  return commands;
}

if (!CONFIG.TOKEN) {
  console.error("❌ TOKEN eksik (Secrets/env). Replit > Secrets kısmına TOKEN ekle.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(CONFIG.TOKEN);

(async () => {
  try {
    if (!CONFIG.CLIENT_ID) throw new Error("CLIENT_ID eksik (Secrets/env).");
    if (!CONFIG.DEV_GUILD_ID && (mode === "guild" || mode === "hybrid")) {
      throw new Error("DEV_GUILD_ID eksik (Secrets/env).");
    }

    if (mode === "global") {
      const globalCommands = collectCommands();
      console.log(`🌍 Global deploy: ${globalCommands.length} komut`);
      await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: globalCommands });
      console.log("✅ Global komutlar yüklendi.");
      return;
    }

    if (mode === "guild") {
      const guildCommands = collectCommands();
      console.log(`🏠 Guild deploy: ${guildCommands.length} komut`);
      await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.DEV_GUILD_ID), { body: guildCommands });
      console.log("✅ Guild komutları yüklendi.");
      return;
    }

    // hybrid: help global, diğerleri guild
    const globalCommands = collectCommands({ only: ["help"] });
    const guildCommands = collectCommands().filter(c => c.name !== "help");

    console.log(`🌍 Global deploy (help): ${globalCommands.length} komut`);
    await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: globalCommands });

    console.log(`🏠 Guild deploy (help hariç): ${guildCommands.length} komut`);
    await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.DEV_GUILD_ID), { body: guildCommands });

    console.log("✅ Hybrid deploy tamamlandı.");
  } catch (error) {
    console.error("❌ Deploy error:", error);
    process.exit(1);
  }
})();
