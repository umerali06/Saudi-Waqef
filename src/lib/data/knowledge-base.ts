import type { Query } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type KbCategory = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  order: number;
  createdAt: Date;
  updatedAt?: Date;
};

export type KbArticle = {
  id: string;
  categoryId: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  summaryAr?: string | null;
  summaryEn?: string | null;
  contentAr: string;
  contentEn: string;
  tags: string[];
  isPublished: boolean;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
};

export type KbGlossaryTerm = {
  id: string;
  termAr: string;
  termEn: string;
  definitionAr: string;
  definitionEn: string;
  category?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export type KbFeedback = {
  id: string;
  userId: string;
  userEmail?: string | null;
  companyId?: string | null;
  articleId?: string | null;
  page?: string | null;
  rating: number;
  message?: string | null;
  locale?: string | null;
  createdAt: Date;
};

const toDate = (value?: { toDate?: () => Date } | null) =>
  value?.toDate ? value.toDate() : new Date();

const slugify = (value: string) =>
  normalizeSearch(value)
    .replace(/[^a-z0-9\\s-]/g, "")
    .trim()
    .replace(/\\s+/g, "-")
    .slice(0, 80);

const buildSearchTokens = (values: string[]) => {
  const tokens = new Set<string>();
  values
    .filter(Boolean)
    .forEach((value) => {
      normalizeSearch(value)
        .split(/\\s+/)
        .filter((token) => token.length > 1)
        .forEach((token) => tokens.add(token));
    });
  return Array.from(tokens).slice(0, 60);
};

const normalizeTags = (tags?: string[] | null) =>
  (tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

export async function listKbCategories() {
  const snapshot = await db
    .collection("kb_categories")
    .orderBy("order", "asc")
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      slug: data.slug ?? doc.id,
      nameAr: data.nameAr ?? "",
      nameEn: data.nameEn ?? "",
      descriptionAr: data.descriptionAr ?? null,
      descriptionEn: data.descriptionEn ?? null,
      order: data.order ?? 0,
      createdAt: toDate(data.createdAt),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as KbCategory;
  });
}

export async function createKbCategory(params: {
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  slug?: string | null;
  order?: number;
}) {
  const id = uuidv4();
  const slug = params.slug?.trim() || slugify(params.nameEn || params.nameAr);
  await db.collection("kb_categories").doc(id).set({
    slug,
    nameAr: params.nameAr.trim(),
    nameEn: params.nameEn.trim(),
    descriptionAr: params.descriptionAr?.trim() ?? null,
    descriptionEn: params.descriptionEn?.trim() ?? null,
    order: params.order ?? 0,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateKbCategory(
  categoryId: string,
  updates: Partial<{
    nameAr: string;
    nameEn: string;
    descriptionAr: string | null;
    descriptionEn: string | null;
    slug: string | null;
    order: number;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.slug !== undefined && updates.slug !== null) {
    payload.slug = slugify(updates.slug);
  }
  if (updates.nameAr) {
    payload.nameAr = updates.nameAr.trim();
  }
  if (updates.nameEn) {
    payload.nameEn = updates.nameEn.trim();
  }
  if (updates.descriptionAr !== undefined) {
    payload.descriptionAr = updates.descriptionAr?.trim() ?? null;
  }
  if (updates.descriptionEn !== undefined) {
    payload.descriptionEn = updates.descriptionEn?.trim() ?? null;
  }
  await db.collection("kb_categories").doc(categoryId).set(payload, { merge: true });
}

export async function listKbArticles(params: {
  categoryId?: string | null;
  query?: string | null;
  includeDrafts?: boolean;
  limitCount?: number;
}) {
  const limitCount = params.limitCount ?? 50;
  let queryRef: Query = db.collection("kb_articles");

  if (!params.includeDrafts) {
    queryRef = queryRef.where("isPublished", "==", true);
  }
  if (params.categoryId) {
    queryRef = queryRef.where("categoryId", "==", params.categoryId);
  }

  const tokens = buildSearchTokens([params.query ?? ""]);
  if (tokens.length > 0) {
    queryRef = queryRef.where("searchTokens", "array-contains", tokens[0]);
  } else {
    queryRef = queryRef.orderBy("createdAt", "desc");
  }

  const snapshot = await queryRef.limit(limitCount).get();
  let articles = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      categoryId: data.categoryId ?? "",
      slug: data.slug ?? doc.id,
      titleAr: data.titleAr ?? "",
      titleEn: data.titleEn ?? "",
      summaryAr: data.summaryAr ?? null,
      summaryEn: data.summaryEn ?? null,
      contentAr: data.contentAr ?? "",
      contentEn: data.contentEn ?? "",
      tags: data.tags ?? [],
      isPublished: data.isPublished ?? false,
      publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate() : null,
      createdAt: toDate(data.createdAt),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
      searchTokens: data.searchTokens ?? [],
    } as KbArticle & { searchTokens: string[] };
  });

  if (tokens.length > 1) {
    articles = articles.filter((article) =>
      tokens.every((token) => (article.searchTokens ?? []).includes(token))
    );
  }

  return articles
    .sort((a, b) => {
      const aTime = a.updatedAt?.getTime() ?? a.createdAt.getTime();
      const bTime = b.updatedAt?.getTime() ?? b.createdAt.getTime();
      return bTime - aTime;
    })
    .map((article) => {
      const trimmed = { ...article } as KbArticle & { searchTokens?: string[] };
      delete trimmed.searchTokens;
      return trimmed as KbArticle;
    });
}

