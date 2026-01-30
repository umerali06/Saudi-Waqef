import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import {
  getMembership,
  listMembershipsByCompany,
  deleteMembership,
  updateMembershipRole,
} from "@/lib/data/memberships";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

const updateSchema = z.object({
  companyId: z.string().min(1),
  role: z.enum(["owner", "admin", "accountant", "hr", "employee", "viewer"]),
});

const removeSchema = z.object({
  companyId: z.string().min(1),
});

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  const targetMembership = await getMembership({
    userId,
    companyId: parsed.data.companyId,
  });
  if (!targetMembership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requesterRole = membership.role;
  const targetRole = targetMembership.role;
  const nextRole = parsed.data.role;

  if (targetRole === "owner" && requesterRole !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (nextRole === "owner" && requesterRole !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (targetRole === "owner" && nextRole !== "owner") {
    const memberships = await listMembershipsByCompany(parsed.data.companyId);
    const owners = memberships.filter((entry) => entry.role === "owner");
    if (owners.length <= 1) {
      return NextResponse.json({ error: "Last owner" }, { status: 400 });
    }
  }

  await updateMembershipRole(targetMembership.id, nextRole);

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "membership.role.update",
    entity: "membership",
    entityId: targetMembership.id,
    metadata: { targetUserId: userId, from: targetRole, to: nextRole },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  const targetMembership = await getMembership({
    userId,
    companyId: parsed.data.companyId,
  });
  if (!targetMembership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requesterRole = membership.role;
  const targetRole = targetMembership.role;

  if (targetRole === "owner" && requesterRole !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (targetRole === "owner") {
    const memberships = await listMembershipsByCompany(parsed.data.companyId);
    const owners = memberships.filter((entry) => entry.role === "owner");
    if (owners.length <= 1) {
      return NextResponse.json({ error: "Last owner" }, { status: 400 });
    }
  }

  await deleteMembership(targetMembership.id);

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "membership.remove",
    entity: "membership",
    entityId: targetMembership.id,
    metadata: { targetUserId: userId, role: targetRole },
  });

  return NextResponse.json({ ok: true });
}


