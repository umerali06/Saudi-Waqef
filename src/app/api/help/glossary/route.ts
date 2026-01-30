import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { listKbGlossaryTerms } from "@/lib/data/knowledge-base";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  const terms = await listKbGlossaryTerms({ query });
  return NextResponse.json({
    terms: terms.map((term) => ({
      id: term.id,
      termAr: term.termAr,
      termEn: term.termEn,
      definitionAr: term.definitionAr,
      definitionEn: term.definitionEn,
      category: term.category ?? null,
    })),
  });
}
