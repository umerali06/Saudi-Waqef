/**
 * Translates ZATCA failures into plain-language buckets for the onboarding
 * wizard's "Connection Failed" state. Deliberately has no dependency on
 * @talha7k/zatca (a Node-only package) so this module is safe to import from
 * client components — it only pattern-matches on error codes/messages that
 * have already crossed the API boundary as plain JSON/strings.
 */
export type ZatcaFailureBucket =
  | "otp_invalid"
  | "csid_rejected"
  | "compliance_failed"
  | "zatca_unavailable"
  | "internal_error"
  | "sync_interrupted"
  | "certificate_expired"
  | "company_info_incomplete"
  | "seller_address_incomplete"
  | "unknown";

export type ZatcaFailureInfo = {
  bucket: ZatcaFailureBucket;
  messageKey: string;
  fields?: string[];
};

const UNAVAILABLE_CODES = new Set(["API_CONN_ERR", "API_TIMEOUT_ERR"]);
const INTERNAL_CODES = new Set([
  "CERT_GEN_ERR",
  "CERT_STORAGE_ERR",
  "CERT_LOAD_ERR",
  "XML_GEN_ERR",
  "SIGN_ERR",
  "QR_GEN_ERR",
  "VALIDATION_ERR",
  "HASH_CHAIN_ERR",
]);

type NormalizedError = { message?: string; code?: string; details?: unknown };

function detailMessageOf(details: unknown): string | undefined {
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.category === "string") return record.category;
  }
  return undefined;
}

function normalize(input: unknown): NormalizedError {
  if (!input) return {};
  if (typeof input === "string") return { message: input };
  if (input instanceof Error) {
    const withExtras = input as Error & { code?: unknown; details?: unknown };
    return {
      message: input.message,
      code: typeof withExtras.code === "string" ? withExtras.code : undefined,
      details: withExtras.details,
    };
  }
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    return {
      message:
        typeof record.error === "string"
          ? record.error
          : typeof record.message === "string"
            ? record.message
            : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
      details: record.details,
    };
  }
  return {};
}

export function classifyZatcaFailure(input: unknown): ZatcaFailureInfo {
  const err = normalize(input);
  const originalMessage = (err.message ?? "").trim();
  const message = originalMessage.toLowerCase();

  const fieldsAfterColon = () => {
    const colonIndex = originalMessage.indexOf(":");
    if (colonIndex < 0) return undefined;
    const fields = originalMessage.slice(colonIndex + 1).split(",").map((field) => field.trim()).filter(Boolean);
    return fields.length ? fields : undefined;
  };

  if (message.startsWith("zatca_seller_address_incomplete")) {
    return {
      bucket: "seller_address_incomplete",
      messageKey: "integrations.zatca.errors.sellerAddressIncomplete",
      fields: fieldsAfterColon(),
    };
  }
  if (message.startsWith("zatca_company_information_incomplete")) {
    return {
      bucket: "company_info_incomplete",
      messageKey: "integrations.zatca.errors.companyInfoIncomplete",
      fields: fieldsAfterColon(),
    };
  }

  if (message.includes("zatca_lock_lost") || message.includes("zatca_lock_held")) {
    return { bucket: "sync_interrupted", messageKey: "integrations.zatca.errors.syncInterrupted" };
  }
  if (message.includes("certificate_expired")) {
    return { bucket: "certificate_expired", messageKey: "integrations.zatca.errors.certificateExpired" };
  }
  if (err.code && UNAVAILABLE_CODES.has(err.code)) {
    return { bucket: "zatca_unavailable", messageKey: "integrations.zatca.errors.unavailable" };
  }
  if (err.code === "API_ERR") {
    const detailMessage = (detailMessageOf(err.details) ?? message).toLowerCase();
    if (detailMessage.includes("otp")) {
      return { bucket: "otp_invalid", messageKey: "integrations.zatca.errors.otpInvalid" };
    }
    return { bucket: "csid_rejected", messageKey: "integrations.zatca.errors.csidRejected" };
  }
  if (message.includes("otp")) {
    return { bucket: "otp_invalid", messageKey: "integrations.zatca.errors.otpInvalid" };
  }
  if (err.code && INTERNAL_CODES.has(err.code)) {
    return { bucket: "internal_error", messageKey: "integrations.zatca.errors.internal" };
  }
  if (message.includes("compliance")) {
    return { bucket: "compliance_failed", messageKey: "integrations.zatca.errors.complianceFailed" };
  }
  if (message.includes("network") || message.includes("fetch failed") || message.includes("econnrefused")) {
    return { bucket: "zatca_unavailable", messageKey: "integrations.zatca.errors.unavailable" };
  }
  return { bucket: "unknown", messageKey: "integrations.zatca.errors.generic" };
}
