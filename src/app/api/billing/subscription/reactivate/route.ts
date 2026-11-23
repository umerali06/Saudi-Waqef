import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { subscriptionReactivateSchema } from "@/lib/validators/billing";
import { updateSubscription, getSubscription } from "@/lib/data/subscriptions";
import { buildBillingPeriod } from "@/lib/utils/billing";
import { reportPlatformEvent } from "@/lib/notifications/platform-events";

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

  if (subscription.status === "suspended" || subscription.status === "past_due") {
    return NextResponse.json({ error: "Subscription suspended" }, { status: 403 });
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

  await reportPlatformEvent({
    kind: "subscription_reactivate",
    severity: "low",
    title: { ar: "إعادة تفعيل اشتراك", en: "Subscription reactivated" },
    message: {
      ar: `المستخدم: ${user.email ?? ""}`,
      en: `User: ${user.email ?? ""}`,
    },
    path: "/admin/tenants",
    entityId: parsed.data.companyId,
    companyId: parsed.data.companyId,
  });

  return NextResponse.json({ ok: true });
}
