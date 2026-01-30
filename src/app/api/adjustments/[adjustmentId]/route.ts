import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { getCashAdjustmentById } from "@/lib/data/cash-adjustments";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ adjustmentId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { adjustmentId } = await context.params;
  const adjustment = await getCashAdjustmentById(adjustmentId);
  if (!adjustment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, adjustment.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ adjustment });
}

