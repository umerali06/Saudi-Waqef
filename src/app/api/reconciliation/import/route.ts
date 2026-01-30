import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { reconciliationImportSchema } from "@/lib/validators/payments";
import { createStatementLines } from "@/lib/data/bank-statement-lines";
import { listCashBankAccounts } from "@/lib/data/cash-bank-accounts";
import { toCsv } from "@/lib/utils/csv";
import { recordAuditEvent } from "@/lib/data/audit-log";

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

  const lang = searchParams.get("lang") === "ar" ? "ar" : "en";
  const headers =
    lang === "ar" ? ["التاريخ", "الوصف", "المبلغ"] : ["date", "description", "amount"];
  const csv = toCsv(headers, []);
  const filename = lang === "ar" ? "statement-template-ar.csv" : "statement-template-en.csv";

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
  const parsed = reconciliationImportSchema.safeParse(body);
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

  const cashAccounts = await listCashBankAccounts(parsed.data.companyId);
  const validAccountIds = new Set(cashAccounts.map((account) => account.accountId));
  if (!validAccountIds.has(parsed.data.accountId)) {
    return NextResponse.json({ error: "Invalid cash account" }, { status: 400 });
  }

  const ids = await createStatementLines({
    companyId: parsed.data.companyId,
    accountId: parsed.data.accountId,
    lines: parsed.data.lines,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "reconciliation.import",
    entity: "bank_statement",
    metadata: { created: ids.length },
  });

  return NextResponse.json({ created: ids.length });
}

