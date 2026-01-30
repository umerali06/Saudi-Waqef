import type { Role } from "@/lib/types";
import { getCompanyById } from "@/lib/data/companies";
import { getMembership } from "@/lib/data/memberships";

const ROLE_PRIORITY: Record<Role, number> = {
  owner: 5,
  admin: 4,
  accountant: 3,
  hr: 3,
  employee: 2,
  viewer: 1,
};

export function hasRequiredRole(userRole: Role, required: Role[]) {
  if (required.length === 0) {
    return true;
  }
  return required.some((role) => ROLE_PRIORITY[userRole] >= ROLE_PRIORITY[role]);
}

export async function requireCompanyMembership(
  userId: string,
  companyId: string
) {
  const membership = await getMembership({ userId, companyId });
  if (!membership) {
    return null;
  }
  const company = await getCompanyById(companyId);
  if (!company || company.status === "suspended") {
    return null;
  }
  return membership;
}

export async function requireCompanyRole(
  userId: string,
  companyId: string,
  requiredRoles: Role[]
) {
  const membership = await getMembership({ userId, companyId });
  if (!membership) {
    return null;
  }
  const company = await getCompanyById(companyId);
  if (!company || company.status === "suspended") {
    return null;
  }
  if (!hasRequiredRole(membership.role, requiredRoles)) {
    return null;
  }
  return membership;
}

export async function requireAccountingAccess(userId: string, companyId: string) {
  return requireCompanyRole(userId, companyId, ["owner", "admin", "accountant"]);
}

export async function requireAdminAccess(userId: string, companyId: string) {
  return requireCompanyRole(userId, companyId, ["owner", "admin"]);
}

export async function requireHrAccess(userId: string, companyId: string) {
  return requireCompanyRole(userId, companyId, ["owner", "admin", "hr"]);
}

export async function requireDocumentAccess(userId: string, companyId: string) {
  return requireCompanyRole(userId, companyId, ["owner", "admin", "accountant", "viewer"]);
}

export async function requireReportAccess(userId: string, companyId: string) {
  return requireCompanyRole(userId, companyId, ["owner", "admin", "accountant", "viewer"]);
}
