import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { contactSchema } from "@/lib/validators/parties";
import { getCustomerById } from "@/lib/data/customers";
import { getContact, updateContact, deleteContact, setPrimaryContact } from "@/lib/data/contacts";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ customerId: string; contactId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId, contactId } = await context.params;
  const customer = await getCustomerById(customerId);
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await getContact(contactId);
  if (!existing || existing.partyId !== customerId || existing.partyType !== "customer") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, customer.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.partyType !== "customer" || parsed.data.partyId !== customerId) {
    return NextResponse.json({ error: "Invalid party" }, { status: 400 });
  }

  await updateContact(contactId, {
    name: parsed.data.name,
    email: parsed.data.email ?? undefined,
    phone: parsed.data.phone ?? undefined,
    role: parsed.data.role ?? undefined,
    isPrimary: parsed.data.isPrimary ?? false,
  });

  if (parsed.data.isPrimary) {
    await setPrimaryContact({
      companyId: customer.companyId,
      partyType: "customer",
      partyId: customerId,
      contactId,
    });
  }

  await recordAuditEvent({
    companyId: customer.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "contact.update",
    entity: "contact",
    entityId: contactId,
    metadata: { partyType: "customer", partyId: customerId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId, contactId } = await context.params;
  const customer = await getCustomerById(customerId);
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await getContact(contactId);
  if (!existing || existing.partyId !== customerId || existing.partyType !== "customer") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, customer.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteContact(contactId);

  await recordAuditEvent({
    companyId: customer.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "contact.delete",
    entity: "contact",
    entityId: contactId,
    metadata: { partyType: "customer", partyId: customerId },
  });

  return NextResponse.json({ ok: true });
}
