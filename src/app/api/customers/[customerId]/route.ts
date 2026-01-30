import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { customerUpdateSchema } from "@/lib/validators/parties";
import { getCustomerById, listCustomers, updateCustomer } from "@/lib/data/customers";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";

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

  return NextResponse.json({ customer });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId } = await context.params;
  const current = await getCustomerById(customerId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = customerUpdateSchema.safeParse(body);
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

  const vatNumber = parsed.data.vatNumber?.trim() ?? current.vatNumber ?? "";
  const vatRegistered = parsed.data.vatRegistered ?? current.vatRegistered;

  const existing = await listCustomers(current.companyId);
  const normalizedName = parsed.data.name
    ? normalizeSearch(parsed.data.name)
    : normalizeSearch(current.name);
  const duplicate = existing.find((customer) => {
    if (customer.id === customerId) {
      return false;
    }
    if (vatNumber && customer.vatNumber === vatNumber) {
      return true;
    }
    return normalizeSearch(customer.name) === normalizedName;
  });
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate customer" }, { status: 409 });
  }

  await updateCustomer(customerId, {
    ...parsed.data,
    vatRegistered,
    vatNumber: vatNumber || null,
  });

  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "customer.update",
    entity: "customer",
    entityId: customerId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

