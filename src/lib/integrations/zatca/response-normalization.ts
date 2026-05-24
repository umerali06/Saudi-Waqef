export type ZatcaArtifactStatus = "submitted" | "accepted" | "rejected";

export type NormalizedZatcaResult = {
  uuid: string;
  status: ZatcaArtifactStatus;
  providerReference?: string | null;
  message?: string | null;
  raw?: Record<string, unknown>;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const getNested = (source: Record<string, unknown>, path: string[]): unknown => {
  let cursor: unknown = source;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

export const normalizeZatcaStatus = (candidate: unknown): ZatcaArtifactStatus => {
  const raw = asString(candidate)?.toLowerCase();
  if (!raw) {
    return "submitted";
  }
  if (
    raw.includes("accept") ||
    raw.includes("clear") ||
    raw === "success" ||
    raw === "ok" ||
    raw === "passed"
  ) {
    return "accepted";
  }
  if (
    raw.includes("reject") ||
    raw.includes("error") ||
    raw.includes("fail") ||
    raw.includes("invalid")
  ) {
    return "rejected";
  }
  return "submitted";
};

export const normalizeZatcaResults = (payload: unknown): NormalizedZatcaResult[] => {
  const root = asObject(payload);
  const listCandidate = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.results)
      ? root?.results
      : Array.isArray(root?.invoices)
        ? root?.invoices
        : Array.isArray(root?.documents)
          ? root?.documents
          : Array.isArray(root?.data)
            ? root?.data
            : [];

  const normalized: NormalizedZatcaResult[] = [];
  for (const entry of listCandidate) {
    const row = asObject(entry);
    if (!row) continue;
    const uuid =
      asString(row.uuid) ||
      asString(row.invoiceUuid) ||
      asString(getNested(row, ["invoice", "uuid"])) ||
      asString(getNested(row, ["document", "uuid"]));
    if (!uuid) continue;

    normalized.push({
      uuid,
      status: normalizeZatcaStatus(
        row.status ??
          row.result ??
          row.state ??
          row.validationStatus ??
          row.processingStatus ??
          row.outcome
      ),
      providerReference:
        asString(row.providerReference) ||
        asString(row.referenceId) ||
        asString(row.clearanceId) ||
        asString(row.reportingId) ||
        null,
      message:
        asString(row.message) ||
        asString(row.description) ||
        asString(row.error) ||
        null,
      raw: row,
    });
  }
  return normalized;
};

