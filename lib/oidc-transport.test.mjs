import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as httpServer } from "node:http";
import { createServer } from "node:https";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Agent, buildConnector, Dispatcher1Wrapper } from "undici";
import ts from "typescript";

const require = createRequire(import.meta.url);
const endpoint = "https://keycloak:8443/realms/paladinscat/protocol/openid-connect/token";
const publicIssuer = "https://auth.example/realms/paladinscat";

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}

function listen(server) {
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve(server.address().port)); });
}
function close(server) { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); }

test("provider endpoints fail closed and public HTTPS keeps ordinary trust", async () => {
  const { oidcFetch } = load("./oidc-transport.ts");
  const oldFetch = globalThis.fetch;
  const oldCa = process.env.PALADINSCAT_OIDC_CA_FILE;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(init.redirect, "error");
    assert.equal(init.dispatcher, undefined, "private CA is not added to public HTTPS trust");
    assert.ok(init.signal);
    return Response.json({ ok: true });
  };
  try {
    for (const url of ["http://keycloak:8080/realms/paladinscat/protocol/openid-connect/token", "http://auth.example/realms/paladinscat", endpoint.replace(":8443", ":8080"), `${endpoint}?q=1`, `${endpoint}#x`, endpoint.replace("keycloak:", "user:pass@keycloak:")]) {
      await assert.rejects(oidcFetch(url));
    }
    delete process.env.PALADINSCAT_OIDC_CA_FILE;
    await assert.rejects(oidcFetch(endpoint), /PALADINSCAT_OIDC_CA_FILE/);
    process.env.PALADINSCAT_OIDC_CA_FILE = "/nonexistent/disposable-oidc-ca.pem";
    await assert.rejects(oidcFetch(endpoint));
    assert.equal(calls, 0, "no provider request before transport validation");
    await oidcFetch(`${publicIssuer}/protocol/openid-connect/token`, { redirect: "follow" });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldCa === undefined) delete process.env.PALADINSCAT_OIDC_CA_FILE; else process.env.PALADINSCAT_OIDC_CA_FILE = oldCa;
  }
});

