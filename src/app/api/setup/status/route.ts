import { NextResponse } from "next/server";
import { hasAnyUsers } from "@/lib/data/users";

export const runtime = "nodejs";

export async function GET() {
  const hasUsers = await hasAnyUsers();
  return NextResponse.json({ hasUsers });
}
