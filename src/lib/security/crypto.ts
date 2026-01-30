import crypto from "crypto";

const ENCRYPTION_PREFIX = "enc:v1";

function getEncryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY is not configured.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be 32 bytes (base64).");
  }
  return key;
}

export function encryptString(value: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptString(value: string) {
  if (!value.startsWith(`${ENCRYPTION_PREFIX}:`)) {
    return value;
  }
  const raw = value.slice(ENCRYPTION_PREFIX.length + 1);
  const [ivBase64, tagBase64, payloadBase64] = raw.split(":");
  if (!ivBase64 || !tagBase64 || !payloadBase64) {
    throw new Error("Invalid encrypted payload.");
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const payload = Buffer.from(payloadBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptOptional(value?: string | null) {
  if (value === undefined || value === null || value === "") {
    return value ?? null;
  }
  return encryptString(value);
}

export function decryptOptional(value?: string | null) {
  if (value === undefined || value === null || value === "") {
    return value ?? null;
  }
  return decryptString(value);
}