test("private provider TLS rejects interception, wrong names and redirects; valid login keys remain usable", { timeout: 90_000 }, async () => {
  const parent = resolve(process.env.PALADINSCAT_TEST_TMP_ROOT || tmpdir());
  const dir = mkdtempSync(join(parent, "oidc-tls-"));
  const openssl = process.env.OPENSSL_BIN || (process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/openssl.exe") ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl");
  const run = (...args) => execFileSync(openssl, args, { cwd: dir, stdio: "pipe", timeout: 20_000, windowsHide: true });
  const servers = [];
  const agents = [];
  const oldCa = process.env.PALADINSCAT_OIDC_CA_FILE;
  let targetPort;
  let validRequests = 0;
  let attackerRequests = 0;
  let redirectedRequests = 0;
  let redirect = false;
  const genuine = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = key => ({ ...key.export({ format: "jwk" }), kid: "same-kid", use: "sig" });
  const token = key => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "same-kid", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: publicIssuer, sub: "fixture-user", aud: "web", iat: now, exp: now + 60, nonce: "bound-nonce" })).toString("base64url");
    return `${header}.${payload}.${sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), key).toString("base64url")}`;
  };
  class FixtureAgent extends Agent {
    constructor(options) {
      assert.equal(options.connect.rejectUnauthorized, true);
      const connector = buildConnector(options.connect);
      super({ ...options, connect: (connection, callback) => connector({ ...connection, hostname: "127.0.0.1", port: String(targetPort), servername: connection.hostname }, callback) });
      agents.push(this);
    }
  }
  try {
    for (const name of ["trusted", "attacker"]) run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.pem`, "-days", "2", "-subj", `/CN=Disposable-${name}-CA`, "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
    for (const [name, ca, dns] of [["valid", "trusted", "keycloak"], ["interceptor", "attacker", "keycloak"], ["wrong-name", "trusted", "other.internal"]]) {
      run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${dns}`);
      writeFileSync(join(dir, `${name}.ext`), `subjectAltName=DNS:${dns}\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n`);
      run("x509", "-req", "-in", `${name}.csr`, "-CA", `${ca}.pem`, "-CAkey", `${ca}.key`, "-CAcreateserial", "-out", `${name}.pem`, "-days", "2", "-sha256", "-extfile", `${name}.ext`);
    }
    const transport = () => load("./oidc-transport.ts", { undici: { Agent: FixtureAgent, Dispatcher1Wrapper } });
    const caPath = join(dir, "current-ca.pem");
    process.env.PALADINSCAT_OIDC_CA_FILE = caPath;
    for (const bad of ["", "not a certificate", "x".repeat(65_537), readFileSync(join(dir, "valid.pem"), "utf8")]) {
      writeFileSync(caPath, bad);
      await assert.rejects(transport().oidcFetch(endpoint));
    }
    writeFileSync(caPath, readFileSync(join(dir, "trusted.pem")));
    const sink = httpServer((_request, response) => { redirectedRequests++; response.end("stolen"); });
    servers.push(sink);
    const sinkPort = await listen(sink);
    const ports = {};
    for (const name of ["valid", "interceptor", "wrong-name"]) {
      const server = createServer({ key: readFileSync(join(dir, `${name}.key`)), cert: readFileSync(join(dir, `${name}.pem`)) }, (request, response) => {
        if (name === "valid") validRequests++; else attackerRequests++;
        if (redirect) { response.writeHead(302, { location: `http://127.0.0.1:${sinkPort}/capture` }); response.end(); return; }
        if (request.url.endsWith("/certs")) response.end(JSON.stringify({ keys: [jwk(name === "valid" ? genuine.publicKey : attacker.publicKey)] }));
        else response.end(JSON.stringify({ token_type: "Bearer", access_token: "fixture-access-token", expires_in: 60 }));
      });
      servers.push(server);
      ports[name] = await listen(server);
    }
    targetPort = ports.interceptor;
    const interceptedTransport = transport();
    const verifier = load("./oidc-security.ts", { "./oidc-transport.ts": interceptedTransport });
    assert.equal(await verifier.validateIdToken(token(attacker.privateKey), publicIssuer, "web", "bound-nonce", "https://keycloak:8443/realms/paladinscat"), null);
    await assert.rejects(interceptedTransport.oidcFetch(endpoint, { method: "POST", body: "client_secret=fixture" }));
    assert.equal(attackerRequests, 0, "TLS fails before sending HTTP credentials or accepting attacker JWKS");
    targetPort = ports["wrong-name"];
    await assert.rejects(transport().oidcFetch(endpoint, { method: "POST", body: "client_secret=fixture" }));
    assert.equal(attackerRequests, 0, "trusted CA alone cannot bypass hostname verification");
    targetPort = ports.valid;
    assert.ok(await verifier.validateIdToken(token(genuine.privateKey), publicIssuer, "web", "bound-nonce", "https://keycloak:8443/realms/paladinscat"), "failed interception did not install a counterfeit cached key");
    assert.equal(await verifier.validateIdToken(token(attacker.privateKey), publicIssuer, "web", "bound-nonce", "https://keycloak:8443/realms/paladinscat"), null);
    const response = await transport().oidcFetch(endpoint, { method: "POST", body: "client_secret=fixture" });
    assert.equal((await response.json()).access_token, "fixture-access-token");
    assert.ok(validRequests >= 2);
    redirect = true;
    await assert.rejects(transport().oidcFetch(endpoint, { method: "POST", body: "client_secret=fixture", redirect: "follow" }));
    assert.equal(redirectedRequests, 0, "redirect target never receives provider requests");
  } finally {
    await Promise.all(agents.map(agent => agent.destroy()));
    await Promise.all(servers.map(close));
    if (oldCa === undefined) delete process.env.PALADINSCAT_OIDC_CA_FILE; else process.env.PALADINSCAT_OIDC_CA_FILE = oldCa;
    const child = relative(parent, dir);
    assert.ok(child.startsWith("oidc-tls-") && !child.includes(".."));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("service assertions retain public audience while only the matching private HTTPS realm is allowed", () => {
  const source = ts.createSourceFile("service.ts", readFileSync(new URL("./oidc-bff-service.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "validateEndpoints");
  const code = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const validate = new Function(`${code}; return validateEndpoints;`)();
  validate(publicIssuer, endpoint);
  validate(publicIssuer, `${publicIssuer}/protocol/openid-connect/token`);
  for (const value of [endpoint.replace("https:", "http:"), endpoint.replace(":8443", ":8080"), endpoint.replace("keycloak", "keycloak.evil"), endpoint.replace("/paladinscat/", "/master/"), `${endpoint}?q=1`, `${endpoint}#x`, endpoint.replace("keycloak", "user@keycloak")]) assert.throws(() => validate(publicIssuer, value));
});
