import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { applyCredit } from "@/lib/accounting/credits";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { applyCreditSchema } from "@/lib/validators/payments";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ openItemId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = applyCreditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { openItemId } = await context.params;
  let result: Awaited<ReturnType<typeof applyCredit>>;
  try {
    result = await applyCredit({ openItemId, ...parsed.data });
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "credit.apply",
    entity: "open_item",
    entityId: openItemId,
    metadata: { applied: result.applied, remaining: result.remaining },
  });

  return NextResponse.json({ ok: true, ...result });
}
