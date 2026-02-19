// src/monitor/server.js
// Stable monitor server (local-only by default).
// Fixes: SyntaxError: Unexpected end of input

"use strict";

const http = require("http");
const os = require("os");
const url = require("url");

let started = false;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function getClientSnapshot(client) {
  try {
    return {
      ready: typeof client?.isReady === "function" ? client.isReady() : null,
      wsPing: client?.ws?.ping ?? null,
      guilds: client?.guilds?.cache?.size ?? null,
      userTag: client?.user ? `${client.user.username}#${client.user.discriminator}` : null,
      lastInteractionAt: client?._lastInteractionAt ?? null,
      lastReconnectAt: client?._lastReconnectAt ?? null,
      watchdog: client?._watchdog ?? null,
    };
  } catch {
    return {
      ready: null,
      wsPing: null,
      guilds: null,
      userTag: null,
      lastInteractionAt: null,
      lastReconnectAt: null,
      watchdog: null,
    };
  }
}

function startMonitorServer(client) {
  if (started) return;
  started = true;

  const host = process.env.MONITOR_HOST || "127.0.0.1";
  const port = Number(process.env.MONITOR_PORT || 8787);

  const server = http.createServer((req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const path = parsed.pathname || "/";

      if (path === "/" || path === "/health") {
        return sendJson(res, 200, { ok: true, ts: Date.now() });
      }

      if (path === "/stats") {
        const mem = process.memoryUsage();
        const payload = {
          ok: true,
          ts: Date.now(),
          pid: process.pid,
          node: process.version,
          platform: process.platform,
          uptimeMs: Math.round(process.uptime() * 1000),
          rssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
          heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
          heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
          loadavg: os.loadavg(),
          cpus: os.cpus()?.length ?? null,
          freeMemMB: Math.round((os.freemem() / 1024 / 1024) * 10) / 10,
          totalMemMB: Math.round((os.totalmem() / 1024 / 1024) * 10) / 10,
          bot: getClientSnapshot(client),
        };
        return sendJson(res, 200, payload);
      }

      return sendJson(res, 404, { ok: false, error: "not_found" });
    } catch (err) {
      console.error("[monitor] handler error:", err);
      return sendJson(res, 500, { ok: false, error: "server_error" });
    }
  });

  server.on("error", (err) => {
    console.error("[monitor] server error:", err);
  });

  server.listen(port, host, () => {
    console.log(`[monitor] listening on http://${host}:${port}`);
  });
}

module.exports = { startMonitorServer };
