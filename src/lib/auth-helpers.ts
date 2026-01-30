import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { getActiveImpersonation } from "@/lib/data/impersonations";
import { getUserById } from "@/lib/data/users";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  impersonatedBy?: {
    id: string;
    email?: string | null;
    impersonationId: string;
  };
};

export async function getSessionUser(options?: { ignoreImpersonation?: boolean }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }

  const baseUser: SessionUser = {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
  };

  if (options?.ignoreImpersonation) {
    return baseUser;
  }

  const cookieStore = await cookies();
  const impersonationId = cookieStore.get("impersonation_id")?.value;
  if (!impersonationId) {
    return baseUser;
  }

  const impersonation = await getActiveImpersonation(impersonationId);
  if (!impersonation) {
    return baseUser;
  }

  const targetUser = await getUserById(impersonation.targetUserId);
  if (!targetUser) {
    return baseUser;
  }

  return {
    id: targetUser.id,
    name: targetUser.name ?? null,
    email: targetUser.email ?? null,
    impersonatedBy: {
      id: impersonation.adminUserId,
      email: impersonation.adminEmail ?? session.user.email ?? null,
      impersonationId: impersonation.id,
    },
  } as SessionUser;
}
