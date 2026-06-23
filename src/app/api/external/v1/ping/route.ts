import { NextResponse } from "next/server";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiAuth(request, ["read:accounting", "read:reports", "read:hr"], async ({
    key,
    companyId,
  }) =>
    NextResponse.json({
      ok: true,
      companyId,
      scopes: key.scopes,
      apiVersion: "external/v1",
    })
  );
}
