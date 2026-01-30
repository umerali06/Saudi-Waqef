import { authenticator } from "otplib";

const DEFAULT_ISSUER = "Saudi Waqef";

authenticator.options = {
  window: 1,
};

export function getMfaIssuer() {
  return process.env.MFA_ISSUER ?? DEFAULT_ISSUER;
}

export function generateMfaSecret(email: string) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, getMfaIssuer(), secret);
  return { secret, otpauth };
}

export function verifyMfaToken(secret: string, token: string) {
  const normalized = token.replace(/\s+/g, "");
  return authenticator.check(normalized, secret);
}
