import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { getCustomerById } from "@/lib/data/customers";
import { contactSchema } from "@/lib/validators/parties";
import { createContact, listContacts, setPrimaryContact } from "@/lib/data/contacts";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId } = await context.params;
  const customer = await getCustomerById(customerId);
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, customer.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contacts = await listContacts({
    companyId: customer.companyId,
    partyType: "customer",
    partyId: customerId,
  });
  return NextResponse.json({ contacts });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId } = await context.params;
  const customer = await getCustomerById(customerId);
  if (!customer) {
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

  const contactId = await createContact({
    companyId: customer.companyId,
    partyType: "customer",
    partyId: customerId,
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    role: parsed.data.role ?? null,
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
    action: "contact.create",
    entity: "contact",
    entityId: contactId,
    metadata: { partyType: "customer", partyId: customerId },
  });

  return NextResponse.json({ contactId });
}

