import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { acceptInviteSchema } from "@/lib/validators/auth";
import { getInviteByToken, isInviteExpired, acceptInvite } from "@/lib/data/invites";
import { createUser, getUserByEmail } from "@/lib/data/users";
import { createMembership, getMembership } from "@/lib/data/memberships";

export const runtime = "nodejs";

const tokenSchema = acceptInviteSchema.pick({ token: true });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invite acceptance payload" },
      { status: 400 }
    );
  }

  const invite = await getInviteByToken(parsed.data.token);
  if (!invite || invite.status !== "pending" || isInviteExpired(invite)) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  const existingUser = await getUserByEmail(invite.email);
  const userId = existingUser?.id ?? uuidv4();

  if (!existingUser) {
    // Only a new account needs a name and password; existing users keep their own.
    const account = acceptInviteSchema.safeParse(body);
    if (!account.success) {
      return NextResponse.json(
        { error: "Invalid invite acceptance payload" },
        { status: 400 }
      );
    }
    await createUser({
      id: userId,
      email: invite.email,
      name: account.data.name,
      password: account.data.password,
      status: "active",
    });
  }

  const membership = await getMembership({
    userId,
    companyId: invite.companyId,
  });

  if (!membership) {
    await createMembership({
      id: uuidv4(),
      userId,
      companyId: invite.companyId,
      role: invite.role,
    });
  }

  await acceptInvite(invite.id);

  return NextResponse.json({ ok: true });
}
