import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { listKbCategories } from "@/lib/data/knowledge-base";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await listKbCategories();
  return NextResponse.json({
    categories: categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      descriptionAr: category.descriptionAr ?? null,
      descriptionEn: category.descriptionEn ?? null,
      order: category.order,
    })),
  });
}
