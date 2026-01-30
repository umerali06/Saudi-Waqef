import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { listBillingPlans } from "@/lib/data/billing-plans";

export type KpiSnapshot = {
  activeCompanies: number;
  invoicesLast30Days: number;
  invoicesPerCompany: number;
  payrollRunsLast30Days: number;
  supportTicketsLast30Days: number;
  mrr: number;
  churnLast30Days: number;
  arpu: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  onboardingConversionRate: number;
  generatedAt: string;
};

const getSinceDate = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const toMonthlyPrice = (billingCycle: string, priceMonthly: number, priceYearly: number) =>
  billingCycle === "yearly" ? priceYearly / 12 : priceMonthly;

export async function getKpiSnapshot() {
  const since = getSinceDate(30);
  const sinceTimestamp = Timestamp.fromDate(since);

  const [
    companiesSnap,
    invoicesSnap,
    payrollSnap,
    supportSnap,
    subscriptionsSnap,
    onboardingStartSnap,
    onboardingCompleteSnap,
    plans,
  ] = await Promise.all([
    db.collection("companies").get(),
    db.collection("sales_invoices").where("createdAt", ">=", sinceTimestamp).get(),
    db.collection("payroll_runs").where("createdAt", ">=", sinceTimestamp).get(),
    db.collection("support_tickets").where("createdAt", ">=", sinceTimestamp).get(),
    db.collection("subscriptions").get(),
    db
      .collection("telemetry_events")
      .where("name", "==", "onboarding.started")
      .where("createdAt", ">=", sinceTimestamp)
      .get(),
    db
      .collection("telemetry_events")
      .where("name", "==", "onboarding.completed")
      .where("createdAt", ">=", sinceTimestamp)
      .get(),
    listBillingPlans({ includeInactive: true }),
  ]);

  const companies = companiesSnap.docs.map((doc) => doc.data());
  const activeCompanies = companies.filter(
    (company) => (company.status ?? "active") === "active"
  ).length;

  const planMap = new Map<string, { monthly: number; yearly: number }>();
  plans.forEach((plan) => {
    planMap.set(plan.id, {
      monthly: plan.priceMonthly ?? 0,
      yearly: plan.priceYearly ?? plan.priceMonthly ?? 0,
    });
  });

  let mrr = 0;
  let churnLast30Days = 0;
  const churnSince = since;
  subscriptionsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const plan = planMap.get(data.planId ?? "");
    if (data.status === "active" || data.status === "past_due") {
      if (plan) {
        mrr += toMonthlyPrice(data.billingCycle ?? "monthly", plan.monthly, plan.yearly);
      }
    }
    const canceledAt = data.canceledAt?.toDate ? data.canceledAt.toDate() : null;
    if (canceledAt && canceledAt >= churnSince) {
      churnLast30Days += 1;
    }
  });

  const invoicesLast30Days = invoicesSnap.size;
  const payrollRunsLast30Days = payrollSnap.size;
  const supportTicketsLast30Days = supportSnap.size;
  const invoicesPerCompany =
    activeCompanies > 0 ? Number((invoicesLast30Days / activeCompanies).toFixed(2)) : 0;

  const arpu = activeCompanies > 0 ? Number((mrr / activeCompanies).toFixed(2)) : 0;

  const onboardingStarted = onboardingStartSnap.size;
  const onboardingCompleted = onboardingCompleteSnap.size;
  const onboardingConversionRate =
    onboardingStarted > 0
      ? Number(((onboardingCompleted / onboardingStarted) * 100).toFixed(1))
      : 0;

  return {
    activeCompanies,
    invoicesLast30Days,
    invoicesPerCompany,
    payrollRunsLast30Days,
    supportTicketsLast30Days,
    mrr: Number(mrr.toFixed(2)),
    churnLast30Days,
    arpu,
    onboardingStarted,
    onboardingCompleted,
    onboardingConversionRate,
    generatedAt: new Date().toISOString(),
  } as KpiSnapshot;
}
