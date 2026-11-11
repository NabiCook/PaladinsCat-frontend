/** Exercise compiled Next cookie persistence with loopback-only HTTP fixtures. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv.includes("--serve")) {
  // Rewrites are captured at build time. Change only this disposable child's
  // in-memory manifest reads so compiled fallback requests cannot reach live APIs.
  const fixtureManifest = (file, value) => {
    if (!String(file).replaceAll("\\", "/").endsWith("/routes-manifest.json")) return value;
    const manifest = JSON.parse(String(value));
    for (const rewrite of manifest.rewrites.fallback) {
      rewrite.destination = `${process.env.PC_FIXTURE_BACKEND}/:path*`;
    }
    const output = JSON.stringify(manifest);
    return typeof value === "string" ? output : Buffer.from(output);
  };
  const read = fs.readFileSync.bind(fs);
  fs.readFileSync = (file, options) => fixtureManifest(file, read(file, options));
  const readAsync = fs.promises.readFile.bind(fs.promises);
  fs.promises.readFile = async (file, options) => fixtureManifest(file, await readAsync(file, options));
  // Fail before an accidental live request if a future Next release changes
  // how rewrite manifests are loaded. Only loopback fixture traffic is allowed.
  for (const name of ["node:http", "node:https"]) {
    const transport = require(name), request = transport.request;
    transport.request = (...args) => {
      const target = args[0] instanceof URL || typeof args[0] === "string" ? new URL(args[0]) : args[0];
      const host = target.hostname || target.host;
      assert.ok(host === "127.0.0.1" || host === "localhost", `External fixture request denied: ${host}`);
      return request(...args);
    };
  }
  const { startServer } = require("next/dist/server/lib/start-server");
  await startServer({ dir: repo, hostname: "127.0.0.1", port: Number(process.env.PC_FIXTURE_PORT), isDev: false });
} else {
  const pro = JSON.parse(fs.readFileSync(join(repo, "package.json"), "utf8")).name.endsWith("-pro");
  const compiled = ts.transpileModule(fs.readFileSync(join(repo, "lib/website-gate.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(require, loaded, loaded.exports);
  const gate = loaded.exports;
  const account = { id: 42, linked_player_id: "42", invitation_required: false, invitation_active: pro,
    regulation_stage: 0, access_restriction_kind: null, access_restriction: null };
  let authReads = 0, renders = 0, imageChecks = 0;
  let imageGrant = "verified";
  const imageId = "1281129406";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
  const backend = createServer((request, response) => {
    const path = new URL(request.url, "http://fixture.invalid").pathname;
    const session = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7) : request.headers.cookie?.match(/__Host-pc_session=([^;]+)/)?.[1];
    response.setHeader("Content-Type", "application/json");
    if (path === '/matches/' + imageId) {
      imageChecks++;
      assert.equal(session, "fixture-session");
      assert.equal(new URL(request.url, "http://fixture.invalid").searchParams.get("skipRecovery"), "true");
      if (imageGrant === "denied") {
        response.statusCode = 429; response.setHeader("Retry-After", "17");
        response.end(JSON.stringify({ error: { code: "MATCH_DAILY_LIMIT_REACHED" } }));
      } else {
        const access = imageGrant === "verified"
          ? { tier: "verified", limit: null, remaining: null, resetAtMs: null }
          : { tier: imageGrant, limit: imageGrant === "guest" ? 5 : 50, remaining: 0, resetAtMs: 1800000000000 };
        response.end(JSON.stringify({ count: 1, matches: [{ match: { match_id: imageId }, players: [] }],
          ...(imageGrant === "missing" ? {} : { access }) }));
      }
    } else if (path === '/matches/' + imageId + '/image') {
      renders++;
      assert.equal(request.headers.authorization, undefined);
      assert.equal(request.headers.cookie, undefined);
      response.setHeader("Content-Type", "image/png"); response.end(png);
    } else if (path === "/auth/me") {
      authReads++;
      response.statusCode = session === "fixture-session" ? 200 : 401;
      response.end(JSON.stringify(session === "fixture-session" ? account : { error: { code: "SESSION_INVALID" } }));
    } else if (path === "/players/search" && session !== "fixture-session") {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: { code: "LOGIN_REQUIRED" } }));
    } else {
      response.end(JSON.stringify({ fixture: true, path }));
    }
  });
  let child, secretFile, fixtureDirectory;
  try {
    await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
    const backendOrigin = `http://127.0.0.1:${backend.address().port}`;
    const reserve = createServer();
    await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
    const port = reserve.address().port;
    await new Promise(resolve => reserve.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const runtimeRoot = resolve(join(repo, "../local/runtime"));
    const fixtureRoot = join(runtimeRoot, "operator-transient");
    fs.mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
    // Atomically reserve a private, unpredictable namespace; never check a
    // predictable file and then mutate/recycle that same pathname.
    fixtureDirectory = fs.mkdtempSync(join(fixtureRoot, "admission-http-"));
    secretFile = join(fixtureDirectory, "gate.fixture");
    const secret = "ab".repeat(32); // Disposable fixture, never a production credential.
    fs.writeFileSync(secretFile, secret, { flag: "wx", mode: 0o600 });
    child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve"], {
      cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production", PC_FIXTURE_PORT: String(port), PC_FIXTURE_BACKEND: backendOrigin,
        NEXT_SERVER_API_URL: backendOrigin, PALADINSCAT_RENDER_URL: backendOrigin, PALADINSCAT_PUBLIC_ORIGIN: origin, PALADINSCAT_WEBSITE_GATE_SECRET_FILE: secretFile },
    });
    let output = "";
    child.stdout.on("data", chunk => { output = (output + chunk).slice(-8000); });
    child.stderr.on("data", chunk => { output = (output + chunk).slice(-8000); });
    const http = (path, headers = {}) => fetch(`${origin}${path}`, { redirect: "manual", signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json", "sec-fetch-site": "same-origin", "x-forwarded-proto": "https", origin, ...headers } });
    const start = Date.now();
    while (true) {
      assert.ok(Date.now() - start < 30_000, `Compiled server startup exceeded 30 seconds: ${output}`);
      assert.equal(child.exitCode, null, `Compiled server exited: ${output}`);
      try { await http("/ads.txt"); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    const credentialModes = [{ cookie: "__Host-pc_session=fixture-session" }, ...(pro ? [] : [{ authorization: "Bearer fixture-session" }])];
    let compiledCookieFlows = 0, warmSearchReads = 0;
    for (const credentials of credentialModes) {
    for (const guest of [undefined, gate.issueGuest(secret, origin, Date.now() - (gate.GUEST_TTL_SECONDS + 1) * 1000)]) {
      const accountCookie = [credentials.cookie, guest ? `${gate.GUEST_COOKIE}=${guest}` : ""].filter(Boolean).join("; ");
      const session = await http("/api/auth/me", { ...credentials, cookie: accountCookie });
      assert.equal(session.status, 200, `App-owned auth failed: ${output}`);
      assert.deepEqual(await session.json(), account);
      const admissionCookie = session.headers.getSetCookie().find(cookie => cookie.startsWith(`${gate.GUEST_COOKIE}=`));
      assert.ok(admissionCookie, "Compiled auth response must persist renewed guest admission");
      for (const attribute of [/; Path=\//i, /; HttpOnly/i, /; Secure/i, /; SameSite=Lax/i, /; Max-Age=86400/i]) {
        assert.match(admissionCookie, attribute);
      }
      const token = admissionCookie.split(";", 1)[0].slice(gate.GUEST_COOKIE.length + 1);
      assert.equal(gate.validGuest(token, secret, origin), true);
      compiledCookieFlows++;
      for (const path of ["/api/search/universal?q=fixture", "/api/players/search?q=fixture",
        "/_pc/search/universal?q=fixture", "/_pc/players/search?q=fixture"]) {
        const before = authReads;
        const search = await http(path, { ...credentials, cookie: [credentials.cookie, `${gate.GUEST_COOKIE}=${token}`].filter(Boolean).join("; ") });
        assert.equal(search.status, 200, path);
        assert.equal((await search.json()).fixture, true, path);
        assert.equal(authReads - before, pro ? 1 : 0, "Warm reads preserve the existing surface proof policy");
        warmSearchReads++;
      }
    }
    }
    let expiredBrowserFlows = 0;
    if (!pro) {
      for (const path of ["/api/auth/me", "/_pc/auth/me"]) {
        for (const cookie of ["", `${gate.GUEST_COOKIE}=${gate.issueGuest(secret, origin, Date.now() - (gate.GUEST_TTL_SECONDS + 1) * 1000)}`,
          "__Host-pc_session=invalid; __Host-pc_guest=tampered"]) {
          const rejection = await http(path, { cookie });
          assert.equal(rejection.status, 401, "Expired browser must receive the backend's real auth rejection");
          assert.equal((await rejection.json()).error.code, "SESSION_INVALID");
          const cookies = rejection.headers.getSetCookie();
          assert.equal(cookies.some(value => value.startsWith("__Host-pc_session=") || value.startsWith("__Host-pc_csrf=")), false);
          const guest = cookies.find(value => value.startsWith(`${gate.GUEST_COOKIE}=`));
          assert.ok(guest, "Rejected auth control must persist unprivileged guest admission");
          const guestHeader = guest.split(";", 1)[0];
          const publicSearch = await http("/api/search/universal?q=fixture", { cookie: guestHeader });
          assert.equal(publicSearch.status, 200);
          assert.equal((await publicSearch.json()).fixture, true);
          const protectedSearch = await http("/api/players/search?q=fixture", { cookie: guestHeader });
          assert.equal(protectedSearch.status, 401);
          assert.equal((await protectedSearch.json()).error.code, "LOGIN_REQUIRED");
          expiredBrowserFlows++;
        }
      }
      for (const path of ["/api/search/universal?q=fixture", "/api/players/search?q=fixture", "/_pc/players/search?q=fixture"]) {
        const denied = await http(path);
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.getSetCookie().length, 0);
      }
      const unsafe = await fetch(`${origin}/api/auth/me`, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000),
        headers: { "sec-fetch-site": "same-origin", origin } });
      assert.equal(unsafe.status, 403);
      assert.equal(unsafe.headers.getSetCookie().length, 0);
    }
    const foreign = await http("/api/auth/me", { cookie: "__Host-pc_session=fixture-session", origin: "https://foreign.invalid" });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.getSetCookie().length, 0);
    const imageHeaders = { cookie: "__Host-pc_session=fixture-session; " + gate.GUEST_COOKIE + "=" + gate.issueGuest(secret, origin) };
    let aliasDenials = 0;
    for (const prefix of ["/API", "/Api", "/_PC", "/%61pi", "/%5Fpc"]) {
      for (const feed of ["active", "inactive"]) {
        const denied = await http(prefix + "/cheaters/" + feed, imageHeaders);
        assert.equal(denied.status, 400, prefix);
        assert.equal((await denied.json()).error.code, "NON_CANONICAL_API_PATH"); aliasDenials++;
      }
    }
    for (const tier of ["guest", "account", "verified"]) {
      imageGrant = tier;
      const image = await http("/match-images/" + imageId, imageHeaders);
      assert.equal(image.status, 200, tier);
      assert.equal(image.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    }
    imageGrant = "denied";
    const quota = await http("/match-images/" + imageId, imageHeaders);
    assert.equal(quota.status, 429, "Cached render must not bypass a fresh quota check");
    assert.equal(quota.headers.get("retry-after"), "17");
    assert.equal((await quota.json()).error.code, "MATCH_DAILY_LIMIT_REACHED");
    imageGrant = "missing";
    assert.equal((await http("/match-images/" + imageId, imageHeaders)).status, 503);
    assert.equal(renders, 3, "Denied or unproven grants must not reach the renderer");
    assert.equal(imageChecks, 5);
    console.log(JSON.stringify({ surface: pro ? "pro" : "public", compiledCookieFlows, warmSearchReads, expiredBrowserFlows,
      aliasDenials, imageChecks, renders, admissionChecksPassed: true }));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = await new Promise(resolve => {
        const timer = setTimeout(() => resolve(false), 5000);
        child.once("exit", () => { clearTimeout(timer); resolve(true); });
        child.kill();
      });
      assert.equal(stopped, true, "Owned compiled server did not stop");
    }
    backend.closeAllConnections();
    await new Promise(resolve => backend.close(resolve));
    if (fixtureDirectory) {
      // Recycle only the atomically allocated directory owned by this run.
      // Do not introduce check/use races by inspecting a file before cleanup.
      const target = fixtureDirectory;
      assert.equal(dirname(target), resolve(repo, "../local/runtime/operator-transient"));
      const python = process.platform === "win32" ? "C:/Python314/python.exe" : "python3";
      const recycled = spawnSync(python, ["-B", "-c", "import sys; from send2trash import send2trash; send2trash(sys.argv[1])", target], {
        windowsHide: true, timeout: 10_000, encoding: "utf8",
      });
      assert.equal(recycled.status, 0, `Fixture recycling failed: ${recycled.stderr || recycled.error || "unknown error"}`);
      assert.equal(fs.existsSync(target), false, "Owned fixture still exists after recycling");
    }
  }
}
