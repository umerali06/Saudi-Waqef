import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { listBillingPlans } from "@/lib/data/billing-plans";
import { listSystemAlerts } from "@/lib/data/system-alerts";

export type SystemOverview = {
  companies: {
    total: number;
    active: number;
    suspended: number;
  };
  users: {
    total: number;
    active: number;
    invited: number;
  };
  subscriptions: Record<string, number>;
  churnedLast30Days: number;
  usage: {
    loginsLast30Days: number;
    invoicesLast30Days: number;
    payrollRunsLast30Days: number;
  };
  generatedAt: string;
};

export async function getSystemOverview() {
  const [companiesSnap, usersSnap, subscriptionsSnap] = await Promise.all([
    db.collection("companies").get(),
    db.collection("users").get(),
    db.collection("subscriptions").get(),
  ]);

  const companies = companiesSnap.docs.map((doc) => doc.data());
  const users = usersSnap.docs.map((doc) => doc.data());
  const subscriptions = subscriptionsSnap.docs.map((doc) => doc.data());

  const companyCounts = companies.reduce(
    (acc, company) => {
      const status = company.status ?? "active";
      acc.total += 1;
      if (status === "suspended") {
        acc.suspended += 1;
      } else {
        acc.active += 1;
      }
      return acc;
    },
    { total: 0, active: 0, suspended: 0 }
  );

  const userCounts = users.reduce(
    (acc, user) => {
      const status = user.status ?? "active";
      acc.total += 1;
      if (status === "invited") {
        acc.invited += 1;
      } else {
        acc.active += 1;
      }
      return acc;
    },
    { total: 0, active: 0, invited: 0 }
  );

  const subscriptionCounts: Record<string, number> = {};
  let churnedLast30Days = 0;
  const churnStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const sub of subscriptions) {
    const status = sub.status ?? "trialing";
    subscriptionCounts[status] = (subscriptionCounts[status] ?? 0) + 1;
    const canceledAt = sub.canceledAt?.toDate ? sub.canceledAt.toDate() : null;
    if (canceledAt && canceledAt >= churnStart) {
      churnedLast30Days += 1;
    }
  }

  const usage = await getSystemUsage();

  return {
    companies: companyCounts,
    users: userCounts,
    subscriptions: subscriptionCounts,
    churnedLast30Days,
    usage,
    generatedAt: new Date().toISOString(),
  } as SystemOverview;
}

export async function getSystemUsage() {
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const startTimestamp = Timestamp.fromDate(startDate);

  const [invoiceSnap, payrollSnap, auditSnap] = await Promise.all([
    db.collection("sales_invoices").where("createdAt", ">=", startTimestamp).get(),
    db.collection("payroll_runs").where("createdAt", ">=", startTimestamp).get(),
    db.collection("audit_logs").where("companyId", "==", "system").get(),
  ]);

  const loginsLast30Days = auditSnap.docs.filter((doc) => {
    const data = doc.data();
    if (data.action !== "auth.login") {
      return false;
    }
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
    return createdAt ? createdAt >= startDate : false;
  }).length;

  return {
    loginsLast30Days,
    invoicesLast30Days: invoiceSnap.size,
    payrollRunsLast30Days: payrollSnap.size,
  };
}

export async function getSystemHealthSummary() {
  const healthStart = Date.now();
  let dbStatus: "ok" | "error" = "ok";
  try {
    await db.collection("companies").limit(1).get();
  } catch {
    dbStatus = "error";
  }
  const dbLatencyMs = Date.now() - healthStart;

  const alerts = await listSystemAlerts({ status: "open", limit: 200 });
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical").length;

  return {
    db: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    alerts: {
      open: alerts.length,
      critical: criticalAlerts,
    },
  };
}

export async function getSubscriptionPlanMap() {
  const plans = await listBillingPlans({ includeInactive: true });
  const map = new Map<string, string>();
  plans.forEach((plan) => map.set(plan.id, plan.name));
  return map;
}
