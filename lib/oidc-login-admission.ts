/** Bound login-start work before form parsing or upstream mutations.
 * refs: doc: documents/02-technical/security/auth.md
 */
const MAX_FORM_BYTES = 2048;
const MAX_RETURN_BYTES = 1024;

/** Create a constant-space, process-wide token bucket and concurrent-start gate.
 * I/O: clock and optional limits -> admission function returning an idempotent release, or null.
 * refs: none
 */
export function createLoginStartAdmission(
  clock = () => performance.now(),
  limits = { burst: 60, perSecond: 2, concurrency: 16 },
): () => (() => void) | null {
  let tokens = limits.burst, last = clock(), active = 0;
  return () => {
    const now = clock();
    tokens = Math.min(limits.burst, tokens + Math.max(0, now - last) * limits.perSecond / 1000);
    last = now;
    if (active >= limits.concurrency || tokens < 1) return null;
    tokens--; active++;
    let released = false;
    return () => { if (!released) { released = true; active--; } };
  };
}

/** Login GET and POST share this worker-local budget; ingress/backend limits remain in force.
 * refs: doc: documents/02-technical/security/auth.md
 */
export const admitLoginStart = createLoginStartAdmission();

/** Safe public rejection; never reflects submitted fields or stream exceptions.
 * refs: none
 */
export class LoginFormError extends Error {
  constructor(readonly status: number) { super("Invalid login form"); }
}

/** Read only a small UTF-8 URL-encoded form, with an absolute body deadline.
 * I/O: request, optional deadline milliseconds -> validated intent and return path (still normalized by caller).
 * refs: doc: documents/02-technical/security/auth.md
 */
export async function readLoginForm(request: Request, deadlineMs = 3000): Promise<{ intent: "login" | "create"; returnPath: string }> {
  const media = request.headers.get("content-type") ?? "";
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media)) throw new LoginFormError(415);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw new LoginFormError(400);
  if (length !== null && Number(length) > MAX_FORM_BYTES) throw new LoginFormError(413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (reader) {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new LoginFormError(408)), deadlineMs);
      });
      while (true) {
        const next = await Promise.race([reader.read(), timeout]);
        if (next.done) break;
        total += next.value.byteLength;
        if (total > MAX_FORM_BYTES) throw new LoginFormError(413);
        chunks.push(next.value);
      }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const fields = new Map<string, string>();
    if (text) {
      for (const pair of text.split("&")) {
        const index = pair.indexOf("=");
        const key = decodeURIComponent((index < 0 ? pair : pair.slice(0, index)).replace(/\+/g, " "));
        const value = decodeURIComponent((index < 0 ? "" : pair.slice(index + 1)).replace(/\+/g, " "));
        if ((key !== "intent" && key !== "return") || fields.has(key)) throw new LoginFormError(400);
        fields.set(key, value);
      }
    }
    const intent = fields.get("intent");
    const returnPath = fields.get("return") || "/";
    if ((intent !== undefined && intent !== "create") || new TextEncoder().encode(returnPath).byteLength > MAX_RETURN_BYTES) throw new LoginFormError(400);
    return { intent: intent === "create" ? "create" : "login", returnPath };
  } catch (error) {
    // Cancellation of an attacker-controlled stream must not extend the deadline.
    if (reader) void reader.cancel().catch(() => {});
    throw error instanceof LoginFormError ? error : new LoginFormError(400);
  } finally {
    clearTimeout(timer);
    reader?.releaseLock();
  }
}
