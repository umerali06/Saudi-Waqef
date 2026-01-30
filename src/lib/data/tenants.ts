import { db } from "@/lib/firebase/admin";
import { getSubscription } from "@/lib/data/subscriptions";
import { listMembershipsByCompany } from "@/lib/data/memberships";
import { getUserById } from "@/lib/data/users";
import { getSubscriptionPlanMap } from "@/lib/data/system-metrics";

export type TenantSummary = {
  id: string;
  name: string;
  status: "active" | "suspended";
  currency: string;
  defaultLanguage: "ar" | "en";
  createdAt: Date;
  userCount: number;
  ownerId?: string | null;
  ownerEmail?: string | null;
  subscriptionStatus?: string | null;
  planName?: string | null;
};

export async function listTenantSummaries() {
  const [companiesSnap, planMap] = await Promise.all([
    db.collection("companies").get(),
    getSubscriptionPlanMap(),
  ]);

  const companies = companiesSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const summaries = await Promise.all(
    companies.map(async (company) => {
      const memberships = await listMembershipsByCompany(company.id);
      const ownerMembership = memberships.find((m) => m.role === "owner") ?? null;
      const ownerUser = ownerMembership
        ? await getUserById(ownerMembership.userId)
        : null;
      const subscription = await getSubscription(company.id);

      return {
        id: company.id,
        name: company.name ?? "",
        status: (company.status ?? "active") as "active" | "suspended",
        currency: company.currency ?? "SAR",
        defaultLanguage: (company.defaultLanguage ?? "ar") as "ar" | "en",
        createdAt: company.createdAt?.toDate ? company.createdAt.toDate() : new Date(),
        userCount: memberships.length,
        ownerId: ownerMembership?.userId ?? null,
        ownerEmail: ownerUser?.email ?? null,
        subscriptionStatus: subscription?.status ?? null,
        planName: subscription?.planId ? planMap.get(subscription.planId) ?? null : null,
      } as TenantSummary;
    })
  );

  return summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
