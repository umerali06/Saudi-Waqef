import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { subscriptionCancelSchema } from "@/lib/validators/billing";
import { updateSubscription, getSubscription } from "@/lib/data/subscriptions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = subscriptionCancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const subscription = await getSubscription(parsed.data.companyId);
  if (!subscription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cancelAtPeriodEnd = parsed.data.cancelAtPeriodEnd ?? true;
  if (cancelAtPeriodEnd) {
    await updateSubscription(parsed.data.companyId, {
      cancelAtPeriodEnd: true,
    });
  } else {
    await updateSubscription(parsed.data.companyId, {
      status: "canceled",
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
    });
  }

  return NextResponse.json({ ok: true });
}
