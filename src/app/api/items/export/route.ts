import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listItems } from "@/lib/data/items";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { toCsv } from "@/lib/utils/csv";

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

  const items = await listItems(companyId);
  const categories = await listTaxCategories(companyId);
  const accounts = await listChartAccounts(companyId);

  const taxById = new Map(categories.map((category) => [category.id, category.name]));
  const accountById = new Map(
    accounts.map((account) => [account.id, account.code || account.name])
  );

  const headers = [
    "type",
    "name",
    "sku",
    "barcode",
    "category",
    "brand",
    "descriptionAr",
    "descriptionEn",
    "baseUnit",
    "packUnit",
    "packSize",
    "salePrice",
    "purchasePrice",
    "taxCategory",
    "incomeAccount",
    "expenseAccount",
    "trackInventory",
    "minStock",
    "status",
    "tags",
  ];

  const rows = items.map((item) => [
    item.type,
    item.name,
    item.sku ?? "",
    item.barcode ?? "",
    item.category ?? "",
    item.brand ?? "",
    item.descriptionAr ?? "",
    item.descriptionEn ?? "",
    item.baseUnit,
    item.packUnit ?? "",
    item.packSize?.toString() ?? "",
    item.salePrice?.toString() ?? "",
    item.purchasePrice?.toString() ?? "",
    item.taxCategoryId ? taxById.get(item.taxCategoryId) ?? item.taxCategoryId : "",
    item.incomeAccountId
      ? accountById.get(item.incomeAccountId) ?? item.incomeAccountId
      : "",
    item.expenseAccountId
      ? accountById.get(item.expenseAccountId) ?? item.expenseAccountId
      : "",
    item.trackInventory ? "true" : "false",
    item.minStock?.toString() ?? "",
    item.status,
    item.tags.join("|"),
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=items.csv",
      "Cache-Control": "no-store",
    },
  });
}

