import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { decryptOptional, encryptOptional } from "@/lib/security/crypto";

export type EmployeeStatus = "active" | "suspended" | "terminated";
export type EmployeeGender = "male" | "female";
export type EmploymentType = "full_time" | "part_time" | "contractor" | "temporary";

export type EmployeeOnboardingTask = {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
};

export type EmployeeRecord = {
  id: string;
  companyId: string;
  employeeNumber?: string | null;
  nameAr: string;
  nameEn: string;
  nationalId?: string | null;
  iqamaNumber?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  dob?: string | null;
  gender?: EmployeeGender | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  hireDate?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  userId?: string | null;
  employmentType?: EmploymentType | null;
  status: EmployeeStatus;
  terminationDate?: string | null;
  terminationReason?: string | null;
  notes?: string | null;
  onboarding?: EmployeeOnboardingTask[];
  createdAt: Date;
  updatedAt?: Date;
};

export async function listEmployees(companyId: string) {
  const snapshot = await db
    .collection("employees")
    .where("companyId", "==", companyId)
    .get();

  const employees = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      employeeNumber: data.employeeNumber ?? null,
      nameAr: data.nameAr ?? "",
      nameEn: data.nameEn ?? "",
      nationalId: decryptOptional(data.nationalId ?? null),
      iqamaNumber: decryptOptional(data.iqamaNumber ?? null),
      passportNumber: decryptOptional(data.passportNumber ?? null),
      nationality: data.nationality ?? null,
      dob: decryptOptional(data.dob ?? null),
      gender: data.gender ?? null,
      email: decryptOptional(data.email ?? null),
      phone: decryptOptional(data.phone ?? null),
      address: decryptOptional(data.address ?? null),
      hireDate: data.hireDate ?? null,
      departmentId: data.departmentId ?? null,
      positionId: data.positionId ?? null,
      managerId: data.managerId ?? null,
      userId: data.userId ?? null,
      employmentType: data.employmentType ?? null,
      status: data.status ?? "active",
      terminationDate: data.terminationDate ?? null,
      terminationReason: data.terminationReason ?? null,
      notes: data.notes ?? null,
      onboarding: data.onboarding ?? [],
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as EmployeeRecord;
  });

  return employees.sort((a, b) => {
    const aName = a.nameEn || a.nameAr;
    const bName = b.nameEn || b.nameAr;
    return aName.localeCompare(bName);
  });
}

export async function getEmployeeById(employeeId: string) {
  const doc = await db.collection("employees").doc(employeeId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    employeeNumber: data.employeeNumber ?? null,
    nameAr: data.nameAr ?? "",
    nameEn: data.nameEn ?? "",
    nationalId: decryptOptional(data.nationalId ?? null),
    iqamaNumber: decryptOptional(data.iqamaNumber ?? null),
    passportNumber: decryptOptional(data.passportNumber ?? null),
    nationality: data.nationality ?? null,
    dob: decryptOptional(data.dob ?? null),
    gender: data.gender ?? null,
    email: decryptOptional(data.email ?? null),
    phone: decryptOptional(data.phone ?? null),
    address: decryptOptional(data.address ?? null),
    hireDate: data.hireDate ?? null,
    departmentId: data.departmentId ?? null,
    positionId: data.positionId ?? null,
    managerId: data.managerId ?? null,
    userId: data.userId ?? null,
    employmentType: data.employmentType ?? null,
    status: data.status ?? "active",
    terminationDate: data.terminationDate ?? null,
    terminationReason: data.terminationReason ?? null,
    notes: data.notes ?? null,
    onboarding: data.onboarding ?? [],
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  } as EmployeeRecord;
}

export async function getEmployeeByUserId(companyId: string, userId: string) {
  const snapshot = await db
    .collection("employees")
    .where("companyId", "==", companyId)
    .where("userId", "==", userId)
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
    employeeNumber: data.employeeNumber ?? null,
    nameAr: data.nameAr ?? "",
    nameEn: data.nameEn ?? "",
    nationalId: decryptOptional(data.nationalId ?? null),
    iqamaNumber: decryptOptional(data.iqamaNumber ?? null),
    passportNumber: decryptOptional(data.passportNumber ?? null),
    nationality: data.nationality ?? null,
    dob: decryptOptional(data.dob ?? null),
    gender: data.gender ?? null,
    email: decryptOptional(data.email ?? null),
    phone: decryptOptional(data.phone ?? null),
    address: decryptOptional(data.address ?? null),
    hireDate: data.hireDate ?? null,
    departmentId: data.departmentId ?? null,
    positionId: data.positionId ?? null,
    managerId: data.managerId ?? null,
    userId: data.userId ?? null,
    employmentType: data.employmentType ?? null,
    status: data.status ?? "active",
    terminationDate: data.terminationDate ?? null,
    terminationReason: data.terminationReason ?? null,
    notes: data.notes ?? null,
    onboarding: data.onboarding ?? [],
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  } as EmployeeRecord;
}

