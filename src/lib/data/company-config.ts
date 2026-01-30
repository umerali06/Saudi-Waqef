import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { getCache, invalidateCache, setCache } from "@/lib/utils/cache";

export type CompanyConfig = {
  vatEnabled: boolean;
  vatRate: number;
  vatFilingFrequency: "monthly" | "quarterly";
  taxInclusive: boolean;
  invoicePrefix: string;
  invoiceSuffix: string;
  invoiceNextNumber: number;
  invoicePadding: number;
  invoiceResetYearly: boolean;
  invoiceLastResetYear: number | null;
  billPrefix: string;
  billSuffix: string;
  billNextNumber: number;
  billPadding: number;
  billResetYearly: boolean;
  billLastResetYear: number | null;
  creditPrefix: string;
  creditSuffix: string;
  creditNextNumber: number;
  creditPadding: number;
  creditResetYearly: boolean;
  creditLastResetYear: number | null;
  vendorCreditPrefix: string;
  vendorCreditSuffix: string;
  vendorCreditNextNumber: number;
  vendorCreditPadding: number;
  vendorCreditResetYearly: boolean;
  vendorCreditLastResetYear: number | null;
  receiptPrefix: string;
  receiptSuffix: string;
  receiptNextNumber: number;
  receiptPadding: number;
  receiptResetYearly: boolean;
  receiptLastResetYear: number | null;
  vendorPaymentPrefix: string;
  vendorPaymentSuffix: string;
  vendorPaymentNextNumber: number;
  vendorPaymentPadding: number;
  vendorPaymentResetYearly: boolean;
  vendorPaymentLastResetYear: number | null;
  transferPrefix: string;
  transferSuffix: string;
  transferNextNumber: number;
  transferPadding: number;
  transferResetYearly: boolean;
  transferLastResetYear: number | null;
  adjustmentPrefix: string;
  adjustmentSuffix: string;
  adjustmentNextNumber: number;
  adjustmentPadding: number;
  adjustmentResetYearly: boolean;
  adjustmentLastResetYear: number | null;
  expensePrefix: string;
  expenseSuffix: string;
  expenseNextNumber: number;
  expensePadding: number;
  expenseResetYearly: boolean;
  expenseLastResetYear: number | null;
  invoiceTemplate: "classic" | "modern" | "minimal";
  billTemplate: "classic" | "modern" | "minimal";
  signatureName?: string | null;
  signatureTitle?: string | null;
  signatureImageUrl?: string | null;
  signatureEnabled?: boolean;
  dateFormat: "yyyy-MM-dd" | "dd/MM/yyyy" | "MM/dd/yyyy";
  timeFormat: "24h" | "12h";
  roundingPrecision: number;
  roundingMode: "standard" | "up" | "down";
  billApprovalThreshold: number;
  payrollApprovalThreshold: number;
  periodLockDate?: string;
  onboardingCompleted?: boolean;
};

const DEFAULT_CONFIG: CompanyConfig = {
  vatEnabled: true,
  vatRate: 15,
  vatFilingFrequency: "quarterly",
  taxInclusive: false,
  invoicePrefix: "INV-",
  invoiceSuffix: "",
  invoiceNextNumber: 1,
  invoicePadding: 0,
  invoiceResetYearly: false,
  invoiceLastResetYear: null,
  billPrefix: "BILL-",
  billSuffix: "",
  billNextNumber: 1,
  billPadding: 0,
  billResetYearly: false,
  billLastResetYear: null,
  creditPrefix: "CR-",
  creditSuffix: "",
  creditNextNumber: 1,
  creditPadding: 0,
  creditResetYearly: false,
  creditLastResetYear: null,
  vendorCreditPrefix: "VCR-",
  vendorCreditSuffix: "",
  vendorCreditNextNumber: 1,
  vendorCreditPadding: 0,
  vendorCreditResetYearly: false,
  vendorCreditLastResetYear: null,
  receiptPrefix: "RCPT-",
  receiptSuffix: "",
  receiptNextNumber: 1,
  receiptPadding: 0,
  receiptResetYearly: false,
  receiptLastResetYear: null,
  vendorPaymentPrefix: "VPAY-",
  vendorPaymentSuffix: "",
  vendorPaymentNextNumber: 1,
  vendorPaymentPadding: 0,
  vendorPaymentResetYearly: false,
  vendorPaymentLastResetYear: null,
  transferPrefix: "TRF-",
  transferSuffix: "",
  transferNextNumber: 1,
  transferPadding: 0,
  transferResetYearly: false,
  transferLastResetYear: null,
  adjustmentPrefix: "ADJ-",
  adjustmentSuffix: "",
  adjustmentNextNumber: 1,
  adjustmentPadding: 0,
  adjustmentResetYearly: false,
  adjustmentLastResetYear: null,
  expensePrefix: "EXP-",
  expenseSuffix: "",
  expenseNextNumber: 1,
  expensePadding: 0,
  expenseResetYearly: false,
  expenseLastResetYear: null,
  invoiceTemplate: "classic",
  billTemplate: "classic",
  signatureEnabled: false,
  signatureName: null,
  signatureTitle: null,
  signatureImageUrl: null,
  dateFormat: "yyyy-MM-dd",
  timeFormat: "24h",
  roundingPrecision: 2,
  roundingMode: "standard",
  billApprovalThreshold: 0,
  payrollApprovalThreshold: 0,
  onboardingCompleted: false,
};

export async function getCompanyConfig(companyId: string) {
  const cacheKey = `company_config:${companyId}`;
  const cached = getCache<CompanyConfig>(cacheKey);
  if (cached) {
    return cached;
  }
  const doc = await db.collection("company_configs").doc(companyId).get();
  if (!doc.exists) {
    return setCache(cacheKey, { ...DEFAULT_CONFIG });
  }
  const data = doc.data()!;
  return setCache(cacheKey, {
    ...DEFAULT_CONFIG,
    ...data,
  } as CompanyConfig);
}

export async function updateCompanyConfig(
  companyId: string,
  updates: Partial<CompanyConfig>
) {
  await db.collection("company_configs").doc(companyId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  invalidateCache(`company_config:${companyId}`);
}
