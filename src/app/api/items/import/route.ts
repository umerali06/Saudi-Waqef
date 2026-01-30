import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { itemImportSchema, itemSchema } from "@/lib/validators/items";
import { createItem, listItems } from "@/lib/data/items";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { parseCsv, toCsv } from "@/lib/utils/csv";
import { normalizeSearch } from "@/lib/utils/search";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { createImportJob } from "@/lib/data/import-jobs";

export const runtime = "nodejs";

const statusMap: Record<string, "active" | "inactive"> = {
  active: "active",
  inactive: "inactive",
};

const typeMap: Record<string, "product" | "service"> = {
  product: "product",
  goods: "product",
  item: "product",
  inventory: "product",
  service: "service",
  "\u0645\u0646\u062A\u062C": "product",
  "\u0628\u0636\u0627\u0639\u0629": "product",
  "\u062E\u062F\u0645\u0629": "service",
};

const normalizeHeader = (value: string) =>
  normalizeSearch(value).replace(/[\s_\-.()]/g, "");

const headerAliases: Record<string, string> = {};
const registerAliases = (key: string, aliases: string[]) => {
  aliases.forEach((alias) => {
    headerAliases[normalizeHeader(alias)] = key;
  });
};

registerAliases("type", ["type", "item type", "product type", "\u0627\u0644\u0646\u0648\u0639"]);
registerAliases("name", ["name", "item name", "product name", "\u0627\u0644\u0627\u0633\u0645"]);
registerAliases("sku", ["sku", "item code", "code", "\u0631\u0645\u0632 \u0627\u0644\u0635\u0646\u0641", "\u0631\u0645\u0632 \u0627\u0644\u0645\u0646\u062A\u062C"]);
registerAliases("barcode", ["barcode", "\u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F", "\u0631\u0645\u0632 \u0634\u0631\u064A\u0637\u064A"]);
registerAliases("category", ["category", "item category", "\u0627\u0644\u0641\u0626\u0629"]);
registerAliases("brand", ["brand", "\u0627\u0644\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629", "\u0627\u0644\u0639\u0644\u0627\u0645\u0629"]);
registerAliases("descriptionAr", [
  "description ar",
  "arabic description",
  "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0639\u0631\u0628\u064A",
]);
registerAliases("descriptionEn", [
  "description en",
  "english description",
  "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0627\u0646\u062C\u0644\u064A\u0632\u064A",
  "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A",
]);
registerAliases("baseUnit", ["base unit", "unit", "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629"]);
registerAliases("packUnit", ["pack unit", "secondary unit", "\u0648\u062D\u062F\u0629 \u0627\u0644\u0639\u0628\u0648\u0629"]);
registerAliases("packSize", ["pack size", "conversion", "\u062D\u062C\u0645 \u0627\u0644\u0639\u0628\u0648\u0629"]);
registerAliases("salePrice", ["sale price", "selling price", "\u0633\u0639\u0631 \u0627\u0644\u0628\u064A\u0639"]);
registerAliases("purchasePrice", ["purchase price", "cost price", "\u0633\u0639\u0631 \u0627\u0644\u0634\u0631\u0627\u0621"]);
registerAliases("taxCategory", ["tax category", "tax", "\u0627\u0644\u0641\u0626\u0629 \u0627\u0644\u0636\u0631\u064A\u0628\u064A\u0629"]);
registerAliases("incomeAccount", ["income account", "sales account", "\u062D\u0633\u0627\u0628 \u0627\u0644\u0625\u064A\u0631\u0627\u062F\u0627\u062A"]);
registerAliases("expenseAccount", ["expense account", "purchase account", "\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0635\u0631\u0648\u0641"]);
registerAliases("trackInventory", ["track inventory", "inventory", "\u062A\u062A\u0628\u0639 \u0627\u0644\u0645\u062E\u0632\u0648\u0646"]);
registerAliases("minStock", ["min stock", "reorder level", "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649 \u0644\u0644\u0645\u062E\u0632\u0648\u0646"]);
registerAliases("status", ["status", "\u0627\u0644\u062D\u0627\u0644\u0629"]);
registerAliases("tags", ["tags", "\u0627\u0644\u0648\u0633\u0648\u0645"]);

