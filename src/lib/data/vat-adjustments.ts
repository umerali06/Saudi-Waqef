import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type VatAdjustmentType = "output" | "input";

export type VatAdjustment = {
  id: string;
  companyId: string;
  periodId: string;
  type: VatAdjustmentType;
  amount: number;
  reason: string;
  createdBy?: string | null;
  createdByEmail?: string | null;
  createdAt: Date;
};

export async function listVatAdjustments(companyId: string, periodId: string) {
  const snapshot = await db
    .collection("vat_adjustments")
    .where("companyId", "==", companyId)
    .where("periodId", "==", periodId)
    .get();

  const adjustments = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      periodId: data.periodId,
      type: data.type,
      amount: data.amount ?? 0,
      reason: data.reason ?? "",
      createdBy: data.createdBy ?? null,
      createdByEmail: data.createdByEmail ?? null,
      createdAt: data.createdAt.toDate(),
    } as VatAdjustment;
  });

  return adjustments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function createVatAdjustment(params: {
  companyId: string;
  periodId: string;
  type: VatAdjustmentType;
  amount: number;
  reason: string;
  createdBy?: string | null;
  createdByEmail?: string | null;
}) {
  const id = uuidv4();
  await db.collection("vat_adjustments").doc(id).set({
    companyId: params.companyId,
    periodId: params.periodId,
    type: params.type,
    amount: params.amount,
    reason: params.reason.trim(),
    createdBy: params.createdBy ?? null,
    createdByEmail: params.createdByEmail ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}
