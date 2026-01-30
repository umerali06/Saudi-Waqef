import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listOpenItems, listOpenItemsByCompany } from "@/lib/data/open-items";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const partyType = searchParams.get("partyType");
  const partyId = searchParams.get("partyId");

  if (partyType && partyId) {
    const items = await listOpenItems(
      companyId,
      partyType as "customer" | "vendor",
      partyId
    );
    return NextResponse.json({ items });
  }

  const items = await listOpenItemsByCompany(companyId);
  return NextResponse.json({ items });
}
