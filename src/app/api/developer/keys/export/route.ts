import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { listApiKeys } from "@/lib/data/api-keys";
import { toCsv } from "@/lib/utils/csv";

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

  const keys = await listApiKeys(companyId);
  const headers = [
    "ID",
    "Name",
    "Prefix",
    "Scopes",
    "Status",
    "Created By",
    "Created At",
    "Last Used At",
    "Revoked At",
  ];
  const rows = keys.map((key) => [
    key.id,
    key.name,
    key.prefix,
    key.scopes.join(", "),
    key.status,
    key.createdByEmail ?? "",
    key.createdAt.toISOString(),
    key.lastUsedAt ? key.lastUsedAt.toISOString() : "",
    key.revokedAt ? key.revokedAt.toISOString() : "",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=api-keys.csv",
    },
  });
}
