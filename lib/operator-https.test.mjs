import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:https";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Agent, buildConnector } from "undici";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}
const listen = server => new Promise((yes, no) => { server.once("error", no); server.listen(0, "127.0.0.1", () => yes(server.address().port)); });
const close = server => { server.closeAllConnections(); return new Promise(yes => server.close(yes)); };

test("real operator HTTPS rejects wrong peers/interception and preserves private proxy boundaries", { timeout: 90_000 }, async () => {
  const parent = resolve(process.env.PALADINSCAT_TEST_TMP_ROOT || tmpdir());
  const dir = mkdtempSync(join(parent, "operator-https-"));
  const openssl = process.env.OPENSSL_BIN || (process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/openssl.exe") ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl");
  const run = (...args) => execFileSync(openssl, args, { cwd: dir, stdio: "pipe", timeout: 15_000, windowsHide: true });
  const file = name => join(dir, name);
  const read = name => readFileSync(file(name));
  const env = {
    PALADINSCAT_OPERATOR_BFF: "1", PALADINSCAT_OPERATOR_ORIGIN: "https://operator.example:8444",
    PALADINSCAT_PUBLIC_ORIGIN: "https://operator.example:8444", OIDC_CLIENT_ID: "paladinscat-operator",
    PALADINSCAT_SERVICE_OIDC_CLIENT_ID: "paladinscat-operator-bff", NEXT_SERVER_API_URL: "https://backend-rust-operator:3006/v1",
    PALADINSCAT_OPERATOR_TLS_CA_FILE: file("trusted.pem"), PALADINSCAT_OPERATOR_TLS_CERT_FILE: file("bff.pem"),
    PALADINSCAT_OPERATOR_TLS_KEY_FILE: file("bff.key"), PALADINSCAT_OPERATOR_TLS_CLIENT_CERTS_FILE: file("gateway.pem"),
    PALADINSCAT_OPERATOR_API_CA_FILE: file("trusted.pem"), PALADINSCAT_OPERATOR_API_CERT_FILE: file("client.pem"),
    PALADINSCAT_OPERATOR_API_KEY_FILE: file("client.key"),
  };
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const servers = [], agents = [];
  let targetPort, backendCalls = 0, pageCalls = 0, intercepted = 0, redirect = false;
  class FixtureAgent extends Agent {
    constructor(options) {
      assert.equal(options.connect.rejectUnauthorized, true);
      const connect = buildConnector(options.connect);
      super({ ...options, connect: (connection, callback) => connect({ ...connection, hostname: "127.0.0.1", port: String(targetPort), servername: connection.hostname }, callback) });
      agents.push(this);
    }
  }
  try {
    for (const name of ["trusted", "rogue"]) run("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.pem`, "-days", "2", "-subj", `/CN=Disposable-${name}`, "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
    for (const [name, ca, dns, purpose] of [["backend", "trusted", "backend-rust-operator", "serverAuth"], ["interceptor", "rogue", "backend-rust-operator", "serverAuth"], ["wrong-name", "trusted", "wrong.internal", "serverAuth"], ["bff", "trusted", "frontend-operator", "serverAuth"], ["client", "trusted", "bff-client", "clientAuth"], ["gateway", "trusted", "gateway", "clientAuth"], ["exporter", "trusted", "exporter", "clientAuth"], ["rogue-client", "rogue", "gateway", "clientAuth"]]) {
      run("req", "-new", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${dns}`);
      writeFileSync(file(`${name}.ext`), `subjectAltName=DNS:${dns}\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=${purpose}\nkeyUsage=critical,digitalSignature\n`);
      run("x509", "-req", "-in", `${name}.csr`, "-CA", `${ca}.pem`, "-CAkey", `${ca}.key`, "-CAcreateserial", "-out", `${name}.pem`, "-days", "2", "-sha256", "-extfile", `${name}.ext`);
    }
    Object.assign(process.env, env);
    const plane = load("./operator-plane.ts");
    const transport = load("./operator-transport.mjs", { undici: { Agent: FixtureAgent }, "./operator-plane.ts": plane });
    for (const name of ["backend", "interceptor", "wrong-name"]) {
      const server = createServer({ key: read(`${name}.key`), cert: read(`${name}.pem`), ca: read("trusted.pem"), requestCert: true, rejectUnauthorized: true, minVersion: "TLSv1.3" }, (req, res) => {
        if (name !== "backend") intercepted++;
        if (redirect) res.writeHead(302, { location: "http://127.0.0.1:1/steal" });
        else res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ peer: req.socket.getPeerCertificate().subject.CN }));
      });
      servers.push(server); targetPort = await listen(server);
      const liveTransport = load("./operator-transport.mjs", { undici: { Agent: FixtureAgent }, "./operator-plane.ts": plane });
      if (name === "backend") assert.equal((await (await liveTransport.operatorBackendFetch("https://backend-rust-operator:3006/v1/admin")).json()).peer, "bff-client");
      else await assert.rejects(liveTransport.operatorBackendFetch("https://backend-rust-operator:3006/v1/admin"));
      await Promise.all(agents.splice(0).map(agent => agent.destroy()));
    }
    assert.equal(intercepted, 0, "no HTTP secret is sent through a wrong server chain or name");
    const freshTransport = load("./operator-transport.mjs", { undici: { Agent: FixtureAgent }, "./operator-plane.ts": plane });
    targetPort = servers[0].address().port; redirect = true;
    await assert.rejects(freshTransport.operatorBackendFetch("https://backend-rust-operator:3006/v1/admin", { redirect: "follow" }));
    redirect = false;
    for (const [variable, name] of [["PALADINSCAT_OPERATOR_API_KEY_FILE", "exporter.key"], ["PALADINSCAT_OPERATOR_API_CERT_FILE", "bff.pem"], ["PALADINSCAT_OPERATOR_API_CA_FILE", "rogue.pem"]]) {
      const previous = process.env[variable]; process.env[variable] = file(name);
      await assert.rejects(freshTransport.operatorBackendFetch("https://backend-rust-operator:3006/v1/admin"));
      process.env[variable] = previous;
    }
    let last;
    const { createOperatorServer } = load("./operator-server-core.mjs", { "./operator-plane.ts": plane, "./operator-transport.mjs": transport });
    const bff = createOperatorServer((_req, res) => { pageCalls++; res.end("private page"); }, async (url, init) => {
      backendCalls++; last = { url: String(url), init };
      if (url.searchParams.has("fail")) throw new Error("fixture private detail");
      if (url.searchParams.has("large")) return new Response(new Uint8Array(8_388_609));
      if (url.searchParams.has("media")) return new Response(new Uint8Array(12_582_912), { headers: { "content-type": "image/png" } });
      if (url.searchParams.has("mediaOversize")) return new Response(new Uint8Array(16_777_217));
      return Response.json({ ok: true }, { headers: { "set-cookie": "untrusted=never-forward", "x-forwarded-for": "never-forward" } });
    });
    servers.push(bff); const bffPort = await listen(bff);
    const query = (path, { peer = "gateway", method = "GET", headers = {}, body } = {}) => new Promise((yes, no) => {
      const req = request({ host: "127.0.0.1", port: bffPort, servername: "frontend-operator", path, method,
        ca: read("trusted.pem"), ...(peer ? { cert: read(`${peer}.pem`), key: read(`${peer}.key`) } : {}),
        minVersion: "TLSv1.3", agent: false, timeout: 5000, headers: { host: "operator.example:8444", ...headers } }, res => {
        const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.once("error", no);
        res.once("end", () => yes({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      });
      req.once("error", no); req.once("timeout", () => req.destroy(new Error("fixture request timeout"))); req.end(body);
    });
    await assert.rejects(query("/admin", { peer: null }));
    await assert.rejects(query("/admin", { peer: "rogue-client" }));
    assert.equal((await query("/admin", { peer: "exporter", headers: { "x-operator-peer": "gateway" } })).status, 403);
    assert.equal(pageCalls + backendCalls, 0);
    assert.equal((await query("/admin")).status, 200);
    assert.equal((await query("/admin", { headers: { host: "public.example" } })).status, 400);
    for (const path of ["/api/%61dmin/accounts", "/admin//accounts", "/admin/../players"]) assert.equal((await query(path)).status, 400);
    for (const path of ["/api/players/1", "/api/operator/audit/export", "/_pc/operator/audit/ack"]) assert.equal((await query(path)).status, 404);
    assert.equal(backendCalls, 0);
    assert.equal((await query("/api/admin/accounts", { method: "POST", headers: { origin: "https://public.example" }, body: "{}" })).status, 403);
    assert.equal(backendCalls, 0);
    const success = await query("/_pc/admin/accounts?limit=2", { headers: { cookie: "__Host-pc_session=public; __Host-pc_admin_session=private; __Host-pc_csrf=csrf; unrelated=secret", "x-forwarded-for": "spoof", "x-operator-peer": "gateway" } });
    assert.equal(success.status, 200);
    assert.equal(last.url, "https://backend-rust-operator:3006/v1/admin/accounts?limit=2");
    assert.equal(last.init.headers.get("cookie"), "__Host-pc_admin_session=private; __Host-pc_csrf=csrf");
    assert.equal(last.init.headers.get("x-forwarded-for"), null);
    assert.equal(last.init.headers.get("x-operator-peer"), null);
    assert.equal(success.headers["set-cookie"], undefined);
    assert.equal(success.headers["cache-control"], "private, no-store");
    assert.equal((await query("/api/admin/accounts", { method: "POST", headers: { origin: "https://operator.example:8444", "content-type": "application/json" }, body: "{}" })).status, 200);
    assert.equal(last.init.body.toString(), "{}");
    for (const [method, path] of [["POST", "/players/42/clear-tag"], ["GET", "/cheaters/evidence/review"], ["POST", "/cheaters/evidence/42/review"], ["PUT", "/community/posts/42"], ["DELETE", "/community/comments/42"], ["DELETE", "/community/chat/42"], ["PUT", "/tierlists/42"]]) {
      assert.equal((await query(`/api${path}`, { method, headers: { origin: "https://operator.example:8444" } })).status, 200);
      assert.equal(last.url, `https://backend-rust-operator:3006/v1${path}`);
    }
    const media = await query("/api/cheaters/evidence/42/media/0?media=1");
    assert.equal(media.status, 200);
    assert.equal(media.body.length, 12_582_912, "existing maximum-sized review images remain reachable");
    assert.equal(media.headers["content-type"], "image/png");
    assert.equal((await query("/api/cheaters/evidence/42/file?mediaOversize=1")).status, 502);
    const before = backendCalls;
    assert.equal((await query("/api/admin/accounts", { method: "POST", headers: { origin: "https://operator.example:8444", "content-length": "131073" } })).status, 413);
    assert.equal(backendCalls, before);
    for (const suffix of ["?fail=1", "?large=1"]) {
      const response = await query(`/api/admin/accounts${suffix}`);
      assert.equal(response.status, 502);
      assert.doesNotMatch(response.body, /fixture private detail/);
    }
  } finally {
    await Promise.all(agents.map(agent => agent.destroy()));
    await Promise.all(servers.map(close));
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    const child = relative(parent, dir);
    assert.ok(child.startsWith("operator-https-") && !child.includes("..") && resolve(dir).startsWith(parent));
    // This directory is owned by this test; runner scratch mounts may not support Trash.
    rmSync(dir, { recursive: true });
    assert.equal(existsSync(dir), false);
  }
});
