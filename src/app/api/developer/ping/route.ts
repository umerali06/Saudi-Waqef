import { NextResponse } from "next/server";
import { authenticateApiKey, recordApiKeyUsage } from "@/lib/security/api-keys";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { key, error } = await authenticateApiKey(request);
  if (!key) {
    await recordApiKeyUsage({
      keyId: "unknown",
      companyId: "unknown",
      endpoint: "/api/developer/ping",
      method: "GET",
      status: 401,
      error: error ?? "Unauthorized",
    });
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 });
  }

  await recordApiKeyUsage({
    keyId: key.id,
    companyId: key.companyId,
    endpoint: "/api/developer/ping",
    method: "GET",
    status: 200,
  });

  return NextResponse.json({
    ok: true,
    companyId: key.companyId,
    scopes: key.scopes,
  });
}
