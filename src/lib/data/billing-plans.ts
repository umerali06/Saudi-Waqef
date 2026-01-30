import { Timestamp, type Query } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type BillingPlan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  maxCompanies?: number | null;
  modules: string[];
  trialDays: number;
  graceDays: number;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
};

export async function listBillingPlans(params?: { includeInactive?: boolean }) {
  const includeInactive = params?.includeInactive ?? false;
  let query: Query = db.collection("billing_plans");
  if (!includeInactive) {
    query = query.where("isActive", "==", true);
  }
  const snapshot = await query.get();
  const plans = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      code: data.code ?? "",
      name: data.name ?? "",
      description: data.description ?? null,
      currency: data.currency ?? "SAR",
      priceMonthly: Number(data.priceMonthly ?? 0),
      priceYearly: Number(data.priceYearly ?? 0),
      maxUsers: Number(data.maxUsers ?? 0),
      maxCompanies: data.maxCompanies ?? null,
      modules: Array.isArray(data.modules) ? data.modules : [],
      trialDays: Number(data.trialDays ?? 0),
      graceDays: Number(data.graceDays ?? 0),
      isActive: Boolean(data.isActive),
      isDefault: Boolean(data.isDefault),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as BillingPlan;
  });

  return plans.sort((a, b) => a.priceMonthly - b.priceMonthly);
}

export async function getBillingPlan(planId: string) {
  const doc = await db.collection("billing_plans").doc(planId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    code: data.code ?? "",
    name: data.name ?? "",
    description: data.description ?? null,
    currency: data.currency ?? "SAR",
    priceMonthly: Number(data.priceMonthly ?? 0),
    priceYearly: Number(data.priceYearly ?? 0),
    maxUsers: Number(data.maxUsers ?? 0),
    maxCompanies: data.maxCompanies ?? null,
    modules: Array.isArray(data.modules) ? data.modules : [],
    trialDays: Number(data.trialDays ?? 0),
    graceDays: Number(data.graceDays ?? 0),
    isActive: Boolean(data.isActive),
    isDefault: Boolean(data.isDefault),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  } as BillingPlan;
}

export async function createBillingPlan(params: {
  code: string;
  name: string;
  description?: string | null;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  maxCompanies?: number | null;
  modules: string[];
  trialDays: number;
  graceDays: number;
  isActive: boolean;
  isDefault: boolean;
}) {
  const id = uuidv4();
  await db.collection("billing_plans").doc(id).set({
    code: params.code.trim(),
    name: params.name.trim(),
    description: params.description ?? null,
    currency: params.currency ?? "SAR",
    priceMonthly: params.priceMonthly,
    priceYearly: params.priceYearly,
    maxUsers: params.maxUsers,
    maxCompanies: params.maxCompanies ?? null,
    modules: params.modules ?? [],
    trialDays: params.trialDays ?? 0,
    graceDays: params.graceDays ?? 0,
    isActive: params.isActive,
    isDefault: params.isDefault,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateBillingPlan(
  planId: string,
  updates: Partial<Omit<BillingPlan, "id" | "createdAt">>
) {
  await db.collection("billing_plans").doc(planId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
