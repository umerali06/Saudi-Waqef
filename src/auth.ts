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

function getRequestIp(
  req?: Request | { headers?: Headers | Record<string, string | string[] | undefined> }
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
      authorize: async (credentials, req) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          throw new Error("AUTH_INVALID_CREDENTIALS");
        }

        const email = parsed.data.email.trim().toLowerCase();
        const ip = getRequestIp(req);
        const throttle = await getLoginThrottle(email);
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
          throw new Error("AUTH_LOCKED");
        }

        const user = await getUserByEmail(parsed.data.email);
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
          throw new Error("AUTH_INVALID_CREDENTIALS");
        }

        const isValid = await verifyPassword(
          parsed.data.password,
          user.passwordHash
        );
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
          throw new Error("AUTH_INVALID_CREDENTIALS");
        }

        const security = await getUserSecurity(user.id);
        if (security.mfaEnabled) {
          const token = parsed.data.otp?.trim() ?? "";
          if (!token) {
            throw new Error("AUTH_MFA_REQUIRED");
          }
          const secret = security.mfaSecret ? decryptString(security.mfaSecret) : null;
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
          await clearLoginAttempts(email);
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
      },
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
