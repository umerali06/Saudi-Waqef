import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import {
  ensureSubscription,
  getSubscription,
  updateSubscription,
  getSubscriptionWithPlan,
} from "@/lib/data/subscriptions";
import { listMembershipsByCompany } from "@/lib/data/memberships";
import { getBillingPlan } from "@/lib/data/billing-plans";
import {
  subscriptionUpdateSchema,
  subscriptionOverrideSchema,
} from "@/lib/validators/billing";
import { buildBillingPeriod, calculatePlanAmount } from "@/lib/utils/billing";
import { createBillingInvoice } from "@/lib/data/billing-invoices";

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

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const subscription = await ensureSubscription(companyId);
  if (!subscription) {
    return NextResponse.json({ subscription: null, plan: null, usage: null });
  }

  const { plan } = await getSubscriptionWithPlan(companyId);
  const memberships = await listMembershipsByCompany(companyId);

  return NextResponse.json({
    subscription,
    plan,
    usage: {
      users: memberships.length,
      maxUsers: plan?.maxUsers ?? null,
    },
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = subscriptionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plan = await getBillingPlan(parsed.data.planId);
  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const existing = await getSubscription(parsed.data.companyId);
  const now = new Date();
  const period = buildBillingPeriod(now, parsed.data.billingCycle);
  const amount = calculatePlanAmount({
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    billingCycle: parsed.data.billingCycle,
  });

  if (!existing) {
    const trialDays = Math.max(0, plan.trialDays ?? 0);
    const trialEndsAt =
      trialDays > 0 ? new Date(now.getTime() + trialDays * 86400000) : null;
    const periodStart = trialEndsAt ?? now;
    const nextPeriod = buildBillingPeriod(periodStart, parsed.data.billingCycle);
    const status = trialEndsAt ? "trialing" : "active";
    await updateSubscription(parsed.data.companyId, {
      planId: plan.id,
      billingCycle: parsed.data.billingCycle,
      status,
      trialEndsAt,
      currentPeriodStart: nextPeriod.startDate,
      currentPeriodEnd: nextPeriod.endDate,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    if (status === "active") {
      const invoiceStatus = amount === 0 ? "paid" : "issued";
      await createBillingInvoice({
        companyId: parsed.data.companyId,
        subscriptionId: parsed.data.companyId,
        planId: plan.id,
        planName: plan.name,
        amount,
        currency: plan.currency,
        status: invoiceStatus,
        periodStart: nextPeriod.startDate,
        periodEnd: nextPeriod.endDate,
        issuedAt: new Date(),
        dueDate: amount === 0 ? null : new Date(),
        paidAt: amount === 0 ? new Date() : null,
      });
    }
  } else {
    await updateSubscription(parsed.data.companyId, {
      planId: plan.id,
      billingCycle: parsed.data.billingCycle,
      status: "active",
      trialEndsAt: null,
      currentPeriodStart: period.startDate,
      currentPeriodEnd: period.endDate,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    const invoiceStatus = amount === 0 ? "paid" : "issued";
    await createBillingInvoice({
      companyId: parsed.data.companyId,
      subscriptionId: parsed.data.companyId,
      planId: plan.id,
      planName: plan.name,
      amount,
      currency: plan.currency,
      status: invoiceStatus,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      issuedAt: new Date(),
      dueDate: amount === 0 ? null : new Date(),
      paidAt: amount === 0 ? new Date() : null,
    });
  }

  const updated = await getSubscription(parsed.data.companyId);
  return NextResponse.json({ subscription: updated, plan });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = subscriptionOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await updateSubscription(parsed.data.companyId, {
    status: parsed.data.status,
  });
  return NextResponse.json({ ok: true });
}
