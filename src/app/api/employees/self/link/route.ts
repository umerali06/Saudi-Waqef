import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyMembership } from "@/lib/access";
import { getEmployeeByUserId, listEmployees } from "@/lib/data/employees";
import { claimLinkRequest, hasRecentLinkRequest } from "@/lib/data/employee-link-requests";
import { notifyCompanyRoles } from "@/lib/notifications/service";

export const runtime = "nodejs";

/** The signed-in person's account and what they can do about a missing employee record. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const account = {
    userId: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    role: membership.role,
  };
  const canManageHr = hasRequiredRole(membership.role, ["owner", "admin", "hr"]);
  if (await getEmployeeByUserId(companyId, user.id)) {
    return NextResponse.json({ account, linked: true, canManageHr, candidate: null, notified: false });
  }

  const email = (user.email ?? "").trim().toLowerCase();
  const match =
    canManageHr && email
      ? (await listEmployees(companyId)).find(
          (employee) =>
            !employee.userId &&
            employee.status !== "terminated" &&
            (employee.email ?? "").trim().toLowerCase() === email
        )
      : undefined;

  return NextResponse.json({
    account,
    linked: false,
    canManageHr,
    candidate: match
      ? { id: match.id, nameAr: match.nameAr, nameEn: match.nameEn }
      : null,
    notified: await hasRecentLinkRequest(companyId, user.id),
  });
}

/** Asks HR, once, to link the signed-in person to their employee record. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const companyId = typeof body?.companyId === "string" ? body.companyId : null;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (await getEmployeeByUserId(companyId, user.id)) {
    return NextResponse.json({ error: "Already linked" }, { status: 409 });
  }

  if (await claimLinkRequest(companyId, user.id)) {
    await notifyCompanyRoles({
      companyId,
      roles: ["owner", "admin", "hr"],
      type: "employee_link_request",
      actorId: user.id,
      data: { userName: user.name ?? "", userEmail: user.email ?? "" },
    });
  }

  return NextResponse.json({ ok: true });
}
