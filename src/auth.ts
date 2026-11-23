import type { NextAuthOptions } from "next-auth";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { loginSchema } from "@/lib/validators/auth";
import { getUserByEmail } from "@/lib/data/users";
import { verifyPassword } from "@/lib/security/password";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { getUserSecurity, updateUserSecurity } from "@/lib/data/user-security";
import { decryptString } from "@/lib/security/crypto";
import {
  clearLoginAttempts,
  getLoginThrottle,
  registerFailedLogin,
} from "@/lib/security/login-guard";
import { verifyMfaToken } from "@/lib/security/mfa";
import { logger } from "@/lib/ops/logger";
import { reportPlatformEvent } from "@/lib/notifications/platform-events";

function getRequestIp(
  req?: { headers?: Headers | Record<string, string | string[] | undefined> } | Request
) {
  if (!req?.headers) {
    return null;
  }
  const headersAny = req.headers as unknown;
  const forwarded =
    typeof (headersAny as Headers).get === "function"
      ? (headersAny as Headers).get("x-forwarded-for")
      : (headersAny as Record<string, string | string[] | undefined>)["x-forwarded-for"];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return raw?.split(",")[0]?.trim() ?? null;
  }
  if (typeof (headersAny as Headers).get === "function") {
    return (headersAny as Headers).get("x-real-ip");
  }
  const realIp = (headersAny as Record<string, string | string[] | undefined>)["x-real-ip"];
  return Array.isArray(realIp) ? realIp[0] ?? null : realIp ?? null;
}

const lockedError = (lockedUntil?: Date | null) => {
  const minutes = lockedUntil ? Math.ceil((lockedUntil.getTime() - Date.now()) / 60000) : 0;
  return `AUTH_LOCKED:${Math.max(minutes, 1)}`;
};

/**
 * Accepts what the user meant to type: temporary passwords get pasted with a
 * trailing space, and an Arabic keyboard produces Arabic-Indic digits.
 */
async function verifyTypedPassword(typed: string, hash: string) {
  if (await verifyPassword(typed, hash)) return true;
  const normalized = typed
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  return normalized !== typed && normalized.length > 0 && verifyPassword(normalized, hash);
}

/**
 * Errors authorize() raises on purpose. Anything else (database outage, bad
 * configuration) must not be shown to the user as a wrong password.
 */
async function reportingUnexpectedErrors<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("AUTH_")) throw error;
    logger.error("Sign-in failed unexpectedly", { error: message });
    await reportPlatformEvent({
      kind: "sign_in_unavailable",
      severity: "critical",
      title: { ar: "تعطل تسجيل الدخول", en: "Sign-in is failing" },
      message: {
        ar: "تعذر على مستخدم الدخول بسبب خطأ في الخادم.",
        en: "A user could not sign in because of a server error.",
      },
      path: "/admin/health",
      quietMinutes: 30,
    });
    throw new Error("AUTH_UNAVAILABLE");
  }
}

