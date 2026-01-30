import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { dispatchQueuedEmails } from "@/lib/email/dispatcher";

export const runtime = "nodejs";

type DispatchBody = {
  companyId?: string;
  limit?: number;
  retryFailed?: boolean;
  maxAttempts?: number;
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as DispatchBody | null;
  const companyId = body?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await dispatchQueuedEmails({
    limit: body?.limit,
    retryFailed: body?.retryFailed ?? false,
    maxAttempts: body?.maxAttempts,
  });

  return NextResponse.json({ ok: true, result });
}
