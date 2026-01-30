import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { subscriptionReactivateSchema } from "@/lib/validators/billing";
import { updateSubscription, getSubscription } from "@/lib/data/subscriptions";
import { buildBillingPeriod } from "@/lib/utils/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = subscriptionReactivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const subscription = await getSubscription(parsed.data.companyId);
  if (!subscription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  const period = buildBillingPeriod(now, subscription.billingCycle);

  await updateSubscription(parsed.data.companyId, {
    status: "active",
    cancelAtPeriodEnd: false,
    canceledAt: null,
    currentPeriodStart: period.startDate,
    currentPeriodEnd: period.endDate,
  });

  return NextResponse.json({ ok: true });
}
