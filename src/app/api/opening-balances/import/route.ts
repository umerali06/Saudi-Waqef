import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { importPayloadSchema } from "@/lib/validators/parties";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { saveOpeningBalances } from "@/lib/data/opening-balances";
import { parseCsv, toCsv } from "@/lib/utils/csv";
import { normalizeSearch } from "@/lib/utils/search";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { createImportJob } from "@/lib/data/import-jobs";
import { getCompanyConfig } from "@/lib/data/company-config";
import { findClosedPeriod } from "@/lib/data/accounting-periods";

export const runtime = "nodejs";

const normalizeHeader = (value: string) =>
  normalizeSearch(value).replace(/[\s_\-.()]/g, "");

const headerAliases: Record<string, string> = {};
const registerAliases = (key: string, aliases: string[]) => {
  aliases.forEach((alias) => {
    headerAliases[normalizeHeader(alias)] = key;
  });
};

registerAliases("accountCode", [
  "account code",
  "accountcode",
  "code",
  "coa code",
  "\u0631\u0645\u0632 \u0627\u0644\u062d\u0633\u0627\u0628",
]);
registerAliases("accountName", [
  "account name",
  "accountname",
  "name",
  "coa name",
  "\u0627\u0633\u0645 \u0627\u0644\u062d\u0633\u0627\u0628",
]);
registerAliases("debit", ["debit", "dr", "\u0645\u062f\u064a\u0646"]);
registerAliases("credit", ["credit", "cr", "\u062f\u0627\u0626\u0646"]);
registerAliases("asOfDate", [
  "as of date",
  "asofdate",
  "opening date",
  "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0627\u0641\u062a\u062a\u0627\u062d",
]);

