import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { importPayloadSchema, vendorSchema } from "@/lib/validators/parties";
import { createVendor, listVendors } from "@/lib/data/vendors";
import { parseCsv, toCsv } from "@/lib/utils/csv";
import { normalizeSearch } from "@/lib/utils/search";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { createImportJob } from "@/lib/data/import-jobs";

export const runtime = "nodejs";

const statusMap: Record<string, "active" | "inactive"> = {
  active: "active",
  inactive: "inactive",
};

const normalizeHeader = (value: string) =>
  normalizeSearch(value).replace(/[\s_\-.()]/g, "");

const headerAliases: Record<string, string> = {};
const registerAliases = (key: string, aliases: string[]) => {
  aliases.forEach((alias) => {
    headerAliases[normalizeHeader(alias)] = key;
  });
};

registerAliases("name", ["name", "vendor name", "vendorname", "اسم المورد"]);
registerAliases("legalName", ["legalname", "legal name", "الاسم القانوني"]);
registerAliases("vatNumber", [
  "vatnumber",
  "vat number",
  "الرقم الضريبي",
  "رقم ضريبة القيمة المضافة",
]);
registerAliases("vatRegistered", [
  "vatregistered",
  "vat registered",
  "مسجل لضريبة القيمة المضافة",
  "مسجل ضريبة القيمة المضافة",
]);
registerAliases("crNumber", ["crnumber", "cr number", "رقم السجل التجاري"]);
registerAliases("email", ["email", "البريد الإلكتروني", "البريد الالكتروني"]);
registerAliases("phone", ["phone", "الهاتف", "رقم الهاتف"]);
registerAliases("remittanceAddress", [
  "remittanceaddress",
  "remittance address",
  "عنوان التحويل",
]);
registerAliases("paymentTermId", [
  "paymenttermid",
  "payment term id",
  "payment term",
  "payment terms",
  "معرف شروط الدفع",
  "شروط الدفع",
]);
registerAliases("preferredPaymentMethod", [
  "preferredpaymentmethod",
  "preferred payment method",
  "طريقة الدفع المفضلة",
]);
registerAliases("currency", ["currency", "العملة"]);
registerAliases("notes", ["notes", "ملاحظات"]);
registerAliases("tags", ["tags", "وسوم", "الوسوم"]);
registerAliases("status", ["status", "الحالة"]);

const templateHeaders = {
  en: [
    "name",
    "legalName",
    "vatNumber",
    "crNumber",
    "email",
    "phone",
    "remittanceAddress",
    "paymentTermId",
    "preferredPaymentMethod",
    "currency",
    "notes",
    "tags",
    "status",
    "vatRegistered",
  ],
  ar: [
    "اسم المورد",
    "الاسم القانوني",
    "الرقم الضريبي",
    "رقم السجل التجاري",
    "البريد الإلكتروني",
    "الهاتف",
    "عنوان التحويل",
    "معرف شروط الدفع",
    "طريقة الدفع المفضلة",
    "العملة",
    "ملاحظات",
    "الوسوم",
    "الحالة",
    "مسجل لضريبة القيمة المضافة",
  ],
};

const parseBoolean = (value: string) => {
  const normalized = normalizeSearch(value);
  if (["true", "yes", "1", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "n"].includes(normalized)) {
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
  if (issue.message === "Invalid VAT number") {
    return { field: "vatNumber", code: "invalid_vat_number" };
  }
  if (field === "email") {
    return { field, code: "invalid_email" };
  }
  if (field === "name") {
    return { field, code: "invalid_name" };
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
  const filename = lang === "ar" ? "vendors-template-ar.csv" : "vendors-template-en.csv";

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
  const parsed = importPayloadSchema.safeParse(body);
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

  const existing = await listVendors(parsed.data.companyId);
  const existingNames = new Set(existing.map((vendor) => normalizeSearch(vendor.name)));
  const existingVatNumbers = new Set(
    existing.map((vendor) => vendor.vatNumber).filter(Boolean) as string[]
  );

  const importedNames = new Set<string>();
  const importedVatNumbers = new Set<string>();
  const errors: ImportError[] = [];
  let created = 0;

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

    const statusRaw = normalizeSearch(getValue(row, "status"));
    const status = statusRaw ? statusMap[statusRaw] : undefined;
    if (statusRaw && !status) {
      errors.push({ row: rowNumber, field: "status", code: "invalid_status" });
      continue;
    }

    const vatRegisteredRaw = getValue(row, "vatRegistered");
    const vatRegistered = vatRegisteredRaw
      ? parseBoolean(vatRegisteredRaw)
      : undefined;
    if (vatRegisteredRaw && vatRegistered === undefined) {
      errors.push({
        row: rowNumber,
        field: "vatRegistered",
        code: "invalid_vat_registered",
      });
      continue;
    }

    const tagsValue = getValue(row, "tags");
    const tags = tagsValue ? parseTags(tagsValue) : [];

    const candidate = {
      companyId: parsed.data.companyId,
      name,
      legalName: toNullIfEmpty(getValue(row, "legalName")),
      vatRegistered,
      vatNumber: toNullIfEmpty(getValue(row, "vatNumber")),
      crNumber: toNullIfEmpty(getValue(row, "crNumber")),
      email: toNullIfEmpty(getValue(row, "email")),
      phone: toNullIfEmpty(getValue(row, "phone")),
      remittanceAddress: toNullIfEmpty(getValue(row, "remittanceAddress")),
      paymentTermId: toNullIfEmpty(getValue(row, "paymentTermId")),
      preferredPaymentMethod: toNullIfEmpty(getValue(row, "preferredPaymentMethod")),
      currency: toNullIfEmpty(getValue(row, "currency")),
      notes: toNullIfEmpty(getValue(row, "notes")),
      tags,
      status,
    };

    const rowParsed = vendorSchema.safeParse(candidate);
    if (!rowParsed.success) {
      const issue = rowParsed.error.issues[0];
      const mapped = issue ? mapIssueToError(issue) : { code: "invalid_row" };
      errors.push({ row: rowNumber, ...mapped });
      continue;
    }

    const normalizedName = normalizeSearch(rowParsed.data.name);
    const vatNumber = rowParsed.data.vatNumber?.trim() ?? "";
    if (existingNames.has(normalizedName) || importedNames.has(normalizedName)) {
      errors.push({ row: rowNumber, field: "name", code: "duplicate_name" });
      continue;
    }
    if (vatNumber && (existingVatNumbers.has(vatNumber) || importedVatNumbers.has(vatNumber))) {
      errors.push({
        row: rowNumber,
        field: "vatNumber",
        code: "duplicate_vat_number",
      });
      continue;
    }

    if (!dryRun) {
      await createVendor({
        ...rowParsed.data,
        vatRegistered: rowParsed.data.vatRegistered ?? Boolean(vatNumber),
        vatNumber: vatNumber || null,
        tags,
        status: rowParsed.data.status ?? "active",
      });
    }
    created += 1;
    importedNames.add(normalizedName);
    if (vatNumber) {
      importedVatNumbers.add(vatNumber);
    }
  }

  if (!dryRun) {
    await recordAuditEvent({
      companyId: parsed.data.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "vendor.import",
      entity: "vendor",
      metadata: { created, errors: errors.length },
    });

    await createImportJob({
      companyId: parsed.data.companyId,
      entity: "vendors",
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

