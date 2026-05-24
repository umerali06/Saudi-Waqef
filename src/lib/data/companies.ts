import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import type { CompanySummary, Role } from "@/lib/types";
import { listMembershipsByUser } from "@/lib/data/memberships";

export type CompanyRecord = {
  id: string;
  name: string;
  currency: string;
  vatNumber?: string;
  legalName?: string;
  crNumber?: string;
  address?: string;
  fiscalYearStart?: string;
  timezone?: string;
  defaultLanguage?: "ar" | "en";
  status?: "active" | "suspended";
  createdAt: Date;
};

export async function createCompany(params: {
  id: string;
  name: string;
  currency?: string;
  vatNumber?: string;
  legalName?: string;
  crNumber?: string;
  address?: string;
  fiscalYearStart?: string;
  timezone?: string;
  defaultLanguage?: "ar" | "en";
  status?: "active" | "suspended";
}) {
  await db.collection("companies").doc(params.id).set({
    name: params.name.trim(),
    currency: params.currency ?? "SAR",
    vatNumber: params.vatNumber ?? null,
    legalName: params.legalName ?? null,
    crNumber: params.crNumber ?? null,
    address: params.address ?? null,
    fiscalYearStart: params.fiscalYearStart ?? null,
    timezone: params.timezone ?? "Asia/Riyadh",
    defaultLanguage: params.defaultLanguage ?? "ar",
    status: params.status ?? "active",
    createdAt: Timestamp.now(),
  });
}

export async function getCompanyById(companyId: string) {
  const doc = await db.collection("companies").doc(companyId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    currency: data.currency,
    vatNumber: data.vatNumber ?? undefined,
    legalName: data.legalName ?? undefined,
    crNumber: data.crNumber ?? undefined,
    address: data.address ?? undefined,
    fiscalYearStart: data.fiscalYearStart ?? undefined,
    timezone: data.timezone ?? undefined,
    defaultLanguage: data.defaultLanguage ?? "ar",
    status: data.status ?? "active",
    createdAt: data.createdAt.toDate(),
  } as CompanyRecord;
}

export async function updateCompany(
  companyId: string,
  updates: Partial<Omit<CompanyRecord, "id" | "createdAt">>
) {
  await db.collection("companies").doc(companyId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function listCompaniesForUser(
  userId: string,
  options?: { includeSuspended?: boolean }
) {
  const memberships = await listMembershipsByUser(userId);
  const companies: CompanySummary[] = [];

  for (const membership of memberships) {
    const company = await getCompanyById(membership.companyId);
    if (company) {
      if (!options?.includeSuspended && company.status === "suspended") {
        continue;
      }
      companies.push({
        id: company.id,
        name: company.name,
        role: membership.role as Role,
      });
    }
  }

  return companies;
}

export async function updateCompanyStatus(
  companyId: string,
  status: "active" | "suspended"
) {
  await db.collection("companies").doc(companyId).set(
    {
      status,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function listActiveCompanies(options?: { limit?: number }) {
  const limit = options?.limit && options.limit > 0 ? options.limit : 500;
  const snapshot = await db
    .collection("companies")
    .where("status", "==", "active")
    .limit(limit)
    .get();

  const companies = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: String(data.name ?? "").trim(),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(0),
    };
  });

  return companies
    .filter((company) => company.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}
