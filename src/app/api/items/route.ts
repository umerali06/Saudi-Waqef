import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { itemBulkStatusSchema, itemSchema } from "@/lib/validators/items";
import { bulkUpdateItems, createItem, listItems } from "@/lib/data/items";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";

export const runtime = "nodejs";

const parseBoolean = (value: string | null) => {
  if (!value) {
    return undefined;
  }
  const normalized = normalizeSearch(value);
  if (["true", "yes", "1", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
};

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
  const type = searchParams.get("type");
  const taxCategoryId = searchParams.get("taxCategoryId");
  const category = normalizeSearch(searchParams.get("category") ?? "");
  const query = normalizeSearch(searchParams.get("q") ?? "");
  const trackInventory = parseBoolean(searchParams.get("trackInventory"));
  const lowStock = parseBoolean(searchParams.get("lowStock"));

  const items = await listItems(companyId);
  let filtered = items;

  if (status && status !== "all") {
    filtered = filtered.filter((item) => item.status === status);
  }
  if (type && type !== "all") {
    filtered = filtered.filter((item) => item.type === type);
  }
  if (trackInventory === true) {
    filtered = filtered.filter((item) => item.trackInventory);
  }
  if (trackInventory === false) {
    filtered = filtered.filter((item) => !item.trackInventory);
  }
  if (category) {
    filtered = filtered.filter(
      (item) => normalizeSearch(item.category ?? "").includes(category)
    );
  }
  if (taxCategoryId) {
    if (taxCategoryId === "none") {
      filtered = filtered.filter((item) => !item.taxCategoryId);
    } else {
      filtered = filtered.filter((item) => item.taxCategoryId === taxCategoryId);
    }
  }
  if (query) {
    filtered = filtered.filter((item) => {
      return (
        normalizeSearch(item.name).includes(query) ||
        normalizeSearch(item.sku ?? "").includes(query) ||
        normalizeSearch(item.barcode ?? "").includes(query) ||
        normalizeSearch(item.category ?? "").includes(query) ||
        normalizeSearch(item.brand ?? "").includes(query)
      );
    });
  }
  if (lowStock === true) {
    filtered = filtered.filter((item) => {
      if (!item.trackInventory || item.minStock === null || item.minStock === undefined) {
        return false;
      }
      return item.stockOnHand <= item.minStock;
    });
  }

  return NextResponse.json({ items: filtered });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = itemSchema.safeParse(body);
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

  const existing = await listItems(parsed.data.companyId);
  const normalizedName = normalizeSearch(parsed.data.name);
  const sku = normalizeSearch(parsed.data.sku ?? "");
  const barcode = normalizeSearch(parsed.data.barcode ?? "");
  const duplicate = existing.find((item) => {
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

  const trackInventory =
    parsed.data.type === "service" ? false : parsed.data.trackInventory ?? false;
  const minStock = trackInventory ? parsed.data.minStock ?? null : null;

  const itemId = await createItem({
    ...parsed.data,
    sku: parsed.data.sku ?? null,
    barcode: parsed.data.barcode ?? null,
    category: parsed.data.category ?? null,
    brand: parsed.data.brand ?? null,
    descriptionAr: parsed.data.descriptionAr ?? null,
    descriptionEn: parsed.data.descriptionEn ?? null,
    packUnit: parsed.data.packUnit ?? null,
    packSize: parsed.data.packSize ?? null,
    salePrice: parsed.data.salePrice ?? null,
    purchasePrice: parsed.data.purchasePrice ?? null,
    taxCategoryId: parsed.data.taxCategoryId ?? null,
    incomeAccountId: parsed.data.incomeAccountId ?? null,
    expenseAccountId: parsed.data.expenseAccountId ?? null,
    trackInventory,
    minStock,
    tags: parsed.data.tags ?? [],
    status: parsed.data.status ?? "active",
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "item.create",
    entity: "item",
    entityId: itemId,
    metadata: { name: parsed.data.name },
  });

  return NextResponse.json({ itemId });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = itemBulkStatusSchema.safeParse(body);
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

  await bulkUpdateItems(parsed.data.ids, { status: parsed.data.status });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "item.bulk_status",
    entity: "item",
    metadata: { status: parsed.data.status, count: parsed.data.ids.length },
  });

  return NextResponse.json({ ok: true });
}

