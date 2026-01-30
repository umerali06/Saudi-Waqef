import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { listApiKeyUsage } from "@/lib/data/api-keys";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const usage = await listApiKeyUsage(companyId);
  return NextResponse.json({
    usage: usage.map((entry) => ({
      id: entry.id,
      keyId: entry.keyId,
      endpoint: entry.endpoint,
      method: entry.method,
      status: entry.status,
      error: entry.error ?? null,
      createdAt: entry.createdAt.toISOString(),
    })),
  });
}


