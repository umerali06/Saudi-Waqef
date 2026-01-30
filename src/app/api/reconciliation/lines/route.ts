import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listStatementLines } from "@/lib/data/bank-statement-lines";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const accountId = searchParams.get("accountId");
  if (!companyId || !accountId) {
    return NextResponse.json(
      { error: "companyId and accountId are required" },
      { status: 400 }
    );
  }

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lines = await listStatementLines(companyId, accountId);
  return NextResponse.json({ lines });
}

