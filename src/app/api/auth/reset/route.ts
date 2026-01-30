import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptInviteSchema } from "@/lib/validators/auth";
import { getUserById, updateUserPassword } from "@/lib/data/users";
import {
  getPasswordResetByToken,
  isResetExpired,
  markPasswordResetUsed,
} from "@/lib/data/password-resets";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(16),
  password: acceptInviteSchema.shape.password,
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const reset = await getPasswordResetByToken(parsed.data.token);
  if (!reset || reset.usedAt || isResetExpired(reset)) {
    return NextResponse.json({ error: "Reset expired" }, { status: 410 });
  }

  const user = await getUserById(reset.userId);
  if (!user || user.status !== "active") {
    return NextResponse.json({ error: "User not active" }, { status: 400 });
  }

  await updateUserPassword(user.id, parsed.data.password);
  await markPasswordResetUsed(reset.id);

  return NextResponse.json({ ok: true });
}
