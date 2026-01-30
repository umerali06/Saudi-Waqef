import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth-helpers";
import { createKbFeedback } from "@/lib/data/knowledge-base";

export const runtime = "nodejs";

const schema = z.object({
  articleId: z.string().trim().optional().nullable(),
  page: z.string().trim().optional().nullable(),
  rating: z.number().min(1).max(5),
  message: z.string().trim().optional().nullable(),
  locale: z.string().trim().optional().nullable(),
  companyId: z.string().trim().optional().nullable(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("active_company")?.value ?? null;

  await createKbFeedback({
    userId: user.id,
    userEmail: user.email ?? null,
    companyId: parsed.data.companyId ?? activeCompanyId,
    articleId: parsed.data.articleId ?? null,
    page: parsed.data.page ?? null,
    rating: parsed.data.rating,
    message: parsed.data.message ?? null,
    locale: parsed.data.locale ?? null,
  });

  return NextResponse.json({ success: true });
}
