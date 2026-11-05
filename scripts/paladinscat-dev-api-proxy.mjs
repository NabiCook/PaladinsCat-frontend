#!/usr/bin/env node
/**
 * Local dev-proxy API key injector.
 *
 * The PaladinsCat dev proxy (scripts/Start-PaladinsCatDevProxy.ps1) forwards
 * same-origin /api and /_pc requests to a remote backend (default: production)
 * via NEXT_SERVER_API_URL. That backend requires either an OIDC session
 * (Authorization: Bearer) or a managed developer credential (x-api-key). When
 * previewing live data locally there is no OIDC session, so every request 401s.
 *
 * This tiny loopback-only Node server closes that gap. The dev proxy points
 * NEXT_SERVER_API_URL at it (http://127.0.0.1:3001); it forwards each request
 * to the real backend with a read-only developer credential injected as
 * x-api-key and any Authorization header stripped (a stale Bearer would force
 * the backend down the OIDC path and 401).
 *
 * Security:
 *   - Binds to 127.0.0.1 only (loopback; not reachable from the network).
 *   - The credential is read from a local runtime file (never committed) and
 *     passed via the PALADINSCAT_DEV_PROXY_API_KEY env var.
 *   - Never runs in production (it is a local dev tool, started only by the
 *     dev proxy launcher with -LocalAuthBypass).
 *
 * Usage:
 *   PALADINSCAT_DEV_PROXY_API_KEY_FILE=<path> \
 *   PALADINSCAT_DEV_PROXY_API_KEY=<secret> \
 *   PALADINSCAT_DEV_PROXY_TARGET=https://paladinscat.com \
 *   PALADINSCAT_DEV_PROXY_PORT=3001 node scripts/paladinscat-dev-api-proxy.mjs
 *
 * refs: documents/06-reference/frontend-design-system.md
 */
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { readFileSync } from "node:fs";

const port = Number(process.env.PALADINSCAT_DEV_PROXY_PORT || 3001);
const targetBase = (process.env.PALADINSCAT_DEV_PROXY_TARGET || "https://paladinscat.com").replace(/\/+$/, "");
const targetUrl = new URL(targetBase);
const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(targetUrl.hostname);
if ((targetUrl.protocol !== "https:" && !(loopback && targetUrl.protocol === "http:")) ||
    targetUrl.username || targetUrl.password || targetUrl.pathname !== "/" ||
    targetUrl.search || targetUrl.hash) {
  throw new Error("Developer credentials require an HTTPS origin or an HTTP loopback origin.");
}

// Credential: prefer the env var; otherwise read the file path.
let apiKey = process.env.PALADINSCAT_DEV_PROXY_API_KEY || "";
if (!apiKey && process.env.PALADINSCAT_DEV_PROXY_API_KEY_FILE) {
  apiKey = readFileSync(process.env.PALADINSCAT_DEV_PROXY_API_KEY_FILE, "utf8").trim();
}
if (apiKey.length < 40) {
  console.error("[dev-api-proxy] no developer credential (set PALADINSCAT_DEV_PROXY_API_KEY or _FILE); refusing to start");
  process.exit(2);
}

const transport = targetUrl.protocol === "https:" ? https : http;

const server = http.createServer((req, res) => {
  // The dev proxy rewrites /api/:path* and /_pc/:path* to <key-injector>/:path*.
  // The real backend serves those under /api, so prepend /api to the incoming
  // path. (targetBase is the origin, e.g. https://paladinscat.com.)
  const incoming = req.url || "/";
  // The website API (/api/players/:id) requires a browser session; the public
  // API (/api/v1/players/:id) accepts x-api-key. Rewrite to /v1 so the
  // developer credential is honored.
  // The preview relay may already supply /v1; apply the namespace once.
  const unversioned = incoming.replace(/^\/v1(?=\/|\?|$)/, "");
  const targetPath = "/api/v1" + (unversioned.startsWith("/") ? unversioned : "/" + unversioned);
  const headers = { ...req.headers };
  // Strip any Authorization (stale Bearer would force the OIDC path -> 401).
  delete headers.authorization;
  delete headers["Authorization"];
  // Inject the read-only developer credential.
  headers["x-api-key"] = apiKey;
  // Host must match the real backend for the TLS SNI + routing.
  headers.host = targetUrl.host;

  const upstream = transport.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      path: targetPath,
      method: req.method,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`dev-api-proxy upstream error: ${err.message}`);
  });
  req.pipe(upstream);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[dev-api-proxy] listening on http://127.0.0.1:${port} -> ${targetBase}`);
});
