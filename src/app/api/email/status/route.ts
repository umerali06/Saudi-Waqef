import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getEmailConfig } from "@/lib/email/sender";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getEmailConfig();
  const mode = process.env.EMAIL_SEND_MODE ?? "queue";

  return NextResponse.json({
    configured: Boolean(config),
    mode,
    fromAddress: config?.fromAddress ?? null,
  });
}
