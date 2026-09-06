/**
 * Classifies a failed ZATCA submission so the submission loop knows whether to
 * retry the same document, move past it, or stop the whole run.
 *
 * This is the server-side counterpart to `error-messages.ts`, which buckets
 * onboarding failures for the wizard UI. Keep the two separate: this one runs
 * against live submission responses and decides control flow.
 */
export type ZatcaFailureKind =
  /** Transport/5xx/throttling — ZATCA may accept the identical document later. */
  | "retryable"
  /** ZATCA judged the document invalid. Retrying the same bytes cannot help. */
  | "permanent"
  /** Credentials or certificate are unusable — every document will fail. */
  | "blocked";

const AUTH_STATUSES = new Set([401, 403]);
const THROTTLE_STATUSES = new Set([408, 425, 429]);

const AUTH_PATTERNS = [
  "invalid token",
  "unauthorized",
  "authentication",
  "certificate expired",
  "invalid certificate",
  "csid",
];

const flatten = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(flatten).join(" ");
  return "";
};

export function classifyZatcaSubmissionFailure(params: {
  httpStatus?: number | null;
  alerts?: unknown;
  response?: unknown;
}): ZatcaFailureKind {
  const status = params.httpStatus ?? null;
  const haystack = `${flatten(params.alerts)} ${flatten(params.response)}`.toLowerCase();

  if (status !== null && AUTH_STATUSES.has(status)) return "blocked";
  // ZATCA reports a rejected document with 400/422 and validation messages; an
  // authentication problem can surface the same way, so inspect the payload.
  if (AUTH_PATTERNS.some((pattern) => haystack.includes(pattern))) return "blocked";

  if (status === null) return "retryable";
  if (THROTTLE_STATUSES.has(status)) return "retryable";
  if (status >= 500) return "retryable";
  if (status >= 400) return "permanent";

  // 2xx/3xx with success=false: no verdict we can act on, so try again later.
  return "retryable";
}
