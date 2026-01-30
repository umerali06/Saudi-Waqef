import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { billingPlanUpdateSchema } from "@/lib/validators/billing";
import { updateBillingPlan, listBillingPlans } from "@/lib/data/billing-plans";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ planId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = billingPlanUpdateSchema.safeParse(body);
  if (!parsed.success || typeof body?.companyId !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, body.companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { planId } = await context.params;
  await updateBillingPlan(planId, parsed.data);

  if (parsed.data.isDefault) {
    const plans = await listBillingPlans({ includeInactive: true });
    await Promise.all(
      plans
        .filter((plan) => plan.id !== planId && plan.isDefault)
        .map((plan) => updateBillingPlan(plan.id, { isDefault: false }))
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { planId } = await context.params;
  await updateBillingPlan(planId, { isActive: false, isDefault: false });
  return NextResponse.json({ ok: true });
}
