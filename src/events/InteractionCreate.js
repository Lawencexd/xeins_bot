const {
  Events,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const { append } = require("../utils/persistLog");
const Daily = require("../fun/daily");
const Quiz = require("../fun/quiz");
const Rel = require("../fun/relationship");
const Games = require("../fun/games");
const Actions = require("../fun/actions");
const Booster = require("../fun/booster");
const Activity = require("../fun/activity");
const { applyActivityRoles } = require("../utils/activityRoles");

function getFunOwnerId(customId) {
  const cid = customId || "";
  const p = cid.split(":");

  // Known patterns:
  // fun:menu:<owner>
  // fun:home:<owner>
  // fun:close:<owner>
  // fun:daily:claim:<owner>
  // fun:daily:reroll:<owner>
  // fun:quiz:cat:<owner>
  // fun:quiz:back:<owner>
  // fun:quiz:ans:<owner>:<cat>:<choice>:<correct>
  // fun:rel:setfav:<owner>
  // fun:rel:stats:<owner>
  // fun:rel:back:<owner>
  // fun:rel:pickfav:<owner>
  if (p.length < 3) return null;

  if (cid.startsWith("fun:quiz:ans:")) return p[3] || null;
  if (cid.startsWith("fun:daily:")) return p[3] || null;
  if (cid.startsWith("fun:quiz:cat:")) return p[3] || null;
  if (cid.startsWith("fun:quiz:back:")) return p[3] || null;
  if (cid.startsWith("fun:menu:")) return p[2] || null;
  if (cid.startsWith("fun:home:")) return p[2] || null;
  if (cid.startsWith("fun:close:")) return p[2] || null;
  if (cid.startsWith("fun:rel:")) return p[3] || null;

  // fallback: last segment (safe for simple ids)
  return p[p.length - 1] || null;
}

const { isAdmin, requireAdmin, requireMod } = require("../permissions");
const state = require("../state");
const { sendLog } = require("../utils/log");
const { getGuild, setGuild, addAudit, getAudit, saveSnapshot, getSnapshot, restoreSnapshot } = require("../store/settings");
const confirmStore = require("../utils/confirmStore");
const { buildConfirmMessage } = require("../utils/confirmUI");
const { logModeration } = require("../logger");
const { buildModlogEmbed } = require("../utils/modlogEmbed");

function errorSignature(err, interaction) {
  const msg = (err?.message || String(err)).slice(0, 120);
  return `${interaction?.commandName || "unknown"}:${msg}`;
}

async function logErrorOnce(client, interaction, err) {
  try {
    state.errorCache ??= new Map();
    const sig = errorSignature(err, interaction);
    const now = Date.now();
    const last = state.errorCache.get(sig) || 0;
    if (now - last < 30_000) return; // anti-spam
    state.errorCache.set(sig, now);

    const where = interaction?.guildId ? `guild:${interaction.guildId}` : "DM";
    const who = interaction?.user ? `${interaction.user.tag} (${interaction.user.id})` : "unknown";
    const cmd = interaction?.commandName || interaction?.customId || "unknown";
    const content = `🧯 **Silent Failover**\n**Where:** ${where}\n**Who:** ${who}\n**Cmd:** ${cmd}\n**Error:** ${(err?.message || err).toString().slice(0, 500)}`;
    await sendLog(client, content);
  } catch (_) {}
}

function computeColdMode(client) {
  const now = Date.now();
  const gwAgo = now - (state.lastGatewayActivityAt || now);
  const ping = Number.isFinite(client.ws.ping) ? client.ws.ping : -1;

  // Unhealthy signals
  const gwBad = gwAgo > 90_000;
  const pingBad = ping < 0 || ping > 10_000;

  if (gwBad && pingBad) {
    state.coldModeUntil = Math.max(state.coldModeUntil || 0, now + 120_000);
    return true;
  }
  return (state.coldModeUntil || 0) > now;
}


/* =========================
   🎲 MINI GAME HELPERS
========================== */

function disableAllButtons(components) {
  try {
    return (components || []).map((row) => {
      const newRow = ActionRowBuilder.from(row);
      newRow.components = newRow.components.map((c) => {
        const b = ButtonBuilder.from(c);
        b.setDisabled(true);
        return b;
      });
      return newRow;
    });
  } catch (_) {
    return components || [];
  }
}

async function handleRpsButton(interaction) {
  const id = interaction.customId;
  const msgId = interaction.message?.id;

  // owner check
  const rec = state.rpsGames && msgId ? state.rpsGames.get(msgId) : null;
  if (rec && rec.ownerId && rec.ownerId !== interaction.user.id) {
    return interaction.reply({ content: "❌ Bu oyun paneli sana ait değil.", flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  if (id === "rps:cancel") {
    await interaction.deferUpdate();
    if (state.rpsGames && msgId) state.rpsGames.delete(msgId);
    return interaction.editReply({ content: "✅ Oyun kapatıldı.", components: [] }).catch(() => {});
  }

  const pick = id.split(":")[1];
  const botPick = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];

  const names = { rock: "Taş 🪨", paper: "Kağıt 📄", scissors: "Makas ✂️" };
  const win =
    (pick === "rock" && botPick === "scissors") ||
    (pick === "paper" && botPick === "rock") ||
    (pick === "scissors" && botPick === "paper");
  const draw = pick === botPick;

  const result = draw ? "Berabere! 🤝" : win ? "Sen kazandın! 🎉" : "Bot kazandı! 😅";

  await interaction.deferUpdate();

  const disabled = disableAllButtons(interaction.message.components);
  if (state.rpsGames && msgId) state.rpsGames.delete(msgId);

  return interaction.editReply({
    content: `🎮 **Taş-Kağıt-Makas**\n${interaction.user} seçti: **${names[pick]}**\nBot seçti: **${names[botPick]}**\n\n**${result}**`,
    components: disabled,
  });
}

async function handleQuizButton(interaction) {
  const parts = (interaction.customId || "").split(":");
  // quiz:<nonce>:<choice>
  const nonce = parts[1];
  const choice = Number(parts[2]);

  const sess = state.quizSessions ? state.quizSessions.get(nonce) : null;
  if (!sess) {
    return interaction.reply({ content: "⏳ Bu quiz süresi dolmuş. /quiz ile yenisini başlat!", flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  if (sess.ownerId && sess.ownerId !== interaction.user.id) {
    return interaction.reply({ content: "❌ Bu quiz sana ait değil.", flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  const correct = sess.correct;
  const ok = choice === correct;

  const letters = ["A", "B", "C", "D"];
  const correctText = sess.a && typeof correct === "number" ? `${letters[correct]}) ${sess.a[correct]}` : `${letters[correct]}`;

  await interaction.deferUpdate();

  // disable buttons
  const disabled = disableAllButtons(interaction.message.components);
  if (state.quizSessions) state.quizSessions.delete(nonce);

  const embed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder().setTitle("🧠 Quiz"));
  embed.addFields({ name: ok ? "✅ Doğru!" : "❌ Yanlış!", value: ok ? "Tebrikler!" : `Doğru cevap: **${correctText}**` });

  return interaction.editReply({ embeds: [embed], components: disabled });
}

/* =========================
   ⚙️ SETTINGS PANEL HELPERS
========================== */

function buildSettingsMainEmbed(cfg) {
  const privacy = cfg?.features?.privacyMode ? "ON" : "OFF";
  const voiceEnabled = cfg?.voice?.enabled ? "ON" : "OFF";
  const ghost = cfg?.voice?.ghostMode ? "ON" : "OFF";

  return new EmbedBuilder()
    .setTitle("⚙️ Xein Settings")
    .setDescription("Aşağıdan bir ayar seç.")
    .addFields(
      { name: "Privacy", value: privacy, inline: true },
      { name: "Voice", value: `Enabled: ${voiceEnabled}\nGhost: ${ghost}`, inline: true }
    )
    .setTimestamp();
}

function settingsMainComponents() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("settings:menu")
    .setPlaceholder("Bir ayar seç…")
    .addOptions(
      { label: "Ayarları Göster", value: "show", emoji: "📋" },
      { label: "Link Güncelle", value: "links", emoji: "🔗" },
      { label: "Auto Role", value: "autorole", emoji: "🎭" },
      { label: "Privacy Mode", value: "privacy", emoji: "🔒" },
      { label: "Voice (Maskot)", value: "voice", emoji: "🔊" },
      { label: "Channels", value: "channels", emoji: "📡" },
      { label: "Features", value: "features", emoji: "🎛️" },
      { label: "System", value: "system", emoji: "🧠" },
      { label: "History", value: "history", emoji: "🕓" }
    );

  const row1 = new ActionRowBuilder().addComponents(menu);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("settings:close").setLabel("Kapat").setStyle(ButtonStyle.Secondary).setEmoji("✖️")
  );
  return [row1, row2];
}


function assertSettingsOwner(interaction) {
  try {
    const msgId = interaction.message && interaction.message.id;
    if (!msgId) return true;

    const rec = state.settingsPanels.get(msgId);
    if (!rec) return true; // allow if unknown

    if (rec.ownerId && rec.ownerId !== interaction.user.id) {
      interaction.reply({ content: "❌ Bu settings paneli sana ait değil.", flags: MessageFlags.Ephemeral }).catch(() => {});
      return false;
    }
    return true;
  } catch (_) {
    return true;
  }
}

function buildSettingsShowEmbed(cfg) {
  const links = cfg?.links || {};
  const ch = cfg?.channels || {};
  const roles = cfg?.roles || {};
  const features = cfg?.features || {};
  const voice = cfg?.voice || {};

  const lines = [];
  lines.push("**Links**");
  lines.push(`Roblox: ${links.roblox || "—"}`);
  lines.push(`Discord: ${links.discord || "—"}`);
  lines.push(`TikTok: ${links.tiktok || "—"}`);
  lines.push("");
  lines.push("**Channels**");
  lines.push(`LOG: ${ch.LOG_CHANNEL_ID || "—"}`);
  lines.push(`MODLOG: ${ch.MODLOG_CHANNEL_ID || "—"}`);
  lines.push(`THANKS: ${ch.THANKS_CHANNEL_ID || process.env.THANKS_CHANNEL_ID || "—"}`);
  lines.push("");
  lines.push("**Roles**");
  lines.push(`AutoRole: ${roles.autoRoleId || "Kapalı"}`);
  lines.push("");
  lines.push("**Features**");
  lines.push(`PrivacyMode: ${features.privacyMode ? "ON" : "OFF"}`);
  lines.push("");
  lines.push("**Voice**");
  lines.push(`Enabled: ${voice.enabled ? "ON" : "OFF"}`);
  lines.push(`MascotChannel: ${voice.mascotChannelId || "—"}`);
  lines.push(`Ghost: ${voice.ghostMode ? "ON" : "OFF"}`);

  return new EmbedBuilder().setTitle("📋 Ayarlar").setDescription(lines.join("\n")).setTimestamp();
}


function buildSettingsChannelsEmbed(cfg) {
  const ch = cfg?.channels || {};
  const lines = [];
  lines.push("Buradan kanalları seçerek ayarlayabilirsin.");
  lines.push("");
  lines.push(`LOG: ${ch.LOG_CHANNEL_ID ? `<#${ch.LOG_CHANNEL_ID}>` : "—"}`);
  lines.push(`MODLOG: ${ch.MODLOG_CHANNEL_ID ? `<#${ch.MODLOG_CHANNEL_ID}>` : "—"}`);
  lines.push(`THANKS: ${ch.THANKS_CHANNEL_ID ? `<#${ch.THANKS_CHANNEL_ID}>` : (process.env.THANKS_CHANNEL_ID ? `<#${process.env.THANKS_CHANNEL_ID}>` : "—")}`);
  lines.push(`TEXT: ${ch.TEXT_CHANNEL_ID ? `<#${ch.TEXT_CHANNEL_ID}>` : (process.env.TEXT_CHANNEL_ID ? `<#${process.env.TEXT_CHANNEL_ID}>` : "—")}`);
  return new EmbedBuilder().setTitle("📡 Channels").setDescription(lines.join("\n")).setTimestamp();
}

function settingsChannelsComponents(cfg) {
  const row1 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("settings:ch:LOG")
      .setPlaceholder("LOG kanalı seç…")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("settings:ch:MODLOG")
      .setPlaceholder("MODLOG kanalı seç…")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("settings:ch:THANKS")
      .setPlaceholder("THANKS kanalı seç…")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("settings:ch:TEXT")
      .setPlaceholder("TEXT kanalı seç…")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );
  const row5 = settingsBackCloseComponents()[0];
  return [row1, row2, row3, row4, row5];
}

function buildSettingsFeaturesEmbed(cfg) {
  const f = cfg?.features || {};
  const v = cfg?.voice || {};
  const lines = [];
  lines.push("Sistemleri aç/kapat (stabilite için).");
  lines.push("");
  lines.push(`BoosterThanks: ${f.boosterThanks === false ? "OFF" : "ON"}`);
  lines.push(`PrivacyMode: ${f.privacyMode ? "ON" : "OFF"}`);
  lines.push(`VoiceEnabled: ${v.enabled ? "ON" : "OFF"}`);
  lines.push(`GhostMode: ${v.ghostMode ? "ON" : "OFF"}`);
  return new EmbedBuilder().setTitle("🎛️ Features").setDescription(lines.join("\n")).setTimestamp();
}

function settingsFeaturesComponents(cfg) {
  const f = cfg?.features || {};
  const v = cfg?.voice || {};
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings:features:boost").setLabel(f.boosterThanks === false ? "BoosterThanks Aç" : "BoosterThanks Kapat").setStyle(f.boosterThanks === false ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("settings:privacy:toggle").setLabel(f.privacyMode ? "Privacy: ON" : "Privacy: OFF").setStyle(ButtonStyle.Secondary).setEmoji("🔒")
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings:voice:toggle").setLabel(v.enabled ? "Voice Kapat" : "Voice Aç").setStyle(v.enabled ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji("🔊"),
      new ButtonBuilder().setCustomId("settings:voice:ghost").setLabel(v.ghostMode ? "Ghost: ON" : "Ghost: OFF").setStyle(ButtonStyle.Secondary).setEmoji("👻")
    ),
    settingsBackCloseComponents()[0]
  ];
}

function buildSettingsSystemEmbed(cfg) {
  const snap = getSnapshot(cfg.__guildId || "") || null;
  const snapLine = snap && snap.at ? new Date(snap.at).toLocaleString("tr-TR") : "—";
  return new EmbedBuilder()
    .setTitle("🧠 System")
    .setDescription(`Snapshot: ${snapLine}\n\nBu bölümden ayarların yedeğini alıp geri yükleyebilirsin.`)
    .setTimestamp();
}

function settingsSystemComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings:snap:save").setLabel("📸 Snapshot Al").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings:snap:restore").setLabel("↩️ Geri Yükle").setStyle(ButtonStyle.Danger)
    ),
    settingsBackCloseComponents()[0]
  ];
}

function buildSettingsHistoryEmbed(guildId) {
  const audit = getAudit(guildId);
  const lines = [];
  if (!audit.length) {
    lines.push("Henüz kayıt yok.");
  } else {
    for (const a of audit.slice(0, 10)) {
      const when = a.at ? new Date(a.at).toLocaleString("tr-TR") : "";
      const who = a.byTag || (a.byId ? `<@${a.byId}>` : "—");
      lines.push(`• ${when} — ${who} — ${a.action}${a.field ? ` (${a.field})` : ""}`);
    }
  }
  return new EmbedBuilder().setTitle("🕓 History").setDescription(lines.join("\n")).setTimestamp();
}

function settingsBackCloseComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings:back").setLabel("Geri").setStyle(ButtonStyle.Secondary).setEmoji("⬅️"),
      new ButtonBuilder().setCustomId("settings:close").setLabel("Kapat").setStyle(ButtonStyle.Secondary).setEmoji("✖️")
    )
  ];
}

function settingsLinksComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings:link:roblox").setLabel("Roblox").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings:link:discord").setLabel("Discord").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings:link:tiktok").setLabel("TikTok").setStyle(ButtonStyle.Primary)
    ),
    ...settingsBackCloseComponents()
  ];
}

function settingsPrivacyComponents(enabled) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("settings:privacy:toggle")
        .setLabel(enabled ? "Kapat" : "Aç")
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji("🔒")
    ),
    ...settingsBackCloseComponents()
  ];
}

function settingsAutoroleComponents(hasRole) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings:autorole:set").setLabel("Rol Ayarla").setStyle(ButtonStyle.Primary).setEmoji("🎭"),
      new ButtonBuilder().setCustomId("settings:autorole:off").setLabel("Kapat").setStyle(hasRole ? ButtonStyle.Danger : ButtonStyle.Secondary)
    ),
    ...settingsBackCloseComponents()
  ];
}

function settingsVoiceComponents(cfg) {
  const enabled = cfg?.voice?.enabled === true;
  const ghost = cfg?.voice?.ghostMode === true;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings:voice:toggle").setLabel(enabled ? "Voice Kapat" : "Voice Aç").setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji("🔊"),
      new ButtonBuilder().setCustomId("settings:voice:ghost").setLabel(ghost ? "Ghost: ON" : "Ghost: OFF").setStyle(ButtonStyle.Secondary).setEmoji("👻"),
      new ButtonBuilder().setCustomId("settings:voice:channel").setLabel("Kanal Ayarla").setStyle(ButtonStyle.Primary).setEmoji("🎙️")
    ),
    ...settingsBackCloseComponents()
  ];
}

