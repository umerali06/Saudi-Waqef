import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { listKbArticles } from "@/lib/data/knowledge-base";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const categoryId = searchParams.get("categoryId");

  const articles = await listKbArticles({
    categoryId,
    query,
    includeDrafts: false,
  });

  return NextResponse.json({
    articles: articles.map((article) => ({
      id: article.id,
      categoryId: article.categoryId,
      slug: article.slug,
      titleAr: article.titleAr,
      titleEn: article.titleEn,
      summaryAr: article.summaryAr ?? null,
      summaryEn: article.summaryEn ?? null,
      tags: article.tags ?? [],
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt ? article.updatedAt.toISOString() : null,
    })),
  });
}
