import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { billingPlanSchema } from "@/lib/validators/billing";
import { createBillingPlan, listBillingPlans, updateBillingPlan } from "@/lib/data/billing-plans";

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

  const includeInactive = searchParams.get("includeInactive") === "true";
  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const plans = await listBillingPlans({ includeInactive });
  return NextResponse.json({ plans });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = billingPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const planId = await createBillingPlan({
    code: parsed.data.code,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    currency: parsed.data.currency,
    priceMonthly: parsed.data.priceMonthly,
    priceYearly: parsed.data.priceYearly,
    maxUsers: parsed.data.maxUsers,
    maxCompanies: parsed.data.maxCompanies ?? null,
    modules: parsed.data.modules ?? [],
    trialDays: parsed.data.trialDays ?? 0,
    graceDays: parsed.data.graceDays ?? 0,
    isActive: parsed.data.isActive ?? true,
    isDefault: parsed.data.isDefault ?? false,
  });

  if (parsed.data.isDefault) {
    const plans = await listBillingPlans({ includeInactive: true });
    await Promise.all(
      plans
        .filter((plan) => plan.id !== planId && plan.isDefault)
        .map((plan) => updateBillingPlan(plan.id, { isDefault: false }))
    );
  }

  return NextResponse.json({ planId });
}
