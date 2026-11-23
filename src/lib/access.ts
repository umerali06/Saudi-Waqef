import type { Role } from "@/lib/types";
import { getCompanyById } from "@/lib/data/companies";
import { getMembership } from "@/lib/data/memberships";

/**
 * Owners always pass and admins pass unless the list is owner-only. Every other
 * role must be listed: an HR user is not an accountant, and the reverse.
 */
export function hasRequiredRole(userRole: Role, required: Role[]) {
  if (required.length === 0 || userRole === "owner") {
    return true;
  }
  if (userRole === "admin") {
    return !(required.length === 1 && required[0] === "owner");
  }
  return required.includes(userRole);
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
  return requireCompanyRole(userId, companyId, [
    "owner",
    "admin",
    "accountant",
    "hr",
    "viewer",
  ]);
}

export async function requireReportAccess(userId: string, companyId: string) {
  return requireCompanyRole(userId, companyId, ["owner", "admin", "accountant", "viewer"]);
}
