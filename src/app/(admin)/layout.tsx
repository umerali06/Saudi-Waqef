import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth-helpers";
import { ensureSystemAdmin, getSystemAdminEmails, isSystemAdminUser } from "@/lib/data/system-admins";

const normalizeEmail = (value?: string | null) =>
  value ? value.trim().toLowerCase() : "";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser({ ignoreImpersonation: true });
  if (!user) {
    redirect("/login");
  }

  const email = normalizeEmail(user.email ?? undefined);
  const allowed = getSystemAdminEmails();
  if (email && allowed.includes(email)) {
    await ensureSystemAdmin({
      userId: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: "super_admin",
    });
  }

  const isAdmin = await isSystemAdminUser(user.id, user.email ?? undefined);
  if (!isAdmin) {
    redirect("/");
  }

  return <AdminShell>{children}</AdminShell>;
}
