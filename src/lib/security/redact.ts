const SENSITIVE_KEYS = new Set([
  "privateKeyPem",
  "publicKeyPem",
  "secret",
  "complianceSecret",
  "binarySecurityToken",
  "complianceToken",
  "complianceRequestId",
  "password",
  "apiKey",
  "webhookSecret",
  "webhookSecretPrevious",
  "credentials",
  "credentialsEnc",
]);

/**
 * Deep-clones `value`, replacing known-sensitive keys with "[REDACTED]".
 * Use before passing any integration/credentials-shaped object to `logger.*`.
 * Certificate PEMs (`certificatePem`, `complianceCertificatePem`) are NOT
 * redacted — they are ZATCA-issued public data, safe to log/fingerprint.
 */
export function redactSecrets<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value as object)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, seen)) as unknown as T;
  }
  if (value instanceof Date) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      output[key] = val ? "[REDACTED]" : val;
    } else {
      output[key] = redactSecrets(val, seen);
    }
  }
  return output as T;
}