export async function createEmployee(params: {
  companyId: string;
  employeeNumber?: string | null;
  nameAr: string;
  nameEn: string;
  nationalId?: string | null;
  iqamaNumber?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  dob?: string | null;
  gender?: EmployeeGender | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  hireDate?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  userId?: string | null;
  employmentType?: EmploymentType | null;
  status?: EmployeeStatus;
  terminationDate?: string | null;
  terminationReason?: string | null;
  notes?: string | null;
  onboarding?: EmployeeOnboardingTask[];
}) {
  const id = uuidv4();
  await db.collection("employees").doc(id).set({
    companyId: params.companyId,
    employeeNumber: params.employeeNumber ?? null,
    employeeNumberNormalized: normalizeSearch(params.employeeNumber ?? ""),
    nameAr: params.nameAr.trim(),
    nameEn: params.nameEn.trim(),
    nameArNormalized: normalizeSearch(params.nameAr),
    nameEnNormalized: normalizeSearch(params.nameEn),
    nationalId: encryptOptional(params.nationalId ?? null),
    nationalIdNormalized: normalizeSearch(params.nationalId ?? ""),
    iqamaNumber: encryptOptional(params.iqamaNumber ?? null),
    iqamaNumberNormalized: normalizeSearch(params.iqamaNumber ?? ""),
    passportNumber: encryptOptional(params.passportNumber ?? null),
    nationality: params.nationality ?? null,
    dob: encryptOptional(params.dob ?? null),
    gender: params.gender ?? null,
    email: encryptOptional(params.email ?? null),
    emailNormalized: normalizeSearch(params.email ?? ""),
    phone: encryptOptional(params.phone ?? null),
    address: encryptOptional(params.address ?? null),
    hireDate: params.hireDate ?? null,
    departmentId: params.departmentId ?? null,
    positionId: params.positionId ?? null,
    managerId: params.managerId ?? null,
    userId: params.userId ?? null,
    employmentType: params.employmentType ?? null,
    status: params.status ?? "active",
    terminationDate: params.terminationDate ?? null,
    terminationReason: params.terminationReason ?? null,
    notes: params.notes ?? null,
    onboarding: params.onboarding ?? [],
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateEmployee(
  employeeId: string,
  updates: Partial<{
    employeeNumber: string | null;
    nameAr: string;
    nameEn: string;
    nationalId: string | null;
    iqamaNumber: string | null;
    passportNumber: string | null;
    nationality: string | null;
    dob: string | null;
    gender: EmployeeGender | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    hireDate: string | null;
    departmentId: string | null;
    positionId: string | null;
    managerId: string | null;
    userId: string | null;
    employmentType: EmploymentType | null;
    status: EmployeeStatus;
    terminationDate: string | null;
    terminationReason: string | null;
    notes: string | null;
    onboarding: EmployeeOnboardingTask[];
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.employeeNumber !== undefined) {
    payload.employeeNumberNormalized = normalizeSearch(updates.employeeNumber ?? "");
  }
  if (updates.nameAr) {
    payload.nameArNormalized = normalizeSearch(updates.nameAr);
  }
  if (updates.nameEn) {
    payload.nameEnNormalized = normalizeSearch(updates.nameEn);
  }
  if (updates.nationalId !== undefined) {
    payload.nationalId = encryptOptional(updates.nationalId);
    payload.nationalIdNormalized = normalizeSearch(updates.nationalId ?? "");
  }
  if (updates.iqamaNumber !== undefined) {
    payload.iqamaNumber = encryptOptional(updates.iqamaNumber);
    payload.iqamaNumberNormalized = normalizeSearch(updates.iqamaNumber ?? "");
  }
  if (updates.passportNumber !== undefined) {
    payload.passportNumber = encryptOptional(updates.passportNumber);
  }
  if (updates.dob !== undefined) {
    payload.dob = encryptOptional(updates.dob);
  }
  if (updates.email !== undefined) {
    payload.email = encryptOptional(updates.email);
    payload.emailNormalized = normalizeSearch(updates.email ?? "");
  }
  if (updates.phone !== undefined) {
    payload.phone = encryptOptional(updates.phone);
  }
  if (updates.address !== undefined) {
    payload.address = encryptOptional(updates.address);
  }
  await db.collection("employees").doc(employeeId).set(payload, { merge: true });
}
