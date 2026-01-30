import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listCompaniesForUser } from "@/lib/data/companies";
import { listMembershipsByUser } from "@/lib/data/memberships";
import { ProtectedShell } from "@/components/protected-shell";
import { getSessionUser } from "@/lib/auth-helpers";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const memberships = await listMembershipsByUser(user.id);
  if (memberships.length === 0) {
    redirect("/setup");
  }

  const companies = await listCompaniesForUser(user.id);
  if (companies.length === 0) {
    redirect("/suspended");
  }

  const cookieStore = await cookies();
  const activeCookie = cookieStore.get("active_company")?.value ?? null;
  const activeCompanyId =
    activeCookie && companies.some((company) => company.id === activeCookie)
      ? activeCookie
      : companies[0].id;

  return (
    <ProtectedShell companies={companies} activeCompanyId={activeCompanyId}>
      {children}
    </ProtectedShell>
  );
}
