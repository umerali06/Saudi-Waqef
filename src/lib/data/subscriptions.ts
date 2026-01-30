import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import type { BillingCycle } from "@/lib/utils/billing";
import { buildBillingPeriod } from "@/lib/utils/billing";
import { getBillingPlan, listBillingPlans } from "@/lib/data/billing-plans";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "suspended";

export type SubscriptionRecord = {
  id: string;
  companyId: string;
  planId: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  trialEndsAt?: Date | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | null;
  createdAt: Date;
};

export async function getSubscription(companyId: string) {
  const doc = await db.collection("subscriptions").doc(companyId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    planId: data.planId,
    status: (data.status ?? "trialing") as SubscriptionStatus,
    billingCycle: (data.billingCycle ?? "monthly") as BillingCycle,
    trialEndsAt: data.trialEndsAt?.toDate ? data.trialEndsAt.toDate() : null,
    currentPeriodStart: data.currentPeriodStart,
    currentPeriodEnd: data.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
    canceledAt: data.canceledAt?.toDate ? data.canceledAt.toDate() : null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  } as SubscriptionRecord;
}

export async function ensureSubscription(companyId: string) {
  const existing = await getSubscription(companyId);
  if (existing) {
    return existing;
  }

  const plans = await listBillingPlans({ includeInactive: false });
  if (plans.length === 0) {
    return null;
  }

  const defaultPlan =
    plans.find((plan) => plan.isDefault) ??
    plans.sort((a, b) => a.priceMonthly - b.priceMonthly)[0];

  const now = new Date();
  const trialDays = Math.max(0, defaultPlan.trialDays ?? 0);
  const trialEndsAt = trialDays > 0 ? new Date(now.getTime() + trialDays * 86400000) : null;
  const cycle: BillingCycle = "monthly";
  const periodStart = trialEndsAt ?? now;
  const period = buildBillingPeriod(periodStart, cycle);
  const status: SubscriptionStatus = trialEndsAt ? "trialing" : "active";

  await db.collection("subscriptions").doc(companyId).set({
    companyId,
    planId: defaultPlan.id,
    status,
    billingCycle: cycle,
    trialEndsAt: trialEndsAt ? Timestamp.fromDate(trialEndsAt) : null,
    currentPeriodStart: period.startDate,
    currentPeriodEnd: period.endDate,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: Timestamp.now(),
  });

  return await getSubscription(companyId);
}

export async function updateSubscription(
  companyId: string,
  updates: Partial<{
    planId: string;
    status: SubscriptionStatus;
    billingCycle: BillingCycle;
    trialEndsAt: Date | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.trialEndsAt !== undefined) {
    payload.trialEndsAt = updates.trialEndsAt
      ? Timestamp.fromDate(updates.trialEndsAt)
      : null;
  }
  if (updates.canceledAt !== undefined) {
    payload.canceledAt = updates.canceledAt ? Timestamp.fromDate(updates.canceledAt) : null;
  }
  await db.collection("subscriptions").doc(companyId).set(payload, { merge: true });
}

export async function getSubscriptionWithPlan(companyId: string) {
  const subscription = await getSubscription(companyId);
  if (!subscription) {
    return { subscription: null, plan: null };
  }
  const plan = await getBillingPlan(subscription.planId);
  return { subscription, plan };
}
