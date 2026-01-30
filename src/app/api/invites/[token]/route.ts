import { NextResponse } from "next/server";
import { getInviteByToken, isInviteExpired } from "@/lib/data/invites";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { token } = await context.params;
  const invite = await getInviteByToken(token);
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "pending" || isInviteExpired(invite)) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    companyId: invite.companyId,
  });
}
