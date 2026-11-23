import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { billingPlanUpdateSchema } from "@/lib/validators/billing";
import { updateBillingPlan, listBillingPlans } from "@/lib/data/billing-plans";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ planId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = billingPlanUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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

export async function DELETE(_: Request, context: RouteContext) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const { planId } = await context.params;
  await updateBillingPlan(planId, { isActive: false, isDefault: false });
  return NextResponse.json({ ok: true });
}
