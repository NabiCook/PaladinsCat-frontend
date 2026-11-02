/** Server-side provider transport. Private Keycloak trust never changes global TLS roots.
 *
 * refs: none
 */
import { X509Certificate, createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { Agent } from "undici";

const MAX_CA_BYTES = 64 * 1024;
let privateAgent: { fingerprint: string; agent: Agent } | undefined;

function privateCa(): Buffer {
  const path = process.env.PALADINSCAT_OIDC_CA_FILE?.trim();
  if (!path) throw new Error("Private OIDC TLS requires PALADINSCAT_OIDC_CA_FILE");
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_CA_BYTES) throw new Error("Invalid OIDC CA file");
    const buffer = Buffer.alloc(MAX_CA_BYTES + 1);
    let size = 0;
    for (;;) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
      if (size > MAX_CA_BYTES) throw new Error("Invalid OIDC CA file");
    }
    const ca = buffer.subarray(0, size);
    const text = ca.toString("ascii");
    const certificates = text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    if (!certificates?.length || text.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g, "").trim()) throw new Error("Invalid OIDC CA file");
    for (const pem of certificates) {
      if (!new X509Certificate(pem).ca) throw new Error("OIDC trust requires a CA certificate");
    }
    return ca;
  } finally { closeSync(fd); }
}

function keycloakAgent(): Agent {
  const ca = privateCa();
  const fingerprint = createHash("sha256").update(ca).digest("hex");
  if (privateAgent?.fingerprint !== fingerprint) {
    const previous = privateAgent;
    privateAgent = { fingerprint, agent: new Agent({
      connections: 8,
      connect: { ca, rejectUnauthorized: true, timeout: 3_000 },
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
    }) };
    if (previous) void previous.agent.close().catch(() => undefined);
  }
  return privateAgent.agent;
}

/** Require authenticated HTTPS and reject redirects before sending any provider credential.
 *
 * I/O: in (input: string | URL, init: RequestInit) -> out Promise<Response>
 *
 * refs: none
 */
export async function oidcFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || (url.hostname === "keycloak" && url.port !== "8443")) throw new Error("Invalid OIDC HTTPS endpoint");
  const options: RequestInit & { dispatcher?: Agent } = {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(10_000),
  };
  if (url.hostname === "keycloak") options.dispatcher = keycloakAgent();
  return fetch(url.toString(), options);
}
