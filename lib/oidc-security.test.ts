/** Tests OIDC security validation and rejection behavior.
 * The module owns its existing image, OIDC, proxy, roster, or moderation boundary.
 * refs: none
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildParAuthorizationUrl, buildPushedAuthorizationRequest, buildRpLogoutUrl, createTransaction, getJwkForTest, keycloakAccountUrl, normalizedHttpsIssuer, parsePushedAuthorizationResponse, requireSameOrigin, resetJwksCacheForTest, resolveInternalIssuer, safeReturnPath, stateMatches, validIdTokenHeader, validLogoutTokenHeader, validateLogoutToken } from "./oidc-security.ts";
import { csrfHeader } from "./csrf.ts";
import { isIdentityCutoverEnabled } from "./identity-cutover.ts";
import { readFileSync } from "node:fs";

test("Inter is self-hosted rather than fetched from a third party", () => {
  const source = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fonts\.(googleapis|gstatic)\.com/);
  assert.match(source, /url\("\/fonts\/inter-latin\.woff2"\)/);
});

test("rejects open redirects", () => {
  for (const path of ["https://evil.example", "//evil.example", "/%5c%5cevil.example", "/admin", "/auth/login"]) assert.equal(safeReturnPath(path), "/");
  assert.equal(safeReturnPath("/players/42?tab=builds"), "/players/42?tab=builds");
  assert.equal(safeReturnPath("/stats/performance?scope=casual"), "/stats/performance?scope=casual");
});
test("state transaction binds callback and rejects replay after cookie clear", () => {
  const transaction = createTransaction("/account");
  assert.equal(stateMatches(transaction.state, transaction.state), true);
  assert.equal(stateMatches(transaction.state, "replayed-or-wrong-state"), false);
  assert.equal(stateMatches(undefined, transaction.state), false);
});
test("unsafe requests require exact origin", () => {
  assert.equal(requireSameOrigin("https://paladinscat.com", "https://paladinscat.com"), true);
  assert.equal(requireSameOrigin("https://evil.example", "https://paladinscat.com"), false);
  assert.equal(requireSameOrigin(null, "https://paladinscat.com"), false);
});
test("OIDC issuer is a query-free HTTPS realm URL", () => {
  assert.equal(normalizedHttpsIssuer("https://auth.paladinscat.com/realms/paladinscat/"), "https://auth.paladinscat.com/realms/paladinscat");
  for (const value of [undefined, "http://auth.paladinscat.com/realms/paladinscat", "https://auth.paladinscat.com/", "https://auth.paladinscat.com/realms/paladinscat?x=1"]) assert.equal(normalizedHttpsIssuer(value), null);
});
test("account console is derived only from the configured realm issuer", () => {
  assert.equal(keycloakAccountUrl("https://auth.paladinscat.com/realms/paladinscat/")?.href, "https://auth.paladinscat.com/realms/paladinscat/account/");
  assert.equal(keycloakAccountUrl("http://auth.paladinscat.com/realms/paladinscat"), null);
});
test("JWKS outage and oversized documents fail closed", async () => {
  resetJwksCacheForTest();
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("offline", { status: 503 });
  assert.equal(await getJwkForTest("https://auth.example", "one"), null);
  globalThis.fetch = async () => new Response("x", { headers: { "content-length": "999999" } });
  assert.equal(await getJwkForTest("https://auth.example", "one"), null);
  globalThis.fetch = original;
});
test("unknown kid forces only one bounded refresh", async () => {
  resetJwksCacheForTest();
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ keys: [{ kid: "known", kty: "RSA", use: "sig" }] })); };
  assert.ok(await getJwkForTest("https://auth.example", "known"));
  for (let i = 0; i < 20; i++) assert.equal(await getJwkForTest("https://auth.example", `unknown-${i}`), null);
  assert.equal(calls, 2);
  globalThis.fetch = original;
});
test("cookie-auth CSRF header is required only for unsafe requests", () => {
  assert.equal(csrfHeader("__Host-pc_csrf=csrf-value", "POST"), "csrf-value");
  assert.equal(csrfHeader("other=value", "POST"), null);
  assert.equal(csrfHeader("__Host-pc_csrf=csrf-value", "GET"), null);
});
test("player refresh forwards the cookie-auth CSRF token", () => {
  const source = readFileSync(new URL("../app/players/[id]/player-profile-client.tsx", import.meta.url), "utf8");
  assert.match(source, /csrfHeader\(document\.cookie, 'POST'\)/);
  assert.match(source, /'X-CSRF-Token': csrf/);
  assert.match(source, /credentials: 'same-origin'/);
});
test("BFF credential is server-only and never a public environment value", () => {
  const source = readFileSync(new URL("./oidc-bff-service.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/);
  assert.match(source, /PALADINSCAT_SERVICE_OIDC_PRIVATE_KEY_FILE/);
  assert.match(source, /client_assertion_type/);
  assert.match(source, /RSA-SHA256/);
  assert.match(source, /base64Url\(signer\.sign\(privateKey\)\)/);
  assert.match(source, /modulusLength.*3072/s);
  assert.match(source, /64 \* 1024/);
  assert.match(source, /exp: now \+ 60/);
  assert.match(source, /jti: randomUUID\(\)/);
  assert.doesNotMatch(source, /PALADINSCAT_OIDC_BFF_SERVICE_TOKEN/);
  assert.doesNotMatch(source, /NEXT_PUBLIC/);
});
test("OIDC client secret is loaded server-side from a secret file when configured", () => {
  const source = readFileSync(new URL("./oidc-client-secret.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/);
  assert.match(source, /OIDC_CLIENT_SECRET_FILE/);
  assert.doesNotMatch(source, /NEXT_PUBLIC/);
});
test("RP logout uses only the exact configured same-origin return URI", () => {
  const logout = buildRpLogoutUrl("https://auth.paladinscat.com/realms/paladinscat", "paladinscat-web", "https://paladinscat.com/", "https://paladinscat.com");
  assert.equal(logout?.origin, "https://auth.paladinscat.com");
  assert.equal(logout?.searchParams.get("post_logout_redirect_uri"), "https://paladinscat.com/");
  assert.equal(logout?.searchParams.get("client_id"), "paladinscat-web");
  assert.equal([...logout!.searchParams.keys()].sort().join(","), "client_id,post_logout_redirect_uri");
  assert.equal(buildRpLogoutUrl("https://auth.paladinscat.com/realms/paladinscat", "paladinscat-web", "https://evil.example/logout", "https://paladinscat.com"), null);
});
test("RP logout names the SSO session via id_token_hint and falls back for pre-cutover sessions", () => {
  const base = "https://auth.paladinscat.com/realms/paladinscat";
  const hint = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzZXNzaW9uLWlkLTIifQ.signature";
  const withHint = buildRpLogoutUrl(base, "paladinscat-web", "https://paladinscat.com/", "https://paladinscat.com", hint);
  assert.equal(withHint?.searchParams.get("id_token_hint"), hint);
  assert.equal(withHint?.href.endsWith(`id_token_hint=${encodeURIComponent(hint)}`), true);
  assert.equal([...withHint!.searchParams.keys()].sort().join(","), "client_id,id_token_hint,post_logout_redirect_uri");
  for (const absent of [undefined, null, ""]) {
    const fallback = buildRpLogoutUrl(base, "paladinscat-web", "https://paladinscat.com/", "https://paladinscat.com", absent);
    assert.equal(fallback?.searchParams.get("id_token_hint"), null);
    assert.equal([...fallback!.searchParams.keys()].sort().join(","), "client_id,post_logout_redirect_uri");
  }
  assert.equal(buildRpLogoutUrl(base, "paladinscat-web", "https://paladinscat.com/", "https://paladinscat.com", "x".repeat(16_385))?.searchParams.get("id_token_hint"), null);
});
test("logout route fetches the BFF-only hint then builds the RP-logout URL", () => {
  const route = readFileSync(new URL("../app/api/auth/oidc/logout/route.ts", import.meta.url), "utf8");
  assert.match(route, /\/auth\/oidc\/logout/);
  assert.match(route, /await oidcBffServiceHeaders\(\)/);
  assert.match(route, /JSON\.stringify\(\{ session_token: session \}\)/);
  assert.match(route, /refresh_token: refreshToken/);
  assert.match(route, /client_secret: clientSecret/);
  assert.match(route, /resolveInternalIssuer\(issuer, process\.env\.OIDC_INTERNAL_ISSUER\).*protocol\/openid-connect\/logout/s);
  assert.match(route, /buildRpLogoutUrl\(process\.env\.OIDC_ISSUER, process\.env\.OIDC_CLIENT_ID, process\.env\.OIDC_POST_LOGOUT_REDIRECT_URI, origin\(\), idTokenHint\)/);
  assert.doesNotMatch(route, /NEXT_PUBLIC/);
});
test("authorization parameters are pushed server-side and the browser gets only PAR identifiers", () => {
  const transaction = createTransaction("/");
  const pushed = buildPushedAuthorizationRequest("https://auth.paladinscat.com/realms/paladinscat", "paladinscat-web", "https://paladinscat.com/api/auth/oidc/callback", transaction);
  assert.equal(pushed.endpoint.pathname, "/realms/paladinscat/protocol/openid-connect/ext/par/request");
  assert.equal(pushed.form.get("scope"), "openid profile");
  assert.equal(pushed.form.get("state"), transaction.state);
  assert.equal(pushed.form.get("nonce"), transaction.nonce);
  assert.equal(pushed.form.get("code_challenge_method"), "S256");
  const authorization = buildParAuthorizationUrl("https://auth.paladinscat.com/realms/paladinscat", "paladinscat-web", "urn:ietf:params:oauth:request_uri:opaque");
  assert.equal(authorization.search, "?client_id=paladinscat-web&request_uri=urn%3Aietf%3Aparams%3Aoauth%3Arequest_uri%3Aopaque");
  assert.equal(authorization.searchParams.get("state"), null);
  assert.equal(authorization.searchParams.get("code_challenge"), null);
});
test("server issuer override permits only Keycloak's exact internal realm", () => {
  const issuer = "https://auth.paladinscat.com/realms/paladinscat";
  assert.equal(resolveInternalIssuer(issuer, "https://keycloak:8443/realms/paladinscat"), "https://keycloak:8443/realms/paladinscat");
  for (const value of [undefined, "http://keycloak:8080/realms/paladinscat", "https://keycloak:8080/realms/paladinscat", "https://keycloak:8443/realms/other", "http://keycloak:8080/realms/other", "http://backend-rust-api:3005/realms/paladinscat", "https://evil.example/realms/paladinscat"]) assert.equal(resolveInternalIssuer(issuer, value), issuer);
});
test("PAR response requires a bounded-lived opaque request URI", () => {
  assert.deepEqual(parsePushedAuthorizationResponse({ request_uri: "urn:ietf:params:oauth:request_uri:abc_DEF-123", expires_in: 60 }), { requestUri: "urn:ietf:params:oauth:request_uri:abc_DEF-123", expiresIn: 60 });
  for (const value of [{ request_uri: "https://evil.example", expires_in: 60 }, { request_uri: "urn:ietf:params:oauth:request_uri:ok", expires_in: 0 }, { request_uri: "urn:ietf:params:oauth:request_uri:ok", expires_in: 601 }]) assert.equal(parsePushedAuthorizationResponse(value), null);
});
test("OIDC login redirects the initiating POST with 303, never 307", () => {
  const source = readFileSync(new URL("../app/api/auth/oidc/login/route.ts", import.meta.url), "utf8");
  assert.match(source, /NextResponse\.redirect\(buildParAuthorizationUrl\(issuer, clientId, requestUri\), \{ status: 303 \}\)/);
  assert.match(source, /const form = await readLoginForm\(request\)/);
  assert.doesNotMatch(source, /request\.formData\(/);
  assert.match(source, /error instanceof LoginFormError \? error\.status : 400/);
});
test("OIDC transaction limits use only the validated Cloudflare client address", () => {
  const source = readFileSync(new URL("../app/api/auth/oidc/login/route.ts", import.meta.url), "utf8");
  assert.match(source, /headers\.get\("cf-connecting-ip"\)/);
  assert.match(source, /address && isIP\(address\)/);
  assert.match(source, /\{ "x-forwarded-for": clientIp \}/);
  assert.doesNotMatch(source, /headers\.get\("x-forwarded-for"\)/);
});
test("PaladinsCat login entry points use native links into the server-side OIDC flow", () => {
  const login = readFileSync(new URL("../app/auth/login/page.tsx", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../components/nav.tsx", import.meta.url), "utf8");
  const register = readFileSync(new URL("../app/auth/register/route.ts", import.meta.url), "utf8");
  const account = readFileSync(new URL("../app/account/page.tsx", import.meta.url), "utf8");
  const accountRoute = readFileSync(new URL("../app/api/auth/oidc/account/route.ts", import.meta.url), "utf8");
  const apiClient = readFileSync(new URL("./api-client.ts", import.meta.url), "utf8");
  assert.equal(isIdentityCutoverEnabled(undefined), false);
  assert.equal(isIdentityCutoverEnabled("false"), false);
  assert.equal(isIdentityCutoverEnabled("true"), true);
  assert.doesNotMatch(register, /identityCutoverEnabled|LegacyRegistration|await register\(/);
  assert.doesNotMatch(login, /useAuth\(\)|LegacyLogin|type="password"|generated\.auth\.oidc\.divider|requestSubmit/);
  assert.match(apiClient, /"\/auth\/login"/);
  assert.match(apiClient, /"\/auth\/register"/);
  assert.match(login, /redirect\(href\)/);
  assert.match(login, /\/api\/auth\/oidc\/login\?return=/);
  assert.match(nav, /const loginHref = `\/auth\/login\?redirect=\$\{encodeURIComponent\(pathname \|\| "\/"\)\}`/);
  assert.equal(nav.match(/<a href=\{loginHref\}/g)?.length, 2);
  assert.doesNotMatch(nav, /<Link href=\{loginHref\}/);
  assert.doesNotMatch(nav, /action="\/api\/auth\/oidc\/login"/);
  assert.match(register, /process\.env\.PALADINSCAT_PUBLIC_ORIGIN \|\| new URL\(request\.url\)\.origin/);
  assert.match(register, /NextResponse\.redirect\(new URL\("\/api\/auth\/oidc\/login\?intent=create", publicOrigin\), 307\)/);
  assert.match(account, /href="https:\/\/auth\.paladinscat\.com\/realms\/paladinscat\/account\/"/);
  assert.match(account, /if \(authLoading\) return/);
  assert.match(accountRoute, /requireSameOrigin/);
  assert.match(accountRoute, /keycloakAccountUrl\(process\.env\.OIDC_ISSUER\)/);
});
test("transitional OIDC cookie sessions can load account data and terminate centrally", () => {
  const apiClient = readFileSync(new URL("./api-client.ts", import.meta.url), "utf8");
  assert.match(apiClient, /function accountAuthHeaders\(token: string \| null = getAuthToken\(\)\)/);
  assert.match(apiClient, /headers: accountAuthHeaders\(\)/);
  assert.match(apiClient, /reportPlayer[\s\S]*?headers: \{ "Content-Type": "application\/json", \.\.\.accountAuthHeaders\(\) \}/);
  const playerReportClient = apiClient.slice(apiClient.indexOf("export async function reportPlayer"), apiClient.indexOf("export type ClearablePlayerTag"));
  assert.doesNotMatch(playerReportClient, /Authorization/);
  const adminDashboard = readFileSync(new URL("./admin-dashboard-api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(adminDashboard, /if \(!token\).*sessionRequired/);
  assert.match(apiClient, /startsWith\("__Host-pc_csrf="\)/);
  assert.match(apiClient, /function hasCookieAuthSession\(\)/);
  assert.match(apiClient, /function cacheAuthUser\(user: AuthUser\)/);
  assert.doesNotMatch(apiClient, /if \(!token\) throw new Error\(API_ERROR_KEYS\.(?:notAuthenticated|authenticationRequired)\);/);
  const tierLists = readFileSync(new URL("./tierlists-api.ts", import.meta.url), "utf8");
  assert.match(tierLists, /credentials: "same-origin"/);
  assert.match(tierLists, /X-CSRF-Token/);
  const operations = readFileSync(new URL("./operations-api.ts", import.meta.url), "utf8");
  assert.match(operations, /accountAuthHeaders\(\)/);
  assert.match(tierLists, /accountAuthHeaders\(input\.token\)/);
  assert.match(adminDashboard, /accountAuthHeaders\(\)/);
  assert.equal(apiClient.match(/Authorization: `Bearer \$\{token\}`/g)?.length, 1);
  for (const source of [adminDashboard, operations, tierLists]) {
    assert.doesNotMatch(source, /Authorization\s*:\s*`Bearer \$\{/);
  }
  assert.match(apiClient, /identityCutoverEnabled \|\| hasOidcCookieSession/);
  assert.match(apiClient, /form\.action = "\/api\/auth\/oidc\/logout"/);
  const logoutSource = apiClient.slice(apiClient.indexOf("export async function logout"));
  assert.ok(logoutSource.indexOf("submitOidcLogout();") < logoutSource.indexOf("await fetchJson"));
});
test("only the fixed create intent can add the Keycloak registration prompt", () => {
  const route = readFileSync(new URL("../app/api/auth/oidc/login/route.ts", import.meta.url), "utf8");
  const admission = readFileSync(new URL("./oidc-login-admission.ts", import.meta.url), "utf8");
  assert.match(route, /const form = await readLoginForm\(request\)/);
  assert.match(admission, /intent !== undefined && intent !== "create"/);
  assert.match(route, /if \(intent === "create"\) par\.form\.set\("prompt", "create"\)/);
  assert.match(route, /entries\.length === 1 && entries\[0\]\[0\] === "intent" && entries\[0\]\[1\] === "create"/);
  assert.match(route, /return await startOidc\("create", "\/", clientAddress\(request\)\)/);
});
test("login begins server-side and the failure page retries with a plain link", () => {
  const page = readFileSync(new URL("../app/auth/login/page.tsx", import.meta.url), "utf8");
  const failure = readFileSync(new URL("../app/auth/login/login-failure.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/auth/oidc/login/route.ts", import.meta.url), "utf8");
  assert.match(page, /redirect\(href\)/);
  assert.doesNotMatch(page, /useEffect|requestSubmit|<form/);
  assert.match(failure, /<a href=\{href\}/);
  assert.match(route, /return await startOidc\("login", safeReturnPath\(entries\[0\]\[1\]\), clientAddress\(request\)\)/);
});
test("frontend server calls use the pinned internal issuer without changing token issuer validation", () => {
  const login = readFileSync(new URL("../app/api/auth/oidc/login/route.ts", import.meta.url), "utf8");
  const callback = readFileSync(new URL("../app/api/auth/oidc/callback/route.ts", import.meta.url), "utf8");
  assert.match(login, /resolveInternalIssuer\(issuer, process\.env\.OIDC_INTERNAL_ISSUER\)/);
  assert.match(callback, /oidcFetch\(`\$\{serverIssuer\}\/protocol\/openid-connect\/token`/);
  assert.match(callback, /const idClaims = await validateIdToken\(token\.id_token, issuer, clientId, tx\.nonce, serverIssuer\)/);
});
test("ID token typ accepts proven Keycloak and standard forms only", () => {
  assert.equal(validIdTokenHeader({ alg: "RS256", kid: "one", typ: "ID" }), true);
  assert.equal(validIdTokenHeader({ alg: "RS256", kid: "one", typ: "JWT" }), true);
  assert.equal(validIdTokenHeader({ alg: "RS256", kid: "one" }), true);
  assert.equal(validIdTokenHeader({ alg: "RS256", kid: "one", typ: "at+jwt" }), false);
});

test("backchannel logout token header requires RS256, kid, and typ=Logout", () => {
  assert.equal(validLogoutTokenHeader({ alg: "RS256", kid: "one", typ: "Logout" }), true);

  assert.equal(validLogoutTokenHeader({ alg: "RS256", kid: "one", typ: "logout+jwt" }), true);
  assert.equal(validLogoutTokenHeader({ alg: "RS256", kid: "one", typ: "ID" }), false);
  assert.equal(validLogoutTokenHeader({ alg: "HS256", kid: "one", typ: "Logout" }), false);
  assert.equal(validLogoutTokenHeader({ alg: "RS256", typ: "Logout" }), false);
});

test("backchannel logout token validation fails closed on malformed or unsigned input", async () => {
  resetJwksCacheForTest();
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("offline", { status: 503 });
  for (const value of ["", "not-a-jwt", "a.b", "a.b.c", "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.sig"]) assert.equal(await validateLogoutToken(value, "https://auth.example/realms/paladinscat", "paladinscat-web"), null);
  globalThis.fetch = original;
});

test("callback exchange requests 72h only when the ID token authorizes it and sizes cookies to backend expiry", () => {
  const callback = readFileSync(new URL("../app/api/auth/oidc/callback/route.ts", import.meta.url), "utf8");
  assert.match(callback, /const keepSignedIn = idClaims\.pc_keep_signed_in === true;/);
  assert.match(callback, /id_token: token\.id_token/);
  assert.match(callback, /refresh_token: token\.refresh_token/);
  assert.match(callback, /if \(keepSignedIn\) exchangeBody\.session_ttl_hours = 72;/);
  assert.match(callback, /const expiresMs = Date\.parse\(result\.expires_at\)/);
  assert.match(callback, /maxAge: sessionMaxAge/);
  assert.doesNotMatch(callback, /maxAge: 60 \* 60 \* 8/);
});

test("callback forwards the Cloudflare edge headers and bounded browser inputs to the backend exchange", () => {
  const callback = readFileSync(new URL("../app/api/auth/oidc/callback/route.ts", import.meta.url), "utf8");
  // Reads the Cloudflare edge headers plus the two bounded browser inputs and nothing else from the request.
  assert.match(callback, /headers\.get\("cf-connecting-ip"\)/);
  assert.match(callback, /headers\.get\("cf-ray"\)/);
  assert.match(callback, /headers\.get\("user-agent"\)/);
  assert.match(callback, /headers\.get\("accept-language"\)/);
  // The exchange (the backend login-event call) is the only backend fetch that carries them.
  assert.match(callback, /\/auth\/oidc\/exchange.*oidcBffServiceHeaders\(cfForwardHeaders\(request\)\)/);
  // The consume call stays header-free (bare oidcBffServiceHeaders(), no CF headers) so the
  // visitor IP is not attached to non-login events.
  assert.match(callback, /\/auth\/oidc\/transactions\/consume.*oidcBffServiceHeaders\(\)/);
  // No other browser header (cookie, authorization, x-forwarded-for) is forwarded.
  assert.doesNotMatch(callback, /headers\.get\("(cookie|authorization|x-forwarded-for)"\)/i);
});

test("the raw visitor IP is never logged or stored in the frontend OIDC flow", () => {
  const callback = readFileSync(new URL("../app/api/auth/oidc/callback/route.ts", import.meta.url), "utf8");
  const bff = readFileSync(new URL("./oidc-bff-service.ts", import.meta.url), "utf8");
  // Neither file contains any logging call (the IP must not be written to a log sink).
  for (const source of [callback, bff]) {
    assert.doesNotMatch(source, /console\.(log|error|warn|info|debug)\s*\(/);
    assert.doesNotMatch(source, /logger\./);
  }
  // The CF headers are only ever placed on the outgoing fetch headers, never persisted to a cookie
  // or serialized into a response body.
  assert.doesNotMatch(callback, /cookies\.set\([^)]*cf-connecting-ip/i);
  assert.doesNotMatch(callback, /JSON\.stringify\([^)]*cf-connecting-ip/);
});

test("backchannel logout route verifies the token then calls the v1 backend revocation", () => {
  const route = readFileSync(new URL("../app/api/auth/oidc/backchannel-logout/route.ts", import.meta.url), "utf8");
  assert.match(route, /validateLogoutToken\(logoutToken, issuer, clientId, serverIssuer\)/);
  assert.match(route, /await oidcBffServiceHeaders\(\)/);
  assert.match(route, /backend\(\).*\/auth\/oidc\/backchannel-logout/s);
  assert.match(route, /if \(!claims \|\| !claims\.sid\)/);
  assert.doesNotMatch(route, /logout_token\)/);
});
