import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { contactUpdateSchema } from "@/lib/validators/parties";
import { getContact, updateContact, deleteContact, setPrimaryContact } from "@/lib/data/contacts";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ contactId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contactId } = await context.params;
  const current = await getContact(contactId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = contactUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, current.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    (parsed.data.partyId && parsed.data.partyId !== current.partyId) ||
    (parsed.data.partyType && parsed.data.partyType !== current.partyType)
  ) {
    return NextResponse.json({ error: "Invalid party" }, { status: 400 });
  }

  const normalized = {
    ...parsed.data,
    email: parsed.data.email ?? undefined,
    phone: parsed.data.phone ?? undefined,
    role: parsed.data.role ?? undefined,
  };
  await updateContact(contactId, normalized);

  if (parsed.data.isPrimary) {
    await setPrimaryContact({
      companyId: current.companyId,
      partyType: current.partyType,
      partyId: current.partyId,
      contactId,
    });
  }

  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "contact.update",
    entity: "contact",
    entityId: contactId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contactId } = await context.params;
  const current = await getContact(contactId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, current.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteContact(contactId);
  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "contact.delete",
    entity: "contact",
    entityId: contactId,
  });

  return NextResponse.json({ ok: true });
}
