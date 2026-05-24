export type GosiResultStatus = "accepted" | "rejected" | "submitted";

export type NormalizedGosiResult = {
  employeeId: string;
  status: GosiResultStatus;
  reference?: string | null;
  message?: string | null;
  raw?: Record<string, unknown>;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const normalizeStatus = (candidate: unknown): GosiResultStatus => {
  const raw = asString(candidate)?.toLowerCase();
  if (!raw) return "submitted";
  if (raw.includes("accept") || raw.includes("success") || raw.includes("ok")) {
    return "accepted";
  }
  if (raw.includes("reject") || raw.includes("error") || raw.includes("fail")) {
    return "rejected";
  }
  return "submitted";
};

export const normalizeGosiResults = (payload: unknown): NormalizedGosiResult[] => {
  const root = asObject(payload);
  const listCandidate = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.results)
      ? root?.results
      : Array.isArray(root?.employees)
        ? root?.employees
        : Array.isArray(root?.data)
          ? root?.data
          : [];

  const normalized: NormalizedGosiResult[] = [];
  for (const entry of listCandidate) {
    const row = asObject(entry);
    if (!row) continue;
    const employeeId = asString(row.employeeId) || asString(row.employeeNumber);
    if (!employeeId) continue;
    normalized.push({
      employeeId,
      status: normalizeStatus(row.status ?? row.result ?? row.outcome),
      reference: asString(row.reference) || asString(row.referenceId) || null,
      message: asString(row.message) || asString(row.error) || null,
      raw: row,
    });
  }
  return normalized;
};

