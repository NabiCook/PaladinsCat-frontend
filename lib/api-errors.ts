/** Error types and safe diagnostics shared by API requests and UI error states.
 *
 * refs: none
 */

/** Stable i18n keys for the API error catalogue (the closed set of known failure keys).
 *
 * refs: none
 */
export const API_ERROR_KEYS = {
  genericFailure: "generated.api.genericFailure",
  unexpectedFetchFailure: "generated.api.unexpectedFetchFailure",
  notAuthenticated: "generated.api.notAuthenticated",
  authenticationRequired: "generated.api.authenticationRequired",
} as const;

/** Union of the known API error keys (the keys of API_ERROR_KEYS).
 *
 * refs: none
 */
export type ApiErrorKey = (typeof API_ERROR_KEYS)[keyof typeof API_ERROR_KEYS];

/** Type-guard: report whether a value is one of the known API error keys.
 *
 * I/O: in (value: unknown) -> out value is ApiErrorKey (boolean predicate)
 *
 * refs: none
 */
export function isApiErrorKey(value: unknown): value is ApiErrorKey {
  return typeof value === "string"
    && (Object.values(API_ERROR_KEYS) as string[]).includes(value);
}

/** Failure categories a rejected API request can be classified into.
 *
 * refs: none
 */
export type ApiRequestFailureKind = "http" | "network" | "timeout" | "edge-challenge" | "session-required" | "invalid-response" | "retry-exhausted";

interface ApiRequestErrorDetails {
  kind?: ApiRequestFailureKind;
  endpoint?: string;
  method?: string;
  timeoutMs?: number;
  code?: string;
  requestId?: string;
}

/** Typed error for a failed API request, carrying status, failure kind, and safe diagnostics.
 *
 * refs: none
 */
export class ApiRequestError extends Error {
  readonly status?: number;
  readonly kind?: ApiRequestFailureKind;
  readonly endpoint?: string;
  readonly method?: string;
  readonly timeoutMs?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(message: string, status?: number, details: ApiRequestErrorDetails = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.kind = details.kind;
    this.endpoint = details.endpoint;
    this.method = details.method;
    this.timeoutMs = details.timeoutMs;
    this.code = details.code;
    this.requestId = details.requestId;
  }
}

/** Translate API keys and add safe status, cause, code, and route details.
 *
 * I/O: in (error: unknown, translate: (key: ApiErrorKey) => string, fallback?: string) -> out string
 *
 * refs: none
 */
export function formatApiErrorMessage(
  error: unknown,
  translate: (key: ApiErrorKey) => string,
  fallback?: string,
): string {
  const rawMessage = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const looksLikeMessageKey = /^[A-Za-z][A-Za-z0-9_.\[\]-]*\.[A-Za-z0-9_.\[\]-]+$/.test(rawMessage);
  const localizedMessage = looksLikeMessageKey
    ? translate(rawMessage as ApiErrorKey) as unknown
    : undefined;
  const translatedMessage = typeof localizedMessage === "string" && localizedMessage !== rawMessage
    ? localizedMessage
    : rawMessage;
  const isGeneric = rawMessage === API_ERROR_KEYS.genericFailure
    || rawMessage === API_ERROR_KEYS.unexpectedFetchFailure
    || rawMessage === "The request could not be completed."
    || rawMessage === "The data request could not be completed.";
  const requestContext = error instanceof ApiRequestError && error.method && error.endpoint
    ? `${error.method} ${error.endpoint} failed`
    : "The API request failed";
  const message = isGeneric || (looksLikeMessageKey && translatedMessage === rawMessage)
    ? fallback || requestContext
    : translatedMessage || fallback || requestContext;
  if (!(error instanceof ApiRequestError)) return message;

  const diagnostics: string[] = [];
  if (error.kind === "timeout") diagnostics.push(`request timed out${error.timeoutMs ? ` after ${error.timeoutMs} ms` : ""}`);
  else if (error.kind === "network") diagnostics.push("network connection failed before a response was received");
  else if (error.kind === "edge-challenge") diagnostics.push("blocked by the edge security challenge");
  else if (error.kind === "session-required") diagnostics.push("browser session was not accepted");
  else if (error.kind === "invalid-response") diagnostics.push("server returned an invalid JSON response");
  else if (error.kind === "retry-exhausted") diagnostics.push("request retries were exhausted");
  if (error.status != null) diagnostics.push(`HTTP ${error.status}`);
  if (error.code) diagnostics.push(error.code);
  if (error.requestId) diagnostics.push(`request ${error.requestId}`);
  if (error.method && error.endpoint) diagnostics.push(`${error.method} ${error.endpoint}`);
  return diagnostics.length ? `${message} (${diagnostics.join("; ")})` : message;
}
