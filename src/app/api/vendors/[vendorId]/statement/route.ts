import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { getVendorById } from "@/lib/data/vendors";
import { listPurchaseBills } from "@/lib/data/purchase-bills";
import { listVendorCreditNotes } from "@/lib/data/vendor-credit-notes";
import { listVendorPayments } from "@/lib/data/vendor-payments";
import { listOpenItemsByCompany, buildAgingByParty } from "@/lib/data/open-items";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ vendorId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vendorId } = await context.params;
  const vendor = await getVendorById(vendorId);
  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, vendor.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [bills, credits, payments, openItems] = await Promise.all([
    listPurchaseBills(vendor.companyId),
    listVendorCreditNotes(vendor.companyId),
    listVendorPayments(vendor.companyId),
    listOpenItemsByCompany(vendor.companyId),
  ]);

  const vendorBills = bills.filter((bill) => bill.vendorId === vendorId);
  const vendorCredits = credits.filter((note) => note.vendorId === vendorId);
  const vendorPayments = payments.filter((payment) => payment.vendorId === vendorId);

  const paidMap = new Map<string, number>();
  vendorPayments.forEach((payment) => {
    payment.allocations.forEach((allocation) => {
      paidMap.set(
        allocation.billId,
        (paidMap.get(allocation.billId) ?? 0) + allocation.amount
      );
    });
  });

  const agingMap = buildAgingByParty(
    openItems.filter((item) => item.partyType === "vendor")
  );
  const aging = agingMap.get(vendorId)?.aging ?? null;

  const statementLines = vendorBills.map((bill) => {
    const paid = paidMap.get(bill.id) ?? bill.amountPaid ?? 0;
    const credited = bill.amountCredited ?? 0;
    const balance = Math.max(bill.total - paid - credited, 0);
    return {
      billId: bill.id,
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      status: bill.status,
      total: bill.total,
      paid,
      credited,
      balance,
      currency: bill.currency ?? "SAR",
    };
  });

  const totals = statementLines.reduce(
    (acc, line) => {
      acc.billed += line.total;
      acc.paid += line.paid;
      acc.credited += line.credited;
      acc.balance += line.balance;
      return acc;
    },
    { billed: 0, paid: 0, credited: 0, balance: 0 }
  );

  return NextResponse.json({
    vendor: {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email ?? null,
      currency: vendor.currency ?? "SAR",
    },
    totals,
    aging,
    bills: statementLines,
    creditNotes: vendorCredits.map((note) => ({
      id: note.id,
      creditNumber: note.creditNumber,
      issueDate: note.issueDate,
      total: note.total,
      status: note.status,
      currency: note.currency ?? "SAR",
    })),
  });
}