const templateHeaders = {
  en: [
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
  ],
  ar: [
    "\u0627\u0644\u0646\u0648\u0639",
    "\u0627\u0644\u0627\u0633\u0645",
    "\u0631\u0645\u0632 \u0627\u0644\u0635\u0646\u0641",
    "\u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F",
    "\u0627\u0644\u0641\u0626\u0629",
    "\u0627\u0644\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629",
    "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0639\u0631\u0628\u064A",
    "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A",
    "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629",
    "\u0648\u062D\u062F\u0629 \u0627\u0644\u0639\u0628\u0648\u0629",
    "\u062D\u062C\u0645 \u0627\u0644\u0639\u0628\u0648\u0629",
    "\u0633\u0639\u0631 \u0627\u0644\u0628\u064A\u0639",
    "\u0633\u0639\u0631 \u0627\u0644\u0634\u0631\u0627\u0621",
    "\u0627\u0644\u0641\u0626\u0629 \u0627\u0644\u0636\u0631\u064A\u0628\u064A\u0629",
    "\u062D\u0633\u0627\u0628 \u0627\u0644\u0625\u064A\u0631\u0627\u062F\u0627\u062A",
    "\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0635\u0631\u0648\u0641",
    "\u062A\u062A\u0628\u0639 \u0627\u0644\u0645\u062E\u0632\u0648\u0646",
    "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649 \u0644\u0644\u0645\u062E\u0632\u0648\u0646",
    "\u0627\u0644\u062D\u0627\u0644\u0629",
    "\u0627\u0644\u0648\u0633\u0648\u0645",
  ],
};

