
const http = require("http");
const os = require("os");

function startMonitorServer(client) {
  const host = "127.0.0.1";
  const port = process.env.MONITOR_PORT || 8787;
  const apiKey = process.env.MONITOR_KEY || "";

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${host}:${port}`);

    if (apiKey && url.searchParams.get("key") !== apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
    }

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (url.pathname === "/stats") {
      const mem = process.memoryUsage();
      const payload = {
        ok: true,
        bot: {
          ready: !!client?.isReady?.(),
          wsPing: client?.ws?.ping ?? null,
          guilds: client?.guilds?.cache?.size ?? null,
          uptimeMs: client?.uptime ?? null,
        },
        system: {
          loadavg: os.loadavg(),
          freemem: os.freemem(),
          totalmem: os.totalmem(),
          platform: os.platform(),
          node: process.version,
        },
        time: new Date().toISOString(),
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(payload));
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });

  server.listen(port, host, () => {
    console.log(`[monitor] listening on http://${host}:${port}`);
  });
}

module.exports = { startMonitorServer };
