import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { getCache, invalidateCache, setCache } from "@/lib/utils/cache";
export type ChartAccountTemplateItem = {
  code: string;
  name: string;
  type: ChartAccount["type"];
  parentCode?: string;
  isPosting: boolean;
  system?: boolean;
};

export type ChartAccount = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense" | "cogs";
  parentId?: string | null;
  isPosting: boolean;
  status: "active" | "inactive";
  system: boolean;
  createdAt: Date;
};

export async function listChartAccounts(companyId: string) {
  const cacheKey = `chart_accounts:${companyId}`;
  const cached = getCache<ChartAccount[]>(cacheKey);
  if (cached) {
    return cached;
  }
  const snapshot = await db
    .collection("chart_accounts")
    .where("companyId", "==", companyId)
    .get();

  const accounts = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      code: data.code,
      name: data.name,
      type: data.type,
      parentId: data.parentId ?? null,
      isPosting: data.isPosting,
      status: data.status,
      system: data.system ?? false,
      createdAt: data.createdAt.toDate(),
    } as ChartAccount;
  });

  return setCache(
    cacheKey,
    accounts.sort((a, b) => a.code.localeCompare(b.code))
  );
}

export async function hasChartAccounts(companyId: string) {
  const snapshot = await db
    .collection("chart_accounts")
    .where("companyId", "==", companyId)
    .limit(1)
    .get();
  return !snapshot.empty;
}

export async function createChartAccount(params: {
  companyId: string;
  code: string;
  name: string;
  type: ChartAccount["type"];
  parentId?: string | null;
  isPosting?: boolean;
  status?: ChartAccount["status"];
  system?: boolean;
}) {
  const id = uuidv4();
  await db.collection("chart_accounts").doc(id).set({
    companyId: params.companyId,
    code: params.code,
    name: params.name,
    type: params.type,
    parentId: params.parentId ?? null,
    isPosting: params.isPosting ?? true,
    status: params.status ?? "active",
    system: params.system ?? false,
    createdAt: Timestamp.now(),
  });
  invalidateCache(`chart_accounts:${params.companyId}`);
  return id;
}

export async function getChartAccount(accountId: string) {
  const doc = await db.collection("chart_accounts").doc(accountId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    code: data.code,
    name: data.name,
    type: data.type,
    parentId: data.parentId ?? null,
    isPosting: data.isPosting,
    status: data.status,
    system: data.system ?? false,
    createdAt: data.createdAt.toDate(),
  } as ChartAccount;
}

export async function getChartAccountByCode(companyId: string, code: string) {
  const snapshot = await db
    .collection("chart_accounts")
    .where("companyId", "==", companyId)
    .where("code", "==", code)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }
  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    companyId: data.companyId,
    code: data.code,
    name: data.name,
    type: data.type,
    parentId: data.parentId ?? null,
    isPosting: data.isPosting,
    status: data.status,
    system: data.system ?? false,
    createdAt: data.createdAt.toDate(),
  } as ChartAccount;
}

export async function hasChildAccounts(accountId: string) {
  const snapshot = await db
    .collection("chart_accounts")
    .where("parentId", "==", accountId)
    .limit(1)
    .get();
  return !snapshot.empty;
}

export async function updateChartAccount(
  accountId: string,
  updates: Partial<
    Pick<ChartAccount, "code" | "name" | "status" | "parentId" | "type" | "isPosting">
  >
) {
  await db.collection("chart_accounts").doc(accountId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  const updated = await getChartAccount(accountId);
  if (updated?.companyId) {
    invalidateCache(`chart_accounts:${updated.companyId}`);
  }
}

export async function createChartAccountsFromTemplate(
  companyId: string,
  template: ChartAccountTemplateItem[]
) {
  const exists = await hasChartAccounts(companyId);
  if (exists) {
    return { seeded: false };
  }

  const batch = db.batch();
  const idByCode = new Map<string, string>();

  for (const account of template) {
    const id = uuidv4();
    idByCode.set(account.code, id);
    const ref = db.collection("chart_accounts").doc(id);
    batch.set(ref, {
      companyId,
      code: account.code,
      name: account.name,
      type: account.type,
      parentId: null,
      isPosting: account.isPosting,
      status: "active",
      system: account.system ?? false,
      createdAt: Timestamp.now(),
    });
  }

  await batch.commit();

  const parentBatch = db.batch();
  let hasParentUpdates = false;
  for (const account of template) {
    if (!account.parentCode) {
      continue;
    }
    const accountId = idByCode.get(account.code);
    const parentId = idByCode.get(account.parentCode) ?? null;
    if (!accountId) {
      continue;
    }
    parentBatch.set(
      db.collection("chart_accounts").doc(accountId),
      { parentId, updatedAt: Timestamp.now() },
      { merge: true }
    );
    hasParentUpdates = true;
  }

  if (hasParentUpdates) {
    await parentBatch.commit();
  }
  invalidateCache(`chart_accounts:${companyId}`);
  return { seeded: true };
}
