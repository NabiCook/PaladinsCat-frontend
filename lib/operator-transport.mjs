/** Request-scoped operator transport; no global TLS settings or redirect fallback. */
import { X509Certificate, createHash, createPrivateKey } from "node:crypto";
import { openSync, fstatSync, readSync, closeSync } from "node:fs";
import { Agent, Dispatcher1Wrapper } from "undici";
import { assertOperatorConfiguration, isOperatorBff } from "./operator-plane.ts";

let cached;

export function readOperatorMaterial(name) {
  const path = process.env[name]?.trim();
  if (!path) throw new Error("Missing operator TLS material");
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 65536) throw new Error("Invalid operator TLS material");
    const bytes = Buffer.alloc(65537);
    let size = 0;
    for (;;) {
      const count = readSync(fd, bytes, size, bytes.length - size, null);
      if (!count) break;
      size += count;
      if (size > 65536) throw new Error("Invalid operator TLS material");
    }
    return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}

export function parseOperatorCertificates(bytes, caRequired) {
  const text = bytes.toString("ascii");
  const blocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!blocks?.length || text.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g, "").trim()) throw new Error("Invalid operator certificates");
  return blocks.map(pem => {
    const certificate = new X509Certificate(pem);
    if (certificate.ca !== caRequired || Date.parse(certificate.validFrom) > Date.now()
        || Date.parse(certificate.validTo) <= Date.now()) throw new Error("Invalid operator certificate validity");
    return certificate;
  });
}

function clientAgent() {
  const ca = readOperatorMaterial("PALADINSCAT_OPERATOR_API_CA_FILE");
  const cert = readOperatorMaterial("PALADINSCAT_OPERATOR_API_CERT_FILE");
  const key = readOperatorMaterial("PALADINSCAT_OPERATOR_API_KEY_FILE");
  const roots = parseOperatorCertificates(ca, true);
  const leaves = parseOperatorCertificates(cert, false);
  const privateKey = createPrivateKey(key);
  if (leaves.length !== 1 || !leaves[0].checkPrivateKey(privateKey)
      || !leaves[0].keyUsage?.includes("1.3.6.1.5.5.7.3.2")
      || !roots.some(root => leaves[0].verify(root.publicKey))) throw new Error("Invalid operator client identity");
  const fingerprint = createHash("sha256").update(ca).update(cert).update(key).digest("hex");
  if (cached?.fingerprint !== fingerprint) {
    const previous = cached;
    // Adapt Node bundled fetch without changing global dispatch or mTLS identity.
    cached = { fingerprint, agent: new Dispatcher1Wrapper(new Agent({ connections: 8,
      connect: { ca, cert, key, rejectUnauthorized: true, timeout: 3000 },
      headersTimeout: 10000, bodyTimeout: 10000,
    })) };
    if (previous) void previous.agent.close().catch(() => undefined);
  }
  return cached.agent;
}

/** TLS client identity is sent exclusively to the configured private API origin. */
export async function operatorBackendFetch(input, init = {}) {
  if (!isOperatorBff()) return fetch(input, init);
  assertOperatorConfiguration();
  const url = new URL(input);
  const configured = new URL(process.env.NEXT_SERVER_API_URL);
  if (url.protocol !== "https:" || url.origin !== configured.origin || url.username || url.password || url.hash) {
    throw new Error("Invalid operator API destination");
  }
  return fetch(url, { ...init, dispatcher: clientAgent(), redirect: "error", cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(10000) });
}
