import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { customerSchema, bulkStatusSchema } from "@/lib/validators/parties";
import { createCustomer, listCustomers, bulkUpdateCustomers } from "@/lib/data/customers";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";
import { listOpenItemsByCompany, buildAgingByParty } from "@/lib/data/open-items";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = searchParams.get("status");
  const vatRegistered = searchParams.get("vatRegistered");
  const query = normalizeSearch(searchParams.get("q") ?? "");
  const balanceFilter = searchParams.get("balance");

  const customers = await listCustomers(companyId);
  let filtered = customers;
  if (status && status !== "all") {
    filtered = filtered.filter((customer) => customer.status === status);
  }
  if (vatRegistered === "true") {
    filtered = filtered.filter((customer) => customer.vatRegistered);
  }
  if (vatRegistered === "false") {
    filtered = filtered.filter((customer) => !customer.vatRegistered);
  }
  if (query) {
    filtered = filtered.filter((customer) => {
      const name = normalizeSearch(customer.name);
      return (
        name.includes(query) ||
        normalizeSearch(customer.legalName ?? "").includes(query) ||
        normalizeSearch(customer.vatNumber ?? "").includes(query) ||
        normalizeSearch(customer.crNumber ?? "").includes(query)
      );
    });
  }

  const openItems = await listOpenItemsByCompany(companyId);
  const customerItems = openItems.filter((item) => item.partyType === "customer");
  const agingMap = buildAgingByParty(customerItems);

  const data = filtered.map((customer) => {
    const aging = agingMap.get(customer.id)?.aging ?? null;
    const balance = aging?.total ?? 0;
    return { ...customer, balance, aging };
  });

  const finalList =
    balanceFilter === "due"
      ? data.filter((entry) => entry.balance > 0)
      : data;

  return NextResponse.json({ customers: finalList });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.[0];
    let message = "Invalid payload";
    if (field === "vatNumber") {
      message = "Invalid VAT number";
    } else if (field === "vatRegistered") {
      message = "Invalid VAT registered flag";
    } else if (field === "email") {
      message = "Invalid email";
    } else if (field === "creditLimit") {
      message = "Invalid credit limit";
    } else if (field === "name") {
      message = "Invalid name";
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const vatNumber = parsed.data.vatNumber?.trim() ?? "";
  const vatRegistered = parsed.data.vatRegistered ?? Boolean(vatNumber);

  const existing = await listCustomers(parsed.data.companyId);
  const normalizedName = normalizeSearch(parsed.data.name);
  const duplicate = existing.find((customer) => {
    if (vatNumber && customer.vatNumber === vatNumber) {
      return true;
    }
    return normalizeSearch(customer.name) === normalizedName;
  });
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate customer" }, { status: 409 });
  }

  const customerId = await createCustomer({
    ...parsed.data,
    vatRegistered,
    vatNumber: vatNumber || null,
    tags: parsed.data.tags ?? [],
    status: parsed.data.status ?? "active",
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "customer.create",
    entity: "customer",
    entityId: customerId,
    metadata: { name: parsed.data.name },
  });

  return NextResponse.json({ customerId });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bulkStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await bulkUpdateCustomers(parsed.data.ids, { status: parsed.data.status });
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "customer.bulk_status",
    entity: "customer",
    metadata: { status: parsed.data.status, count: parsed.data.ids.length },
  });
  return NextResponse.json({ ok: true });
}