const templateHeaders = {
  en: ["accountCode", "accountName", "debit", "credit", "asOfDate"],
  ar: [
    "\u0631\u0645\u0632 \u0627\u0644\u062d\u0633\u0627\u0628",
    "\u0627\u0633\u0645 \u0627\u0644\u062d\u0633\u0627\u0628",
    "\u0645\u062f\u064a\u0646",
    "\u062f\u0627\u0626\u0646",
    "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0627\u0641\u062a\u062a\u0627\u062d",
  ],
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type ImportError = {
  row: number;
  field?: string;
  code: string;
};

const parseAmount = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: 0, invalid: false };
  }
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) {
    return { value: 0, invalid: true };
  }
  return { value: parsed, invalid: false };
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
  const filename =
    lang === "ar"
      ? "opening-balances-template-ar.csv"
      : "opening-balances-template-en.csv";

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

  if (headerIndex.accountCode === undefined && headerIndex.accountName === undefined) {
    return NextResponse.json({ error: "Missing account column" }, { status: 400 });
  }
  if (headerIndex.debit === undefined && headerIndex.credit === undefined) {
    return NextResponse.json({ error: "Missing amount columns" }, { status: 400 });
  }

  const accounts = await listChartAccounts(parsed.data.companyId);
  const postingAccounts = accounts.filter((account) => account.isPosting);
  const accountByCode = new Map<string, string>();
  const accountByName = new Map<string, string>();
  postingAccounts.forEach((account) => {
    accountByCode.set(normalizeSearch(account.code), account.id);
    accountByName.set(normalizeSearch(account.name), account.id);
  });

  const importedAccounts = new Set<string>();
  const entries: { accountId: string; debit: number; credit: number }[] = [];
  const errors: ImportError[] = [];
  let asOfDate: string | null = null;

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

    const code = getValue(row, "accountCode").trim();
    const name = getValue(row, "accountName").trim();
    if (!code && !name) {
      errors.push({ row: rowNumber, field: "accountCode", code: "missing_account" });
      continue;
    }

    const resolvedId = code
      ? accountByCode.get(normalizeSearch(code))
      : accountByName.get(normalizeSearch(name));
    if (!resolvedId) {
      errors.push({
        row: rowNumber,
        field: code ? "accountCode" : "accountName",
        code: "invalid_account",
      });
      continue;
    }

    if (importedAccounts.has(resolvedId)) {
      errors.push({ row: rowNumber, field: "accountCode", code: "duplicate_account" });
      continue;
    }

    const debitValue = getValue(row, "debit");
    const creditValue = getValue(row, "credit");
    const debitParsed = parseAmount(debitValue);
    const creditParsed = parseAmount(creditValue);

    if (debitParsed.invalid) {
      errors.push({ row: rowNumber, field: "debit", code: "invalid_debit" });
      continue;
    }
    if (creditParsed.invalid) {
      errors.push({ row: rowNumber, field: "credit", code: "invalid_credit" });
      continue;
    }

    const debit = debitParsed.value;
    const credit = creditParsed.value;

    if (debit > 0 && credit > 0) {
      errors.push({ row: rowNumber, field: "debit", code: "both_amounts" });
      continue;
    }
    if (debit === 0 && credit === 0) {
      errors.push({ row: rowNumber, field: "debit", code: "missing_amount" });
      continue;
    }

    const rowDate = getValue(row, "asOfDate").trim();
    if (rowDate) {
      if (!datePattern.test(rowDate)) {
        errors.push({ row: rowNumber, field: "asOfDate", code: "invalid_date" });
        continue;
      }
      if (!asOfDate) {
        asOfDate = rowDate;
      } else if (asOfDate !== rowDate) {
        errors.push({ row: rowNumber, field: "asOfDate", code: "mixed_date" });
        continue;
      }
    }

    entries.push({ accountId: resolvedId, debit, credit });
    importedAccounts.add(resolvedId);
  }

  if (errors.length > 0) {
    if (!dryRun) {
      await createImportJob({
        companyId: parsed.data.companyId,
        entity: "opening_balances",
        status: "failed",
        totalRows: rows.length,
        createdCount: 0,
        errorCount: errors.length,
        createdBy: user.id,
        createdByEmail: user.email ?? null,
      });
    }

    return NextResponse.json({ created: 0, errors });
  }

  const finalAsOfDate = asOfDate ?? new Date().toISOString().slice(0, 10);
  const config = await getCompanyConfig(parsed.data.companyId);
  if (config.periodLockDate && finalAsOfDate <= config.periodLockDate) {
    if (!dryRun) {
      await createImportJob({
        companyId: parsed.data.companyId,
        entity: "opening_balances",
        status: "failed",
        totalRows: rows.length,
        createdCount: 0,
        errorCount: 1,
        createdBy: user.id,
        createdByEmail: user.email ?? null,
      });
    }
    return NextResponse.json({ created: 0, errors: [{ row: 0, code: "period_locked" }] });
  }

  const closedPeriod = await findClosedPeriod(parsed.data.companyId, finalAsOfDate);
  if (closedPeriod) {
    if (!dryRun) {
      await createImportJob({
        companyId: parsed.data.companyId,
        entity: "opening_balances",
        status: "failed",
        totalRows: rows.length,
        createdCount: 0,
        errorCount: 1,
        createdBy: user.id,
        createdByEmail: user.email ?? null,
      });
    }
    return NextResponse.json({ created: 0, errors: [{ row: 0, code: "period_closed" }] });
  }

  const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    if (!dryRun) {
      await createImportJob({
        companyId: parsed.data.companyId,
        entity: "opening_balances",
        status: "failed",
        totalRows: rows.length,
        createdCount: 0,
        errorCount: 1,
        createdBy: user.id,
        createdByEmail: user.email ?? null,
      });
    }
    return NextResponse.json({ created: 0, errors: [{ row: 0, code: "unbalanced" }] });
  }

  if (!dryRun) {
    await saveOpeningBalances(parsed.data.companyId, entries, finalAsOfDate);
    await recordAuditEvent({
      companyId: parsed.data.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "opening_balances.import",
      entity: "opening_balance",
      metadata: { entries: entries.length, asOfDate: finalAsOfDate },
    });

    await createImportJob({
      companyId: parsed.data.companyId,
      entity: "opening_balances",
      status: "completed",
      totalRows: rows.length,
      createdCount: entries.length,
      errorCount: 0,
      createdBy: user.id,
      createdByEmail: user.email ?? null,
    });
  }

  return NextResponse.json({ created: entries.length, errors: [] });
}
