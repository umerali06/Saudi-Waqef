import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { decryptString, encryptString } from "@/lib/security/crypto";

export type ContractStatus = "draft" | "active" | "ended";
export type ContractType = "full_time" | "part_time" | "temporary" | "contractor";

export type EmployeeContractRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  type: ContractType;
  status: ContractStatus;
  startDate?: string | null;
  endDate?: string | null;
  probationEndDate?: string | null;
  salary: {
    basic: number;
    housingAllowance: number;
    transportAllowance: number;
    otherAllowance: number;
    deductions: number;
    currency: string;
  };
  notes?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

type SalarySource = {
  salaryEnc?: string | null;
  salary?: Partial<{
    basic: number;
    housingAllowance: number;
    transportAllowance: number;
    otherAllowance: number;
    deductions: number;
    currency: string;
  }> | null;
};

function parseSalary(data: SalarySource) {
  if (data.salaryEnc) {
    try {
      const decrypted = decryptString(data.salaryEnc);
      const parsed = JSON.parse(decrypted);
      return {
        basic: Number(parsed.basic ?? 0),
        housingAllowance: Number(parsed.housingAllowance ?? 0),
        transportAllowance: Number(parsed.transportAllowance ?? 0),
        otherAllowance: Number(parsed.otherAllowance ?? 0),
        deductions: Number(parsed.deductions ?? 0),
        currency: parsed.currency ?? "SAR",
      };
    } catch {
      // Fallback to legacy fields if decryption fails.
    }
  }
  return {
    basic: data.salary?.basic ?? 0,
    housingAllowance: data.salary?.housingAllowance ?? 0,
    transportAllowance: data.salary?.transportAllowance ?? 0,
    otherAllowance: data.salary?.otherAllowance ?? 0,
    deductions: data.salary?.deductions ?? 0,
    currency: data.salary?.currency ?? "SAR",
  };
}

export async function listEmployeeContracts(employeeId: string) {
  const snapshot = await db
    .collection("employee_contracts")
    .where("employeeId", "==", employeeId)
    .get();

  const contracts = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      employeeId: data.employeeId,
      type: data.type ?? "full_time",
      status: data.status ?? "draft",
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      probationEndDate: data.probationEndDate ?? null,
      salary: parseSalary(data),
      notes: data.notes ?? null,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as EmployeeContractRecord;
  });

  return contracts.sort((a, b) => {
    const aStart = a.startDate ?? "";
    const bStart = b.startDate ?? "";
    return bStart.localeCompare(aStart);
  });
}

export async function getEmployeeContractById(contractId: string) {
  const doc = await db.collection("employee_contracts").doc(contractId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    employeeId: data.employeeId,
    type: data.type ?? "full_time",
    status: data.status ?? "draft",
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    probationEndDate: data.probationEndDate ?? null,
    salary: parseSalary(data),
    notes: data.notes ?? null,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  } as EmployeeContractRecord;
}

export async function createEmployeeContract(params: {
  companyId: string;
  employeeId: string;
  type: ContractType;
  status: ContractStatus;
  startDate?: string | null;
  endDate?: string | null;
  probationEndDate?: string | null;
  salary: {
    basic: number;
    housingAllowance: number;
    transportAllowance: number;
    otherAllowance: number;
    deductions: number;
    currency?: string | null;
  };
  notes?: string | null;
}) {
  const id = uuidv4();
  await db.collection("employee_contracts").doc(id).set({
    companyId: params.companyId,
    employeeId: params.employeeId,
    type: params.type,
    status: params.status,
    startDate: params.startDate ?? null,
    endDate: params.endDate ?? null,
    probationEndDate: params.probationEndDate ?? null,
    salaryEnc: encryptString(
      JSON.stringify({
        basic: params.salary.basic,
        housingAllowance: params.salary.housingAllowance,
        transportAllowance: params.salary.transportAllowance,
        otherAllowance: params.salary.otherAllowance,
        deductions: params.salary.deductions,
        currency: params.salary.currency ?? "SAR",
      })
    ),
    notes: params.notes ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateEmployeeContract(
  contractId: string,
  updates: Partial<{
    type: ContractType;
    status: ContractStatus;
    startDate: string | null;
    endDate: string | null;
    probationEndDate: string | null;
    salary: {
      basic: number;
      housingAllowance: number;
      transportAllowance: number;
      otherAllowance: number;
      deductions: number;
      currency?: string | null;
    };
    notes: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.salary) {
    payload.salaryEnc = encryptString(
      JSON.stringify({
        basic: updates.salary.basic,
        housingAllowance: updates.salary.housingAllowance,
        transportAllowance: updates.salary.transportAllowance,
        otherAllowance: updates.salary.otherAllowance,
        deductions: updates.salary.deductions,
        currency: updates.salary.currency ?? "SAR",
      })
    );
    payload.salary = null;
  }
  await db.collection("employee_contracts").doc(contractId).set(payload, { merge: true });
}

export async function endOtherActiveContracts(employeeId: string, exceptId?: string) {
  const snapshot = await db
    .collection("employee_contracts")
    .where("employeeId", "==", employeeId)
    .where("status", "==", "active")
    .get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    if (exceptId && doc.id === exceptId) {
      return;
    }
    batch.set(
      db.collection("employee_contracts").doc(doc.id),
      { status: "ended", updatedAt: Timestamp.now() },
      { merge: true }
    );
  });
  await batch.commit();
}
