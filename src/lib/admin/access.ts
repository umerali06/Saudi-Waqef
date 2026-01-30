import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import {
  ensureSystemAdmin,
  getSystemAdmin,
  getSystemAdminEmails,
  isSystemAdminUser,
  type SystemAdminRecord,
} from "@/lib/data/system-admins";

const normalizeEmail = (value?: string | null) =>
  value ? value.trim().toLowerCase() : "";

export async function requireSystemAdmin() {
  const user = await getSessionUser({ ignoreImpersonation: true });
  if (!user) {
    return {
      user: null,
      admin: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const email = normalizeEmail(user.email ?? undefined);
  const allowed = getSystemAdminEmails();
  if (email && allowed.includes(email)) {
    const admin = await ensureSystemAdmin({
      userId: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: "super_admin",
    });
    return { user, admin, response: null } as {
      user: typeof user;
      admin: SystemAdminRecord | null;
      response: null;
    };
  }

  const isAdmin = await isSystemAdminUser(user.id, user.email ?? undefined);
  if (!isAdmin) {
    return {
      user,
      admin: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const admin = await getSystemAdmin(user.id);
  return { user, admin, response: null } as {
    user: typeof user;
    admin: SystemAdminRecord | null;
    response: null;
  };
}