const parseBoolean = (value: string) => {
  const normalized = normalizeSearch(value);
  if (["true", "yes", "1", "y", "\u0646\u0639\u0645"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "n", "\u0644\u0627"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const parseTags = (value: string) =>
  value
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);

const toNullIfEmpty = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

type ImportError = {
  row: number;
  field?: string;
  code: string;
};

const mapIssueToError = (issue: { path: (string | number)[]; message: string }) => {
  const field = typeof issue.path[0] === "string" ? String(issue.path[0]) : undefined;
  switch (issue.message) {
    case "Pack size required":
      return { field: "packSize", code: "missing_pack_size" };
    case "Pack unit required":
      return { field: "packUnit", code: "missing_pack_unit" };
    case "Services cannot track inventory":
      return { field: "trackInventory", code: "invalid_track_inventory" };
    case "Services cannot use pack units":
      return { field: "packUnit", code: "invalid_pack_unit" };
    default:
      break;
  }
  if (field === "name") {
    return { field, code: "invalid_name" };
  }
  if (field === "baseUnit") {
    return { field, code: "missing_base_unit" };
  }
  return { field, code: "invalid_row" };
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

  const lang = searchParams.get("lang") === "ar" ? "ar" : "en";
  const headers = templateHeaders[lang];
  const csv = toCsv(headers, []);
  const filename = lang === "ar" ? "items-template-ar.csv" : "items-template-en.csv";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = itemImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const dryRun = parsed.data.dryRun === true;

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { headers, rows } = parseCsv(parsed.data.csv);
  if (headers.length === 0) {
    return NextResponse.json({ error: "Missing headers" }, { status: 400 });
  }

  const headerIndex: Record<string, number> = {};
  headers.forEach((header, index) => {
    const alias = headerAliases[normalizeHeader(header)];
    if (alias) {
      headerIndex[alias] = index;
    }
  });

  if (headerIndex.name === undefined) {
    return NextResponse.json({ error: "Missing name column" }, { status: 400 });
  }
  if (headerIndex.baseUnit === undefined) {
    return NextResponse.json({ error: "Missing baseUnit column" }, { status: 400 });
  }

  const existing = await listItems(parsed.data.companyId);
  const existingNames = new Set(existing.map((item) => normalizeSearch(item.name)));
  const existingSkus = new Set(
    existing.map((item) => normalizeSearch(item.sku ?? "")).filter(Boolean)
  );
  const existingBarcodes = new Set(
    existing.map((item) => normalizeSearch(item.barcode ?? "")).filter(Boolean)
  );

  const accounts = await listChartAccounts(parsed.data.companyId);
  const accountByCode = new Map<string, string>();
  const accountByName = new Map<string, string>();
  accounts
    .filter((account) => account.isPosting)
    .forEach((account) => {
      accountByCode.set(normalizeSearch(account.code), account.id);
      accountByName.set(normalizeSearch(account.name), account.id);
    });

  const categories = await listTaxCategories(parsed.data.companyId);
  const taxByName = new Map(
    categories.map((category) => [normalizeSearch(category.name), category.id])
  );
  const taxById = new Map(categories.map((category) => [category.id, category.id]));

  const importedNames = new Set<string>();
  const importedSkus = new Set<string>();
  const importedBarcodes = new Set<string>();
  const errors: ImportError[] = [];
  let created = 0;

  const resolveAccountId = (value: string) => {
    const normalized = normalizeSearch(value);
    if (!normalized) {
      return null;
    }
    return accountByCode.get(normalized) ?? accountByName.get(normalized) ?? null;
  };

  const resolveTaxId = (value: string) => {
    const normalized = normalizeSearch(value);
    if (!normalized) {
      return null;
    }
    return taxById.get(value) ?? taxByName.get(normalized) ?? null;
  };

  const getValue = (row: string[], key: string) => {
    const index = headerIndex[key];
    if (index === undefined) {
      return "";
    }
    return row[index] ?? "";
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2;

    const name = getValue(row, "name").trim();
    if (!name) {
      errors.push({ row: rowNumber, field: "name", code: "missing_name" });
      continue;
    }

    const typeRaw = normalizeSearch(getValue(row, "type"));
    const type = typeRaw ? typeMap[typeRaw] : "product";
    if (typeRaw && !type) {
      errors.push({ row: rowNumber, field: "type", code: "invalid_type" });
      continue;
    }

    const baseUnit = getValue(row, "baseUnit").trim();
    if (!baseUnit) {
      errors.push({ row: rowNumber, field: "baseUnit", code: "missing_base_unit" });
      continue;
    }

    const packUnit = toNullIfEmpty(getValue(row, "packUnit"));
    const packSizeValue = getValue(row, "packSize").trim();
    const packSize = packSizeValue ? Number(packSizeValue) : null;
    if (packSizeValue && Number.isNaN(packSize)) {
      errors.push({ row: rowNumber, field: "packSize", code: "invalid_pack_size" });
      continue;
    }
    if (packUnit && !packSize) {
      errors.push({ row: rowNumber, field: "packSize", code: "missing_pack_size" });
      continue;
    }
    if (packSize && !packUnit) {
      errors.push({ row: rowNumber, field: "packUnit", code: "missing_pack_unit" });
      continue;
    }

    const salePriceValue = getValue(row, "salePrice").trim();
    const salePrice = salePriceValue ? Number(salePriceValue) : null;
    if (salePriceValue && Number.isNaN(salePrice)) {
      errors.push({ row: rowNumber, field: "salePrice", code: "invalid_sale_price" });
      continue;
    }

    const purchasePriceValue = getValue(row, "purchasePrice").trim();
    const purchasePrice = purchasePriceValue ? Number(purchasePriceValue) : null;
    if (purchasePriceValue && Number.isNaN(purchasePrice)) {
      errors.push({
        row: rowNumber,
        field: "purchasePrice",
        code: "invalid_purchase_price",
      });
      continue;
    }

    const minStockValue = getValue(row, "minStock").trim();
    const minStock = minStockValue ? Number(minStockValue) : null;
    if (minStockValue && Number.isNaN(minStock)) {
      errors.push({ row: rowNumber, field: "minStock", code: "invalid_min_stock" });
      continue;
    }

    const statusRaw = normalizeSearch(getValue(row, "status"));
    const status = statusRaw ? statusMap[statusRaw] : undefined;
    if (statusRaw && !status) {
      errors.push({ row: rowNumber, field: "status", code: "invalid_status" });
      continue;
    }

    const trackRaw = getValue(row, "trackInventory").trim();
    const trackInventory = trackRaw ? parseBoolean(trackRaw) : undefined;
    if (trackRaw && trackInventory === undefined) {
      errors.push({
        row: rowNumber,
        field: "trackInventory",
        code: "invalid_track_inventory",
      });
      continue;
    }

    const effectiveTrackInventory =
      type === "service" ? false : trackInventory ?? Boolean(minStock);

    if (type === "service" && (trackInventory || packUnit || packSize)) {
      errors.push({ row: rowNumber, field: "type", code: "invalid_service" });
      continue;
    }

    const taxValue = getValue(row, "taxCategory").trim();
    const taxCategoryId = taxValue ? resolveTaxId(taxValue) : null;
    if (taxValue && !taxCategoryId) {
      errors.push({ row: rowNumber, field: "taxCategory", code: "invalid_tax" });
      continue;
    }

    const incomeValue = getValue(row, "incomeAccount").trim();
    const incomeAccountId = incomeValue ? resolveAccountId(incomeValue) : null;
    if (incomeValue && !incomeAccountId) {
      errors.push({ row: rowNumber, field: "incomeAccount", code: "invalid_income" });
      continue;
    }

    const expenseValue = getValue(row, "expenseAccount").trim();
    const expenseAccountId = expenseValue ? resolveAccountId(expenseValue) : null;
    if (expenseValue && !expenseAccountId) {
      errors.push({ row: rowNumber, field: "expenseAccount", code: "invalid_expense" });
      continue;
    }

    const tagsValue = getValue(row, "tags");
    const tags = tagsValue ? parseTags(tagsValue) : [];

    const candidate = {
      companyId: parsed.data.companyId,
      type,
      name,
      sku: toNullIfEmpty(getValue(row, "sku")),
      barcode: toNullIfEmpty(getValue(row, "barcode")),
      category: toNullIfEmpty(getValue(row, "category")),
      brand: toNullIfEmpty(getValue(row, "brand")),
      descriptionAr: toNullIfEmpty(getValue(row, "descriptionAr")),
      descriptionEn: toNullIfEmpty(getValue(row, "descriptionEn")),
      baseUnit,
      packUnit,
      packSize,
      salePrice,
      purchasePrice,
      taxCategoryId,
      incomeAccountId,
      expenseAccountId,
      trackInventory: effectiveTrackInventory,
      minStock: effectiveTrackInventory ? minStock : null,
      status,
      tags,
    };

    const rowParsed = itemSchema.safeParse(candidate);
    if (!rowParsed.success) {
      const issue = rowParsed.error.issues[0];
      const mapped = issue ? mapIssueToError(issue) : { code: "invalid_row" };
      errors.push({ row: rowNumber, ...mapped });
      continue;
    }

    const normalizedName = normalizeSearch(rowParsed.data.name);
    const sku = normalizeSearch(rowParsed.data.sku ?? "");
    const barcode = normalizeSearch(rowParsed.data.barcode ?? "");

    if (existingNames.has(normalizedName) || importedNames.has(normalizedName)) {
      errors.push({ row: rowNumber, field: "name", code: "duplicate_name" });
      continue;
    }
    if (sku && (existingSkus.has(sku) || importedSkus.has(sku))) {
      errors.push({ row: rowNumber, field: "sku", code: "duplicate_sku" });
      continue;
    }
    if (barcode && (existingBarcodes.has(barcode) || importedBarcodes.has(barcode))) {
      errors.push({ row: rowNumber, field: "barcode", code: "duplicate_barcode" });
      continue;
    }

    if (!dryRun) {
      await createItem({
        ...rowParsed.data,
        sku: rowParsed.data.sku ?? null,
        barcode: rowParsed.data.barcode ?? null,
        category: rowParsed.data.category ?? null,
        brand: rowParsed.data.brand ?? null,
        descriptionAr: rowParsed.data.descriptionAr ?? null,
        descriptionEn: rowParsed.data.descriptionEn ?? null,
        packUnit: rowParsed.data.packUnit ?? null,
        packSize: rowParsed.data.packSize ?? null,
        salePrice: rowParsed.data.salePrice ?? null,
        purchasePrice: rowParsed.data.purchasePrice ?? null,
        taxCategoryId: rowParsed.data.taxCategoryId ?? null,
        incomeAccountId: rowParsed.data.incomeAccountId ?? null,
        expenseAccountId: rowParsed.data.expenseAccountId ?? null,
        trackInventory: rowParsed.data.trackInventory ?? false,
        minStock: rowParsed.data.minStock ?? null,
        tags,
        status: rowParsed.data.status ?? "active",
      });
    }
    created += 1;
    importedNames.add(normalizedName);
    if (sku) {
      importedSkus.add(sku);
    }
    if (barcode) {
      importedBarcodes.add(barcode);
    }
  }

  if (!dryRun) {
    await recordAuditEvent({
      companyId: parsed.data.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "item.import",
      entity: "item",
      metadata: { created, errors: errors.length },
    });

    await createImportJob({
      companyId: parsed.data.companyId,
      entity: "items",
      status: errors.length ? "completed_with_errors" : "completed",
      totalRows: rows.length,
      createdCount: created,
      errorCount: errors.length,
      createdBy: user.id,
      createdByEmail: user.email ?? null,
    });
  }

  return NextResponse.json({ created, errors });
}



