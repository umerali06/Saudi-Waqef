import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { itemSchema, itemUpdateSchema } from "@/lib/validators/items";
import { getItemById, listItems, updateItem } from "@/lib/data/items";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const item = await getItemById(itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, item.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ item });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const current = await getItemById(itemId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = itemUpdateSchema.safeParse(body);
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

  const merged = {
    ...current,
    ...parsed.data,
    companyId: current.companyId,
  };
  const mergedValidation = itemSchema.safeParse(merged);
  if (!mergedValidation.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await listItems(current.companyId);
  const normalizedName = normalizeSearch(merged.name);
  const sku = normalizeSearch(merged.sku ?? "");
  const barcode = normalizeSearch(merged.barcode ?? "");
  const duplicate = existing.find((item) => {
    if (item.id === itemId) {
      return false;
    }
    if (normalizeSearch(item.name) === normalizedName) {
      return true;
    }
    if (sku && normalizeSearch(item.sku ?? "") === sku) {
      return true;
    }
    if (barcode && normalizeSearch(item.barcode ?? "") === barcode) {
      return true;
    }
    return false;
  });
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate item" }, { status: 409 });
  }

  const updates = { ...parsed.data };
  if (merged.type === "service") {
    updates.trackInventory = false;
    updates.packUnit = null;
    updates.packSize = null;
    updates.minStock = null;
  }
  if (merged.trackInventory === false) {
    updates.minStock = null;
  }

  const effective = { ...merged, ...updates };
  const trackedFields = ["salePrice", "purchasePrice", "baseUnit", "packUnit", "packSize"];
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  trackedFields.forEach((field) => {
    const fromValue = current[field as keyof typeof current];
    const toValue = effective[field as keyof typeof effective];
    if (fromValue !== toValue) {
      changes[field] = { from: fromValue, to: toValue };
    }
  });
  const metadata: Record<string, unknown> = { fields: Object.keys(parsed.data) };
  if (Object.keys(changes).length > 0) {
    metadata.changes = changes;
  }

  await updateItem(itemId, updates);

  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "item.update",
    entity: "item",
    entityId: itemId,
    metadata,
  });

  return NextResponse.json({ ok: true });
}

