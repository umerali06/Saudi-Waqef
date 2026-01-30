import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getKbArticleById, listKbCategories } from "@/lib/data/knowledge-base";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    articleId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { articleId } = await context.params;
  const article = await getKbArticleById(articleId);
  if (!article || !article.isPublished) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const categories = await listKbCategories();
  const category = categories.find((item) => item.id === article.categoryId) ?? null;

  return NextResponse.json({
    article: {
      id: article.id,
      categoryId: article.categoryId,
      slug: article.slug,
      titleAr: article.titleAr,
      titleEn: article.titleEn,
      summaryAr: article.summaryAr ?? null,
      summaryEn: article.summaryEn ?? null,
      contentAr: article.contentAr,
      contentEn: article.contentEn,
      tags: article.tags ?? [],
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt ? article.updatedAt.toISOString() : null,
    },
    category: category
      ? {
          id: category.id,
          nameAr: category.nameAr,
          nameEn: category.nameEn,
          slug: category.slug,
        }
      : null,
  });
}
