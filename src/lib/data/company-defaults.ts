import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { getCache, invalidateCache, setCache } from "@/lib/utils/cache";

export type CompanyDefaults = {
  salesAccountId: string | null;
  purchasesAccountId: string | null;
  vatOutputAccountId: string | null;
  vatInputAccountId: string | null;
  discountAccountId: string | null;
  receivableAccountId: string | null;
  payableAccountId: string | null;
  defaultSalesTaxCategoryId: string | null;
  defaultPurchaseTaxCategoryId: string | null;
  defaultSalesPaymentTermId: string | null;
  defaultPurchasePaymentTermId: string | null;
};

const DEFAULTS: CompanyDefaults = {
  salesAccountId: null,
  purchasesAccountId: null,
  vatOutputAccountId: null,
  vatInputAccountId: null,
  discountAccountId: null,
  receivableAccountId: null,
  payableAccountId: null,
  defaultSalesTaxCategoryId: null,
  defaultPurchaseTaxCategoryId: null,
  defaultSalesPaymentTermId: null,
  defaultPurchasePaymentTermId: null,
};

export async function getCompanyDefaults(companyId: string) {
  const cacheKey = `company_defaults:${companyId}`;
  const cached = getCache<CompanyDefaults>(cacheKey);
  if (cached) {
    return cached;
  }
  const doc = await db.collection("company_defaults").doc(companyId).get();
  if (!doc.exists) {
    return setCache(cacheKey, { ...DEFAULTS });
  }
  const data = doc.data()!;
  return setCache(cacheKey, {
    salesAccountId: data.salesAccountId ?? null,
    purchasesAccountId: data.purchasesAccountId ?? null,
    vatOutputAccountId: data.vatOutputAccountId ?? null,
    vatInputAccountId: data.vatInputAccountId ?? null,
    discountAccountId: data.discountAccountId ?? null,
    receivableAccountId: data.receivableAccountId ?? null,
    payableAccountId: data.payableAccountId ?? null,
    defaultSalesTaxCategoryId: data.defaultSalesTaxCategoryId ?? null,
    defaultPurchaseTaxCategoryId: data.defaultPurchaseTaxCategoryId ?? null,
    defaultSalesPaymentTermId: data.defaultSalesPaymentTermId ?? null,
    defaultPurchasePaymentTermId: data.defaultPurchasePaymentTermId ?? null,
  } as CompanyDefaults);
}

export async function updateCompanyDefaults(
  companyId: string,
  updates: Partial<CompanyDefaults>
) {
  await db.collection("company_defaults").doc(companyId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  invalidateCache(`company_defaults:${companyId}`);
}
