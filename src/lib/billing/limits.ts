import { listMembershipsByCompany, listMembershipsByUser } from "@/lib/data/memberships";
import { ensureSubscription, getSubscriptionWithPlan } from "@/lib/data/subscriptions";

export async function checkUserLimit(companyId: string) {
  const subscription = (await ensureSubscription(companyId)) ?? null;
  if (!subscription) {
    return { ok: true };
  }

  if (subscription.status === "canceled" || subscription.status === "suspended") {
    return { ok: false, reason: "Subscription inactive" };
  }

  const { plan } = await getSubscriptionWithPlan(companyId);
  if (!plan || !plan.maxUsers) {
    return { ok: true };
  }

  const memberships = await listMembershipsByCompany(companyId);
  if (memberships.length >= plan.maxUsers) {
    return { ok: false, reason: "Plan user limit reached" };
  }

  return { ok: true };
}

/** Companies the user owns against the most generous plan among them; null is unlimited. */
export async function getCompanyUsage(userId: string) {
  const memberships = await listMembershipsByUser(userId);
  const owned = memberships.filter((entry) => entry.role === "owner");

  let max: number | null = null;
  for (const membership of owned) {
    const { plan } = await getSubscriptionWithPlan(membership.companyId);
    if (!plan || !plan.maxCompanies) {
      continue;
    }
    if (max === null || plan.maxCompanies > max) {
      max = plan.maxCompanies;
    }
  }

  return { owned: owned.length, max, canCreate: max === null || owned.length < max };
}

export async function checkCompanyLimit(userId: string) {
  const usage = await getCompanyUsage(userId);
  return usage.canCreate ? { ok: true } : { ok: false, reason: "Plan company limit reached" };
}