function modalForLink(key, current) {
  const modal = new ModalBuilder().setCustomId(`settings:modal:link:${key}`).setTitle(`Link Güncelle: ${key}`);
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel("Yeni link")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(current || "");
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function modalForAutorole(current) {
  const modal = new ModalBuilder().setCustomId("settings:modal:autorole").setTitle("AutoRole Ayarla");
  const input = new TextInputBuilder()
    .setCustomId("roleid")
    .setLabel("Rol ID (kapatmak için: off)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(current || "");
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function modalForVoiceChannel(current) {
  const modal = new ModalBuilder().setCustomId("settings:modal:voice_channel").setTitle("Voice Kanalı Ayarla");
  const input = new TextInputBuilder()
    .setCustomId("channelid")
    .setLabel("Ses kanal ID")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(current || "");
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function handleConfirmButton(interaction, client) {
  const id = interaction.customId; // confirm_yes:key / confirm_no:key
  const [kind, key] = id.split(":");
  const payload = confirmStore.get(key);

  await interaction.deferUpdate();

  if (!payload) {
    return interaction.editReply({ content: "⏳ Bu onay süresi dolmuş.", embeds: [], components: [] });
  }

  // Only the original moderator can confirm
  if (payload.moderatorId && interaction.user.id !== payload.moderatorId) {
    return interaction.followUp({ content: "❌ Bu onay sana ait değil.", flags: MessageFlags.Ephemeral });
  }

  if (kind === "confirm_no") {
    confirmStore.del(key);
    return interaction.editReply({ content: "✖️ İşlem iptal edildi.", embeds: [], components: [] });
  }

  // YES
  confirmStore.del(key);

  try {
    const guild = await client.guilds.fetch(payload.guildId).catch(() => null);
    if (!guild) {
      return interaction.editReply({ content: "❌ Guild bulunamadı.", embeds: [], components: [] });
    }

    const cfg = getGuild(payload.guildId);

    if (payload.type === "ban") {
      // Permission guard (safety)
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
        return interaction.editReply({ content: "❌ Ban yetkin yok.", embeds: [], components: [] });
      }

      const userId = payload.targetId;
      const reason = payload.reason || "Sebep belirtilmedi.";

      const member = await guild.members.fetch(userId).catch(() => null);
      if (member && !member.bannable) {
        return interaction.editReply({ content: "❌ Bu kullanıcı banlanamıyor (rol/yetki).", embeds: [], components: [] });
      }

      await guild.members.ban(userId, { reason });

      await interaction.editReply({ content: `✅ Banlandı: <@${userId}>\nSebep: **${reason}**`, embeds: [], components: [] });

      const embed = buildModlogEmbed({
        action: "BAN",
        actor: interaction.user,
        target: member ? member : { id: userId, toString: () => `<@${userId}>` },
        reason,
      });

      await logModeration(guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
      return;
    }

    if (payload.type === "purge") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.editReply({ content: "❌ Mesaj yönetme yetkin yok.", embeds: [], components: [] });
      }

      const ch = await guild.channels.fetch(payload.channelId).catch(() => null);
      if (!ch || !ch.isTextBased?.()) {
        return interaction.editReply({ content: "❌ Kanal bulunamadı.", embeds: [], components: [] });
      }

      const amount = payload.amount;
      const deleted = await ch.bulkDelete(amount, true).catch(() => null);
      const delCount = deleted?.size ?? 0;

      await interaction.editReply({ content: `✅ ${delCount} mesaj silindi.`, embeds: [], components: [] });

      const embed = buildModlogEmbed({
        action: "PURGE",
        actor: interaction.user,
        channel: ch,
        count: delCount,
      });

      await logModeration(guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
      return;
    }

    return interaction.editReply({ content: "✅ İşlem tamamlandı.", embeds: [], components: [] });
  } catch (err) {
    await logErrorOnce(client, interaction, err);
    return interaction.editReply({ content: "❌ İşlem başarısız oldu. (Log kanalına yazdım)", embeds: [], components: [] });
  }
}

async function handlePanelButton(interaction, client) {
  const rawId = interaction.customId;
  const [id, targetId] = rawId.split(":");
  if (!id.startsWith("panel_")) return false;

  // Only admins
  if (!isAdmin(interaction)) {
    await interaction.deferUpdate();
    await interaction.followUp({ content: "❌ Panel butonları sadece adminler içindir.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (!assertSettingsOwner(interaction)) return;

          const cfg = getGuild(interaction.guildId);
  const channel = interaction.channel;

  // ======= USER ACTIONS (opsiyonel target ile) =======
  if (id === "panel_mute10" || id === "panel_unmute" || id === "panel_kick" || id === "panel_ban") {
    if (!targetId) {
      await interaction.reply({ content: "❌ Bu buton hedef kullanıcı olmadan çalışmaz. /panel target:@kullanıcı ile aç.", flags: MessageFlags.Ephemeral });
      return true;
    }

    // Permission guards
    if (id === "panel_mute10" || id === "panel_unmute") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({ content: "❌ Timeout yetkin yok.", flags: MessageFlags.Ephemeral });
        return true;
      }
    }
    if (id === "panel_kick") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers)) {
        await interaction.reply({ content: "❌ Kick yetkin yok.", flags: MessageFlags.Ephemeral });
        return true;
      }
    }
    if (id === "panel_ban") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
        await interaction.reply({ content: "❌ Ban yetkin yok.", flags: MessageFlags.Ephemeral });
        return true;
      }
    }

    // Ban = confirm (2 adım)
    if (id === "panel_ban") {
      const key = `${interaction.id}:${interaction.user.id}:ban:${targetId}`;
      const msg = buildConfirmMessage(interaction, {
        key,
        title: "🔨 Panel Ban Onayı",
        description: `<@${targetId}> kullanıcısını banlamak üzeresin.\nBu işlem geri alınamaz.`,
        payload: {
          type: "ban",
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          moderatorId: interaction.user.id,
          targetId,
          reason: "Panel üzerinden ban"
        }
      });
      await interaction.reply(msg);
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const member = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!member) return interaction.editReply("❌ Kullanıcı sunucuda bulunamadı.");

      if (id === "panel_mute10") {
        if (!member.moderatable) return interaction.editReply("❌ Bu kullanıcıya timeout atamıyorum (rol/yetki). ");
        await member.timeout(10 * 60 * 1000, "Panel mute 10m");
        await interaction.editReply(`✅ Timeout verildi: ${member} (10 dakika)`);

        const embed = buildModlogEmbed({
          action: "MUTE",
          actor: interaction.user,
          target: member,
          reason: "Panel mute 10m",
          duration: "10 dakika",
          channel: interaction.channel,
        });
        await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
        return true;
      }

      if (id === "panel_unmute") {
        if (!member.moderatable) return interaction.editReply("❌ Bu kullanıcıdan timeout kaldıramıyorum (rol/yetki). ");
        await member.timeout(null, "Panel unmute");
        await interaction.editReply(`✅ Timeout kaldırıldı: ${member}`);

        const embed = buildModlogEmbed({
          action: "UNMUTE",
          actor: interaction.user,
          target: member,
          reason: "Panel unmute",
          channel: interaction.channel,
        });
        await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
        return true;
      }

      if (id === "panel_kick") {
        if (!member.kickable) return interaction.editReply("❌ Bu kullanıcı kicklenemiyor (rol/yetki). ");
        await member.kick("Panel kick");
        await interaction.editReply(`✅ Kick atıldı: ${member.user.tag}`);

        const embed = buildModlogEmbed({
          action: "KICK",
          actor: interaction.user,
          target: member,
          reason: "Panel kick",
          channel: interaction.channel,
        });
        await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
        return true;
      }
    } catch (err) {
      await logErrorOnce(client, interaction, err);
      await interaction.editReply("❌ Panel kullanıcı işlemi başarısız oldu. (Log kanalına yazdım)");
      return true;
    }
  }

  // Close
  if (id === "panel_close") {
    await interaction.deferUpdate();
    return interaction.editReply({ content: "✅ Panel kapatıldı.", embeds: [], components: [] });
  }

  // Purge requires confirmation (2-step)
  if (id === "panel_purge10" || id === "panel_purge50") {
    const amount = id === "panel_purge10" ? 10 : 50;
    const key = `${interaction.id}:${interaction.user.id}:purge:${interaction.channelId}:${amount}`;
    const msg = buildConfirmMessage(interaction, {
      key,
      title: "🧹 Panel Silme Onayı",
      description: `Bu kanalda **${amount}** mesaj silinecek.\nBu işlem geri alınamaz.`,
      payload: {
        type: "purge",
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        moderatorId: interaction.user.id,
        amount
      }
    });

    await interaction.reply(msg);
    return true;
  }

  await interaction.deferUpdate();

  try {
    if (!channel?.isTextBased?.()) {
      await interaction.followUp({ content: "❌ Bu buton sadece yazı kanallarında çalışır.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (id === "panel_lock") {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      await interaction.followUp({ content: "🔒 Kanal kilitlendi.", flags: MessageFlags.Ephemeral });

      const embed = buildModlogEmbed({ action: "LOCK", actor: interaction.user, channel });
      await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
      return true;
    }

    if (id === "panel_unlock") {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      await interaction.followUp({ content: "🔓 Kanal açıldı.", flags: MessageFlags.Ephemeral });

      const embed = buildModlogEmbed({ action: "UNLOCK", actor: interaction.user, channel });
      await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
      return true;
    }

    // Slowmode
    if (id.startsWith("panel_slow_")) {
      let seconds = 0;
      if (id === "panel_slow_5") seconds = 5;
      if (id === "panel_slow_15") seconds = 15;
      if (id === "panel_slow_30") seconds = 30;
      if (id === "panel_slow_off") seconds = 0;

      await channel.setRateLimitPerUser(seconds);
      await interaction.followUp({ content: `🐢 Slowmode: **${seconds}s**`, flags: MessageFlags.Ephemeral });

      const embed = buildModlogEmbed({
        action: "SLOWMODE",
        actor: interaction.user,
        channel,
        extraFields: [{ name: "Süre", value: `${seconds}s`, inline: true }],
      });
      await logModeration(interaction.guild, cfg.channels.MODLOG_CHANNEL_ID, embed);
      return true;
    }
  } catch (err) {
    await logErrorOnce(client, interaction, err);
    await interaction.followUp({ content: "❌ Panel işlemi başarısız oldu. (Log kanalına yazdım)", flags: MessageFlags.Ephemeral });
    return true;
  }

  return true;
}

module.exports = {
  name: Events.InteractionCreate,
  /**
   * @param {import('discord.js').Interaction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {


    // ===== SETTINGS: Activity Roles Buttons =====
    try {
      const cid2 = interaction.customId || "";
      if (cid2.startsWith("settings:act:")) {
        const owner = cid2.split(":").pop();
        if (owner && interaction.user?.id !== owner) {
          return interaction.reply({ content: "⛔ Bu panel sana ait değil.", flags: MessageFlags.Ephemeral });
        }

        if (interaction.isButton()) {
          if (cid2.startsWith("settings:act:toggle:")) {
            const rules = await Activity.getRules(interaction.guildId);
            rules.enabled = !rules.enabled;
            await Activity.setRules(interaction.guildId, rules);
            return interaction.reply({ content: `✅ Activity Roles ${rules.enabled ? "açıldı" : "kapatıldı"}.`, flags: MessageFlags.Ephemeral });
          }

          if (cid2.startsWith("settings:act:setup:")) {
            // presets: activeDays 7, activeDays 30, hugs 100, quizWins 20
            const rules = await Activity.getRules(interaction.guildId);
            rules.entries = rules.entries && rules.entries.length ? rules.entries : [
              { metric: "activeDays", threshold: 7, roleId: null },
              { metric: "activeDays", threshold: 30, roleId: null },
              { metric: "hugs", threshold: 100, roleId: null },
              { metric: "quizWins", threshold: 20, roleId: null },
            ];
            await Activity.setRules(interaction.guildId, rules);

            const embed = new EmbedBuilder()
              .setTitle("🔥 Activity Roles • Kurulum")
              .setDescription("Preset kurallar eklendi. Şimdi rol seçmek için aşağıdaki butonları kullan.")
              .addFields(
                { name: "1) 7 gün aktif", value: "activeDays ≥ 7", inline: true },
                { name: "2) 30 gün aktif", value: "activeDays ≥ 30", inline: true },
                { name: "3) 100 hug", value: "hugs ≥ 100", inline: true },
                { name: "4) 20 quiz win", value: "quizWins ≥ 20", inline: true }
              );

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`settings:act:pick:0:${owner}`).setLabel("Rol Seç #1").setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`settings:act:pick:1:${owner}`).setLabel("Rol Seç #2").setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`settings:act:pick:2:${owner}`).setLabel("Rol Seç #3").setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`settings:act:pick:3:${owner}`).setLabel("Rol Seç #4").setStyle(ButtonStyle.Primary)
            );

            return interaction.update({ embeds: [embed], components: [row], content: "" });
          }

          if (cid2.startsWith("settings:act:pick:")) {
            // show role select menu
            const p = cid2.split(":"); // settings:act:pick:<idx>:<owner>
            const idxRule = Number(p[3]);
            const row = new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId(`settings:act:set:${idxRule}:${owner}`)
                .setPlaceholder("Bir rol seç…")
                .setMinValues(1)
                .setMaxValues(1)
            );
            const nav = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`settings:home:${owner}`).setLabel("Geri").setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ content: "Rol seç:", embeds: [], components: [row, nav] });
          }
        }

        if (interaction.isRoleSelectMenu()) {
          if (cid2.startsWith("settings:act:set:")) {
            const p = cid2.split(":"); // settings:act:set:<idx>:<owner>
            const idxRule = Number(p[3]);
            const roleId = interaction.values?.[0];
            const rules = await Activity.getRules(interaction.guildId);
            if (!rules.entries?.[idxRule]) {
              return interaction.reply({ content: "❌ Kural bulunamadı.", flags: MessageFlags.Ephemeral });
            }
            rules.entries[idxRule].roleId = roleId;
            await Activity.setRules(interaction.guildId, rules);
            return interaction.reply({ content: `✅ Rol ayarlandı: <@&${roleId}>`, flags: MessageFlags.Ephemeral });
          }
        }
      }
    } catch (e) {
      try { append("settingsActError", String(e?.message || e)); } catch {}
    }
    // ===== END SETTINGS: Activity Roles Buttons =====

    // ===== FUN ROUTER V3.3 (panel interactions) =====
    try {
      // mark activity for watchdog
      try { client.__lastInteractionAt = Date.now(); } catch {}
      try { if (interaction.guildId) Activity.markActive(interaction.guildId, interaction.user.id).catch(() => {}); } catch {}
      try { interaction.guild?.members.fetch(interaction.user.id).then((m)=>m&&applyActivityRoles(interaction.guild,m)).catch(()=>{}); } catch {}
      try { const m = await interaction.guild.members.fetch(interaction.user.id).catch(() => null); if (m) applyActivityRoles(interaction.guild, m).catch(() => {}); } catch {}

      // Only handle our panel customIds
      const cid = interaction.customId || "";
      if (cid.startsWith("fun:")) {
        const ownerId = interaction.message?.interaction?.user?.id || getFunOwnerId(cid);
        if (ownerId && interaction.user?.id !== ownerId) {
          return interaction.reply({ content: "⛔ Bu panel sana ait değil.", flags: MessageFlags.Ephemeral });
        }

        // HOME / CLOSE
        if (interaction.isButton()) {
          if (cid.startsWith("fun:close:")) {
            return interaction.update({ content: "✅ Panel kapatıldı.", embeds: [], components: [] });
          }
          if (cid.startsWith("fun:home:")) {
            // re-render main panel (inline)
            const embed = new EmbedBuilder()
              .setTitle("🎉 Fun Panel")
              .setDescription("Aşağıdan bir kategori seç. (Hepsi tek panelden, sade.)")
              .addFields(
                { name: "🤝 Actions", value: "Sosyal eylemler", inline: true },
                { name: "🎮 Games", value: "Mini oyunlar ve challenge'lar", inline: true },
                { name: "🧠 Quiz", value: "Kategori seçmeli quiz'ler", inline: true },
                { name: "🎯 Daily", value: "Günlük görevler ve ödüller", inline: true },
                { name: "💞 Relationship", value: "Etkileşim & bağ sistemi", inline: true },
                { name: "🏆 Leaderboard", value: "Haftalık sıralamalar", inline: true },
                { name: "💎 Booster", value: "Booster özel avantajlar", inline: true }
              );

            const row1 = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`fun:menu:${ownerId}`)
                .setPlaceholder("Bir kategori seç…")
                .addOptions(
                  { label: "Actions", value: "actions", emoji: "🤝" },
                  { label: "Games", value: "games", emoji: "🎮" },
                  { label: "Quiz", value: "quiz", emoji: "🧠" },
                  { label: "Daily", value: "daily", emoji: "🎯" },
                  { label: "Relationship", value: "rel", emoji: "💞" },
                  { label: "Leaderboard", value: "lb", emoji: "🏆" },
                  { label: "Booster", value: "booster", emoji: "💎" }
                )
            );

            const row2 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`fun:close:${ownerId}`).setLabel("Close").setStyle(ButtonStyle.Danger)
            );

            return interaction.update({ embeds: [embed], components: [row1, row2], content: "" });
          }

          // DAILY buttons: fun:daily:claim:<owner> / fun:daily:reroll:<owner>
          if (cid.startsWith("fun:daily:claim:")) return Daily.claim(interaction, interaction.guildId, ownerId);
          if (cid.startsWith("fun:daily:reroll:")) return Daily.reroll(interaction, interaction.guildId, ownerId);

          // ===== STAGE5 GAMES ROUTES =====
          if (cid.startsWith("fun:game:back:")) return Games.renderHome(interaction, ownerId);

          if (cid.startsWith("fun:game:start:")) {
            const p = cid.split(":"); // fun:game:start:<type>:<owner>
            const type = p[3];
            if (type === "reaction") return Games.startReaction(interaction, ownerId);
            if (type === "guess") return Games.startGuess(interaction, ownerId);
            if (type === "math") return Games.startMath(interaction, ownerId);
            if (type === "blackjack") return Games.startBlackjack(interaction, ownerId);
            if (type === "duel") return Games.startDuel(interaction, ownerId);
            if (type === "riddle") return Games.startRiddle(interaction, ownerId);
          }

          if (cid.startsWith("fun:game:react:")) return Games.react(interaction, ownerId);

          // Coinflip / Dice
          if (cid.startsWith("fun:game:coinflip:")) return Games.startCoinflip(interaction, ownerId);
          if (cid.startsWith("fun:game:dice:")) return Games.startDice(interaction, ownerId);

          // RPS choice: fun:game:rps:<owner>:<choice>
          if (cid.startsWith("fun:game:rps:")) {
            const p = cid.split(":");
            const choice = p[4];
            return Games.playRps(interaction, ownerId, choice);
          }

          // Math answer: fun:game:math:<owner>:<choice>:<correct>
          if (cid.startsWith("fun:game:math:")) {
            const p = cid.split(":");
            const choice = p[4];
            const correct = p[5];
            return Games.answerMath(interaction, ownerId, choice, correct);
          }
                    // Blackjack buttons
          if (cid.startsWith("fun:game:bj:")) {
            const p = cid.split(":");
            const action = p[4];
            return Games.blackjackAction(interaction, ownerId, action);
          }

          // Duel pick: fun:game:duel:pick:<owner>:<choice>
          if (cid.startsWith("fun:game:duel:pick:")) {
            const p = cid.split(":");
            const choice = p[5];
            return Games.duelPick(interaction, ownerId, choice);
          }

          // Riddle answer: fun:game:riddle:ans:<owner>:<choice>:<correct>
          if (cid.startsWith("fun:game:riddle:ans:")) {
            const p = cid.split(":");
            const choice = p[5];
            const correct = p[6];
            return Games.riddleAnswer(interaction, ownerId, choice, correct);
          }

          // ===== END STAGE5 GAMES ROUTES =====

          // ===== ACTIONS ROUTES =====
          if (cid.startsWith("fun:act:back:")) return Actions.renderHome(interaction, ownerId);
          // fun:act:pick:<action>:<owner>
          if (cid.startsWith("fun:act:pick:")) {
            const p = cid.split(":");
            const action = p[3];
            return Actions.openPicker(interaction, ownerId, action);
          }
          // ===== END ACTIONS ROUTES =====



          // QUIZ back
          if (cid.startsWith("fun:quiz:back:")) {
            const home = Quiz.renderQuizHome(ownerId);
            return interaction.update({ embeds: [home.embed], components: home.components, content: "" });
          }

          // QUIZ answer: fun:quiz:ans:<owner>:<cat>:<choice>:<correct>
          if (cid.startsWith("fun:quiz:ans:")) {
            const p = cid.split(":");
            const category = p[4];
            const choice = Number(p[5]);
            const correct = Number(p[6]);
            const isCorrect = choice === correct;

            await Quiz.recordResult(interaction.guildId, ownerId, isCorrect);
            if (isCorrect) await Daily.bumpProgress(interaction.guildId, ownerId, "quizCorrect", 1);

            const embed = new EmbedBuilder()
              .setTitle(isCorrect ? "✅ Doğru!" : "❌ Yanlış!")
              .setDescription(isCorrect ? "Günlük görevin ilerledi 🎯" : "Sorun değil, tekrar dene 🙂")
              .setFooter({ text: "Quiz • Aşama 3" });

            const nav = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`fun:quiz:back:${ownerId}`).setLabel("Yeni Soru").setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
            );

            return interaction.update({ embeds: [embed], components: [nav], content: "" });
          }

          // REL buttons
          if (cid.startsWith("fun:rel:setfav:")) return Rel.openFavPicker(interaction, ownerId);
          if (cid.startsWith("fun:rel:stats:")) return Rel.renderStats(interaction, interaction.guildId, ownerId);
          if (cid.startsWith("fun:rel:lb:")) return Rel.renderLeaderboard(interaction, interaction.guildId, ownerId);
          if (cid.startsWith("fun:rel:marry:")) return Rel.openMarry(interaction, interaction.guildId, ownerId);
          if (cid.startsWith("fun:rel:divorce:")) return Rel.doDivorce(interaction, interaction.guildId, ownerId);
          if (cid.startsWith("fun:rel:accept:")) return Rel.acceptMarry(interaction, interaction.guildId, ownerId);
          if (cid.startsWith("fun:rel:decline:")) return Rel.declineMarry(interaction, interaction.guildId, ownerId);
          if (cid.startsWith("fun:rel:back:")) return Rel.renderHome(interaction, interaction.guildId, ownerId);
        }

        // Select menus
        if (interaction.isStringSelectMenu()) {
          // main menu
          if (cid.startsWith("fun:menu:")) {
            const value = interaction.values?.[0];
            if (value === "actions") return Actions.renderHome(interaction, ownerId);
            if (value === "games") return Games.renderHome(interaction, ownerId);
            if (value === "daily") return Daily.renderDaily(interaction, interaction.guildId, ownerId);
            if (value === "quiz") {
              const home = Quiz.renderQuizHome(ownerId);
              return interaction.update({ embeds: [home.embed], components: home.components, content: "" });
            }
            if (value === "rel") return Rel.renderHome(interaction, interaction.guildId, ownerId);
            if (value === "lb") return Rel.renderLeaderboard(interaction, interaction.guildId, ownerId);
            if (value === "booster") {
              const isBooster = !!interaction.member?.premiumSince;
              if (!isBooster) {
                return interaction.reply({
                  content: "💎 Bu özellik yalnızca **sunucu booster** kullanıcılarına özeldir!\n\nBoost atarak özel avantajların kilidini açabilirsin 🚀",
                  flags: MessageFlags.Ephemeral,
                });
              }
              return Booster.renderBooster(interaction, ownerId);
            }

            const embed = new EmbedBuilder()
              .setTitle("🎉 Fun Panel")
              .setDescription("Bu kategori şu an kullanıma hazır değil.")
              .setFooter({ text: "Xeins Fun Panel" });

            return interaction.update({ embeds: [embed], content: "" });
          }

          // quiz category
          
          // Games pick menu
          if (cid.startsWith("fun:game:pick:")) {
            const choice = interaction.values?.[0];
            if (choice === "reaction") return Games.startReaction(interaction, ownerId);
            if (choice === "guess") return Games.startGuess(interaction, ownerId);
            if (choice === "math") return Games.startMath(interaction, ownerId);
            if (choice === "coinflip") return Games.startCoinflip(interaction, ownerId);
            if (choice === "dice") return Games.startDice(interaction, ownerId);
            if (choice === "rps") return Games.startRps(interaction, ownerId);
            if (choice === "blackjack") return Games.startBlackjack(interaction, ownerId);
            if (choice === "duel") return Games.startDuel(interaction, ownerId);
            if (choice === "riddle") return Games.startRiddle(interaction, ownerId);
            return Games.renderHome(interaction, ownerId);
          }

          // Guess select menu (same component type)
          if (cid.startsWith("fun:game:guess:")) {
            const v = interaction.values?.[0];
            return Games.pickGuess(interaction, ownerId, v);
          }

if (cid.startsWith("fun:quiz:cat:")) {
            const category = interaction.values?.[0] || "genel";
            const list = Quiz.BANK[category] || Quiz.BANK.genel;
            const item = list[Math.floor(Math.random() * list.length)];
            const correct = item.c;

            const embed = new EmbedBuilder()
              .setTitle(`🧠 Quiz • ${category}`)
              .setDescription(`**${item.q}**`)
              .setFooter({ text: "Butonla cevapla." });

            const buttons = new ActionRowBuilder().addComponents(
              ...item.a.map((txt, i) =>
                new ButtonBuilder()
                  .setCustomId(`fun:quiz:ans:${ownerId}:${category}:${i}:${correct}`)
                  .setLabel(txt)
                  .setStyle(ButtonStyle.Primary)
              )
            );

            const nav = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`fun:quiz:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`fun:home:${ownerId}`).setLabel("Home").setStyle(ButtonStyle.Secondary)
            );

            return interaction.update({ embeds: [embed], components: [buttons, nav], content: "" });
          }
        }

        if (interaction.isUserSelectMenu()) {
          if (cid.startsWith("fun:act:do:")) {
            const p = cid.split(":");
            const action = p[3];
            const targetIds = interaction.values || [];
            return Actions.doAction(interaction, interaction.guildId, ownerId, action, targetIds);
          }

          if (cid.startsWith("fun:rel:pickspouse:")) {
            const targetId = interaction.values?.[0];
            if (!targetId) return interaction.reply({ content: "❌ Kullanıcı seçilemedi.", flags: MessageFlags.Ephemeral });
            const p = await Rel.propose(interaction.guildId, ownerId, targetId);
            if (!p) return interaction.reply({ content: "❌ Teklif gönderilemedi.", flags: MessageFlags.Ephemeral });
            return interaction.update({ content: `💍 Teklif gönderildi: <@${targetId}> (kabul/ret için paneli açabilir)`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fun:rel:back:${ownerId}`).setLabel("Geri").setStyle(ButtonStyle.Secondary))] });
          }

          if (cid.startsWith("fun:rel:pickfav:")) {
            const targetId = interaction.values?.[0];
            if (!targetId) return interaction.reply({ content: "❌ Kullanıcı seçilemedi.", flags: MessageFlags.Ephemeral });

            const saved = await Rel.setFavorite(interaction.guildId, ownerId, targetId);
            if (!saved) {
              return interaction.reply({ content: "❌ Favori kaydedilemedi (storage).", flags: MessageFlags.Ephemeral });
            }
            return Rel.renderHome(interaction, interaction.guildId, ownerId);
          }
        }
      }
    } catch (e) {
      append("funRouterError", String(e?.message || e));
    }
    // ===== END FUN ROUTER V3.3 =====

    try { client.__lastInteractionAt = Date.now(); } catch {}
      try { if (interaction.guildId) Activity.markActive(interaction.guildId, interaction.user.id).catch(() => {}); } catch {}
    try {
      state.lastInteractionAt = Date.now();

      // 3) Cool mode / cold mode: bot sağlıksızsa komutları kilitle
      const inColdMode = computeColdMode(client);

      /* =========================
         🔘 BUTONLAR
      ========================== */
      if (interaction.isButton()) {
        const id = interaction.customId;

        // 🎲 Mini games
        if (id && id.startsWith("rps:")) {
          await handleRpsButton(interaction);
          return;
        }
        if (id && id.startsWith("quiz:")) {
          await handleQuizButton(interaction);
          return;
        }

        // Confirm buttons
        if (id.startsWith("confirm_yes:") || id.startsWith("confirm_no:")) {
          await handleConfirmButton(interaction, client);
          return;
        }

        // Panel buttons
        if (id.startsWith("panel_")) {
          await handlePanelButton(interaction, client);
          return;
        }

        // Help buttons
        if (id && id.startsWith("help_")) {
          await interaction.deferUpdate();

          const helpCmd = client.commands?.get("help");
          if (!helpCmd?.buildHelpEmbed || !helpCmd?.buildHelpButtons) {
            return interaction.editReply({ content: "❌ Help sistemi hazır değil.", embeds: [], components: [] });
          }

          if (id === "help_close") {
            return interaction.editReply({ content: "✅ Help panel kapatıldı.", embeds: [], components: [] });
          }

          if (id === "help_admin" && !isAdmin(interaction)) {
            await interaction.editReply({
              embeds: [helpCmd.buildHelpEmbed("help_home")],
              components: helpCmd.buildHelpButtons("help_home"),
            });

            return interaction.followUp({
              content: "❌ Admin menüsü sadece **adminler** için.",
              flags: MessageFlags.Ephemeral,
            });
          }

          return interaction.editReply({
            embeds: [helpCmd.buildHelpEmbed(id)],
            components: helpCmd.buildHelpButtons(id),
          });
        }

        // Settings panel buttons
        if (id && id.startsWith("settings:")) {
          if (!isAdmin(interaction)) {
            await interaction.reply({ content: "❌ Settings panel sadece adminler içindir.", flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
          }

          if (!assertSettingsOwner(interaction)) return;

          const cfg = getGuild(interaction.guildId);

          if (id === "settings:close") {
            await interaction.deferUpdate();
            try { if (interaction.message?.id) state.settingsPanels.delete(interaction.message.id); } catch (_) {}
            return interaction.editReply({ content: "✅ Panel kapatıldı.", embeds: [], components: [] });
          }

          if (id === "settings:back") {
            await interaction.deferUpdate();
            return interaction.editReply({ embeds: [buildSettingsMainEmbed(cfg)], components: settingsMainComponents() });
          }

          // Snapshot save
          if (id === "settings:snap:save") {
            await interaction.deferUpdate();
            const cur = getGuild(interaction.guildId);
            saveSnapshot(interaction.guildId, {
              byId: interaction.user.id,
              byTag: interaction.user.tag || interaction.user.username,
              data: {
                links: cur.links,
                channels: cur.channels,
                roles: cur.roles,
                features: cur.features,
                voice: cur.voice,
              },
            });
            addAudit(interaction.guildId, { action: "SNAPSHOT_SAVE", byId: interaction.user.id, byTag: interaction.user.tag || interaction.user.username });
            const nextCfg = getGuild(interaction.guildId);
            nextCfg.__guildId = interaction.guildId;
            return interaction.editReply({ embeds: [buildSettingsSystemEmbed(nextCfg)], components: settingsSystemComponents() });
          }

          // Snapshot restore (2-step confirm)
          if (id === "settings:snap:restore") {
            await interaction.deferUpdate();

            const key = `snaprestore:${interaction.guildId}:${interaction.user.id}`;
            confirmStore.put(key, { ok: true }, 60_000);

            const embed = new EmbedBuilder()
              .setTitle("⚠️ Snapshot Geri Yükle")
              .setDescription("Son snapshot ayarları geri yüklenecek. Emin misin?\n\nBu işlem: links/channels/roles/features/voice bölümlerini geri alır.")
              .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("settings:snap:restore_confirm").setLabel("Onayla").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId("settings:snap:restore_cancel").setLabel("Vazgeç").setStyle(ButtonStyle.Secondary)
            );

            return interaction.editReply({ embeds: [embed], components: [row, settingsBackCloseComponents()[0]] });
          }

          if (id === "settings:snap:restore_confirm") {
            await interaction.deferUpdate();
            const key = `snaprestore:${interaction.guildId}:${interaction.user.id}`;
            const ok = confirmStore.get(key);
            confirmStore.del(key);
            if (!ok) {
              return interaction.followUp({ content: "⏳ Onay süresi doldu. Tekrar dene.", flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            const before = getGuild(interaction.guildId);
            const restored = restoreSnapshot(interaction.guildId);
            if (!restored) {
              return interaction.followUp({ content: "❌ Snapshot bulunamadı.", flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            addAudit(interaction.guildId, { action: "SNAPSHOT_RESTORE", byId: interaction.user.id, byTag: interaction.user.tag || interaction.user.username });
            const nextCfg = getGuild(interaction.guildId);
            return interaction.editReply({ embeds: [buildSettingsMainEmbed(nextCfg)], components: settingsMainComponents() });
          }

          if (id === "settings:snap:restore_cancel") {
            await interaction.deferUpdate();
            const nextCfg = getGuild(interaction.guildId);
            nextCfg.__guildId = interaction.guildId;
            return interaction.editReply({ embeds: [buildSettingsSystemEmbed(nextCfg)], components: settingsSystemComponents() });
          }

// Privacy toggle
          if (id === "settings:privacy:toggle") {
            await interaction.deferUpdate();
            const enabled = !(cfg?.features?.privacyMode === true);
            const beforePrivacy = cfg?.features?.privacyMode ? "ON" : "OFF";
            setGuild(interaction.guildId, { features: { privacyMode: enabled } });
            const next = getGuild(interaction.guildId);
            addAudit(interaction.guildId, { action: "FEATURE_TOGGLE", field: "features.privacyMode", byId: interaction.user.id, byTag: interaction.user.tag || interaction.user.username, before: beforePrivacy, after: next?.features?.privacyMode ? "ON" : "OFF" });
            const embed = new EmbedBuilder()
              .setTitle("🔒 Privacy Mode")
              .setDescription(`Varsayılan gizlilik: **${next.features.privacyMode ? "ON" : "OFF"}**`)
              .setTimestamp();
            return interaction.editReply({ embeds: [embed], components: settingsPrivacyComponents(next.features.privacyMode) });
          }

          // Link modals
          if (id.startsWith("settings:link:")) {
            const key = id.split(":")[2];
            const links = cfg?.links || {};
            return interaction.showModal(modalForLink(key, links[key] || ""));
          }

          // AutoRole
          if (id === "settings:autorole:set") {
            const current = cfg?.roles?.autoRoleId || "";
            return interaction.showModal(modalForAutorole(current));
          }

          if (id === "settings:autorole:off") {
            await interaction.deferUpdate();
            const beforeRole = cfg?.roles?.autoRoleId;
            setGuild(interaction.guildId, { roles: { autoRoleId: null } });
            addAudit(interaction.guildId, { action: "ROLE_SET", field: "roles.autoRoleId", byId: interaction.user.id, byTag: interaction.user.tag || interaction.user.username, before: beforeRole, after: null });
            const next = getGuild(interaction.guildId);
            const embed = new EmbedBuilder().setTitle("🎭 AutoRole").setDescription("AutoRole: **Kapalı**").setTimestamp();
            return interaction.editReply({ embeds: [embed], components: settingsAutoroleComponents(Boolean(next?.roles?.autoRoleId)) });
          }

          // Voice
          if (id === "settings:voice:toggle") {
            await interaction.deferUpdate();
            const cur = cfg?.voice || {};
            const beforeVoice = cur.enabled ? "ON" : "OFF";
            setGuild(interaction.guildId, { voice: { ...cur, enabled: !cur.enabled } });
            addAudit(interaction.guildId, { action: "FEATURE_TOGGLE", field: "voice.enabled", byId: interaction.user.id, byTag: interaction.user.tag || interaction.user.username, before: beforeVoice, after: (!cur.enabled) ? "ON" : "OFF" });
            const next = getGuild(interaction.guildId);
            const embed = new EmbedBuilder()
              .setTitle("🔊 Voice (Maskot)")
              .setDescription(
                `Enabled: **${next.voice.enabled ? "ON" : "OFF"}**\nGhost: **${next.voice.ghostMode ? "ON" : "OFF"}**\nChannel: **${next.voice.mascotChannelId || "—"}**\n\nNot: Hosting/UDP engeli varsa bağlanamayabilir.`
              )
              .setTimestamp();
            return interaction.editReply({ embeds: [embed], components: settingsVoiceComponents(next) });
          }

          if (id === "settings:voice:ghost") {
            await interaction.deferUpdate();
            const cur = cfg?.voice || {};
            const beforeGhost = cur.ghostMode ? "ON" : "OFF";
            setGuild(interaction.guildId, { voice: { ...cur, ghostMode: !cur.ghostMode } });
            addAudit(interaction.guildId, { action: "FEATURE_TOGGLE", field: "voice.ghostMode", byId: interaction.user.id, byTag: interaction.user.tag || interaction.user.username, before: beforeGhost, after: (!cur.ghostMode) ? "ON" : "OFF" });
            const next = getGuild(interaction.guildId);
            const embed = new EmbedBuilder()
              .setTitle("🔊 Voice (Maskot)")
              .setDescription(
                `Enabled: **${next.voice.enabled ? "ON" : "OFF"}**\nGhost: **${next.voice.ghostMode ? "ON" : "OFF"}**\nChannel: **${next.voice.mascotChannelId || "—"}**\n\nNot: Hosting/UDP engeli varsa bağlanamayabilir.`
              )
              .setTimestamp();
            return interaction.editReply({ embeds: [embed], components: settingsVoiceComponents(next) });
          }

          if (id === "settings:voice:channel") {
            const current = cfg?.voice?.mascotChannelId || "";
            return interaction.showModal(modalForVoiceChannel(current));
          }

          return;
        }

        return;
      }

      /* =========================
         🧾 SELECT MENÜLER
      ========================== */
      if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
        if (interaction.customId === "settings:menu") {
          if (!isAdmin(interaction)) {
            await interaction.reply({ content: "❌ Settings panel sadece adminler içindir.", flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
          }

          if (!assertSettingsOwner(interaction)) return;

          const cfg = getGuild(interaction.guildId);
          const choice = interaction.values[0];
          await interaction.deferUpdate();

          if (choice === "show") {
            return interaction.editReply({ embeds: [buildSettingsShowEmbed(cfg)], components: settingsBackCloseComponents() });
          }

          if (choice === "links") {
            const embed = new EmbedBuilder().setTitle("🔗 Link Güncelle").setDescription("Hangi linki güncellemek istiyorsun?").setTimestamp();
            return interaction.editReply({ embeds: [embed], components: settingsLinksComponents() });
          }

          if (choice === "autorole") {
            const current = cfg?.roles?.autoRoleId || null;
            const embed = new EmbedBuilder()
              .setTitle("🎭 AutoRole")
              .setDescription(`AutoRole: **${current || "Kapalı"}**\n\nRol ID girerek ayarlayabilirsin.`)
              .setTimestamp();
            return interaction.editReply({ embeds: [embed], components: settingsAutoroleComponents(Boolean(current)) });
          }

          if (choice === "privacy") {
            const enabled = cfg?.features?.privacyMode === true;
            const embed = new EmbedBuilder()
              .setTitle("🔒 Privacy Mode")
              .setDescription(`Varsayılan gizlilik: **${enabled ? "ON" : "OFF"}**`)
              .setTimestamp();
            return interaction.editReply({ embeds: [embed], components: settingsPrivacyComponents(enabled) });
          }

          if (choice === "voice") {
            const embed = new EmbedBuilder()
              .setTitle("🔊 Voice (Maskot)")
              .setDescription(
                `Enabled: **${cfg?.voice?.enabled ? "ON" : "OFF"}**\nGhost: **${cfg?.voice?.ghostMode ? "ON" : "OFF"}**\nChannel: **${cfg?.voice?.mascotChannelId || "—"}**\n\nNot: Hosting/UDP engeli varsa bağlanamayabilir.`
              )
              .setTimestamp();
            return interaction.editReply({ embeds: [embed], components: settingsVoiceComponents(cfg) });
          }

          if (choice === "channels") {
            return interaction.editReply({ embeds: [buildSettingsChannelsEmbed(cfg)], components: settingsChannelsComponents(cfg) });
          }

          if (choice === "features") {
            return interaction.editReply({ embeds: [buildSettingsFeaturesEmbed(cfg)], components: settingsFeaturesComponents(cfg) });
          }

          if (choice === "system") {
            const nextCfg = { ...cfg, __guildId: interaction.guildId };
            return interaction.editReply({ embeds: [buildSettingsSystemEmbed(nextCfg)], components: settingsSystemComponents() });
          }

          if (choice === "history") {
            return interaction.editReply({ embeds: [buildSettingsHistoryEmbed(interaction.guildId)], components: settingsBackCloseComponents() });
          }

          return interaction.editReply({ embeds: [buildSettingsMainEmbed(cfg)], components: settingsMainComponents() });
        }
      }

      /* =========================
         🪟 MODALLAR
      ========================== */
      if (interaction.isModalSubmit && interaction.isModalSubmit()) {
        if (!interaction.customId.startsWith("settings:modal:")) return;
        if (!isAdmin(interaction)) {
          await interaction.reply({ content: "❌ Settings panel sadece adminler içindir.", flags: MessageFlags.Ephemeral }).catch(() => {});
          return;
        }

        if (!assertSettingsOwner(interaction)) return;

          const cfg = getGuild(interaction.guildId);
        const parts = interaction.customId.split(":");
        const type = parts[2];
        const extra = parts[3];

        if (type === "link") {
          const key = extra;
          const value = interaction.fields.getTextInputValue("value");
          if (!value || value.length < 3) {
            return interaction.reply({ content: "❌ Link geçersiz.", flags: MessageFlags.Ephemeral });
          }
          const beforeLink = cfg?.links ? cfg.links[key] : null;
          setGuild(interaction.guildId, { links: { [key]: value } });
          addAudit(interaction.guildId, { action: "LINK_SET", field: `links.${key}`, byId: interaction.user.id, byTag: interaction.user.tag || interaction.user.username, before: beforeLink, after: value });
          const next = getGuild(interaction.guildId);
          await interaction.reply({ content: `✅ ${key} linki güncellendi.`, flags: MessageFlags.Ephemeral });
          // Keep panel clean: try to refresh original message (if any)
          return;
        }

        if (type === "autorole") {
          const roleid = interaction.fields.getTextInputValue("roleid");
          const nextId = roleid === "off" ? null : roleid;
          const beforeAuto = cfg?.roles?.autoRoleId;
          setGuild(interaction.guildId, { roles: { autoRoleId: nextId } });
          addAudit(interaction.guildId, { action: "ROLE_SET", field: "roles.autoRoleId", byId: interaction.user.id, byTag: interaction.user.tag || interaction.user.username, before: beforeAuto, after: nextId });
          await interaction.reply({ content: "✅ AutoRole ayarı kaydedildi.", flags: MessageFlags.Ephemeral });
          return;
        }

        if (type === "voice_channel") {
          const channelid = interaction.fields.getTextInputValue("channelid");
          const cur = cfg?.voice || {};
          const beforeCh = cur.mascotChannelId;
          setGuild(interaction.guildId, { voice: { ...cur, mascotChannelId: channelid } });
          addAudit(interaction.guildId, { action: "VOICE_CHANNEL_SET", field: "voice.mascotChannelId", byId: interaction.user.id, byTag: interaction.user.tag || interaction.user.username, before: beforeCh, after: channelid });
          await interaction.reply({ content: "✅ Voice kanalı ayarlandı.", flags: MessageFlags.Ephemeral });
          return;
        }
      }

      
      // Channel select in Settings panel
      if (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu()) {
        const id = interaction.customId;

        // 🎲 Mini games
        if (id && id.startsWith("rps:")) {
          await handleRpsButton(interaction);
          return;
        }
        if (id && id.startsWith("quiz:")) {
          await handleQuizButton(interaction);
          return;
        }
        if (id && id.startsWith("settings:ch:")) {
          if (!isAdmin(interaction)) {
            return interaction.reply({ content: "❌ Settings panel sadece adminler içindir.", flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          if (!assertSettingsOwner(interaction)) return;

          const key = id.split(":")[2]; // LOG/MODLOG/THANKS/TEXT
          const chosen = interaction.values && interaction.values[0] ? interaction.values[0] : null;
          if (!chosen) {
            await interaction.deferUpdate();
            return;
          }

          await interaction.deferUpdate();

          const map = {
            LOG: "LOG_CHANNEL_ID",
            MODLOG: "MODLOG_CHANNEL_ID",
            THANKS: "THANKS_CHANNEL_ID",
            TEXT: "TEXT_CHANNEL_ID",
          };
          const field = map[key];
          if (!field) return;

          const before = getGuild(interaction.guildId);
          setGuild(interaction.guildId, { channels: { [field]: chosen } });
          const after = getGuild(interaction.guildId);

          addAudit(interaction.guildId, {
            action: "CHANNEL_SET",
            field,
            byId: interaction.user.id,
            byTag: interaction.user.tag || interaction.user.username,
            before: before.channels ? before.channels[field] : null,
            after: chosen,
          });

          return interaction.editReply({
            embeds: [buildSettingsChannelsEmbed(after)],
            components: settingsChannelsComponents(after),
          });
        }
      }
/* =========================
         ⌨️ SLASH KOMUTLARI
      ========================== */
      if (!interaction.isChatInputCommand()) return;

      const commandName = interaction.commandName;
      const command = client.commands?.get(commandName);
      if (!command) return;

      // If cold mode, allow only safe commands
      const allowDuringCold = new Set(["status", "ping", "help"]);
      if (inColdMode && !allowDuringCold.has(commandName)) {
        return interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "🧊 Bot şu an geçici olarak **bakım modunda** (stabilite koruması).\nBirazdan tekrar dene."
        }).catch(() => {});
      }

      // Admin privacy mode (8): default ephemeral for admin/mod commands unless command explicitly wants public
      const cfg = interaction.guildId ? getGuild(interaction.guildId) : null;
      const privacyMode = cfg?.features?.privacyMode === true;

      // Safety defer (only when command asks)
      if (command.defer === true && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply(privacyMode || Boolean(command.ephemeral) ? { flags: MessageFlags.Ephemeral } : {});
      }

      await command.execute(interaction, client);

      // ===== STAGE3 DAILY AUTO-PROGRESS =====
      try {
        const name = interaction.commandName;
        // games progress
        if (["coinflip", "dice", "rps"].includes(name)) {
          Daily.bumpProgress(interaction.guildId, interaction.user.id, "gamesPlayed", 1).catch(() => {});
        }
        // affection progress + relationship score
        if (["hug", "kiss"].includes(name)) {
          if (name === "hug") Activity.bump(interaction.guildId, interaction.user.id, "hugs", 1).catch(() => {});

          Daily.bumpProgress(interaction.guildId, interaction.user.id, "affectionSent", 1).catch(() => {});
          // try to find the first user option target
          const opt = interaction.options?.data?.find((o) => o.user)?.user;
          if (opt?.id) {
            Rel.bumpInteraction(interaction.guildId, interaction.user.id, opt.id, 1).catch(() => {});
          }
        }
      } catch {}
      // ===== END STAGE3 DAILY AUTO-PROGRESS =====

      // ===== ACTIVITY TRACKER =====
      try { if (interaction.guildId) Activity.markActive(interaction.guildId, interaction.user.id).catch(() => {}); } catch {}
      // ===== END ACTIVITY TRACKER =====

    } catch (err) {
      console.error("InteractionCreate error:", err);
      await logErrorOnce(client, interaction, err);

      const payload = { content: "❌ Bir hata oluştu. (Log kanalına yazdım)", flags: MessageFlags.Ephemeral };
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch (_) {}
    }
  },
};
