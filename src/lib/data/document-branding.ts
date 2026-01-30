import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type DocumentBranding = {
  logoUrl: string | null;
  header: string | null;
  footer: string | null;
  accentColor: string | null;
};

const DEFAULT_BRANDING: DocumentBranding = {
  logoUrl: null,
  header: null,
  footer: null,
  accentColor: null,
};

export async function getDocumentBranding(companyId: string) {
  const doc = await db.collection("document_branding").doc(companyId).get();
  if (!doc.exists) {
    return { ...DEFAULT_BRANDING };
  }
  const data = doc.data()!;
  return {
    logoUrl: data.logoUrl ?? null,
    header: data.header ?? null,
    footer: data.footer ?? null,
    accentColor: data.accentColor ?? null,
  } as DocumentBranding;
}

export async function updateDocumentBranding(
  companyId: string,
  updates: Partial<DocumentBranding>
) {
  await db.collection("document_branding").doc(companyId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