export async function getKbArticleById(articleId: string) {
  const doc = await db.collection("kb_articles").doc(articleId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    categoryId: data.categoryId ?? "",
    slug: data.slug ?? doc.id,
    titleAr: data.titleAr ?? "",
    titleEn: data.titleEn ?? "",
    summaryAr: data.summaryAr ?? null,
    summaryEn: data.summaryEn ?? null,
    contentAr: data.contentAr ?? "",
    contentEn: data.contentEn ?? "",
    tags: data.tags ?? [],
    isPublished: data.isPublished ?? false,
    publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate() : null,
    createdAt: toDate(data.createdAt),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as KbArticle;
}

export async function createKbArticle(params: {
  categoryId: string;
  titleAr: string;
  titleEn: string;
  summaryAr?: string | null;
  summaryEn?: string | null;
  contentAr: string;
  contentEn: string;
  tags?: string[];
  slug?: string | null;
  isPublished?: boolean;
}) {
  const id = uuidv4();
  const tags = normalizeTags(params.tags);
  const slug = params.slug?.trim() || slugify(params.titleEn || params.titleAr);
  const searchTokens = buildSearchTokens([
    params.titleAr,
    params.titleEn,
    params.summaryAr ?? "",
    params.summaryEn ?? "",
    ...tags,
  ]);
  const isPublished = params.isPublished ?? false;

  await db.collection("kb_articles").doc(id).set({
    categoryId: params.categoryId,
    slug,
    titleAr: params.titleAr.trim(),
    titleEn: params.titleEn.trim(),
    summaryAr: params.summaryAr?.trim() ?? null,
    summaryEn: params.summaryEn?.trim() ?? null,
    contentAr: params.contentAr.trim(),
    contentEn: params.contentEn.trim(),
    tags,
    searchTokens,
    isPublished,
    publishedAt: isPublished ? Timestamp.now() : null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateKbArticle(
  articleId: string,
  updates: Partial<{
    categoryId: string;
    titleAr: string;
    titleEn: string;
    summaryAr: string | null;
    summaryEn: string | null;
    contentAr: string;
    contentEn: string;
    tags: string[];
    slug: string | null;
    isPublished: boolean;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };

  if (updates.titleAr) {
    payload.titleAr = updates.titleAr.trim();
  }
  if (updates.titleEn) {
    payload.titleEn = updates.titleEn.trim();
  }
  if (updates.summaryAr !== undefined) {
    payload.summaryAr = updates.summaryAr?.trim() ?? null;
  }
  if (updates.summaryEn !== undefined) {
    payload.summaryEn = updates.summaryEn?.trim() ?? null;
  }
  if (updates.contentAr) {
    payload.contentAr = updates.contentAr.trim();
  }
  if (updates.contentEn) {
    payload.contentEn = updates.contentEn.trim();
  }
  if (updates.slug !== undefined && updates.slug !== null) {
    payload.slug = slugify(updates.slug);
  }
  if (updates.tags) {
    payload.tags = normalizeTags(updates.tags);
  }

  const shouldRebuildTokens = [
    "titleAr",
    "titleEn",
    "summaryAr",
    "summaryEn",
    "tags",
  ].some((field) => field in updates);

  if (shouldRebuildTokens) {
    const snapshot = await db.collection("kb_articles").doc(articleId).get();
    const data = snapshot.data() ?? {};
    const tokens = buildSearchTokens([
      updates.titleAr ?? data.titleAr ?? "",
      updates.titleEn ?? data.titleEn ?? "",
      updates.summaryAr ?? data.summaryAr ?? "",
      updates.summaryEn ?? data.summaryEn ?? "",
      ...(normalizeTags(updates.tags ?? data.tags ?? []) ?? []),
    ]);
    payload.searchTokens = tokens;
  }

  if (updates.isPublished !== undefined) {
    payload.isPublished = updates.isPublished;
    payload.publishedAt = updates.isPublished ? Timestamp.now() : null;
  }

  await db.collection("kb_articles").doc(articleId).set(payload, { merge: true });
}

export async function listKbGlossaryTerms(params?: { query?: string | null }) {
  let queryRef: Query = db.collection("kb_glossary");
  const tokens = buildSearchTokens([params?.query ?? ""]);
  if (tokens.length > 0) {
    queryRef = queryRef.where("searchTokens", "array-contains", tokens[0]);
  } else {
    queryRef = queryRef.orderBy("termEn", "asc");
  }
  const snapshot = await queryRef.limit(200).get();
  const items = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      termAr: data.termAr ?? "",
      termEn: data.termEn ?? "",
      definitionAr: data.definitionAr ?? "",
      definitionEn: data.definitionEn ?? "",
      category: data.category ?? null,
      createdAt: toDate(data.createdAt),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
      searchTokens: data.searchTokens ?? [],
    } as KbGlossaryTerm & { searchTokens: string[] };
  });

  if (tokens.length > 1) {
    return items.filter((item) =>
      tokens.every((token) => (item.searchTokens ?? []).includes(token))
    );
  }

  return items.map((item) => {
    const trimmed = { ...item } as KbGlossaryTerm & { searchTokens?: string[] };
    delete trimmed.searchTokens;
    return trimmed as KbGlossaryTerm;
  });
}

export async function createKbGlossaryTerm(params: {
  termAr: string;
  termEn: string;
  definitionAr: string;
  definitionEn: string;
  category?: string | null;
}) {
  const id = uuidv4();
  const searchTokens = buildSearchTokens([
    params.termAr,
    params.termEn,
    params.definitionAr,
    params.definitionEn,
    params.category ?? "",
  ]);
  await db.collection("kb_glossary").doc(id).set({
    termAr: params.termAr.trim(),
    termEn: params.termEn.trim(),
    definitionAr: params.definitionAr.trim(),
    definitionEn: params.definitionEn.trim(),
    category: params.category?.trim() ?? null,
    searchTokens,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateKbGlossaryTerm(
  termId: string,
  updates: Partial<{
    termAr: string;
    termEn: string;
    definitionAr: string;
    definitionEn: string;
    category: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.termAr) {
    payload.termAr = updates.termAr.trim();
  }
  if (updates.termEn) {
    payload.termEn = updates.termEn.trim();
  }
  if (updates.definitionAr) {
    payload.definitionAr = updates.definitionAr.trim();
  }
  if (updates.definitionEn) {
    payload.definitionEn = updates.definitionEn.trim();
  }
  if (updates.category !== undefined) {
    payload.category = updates.category?.trim() ?? null;
  }

  const shouldRebuild = [
    "termAr",
    "termEn",
    "definitionAr",
    "definitionEn",
    "category",
  ].some((field) => field in updates);

  if (shouldRebuild) {
    const snapshot = await db.collection("kb_glossary").doc(termId).get();
    const data = snapshot.data() ?? {};
    payload.searchTokens = buildSearchTokens([
      updates.termAr ?? data.termAr ?? "",
      updates.termEn ?? data.termEn ?? "",
      updates.definitionAr ?? data.definitionAr ?? "",
      updates.definitionEn ?? data.definitionEn ?? "",
      updates.category ?? data.category ?? "",
    ]);
  }

  await db.collection("kb_glossary").doc(termId).set(payload, { merge: true });
}

export async function createKbFeedback(params: {
  userId: string;
  userEmail?: string | null;
  companyId?: string | null;
  articleId?: string | null;
  page?: string | null;
  rating: number;
  message?: string | null;
  locale?: string | null;
}) {
  const id = uuidv4();
  await db.collection("kb_feedback").doc(id).set({
    userId: params.userId,
    userEmail: params.userEmail ?? null,
    companyId: params.companyId ?? null,
    articleId: params.articleId ?? null,
    page: params.page ?? null,
    rating: params.rating,
    message: params.message?.trim() ?? null,
    locale: params.locale ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}
