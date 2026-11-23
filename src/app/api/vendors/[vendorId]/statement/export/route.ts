import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { getVendorById } from "@/lib/data/vendors";
import { listPurchaseBills } from "@/lib/data/purchase-bills";
import { listVendorCreditNotes } from "@/lib/data/vendor-credit-notes";
import { toCsv } from "@/lib/utils/csv";
import { outstandingBalance } from "@/lib/utils/settlement";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ vendorId: string }>;
};

const safeFilename = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

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

  const [bills, credits] = await Promise.all([
    listPurchaseBills(vendor.companyId),
    listVendorCreditNotes(vendor.companyId),
  ]);

  const vendorBills = bills.filter(
    (bill) => bill.vendorId === vendorId && !["draft", "canceled"].includes(bill.status)
  );
  const vendorCredits = credits.filter(
    (note) => note.vendorId === vendorId && note.status === "issued"
  );

  const rows: string[][] = [];

  vendorBills.forEach((bill) => {
    const paid = bill.amountPaid;
    const credited = bill.amountCredited;
    const balance = outstandingBalance(bill);
    rows.push([
      "bill",
      bill.billNumber,
      bill.billDate,
      bill.dueDate,
      bill.status,
      String(bill.total),
      String(paid),
      String(credited),
      String(balance),
      bill.currency ?? "SAR",
    ]);
  });

  vendorCredits.forEach((note) => {
    rows.push([
      "vendor_credit",
      note.creditNumber,
      note.issueDate,
      "",
      note.status,
      String(note.total),
      "0",
      String(note.total),
      "0",
      note.currency ?? "SAR",
    ]);
  });

  const headers = [
    "type",
    "number",
    "issueDate",
    "dueDate",
    "status",
    "total",
    "paid",
    "credited",
    "balance",
    "currency",
  ];

  const csv = toCsv(headers, rows);
  const filename = safeFilename(vendor.name || "vendor");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=statement-${filename}.csv`,
      "Cache-Control": "no-store",
    },
  });
}
