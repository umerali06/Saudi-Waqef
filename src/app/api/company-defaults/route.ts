import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { getCompanyDefaults, updateCompanyDefaults } from "@/lib/data/company-defaults";
import { companyDefaultsSchema } from "@/lib/validators/company";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { listPaymentTerms } from "@/lib/data/payment-terms";

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

  const defaults = await getCompanyDefaults(companyId);
  return NextResponse.json({ defaults });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = companyDefaultsSchema.safeParse(body);
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

  const { companyId, ...updates } = parsed.data;
  const accountIds = [
    updates.salesAccountId,
    updates.purchasesAccountId,
    updates.vatOutputAccountId,
    updates.vatInputAccountId,
    updates.discountAccountId,
    updates.receivableAccountId,
    updates.payableAccountId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);

  if (accountIds.length > 0) {
    const accounts = await listChartAccounts(companyId);
    const postingIds = new Set(
      accounts.filter((account) => account.isPosting).map((account) => account.id)
    );
    const invalidAccount = accountIds.find((id) => !postingIds.has(id));
    if (invalidAccount) {
      return NextResponse.json(
        { error: "Invalid default account" },
        { status: 400 }
      );
    }
  }

  const taxIds = [
    updates.defaultSalesTaxCategoryId,
    updates.defaultPurchaseTaxCategoryId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  if (taxIds.length > 0) {
    const categories = await listTaxCategories(companyId);
    const categoryIds = new Set(categories.map((category) => category.id));
    const invalidTax = taxIds.find((id) => !categoryIds.has(id));
    if (invalidTax) {
      return NextResponse.json(
        { error: "Invalid default tax category" },
        { status: 400 }
      );
    }
  }

  const termIds = [
    updates.defaultSalesPaymentTermId,
    updates.defaultPurchasePaymentTermId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  if (termIds.length > 0) {
    const terms = await listPaymentTerms(companyId);
    const termIdSet = new Set(terms.map((term) => term.id));
    const invalidTerm = termIds.find((id) => !termIdSet.has(id));
    if (invalidTerm) {
      return NextResponse.json(
        { error: "Invalid default payment term" },
        { status: 400 }
      );
    }
  }

  await updateCompanyDefaults(companyId, updates);
  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "company.defaults.update",
    entity: "company_defaults",
    entityId: companyId,
    metadata: { fields: Object.keys(updates) },
  });
  return NextResponse.json({ ok: true });
}