async function trackFailedLogin(params: {
  email: string;
  ip?: string | null;
  userId?: string | null;
  reason?: string;
}) {
  try {
    return await registerFailedLogin(params);
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "MFA code", type: "text" },
      },
      authorize: (credentials, req) => reportingUnexpectedErrors(async () => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          throw new Error("AUTH_INVALID_CREDENTIALS");
        }

        const email = parsed.data.email.trim().toLowerCase();
        const ip = getRequestIp(req);
        const throttle = await getLoginThrottle(email, ip);
        if (throttle.locked) {
          try {
            await recordAuditEvent({
              companyId: "system",
              userId: "anonymous",
              action: "auth.locked",
              entity: "user",
              metadata: {
                email,
                ip,
                lockedUntil: throttle.lockedUntil?.toISOString() ?? null,
              },
            });
          } catch {
            // Ignore audit failures.
          }
          throw new Error(lockedError(throttle.lockedUntil));
        }

        const user = await getUserByEmail(email);
        if (!user || user.status !== "active") {
          const lockResult = await trackFailedLogin({
            email,
            ip,
            userId: user?.id ?? null,
            reason: "user_not_active",
          });
          if (lockResult?.lockedUntil) {
            try {
              await recordAuditEvent({
                companyId: "system",
                userId: user?.id ?? "anonymous",
                userEmail: user?.email ?? undefined,
                action: "auth.locked",
                entity: "user",
                entityId: user?.id ?? null,
                metadata: { email, ip, lockedUntil: lockResult.lockedUntil.toISOString() },
              });
            } catch {
              // Ignore audit failures.
            }
          }
          throw new Error(
            lockResult?.lockedUntil ? lockedError(lockResult.lockedUntil) : "AUTH_INVALID_CREDENTIALS"
          );
        }

        const isValid = await verifyTypedPassword(parsed.data.password, user.passwordHash);
        if (!isValid) {
          const lockResult = await trackFailedLogin({
            email,
            ip,
            userId: user.id,
            reason: "invalid_password",
          });
          if (lockResult?.lockedUntil) {
            try {
              await recordAuditEvent({
                companyId: "system",
                userId: user.id,
                userEmail: user.email,
                action: "auth.locked",
                entity: "user",
                entityId: user.id,
                metadata: { ip, lockedUntil: lockResult.lockedUntil.toISOString() },
              });
            } catch {
              // Ignore audit failures.
            }
          }
          try {
            await recordAuditEvent({
              companyId: "system",
              userId: user.id,
              userEmail: user.email,
              action: "auth.login_failed",
              entity: "user",
              entityId: user.id,
              metadata: { reason: "invalid_password", ip },
            });
          } catch {
            // Ignore audit failures.
          }
          throw new Error(
            lockResult?.lockedUntil ? lockedError(lockResult.lockedUntil) : "AUTH_INVALID_CREDENTIALS"
          );
        }

        const security = await getUserSecurity(user.id);
        if (security.mfaEnabled) {
          const token = parsed.data.otp?.trim() ?? "";
          if (!token) {
            throw new Error("AUTH_MFA_REQUIRED");
          }
          let secret: string | null = null;
          try {
            secret = security.mfaSecret ? decryptString(security.mfaSecret) : null;
          } catch (error) {
            // The secret was encrypted under a different APP_ENCRYPTION_KEY, so
            // no code the user types can ever match.
            logger.error("Stored MFA secret could not be decrypted", {
              userId: user.id,
              error: error instanceof Error ? error.message : String(error),
            });
            throw new Error("AUTH_MFA_BROKEN");
          }
          if (!secret || !verifyMfaToken(secret, token)) {
            const lockResult = await trackFailedLogin({
              email,
              ip,
              userId: user.id,
              reason: "invalid_mfa",
            });
            if (lockResult?.lockedUntil) {
              try {
                await recordAuditEvent({
                  companyId: "system",
                  userId: user.id,
                  userEmail: user.email,
                  action: "auth.locked",
                  entity: "user",
                  entityId: user.id,
                  metadata: { ip, lockedUntil: lockResult.lockedUntil.toISOString() },
                });
              } catch {
                // Ignore audit failures.
              }
            }
            try {
              await recordAuditEvent({
                companyId: "system",
                userId: user.id,
                userEmail: user.email,
                action: "auth.mfa_failed",
                entity: "user",
                entityId: user.id,
                metadata: { ip },
              });
            } catch {
              // Ignore audit failures.
            }
            throw new Error("AUTH_MFA_INVALID");
          }
        }

        try {
          await clearLoginAttempts(email, ip);
          await recordAuditEvent({
            companyId: "system",
            userId: user.id,
            userEmail: user.email,
            action: "auth.login",
            entity: "user",
            entityId: user.id,
            metadata: { ip, mfa: security.mfaEnabled },
          });
          await updateUserSecurity(user.id, {
            lastLoginAt: new Date(),
            lastLoginIp: ip ?? null,
          });
        } catch {
          // Avoid blocking login if audit logging fails.
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      }),
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
