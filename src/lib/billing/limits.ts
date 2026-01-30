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

export async function checkCompanyLimit(userId: string) {
  const memberships = await listMembershipsByUser(userId);
  const owned = memberships.filter((entry) => entry.role === "owner");
  if (owned.length === 0) {
    return { ok: true };
  }

  let maxCompanies: number | null = null;
  for (const membership of owned) {
    const { plan } = await getSubscriptionWithPlan(membership.companyId);
    if (!plan || !plan.maxCompanies) {
      continue;
    }
    if (maxCompanies === null || plan.maxCompanies > maxCompanies) {
      maxCompanies = plan.maxCompanies;
    }
  }

  if (maxCompanies && owned.length >= maxCompanies) {
    return { ok: false, reason: "Plan company limit reached" };
  }

  return { ok: true };
}
