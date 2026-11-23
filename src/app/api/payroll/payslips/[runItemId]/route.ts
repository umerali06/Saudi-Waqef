import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { buildPayslipDocument } from "@/lib/data/payslips";
import { getAccessiblePayslip } from "@/lib/payroll/payslip-access";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runItemId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runItemId } = await context.params;
  const payslip = await getAccessiblePayslip(user.id, runItemId);
  if (!payslip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await buildPayslipDocument(payslip.run, [payslip.item]));
}
