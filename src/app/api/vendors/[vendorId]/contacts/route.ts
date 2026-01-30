import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { getVendorById } from "@/lib/data/vendors";
import { contactSchema } from "@/lib/validators/parties";
import { createContact, listContacts, setPrimaryContact } from "@/lib/data/contacts";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ vendorId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vendorId } = await context.params;
  const vendor = await getVendorById(vendorId);
  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, vendor.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contacts = await listContacts({
    companyId: vendor.companyId,
    partyType: "vendor",
    partyId: vendorId,
  });
  return NextResponse.json({ contacts });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vendorId } = await context.params;
  const vendor = await getVendorById(vendorId);
  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, vendor.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.partyType !== "vendor" || parsed.data.partyId !== vendorId) {
    return NextResponse.json({ error: "Invalid party" }, { status: 400 });
  }

  const contactId = await createContact({
    companyId: vendor.companyId,
    partyType: "vendor",
    partyId: vendorId,
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    role: parsed.data.role ?? null,
    isPrimary: parsed.data.isPrimary ?? false,
  });

  if (parsed.data.isPrimary) {
    await setPrimaryContact({
      companyId: vendor.companyId,
      partyType: "vendor",
      partyId: vendorId,
      contactId,
    });
  }

  await recordAuditEvent({
    companyId: vendor.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "contact.create",
    entity: "contact",
    entityId: contactId,
    metadata: { partyType: "vendor", partyId: vendorId },
  });

  return NextResponse.json({ contactId });
}

