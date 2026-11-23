import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyMembership } from "@/lib/access";
import { buildDashboard } from "@/lib/reports/dashboard";

export const runtime = "nodejs";

const querySchema = z.object({
  companyId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

/** Open to every member; the sections returned depend on the member's role. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    companyId: searchParams.get("companyId") ?? "",
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dashboard = await buildDashboard({ ...parsed.data, role: membership.role });
  return NextResponse.json({ dashboard, role: membership.role });
}
