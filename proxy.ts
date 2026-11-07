/** proxy component/module.
 * Owns the UI behavior implemented in this file; data and side effects remain within its existing boundaries.
 * refs: none
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { GUEST_COOKIE, GUEST_TTL_SECONDS, issueGuest, validGuest, safeWebsiteRequest, websiteApiPath } from "./lib/website-gate";
import { isAccountOnlyPath, isVerifiedOnlyPath } from "./lib/verified-access";
import { serverApiBase } from "./lib/server-api";
import { anonymousPresenceRequestAllowed } from "./lib/anonymous-presence-gate";
import { hasProAccess } from "./lib/pro-surface";
import { accountSessionCookie, assertOperatorConfiguration, isOperatorBff, operatorPathAllowed } from "./lib/operator-plane";

const ACCESS_POLICY_PATH = "/prototype/access-policy";
// The dashboard ships as a standalone static document under public/app. Every
// public browser navigation renders that shell and the client router owns the
// address bar; operational surfaces (dev tools, ops console, Discord embeds,
// the access-policy page) and API/asset namespaces keep their own handlers.
const SPA_DOCUMENT = "/app/index.html";
const SPA_BYPASS_PREFIXES = [
  "/app/", "/api", "/_pc", "/_next/", "/dev/", "/operations/", "/prototype/",
  "/discord-preview/", "/match-images/", "/player-avatars/",
] as const;
type AccountSessionState = "guest" | "unverified" | "uninvited" | "verified" | "rate-limited" | "unavailable";
type AccountSessionCheck = { state: AccountSessionState; retryAfter?: string; restricted?: boolean; invitationRequired?: boolean; pro?: boolean };

/** Validate the opaque browser session through the backend auth owner. */
async function accountSessionState(request: NextRequest, allowBearer = false): Promise<AccountSessionCheck> {
  // API recovery must use the same credential as Rust. Browser document and
  // Pro promotion checks retain their existing host-cookie-only authority.
  const authorization = allowBearer ? request.headers.get("authorization") : null;
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (bearer.length > 512) return { state: "guest" };
  const session = bearer || request.cookies.get(accountSessionCookie())?.value;
  if (!session) return { state: "guest" };
  try {
    const headers = new Headers({ accept: "application/json", authorization: `Bearer ${session}` });
    // Preserve the edge-owned client identity so auth checks do not share the frontend container's quota.
    const clientAddress = request.headers.get("cf-connecting-ip");
    if (clientAddress) headers.set("cf-connecting-ip", clientAddress);
    const response = await fetch(`${serverApiBase()}/auth/me`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    if (response.status === 401 || response.status === 403) return { state: "guest" };
    if (response.status === 429) {
      return { state: "rate-limited", retryAfter: response.headers.get("retry-after") || undefined };
    }
    if (!response.ok) return { state: "unavailable" };
    const account = await response.json() as {
      linked_player_id?: unknown;
      invitation_active?: unknown;
      invitation_required?: unknown;
      access_restriction_kind?: unknown;
      access_restriction?: unknown;
    };
    const restrictionKind = typeof account.access_restriction_kind === "string"
      ? account.access_restriction_kind.trim()
      : "";
    const restrictionCode = account.access_restriction && typeof account.access_restriction === "object"
      && !Array.isArray(account.access_restriction)
      && typeof (account.access_restriction as { code?: unknown }).code === "string"
      ? (account.access_restriction as { code: string }).code.trim()
      : "";
    const linkedPlayerId = Number(account.linked_player_id);
    return {
      state: Number.isSafeInteger(linkedPlayerId) && linkedPlayerId > 0
        ? (account.invitation_required === false || account.invitation_active === true ? "verified" : "uninvited") : "unverified",
      restricted: Boolean(restrictionKind || restrictionCode),
      invitationRequired: account.invitation_required !== false,
      pro: hasProAccess(account),
    };
  } catch {
    return { state: "unavailable" };
  }
}

/**
 * Recognise the migrated Pro evidence routes that already carry backend guards.
 *
 * These mirrors `routes/match_access.rs` (public Read tier for the published feed,
 * detail, file and media reads) and `routes/cheaters.rs` (verified review queue,
 * admin-only decisions), so the frontend gate must let them reach the backend.
 * refs: routes/match_access.rs · routes/cheaters.rs · migrations: 166
 */
function isMigratedEvidenceRoute(path: string, method: string): boolean {
  const relative = path.replace(/^\/(?:api|_pc)(?=\/)/, "");
  if (!relative.startsWith("/cheaters/evidence")) return false;
  if (method === "GET" || method === "HEAD") {
    if (relative === "/cheaters/evidence" || relative === "/cheaters/evidence/review") return true;
    return /^\/cheaters\/evidence\/[1-9]\d{0,11}(?:\/file|\/media\/\d{1,2})?$/.test(relative);
  }
  return method === "POST" && /^\/cheaters\/evidence\/[1-9]\d{0,11}\/review$/.test(relative);
}

/** Redirect a protected website request without accepting caller-controlled origins. */
function accessRedirect(request: NextRequest, destination: "/auth/login" | "/link-account" | "/account" | typeof ACCESS_POLICY_PATH) {
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = "";
  url.hash = destination === "/account" ? "invitation" : "";
  if (destination === "/auth/login") {
    url.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  }
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

/** Add crawler exclusion to any response for a protected page. */
function markProtectedResponse(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * The nonce is generated here, placed in the outgoing Content-Security-Policy
 * header, and handed to the App Router via the `x-nonce` request header so the
 * root layout can tag its own inline scripts (e.g. the JSON-LD block) with the
 * matching nonce. Next.js applies the same nonce to the inline scripts it
 * emits (RSC bootstrap, fonts, devtools), which is why `script-src` carries
 * the nonce plus `'strict-dynamic'`. `'unsafe-inline'` in script-src is a
 * harmless fallback for legacy browsers that do not understand nonces —
 * modern browsers that support `strict-dynamic`/nonces ignore it.
 *
 * style-src keeps `'unsafe-inline'` because Next.js + Tailwind rely on inline
 * <style> injection; removing it breaks the app rather than hardening it.
 *
 * NOTE: This file was `middleware.ts` until the Next.js 16 rename to the
 * `proxy` file convention (https://nextjs.org/docs/messages/middleware-to-proxy).
 * refs: none
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isSecure = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")) === "https";
  // Public document navigations render the dashboard shell. The bypass list
  // keeps API, assets and operational surfaces on their own handlers.
  const spaDocument =
    (request.method === "GET" || request.method === "HEAD") &&
    Boolean(request.headers.get("accept")?.includes("text/html")) &&
    !SPA_BYPASS_PREFIXES.some((prefix) => path.startsWith(prefix));
  // The production nonce policy makes Next's development runtime defer client
  // hydration. Dev servers must not be used as a public surface; let Next
  // handle its local assets and HMR without injecting production headers.
  let accountCheck: AccountSessionCheck | undefined;
  const getAccountCheck = async () => {
    accountCheck ??= await accountSessionState(request, websiteApiPath(path));
    return accountCheck;
  };
  // Do not let percent-encoded namespace aliases reach a rewrite without admission.
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
    if (websiteApiPath(decodedPath.toLowerCase()) && !websiteApiPath(path)) {
      return NextResponse.json({ error: { code: "NON_CANONICAL_API_PATH" } }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
  } catch {
    return NextResponse.json({ error: { code: "INVALID_PATH" } }, { status: 400 });
  }
  if (isOperatorBff()) {
    try { assertOperatorConfiguration(); } catch {
      return NextResponse.json({ error: { code: "OPERATOR_UNAVAILABLE" } }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    if (!operatorPathAllowed(path, request.method) || decodedPath !== path) {
      return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    if (path === "/") return NextResponse.redirect(new URL("/admin", process.env.PALADINSCAT_OPERATOR_ORIGIN));
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const forwarded = new Headers(request.headers);
    forwarded.set("x-nonce", nonce);
    const response = NextResponse.next({ request: { headers: forwarded } });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Content-Security-Policy", [
      "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
      "connect-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    ].join("; "));
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "no-referrer");
    // Private admission, operator session and current DB role are enforced at
    // their gateway/API owners. Public guest/Pro promotion never runs here.
    return response;
  }
  const api = websiteApiPath(path);
  const protectedPage = isVerifiedOnlyPath(decodedPath) || isAccountOnlyPath(decodedPath);
  // Moderated cheater/exploit data must not be served on the public surface.
  // The public report flow needs only the submission POST; every other
  // cheater/exploit API path would otherwise fall through to the backend
  // catch-all rewrite and leak the moderated feed. Verified accounts keep the
  // in-product directories and detail pages that render this data (those page
  // routes are verified-only), so admit GET/HEAD reads only after the backend
  // proves the session; every other caller gets 404 so the routes appear
  // non-existent to cheaters probing the public surface. Both /api and /_pc
  // aliases are covered on the decoded path so percent-encoded variants are
  // admitted on exactly the same terms.
  // The migrated Pro evidence surface keeps the backend's own access contract:
  // published reads are public, the review queue is verified, and decisions are
  // admin-only. The moderated-directory wall below must not shadow those routes.
  // refs: routes/match_access.rs (Read tier) · routes/cheaters.rs (review admin)
  const migratedEvidenceRoute = isMigratedEvidenceRoute(decodedPath, request.method);
  const isCheaterExploitApi = !migratedEvidenceRoute && (
    decodedPath.startsWith("/api/cheaters/") || decodedPath.startsWith("/_pc/cheaters/") ||
    decodedPath.startsWith("/api/players/exploiters") || decodedPath.startsWith("/_pc/players/exploiters"));
  if (isCheaterExploitApi) {
    const isPublicSubmit = request.method === "POST" &&
      (decodedPath === "/api/cheaters/evidence" || decodedPath === "/_pc/cheaters/evidence");
    if (!isPublicSubmit) {
      const isRead = request.method === "GET" || request.method === "HEAD";
      const check = isRead ? await getAccountCheck() : { state: "guest" as AccountSessionState };
      if (isRead && (check.state === "rate-limited" || check.state === "unavailable")) {
        const headers = new Headers({ "Cache-Control": "private, no-store" });
        if (check.state === "rate-limited") {
          if (check.retryAfter) headers.set("Retry-After", check.retryAfter);
          return NextResponse.json({ error: { code: "AUTHENTICATION_RATE_LIMITED" } }, { status: 429, headers });
        }
        return NextResponse.json({ error: { code: "AUTHENTICATION_UNAVAILABLE" } }, { status: 503, headers });
      }
      if (!isRead || check.state !== "verified") {
        return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
      }
    }
  }
  // Aggregate GET only. Collection uses /auth/account/maintenance-presence
  // through normal admission, authentication, CSRF and backend consent checks.
  if (path === "/api/analytics/presence") {
    if (!anonymousPresenceRequestAllowed(request, process.env.PALADINSCAT_PUBLIC_ORIGIN || "https://paladinscat.com")) {
      return new NextResponse(null, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  // Developer routes authenticate in Rust; Next-owned OIDC endpoints retain
  // their state/CSRF/signature checks, including provider callbacks without a guest cookie.
  const oidcEndpoint = ["login", "callback", "logout", "account", "backchannel-logout"]
    .some((name) => path === `/api/auth/oidc/${name}`);
  if (path === "/api/v1" || path.startsWith("/api/v1/") || oidcEndpoint) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (
    path !== ACCESS_POLICY_PATH
    && !api
    && request.cookies.has(accountSessionCookie())
    && request.headers.get("accept")?.includes("text/html")
  ) {
    const check = await getAccountCheck();
    if (check.restricted) return accessRedirect(request, ACCESS_POLICY_PATH);
  }
  if (process.env.NODE_ENV === "development") {
    return spaDocument ? NextResponse.rewrite(new URL(SPA_DOCUMENT, request.url)) : NextResponse.next();
  }
  const verifiedOnly = isVerifiedOnlyPath(decodedPath);
  if (protectedPage) {
    const { state, retryAfter, restricted, invitationRequired } = await getAccountCheck();
    const requiresEntitlement = verifiedOnly && !(invitationRequired === false && isAccountOnlyPath(decodedPath));
    if (restricted) return accessRedirect(request, ACCESS_POLICY_PATH);
    if (state === "guest") return accessRedirect(request, "/auth/login");
    if (requiresEntitlement && state === "unverified") return accessRedirect(request, "/link-account");
    if (requiresEntitlement && state === "uninvited") return accessRedirect(request, "/account");
    if (state === "rate-limited") {
      const headers = new Headers({ "Cache-Control": "private, no-store" });
      if (retryAfter) headers.set("Retry-After", retryAfter);
      return markProtectedResponse(NextResponse.json({ error: { code: "AUTHENTICATION_RATE_LIMITED" } }, { status: 429, headers }));
    }
    if (state === "unavailable") {
      return markProtectedResponse(NextResponse.json({ error: { code: "AUTHENTICATION_UNAVAILABLE" } }, {
        status: 503, headers: { "Cache-Control": "private, no-store" },
      }));
    }
  }
  const origin = process.env.PALADINSCAT_PUBLIC_ORIGIN || "https://paladinscat.com";
  let secret: string;
  try {
    secret = readFileSync(
      /* turbopackIgnore: true */ process.env.PALADINSCAT_WEBSITE_GATE_SECRET_FILE || "",
      "utf8",
    ).trim();
    if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Invalid website gate secret");
  } catch {
    const response = NextResponse.json({ error: { code: "WEBSITE_GATE_UNAVAILABLE" } }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
    return protectedPage ? markProtectedResponse(response) : response;
  }
  const admitted = validGuest(request.cookies.get(GUEST_COOKIE)?.value, secret, origin);
  if (api) {
    // A loaded tab can outlive its 24-hour guest admission while its genuine
    // account session is still valid. Restore data admission only after backend
    // proof, without granting data permissions or relaxing origin checks.
    if (!safeWebsiteRequest(request.headers, origin)) {
      return NextResponse.json({ error: { code: "WEBSITE_SESSION_REQUIRED", message: "Open the website to establish a guest session. External clients must use /api/v1 with a registered API key." } }, {
        status: 403, headers: { "Cache-Control": "private, no-store" },
      });
    }
    // Expired browser credentials must reach the auth owner and return its 401,
    // rather than an admission 403 that preserves stale verified display state.
    const browserAuthControl = (path === "/api/auth/me" || path === "/_pc/auth/me")
      && request.method === "GET" && request.headers.get("sec-fetch-site") === "same-origin";
    if (!admitted && !browserAuthControl) {
      const { state, retryAfter } = await getAccountCheck();
      if (state === "guest") {
        return NextResponse.json({ error: { code: "WEBSITE_SESSION_REQUIRED", message: "Open the website to establish a guest session. External clients must use /api/v1 with a registered API key." } }, {
          status: 403, headers: { "Cache-Control": "private, no-store" },
        });
      }
      if (state === "rate-limited") {
        const headers = new Headers({ "Cache-Control": "private, no-store" });
        if (retryAfter) headers.set("Retry-After", retryAfter);
        return NextResponse.json({ error: { code: "AUTHENTICATION_RATE_LIMITED" } }, { status: 429, headers });
      }
      if (state === "unavailable") {
        return NextResponse.json({ error: { code: "AUTHENTICATION_UNAVAILABLE" } }, {
          status: 503, headers: { "Cache-Control": "private, no-store" },
        });
      }
    }
    const response = NextResponse.next({
      request: {
        headers: (() => {
          const h = new Headers(request.headers);
          // Next.js rewrites proxy strips cf-connecting-ip/cf-ray on the
          // server-to-server fetch to the backend. Custom headers survive
          // the proxy hop, so pin the edge identity under x-paladinscat-*
          // names that the Rust backend reads first.
          const clientIp = request.headers.get("cf-connecting-ip");
          if (clientIp) {
            h.set("cf-connecting-ip", clientIp);
            h.set("x-paladinscat-client-ip", clientIp);
          }
          const cfRay = request.headers.get("cf-ray");
          if (cfRay) {
            h.set("cf-ray", cfRay);
            h.set("x-paladinscat-cf-ray", cfRay);
          }
          return h;
        })(),
      },
    });
    response.headers.set("Cache-Control", "private, no-store");
    if (!admitted) {
      response.cookies.set(GUEST_COOKIE, issueGuest(secret, origin), {
        httpOnly: true, secure: isSecure, sameSite: "lax", path: "/", maxAge: GUEST_TTL_SECONDS,
      });
    }
    return response;
  }

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")
    ?? request.nextUrl.protocol.replace(":", "");
  // The dashboard shell and its assets are standalone static documents served
  // from public/app. Nothing server-renders them, so they cannot carry the
  // per-request nonce and a 'strict-dynamic' script-src would silently block
  // every script they load. Keep the rest of the policy, but allow same-origin
  // scripts on that surface.
  // 'wasm-unsafe-eval' is required by the demo analyzer: its worker compiles
  // paladins_demo_analyzer_bg.wasm, and WebAssembly compilation is refused
  // unless script-src grants it explicitly ('self' does not, and the worker
  // inherits this policy). Without it every analysis dies with a CSP
  // CompileError before the recording is parsed.
  const isStaticSurface = spaDocument || path.startsWith("/app/");
  // 'wasm-unsafe-eval' is granted on BOTH surfaces on purpose: a worker's
  // policy is the CSP of its own script response, and /demo-analyzer/worker.js
  // is served through the nonce branch. Granting it only on documents leaves
  // the worker's WebAssembly.compile blocked.
  const scriptSrc = isStaticSurface
    ? "script-src 'self' 'wasm-unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'wasm-unsafe-eval'`;

  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' below is a legacy fallback only; browsers that support
    // 'strict-dynamic' ignore it.
    scriptSrc,
    // Next.js injects inline styles (Tailwind, PostCSS, next/font) server-side.
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    // Player avatars, live-stream previews, and repository-owned blog images
    // are rendered from these fixed upstreams. Keep this an explicit allowlist;
    // do not broaden it to arbitrary HTTPS image hosts.
    "img-src 'self' data: blob: https://hirez-api.onrender.com https://static-cdn.jtvnw.net https://raw.githubusercontent.com",
    "font-src 'self' data:",
    // Same-origin /api is the proxied backend; api.github.com powers the blog feed.
    "connect-src 'self' https://api.github.com",
    "media-src 'self' https://medal.tv https://cdn.medal.tv https://cdn.discordapp.com https://media.discordapp.net",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://clips.twitch.tv",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(forwardedProtocol === "https" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = spaDocument
    ? NextResponse.rewrite(new URL(SPA_DOCUMENT, request.url), {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({
        request: { headers: requestHeaders },
      });
  response.headers.set("Content-Security-Policy", csp);
  // The dashboard bundle is static and referenced with an explicit version
  // query, so it can be cached at the edge and in the browser: that keeps a
  // repeat navigation from re-downloading 30+ modules and leaves the API call
  // as the only hot-path latency. Documents and API responses keep
  // private/no-store because they carry admission cookies.
  response.headers.set(
    "Cache-Control",
    path.startsWith("/app/")
      ? "public, max-age=300, stale-while-revalidate=86400"
      : "private, no-store",
  );
  if (protectedPage) markProtectedResponse(response);
  if (!admitted && request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    response.cookies.set(GUEST_COOKIE, issueGuest(secret, origin), {
      httpOnly: true, secure: isSecure, sameSite: "lax", path: "/", maxAge: GUEST_TTL_SECONDS,
    });
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

/** Provide this exported item.
 * Contract: accepts the parameters shown in the signature and returns the declared value; side effects follow the implementation.
 * refs: none
 */
export const config = {
  // Cover both API aliases as well as documents; static assets need no guest cookie.
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|images/|drafts/|fonts/|locales/|robots.txt|sitemap\\.xml|ads\\.txt$|manifest\\.webmanifest).*)",
  ],
};
