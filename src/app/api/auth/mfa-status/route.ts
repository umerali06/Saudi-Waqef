import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/data/users";
import { getUserSecurity } from "@/lib/data/user-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ mfaEnabled: false });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ mfaEnabled: false });
  }

  const security = await getUserSecurity(user.id);
  return NextResponse.json({ mfaEnabled: Boolean(security.mfaEnabled) });
}
