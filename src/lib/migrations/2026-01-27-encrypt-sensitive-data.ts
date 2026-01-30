import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { encryptString } from "@/lib/security/crypto";
import type { Migration } from "@/lib/migrations/types";

const ENCRYPTION_PREFIX = "enc:v1:";
const PAGE_SIZE = 200;
const BATCH_LIMIT = 400;

const isEncrypted = (value: string) => value.startsWith(ENCRYPTION_PREFIX);

const coerceString = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
};

type SalaryPayload = {
  basic: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  deductions: number;
  currency: string;
};

type SalarySource = Partial<SalaryPayload> & Record<string, unknown>;

const normalizeSalary = (raw: SalarySource | null | undefined): SalaryPayload => ({
  basic: Number(raw?.basic ?? 0),
  housingAllowance: Number(raw?.housingAllowance ?? 0),
  transportAllowance: Number(raw?.transportAllowance ?? 0),
  otherAllowance: Number(raw?.otherAllowance ?? 0),
  deductions: Number(raw?.deductions ?? 0),
  currency: typeof raw?.currency === "string" ? raw.currency : "SAR",
});

async function processCollection(params: {
  collection: string;
  dryRun: boolean;
  log: (message: string) => void;
  getUpdates: (data: Record<string, unknown>, docId: string) => Record<string, unknown> | null;
}) {
  let scanned = 0;
  let updated = 0;
  let lastDoc: QueryDocumentSnapshot | null = null;
  let batch = db.batch();
  let batchCount = 0;

  const commitBatch = async () => {
    if (params.dryRun || batchCount === 0) {
      return;
    }
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  while (true) {
    let query = db.collection(params.collection).orderBy("__name__").limit(PAGE_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }
    for (const doc of snapshot.docs) {
      scanned += 1;
      const updates = params.getUpdates(doc.data(), doc.id);
      if (updates && Object.keys(updates).length > 0) {
        updated += 1;
        if (!params.dryRun) {
          batch.set(doc.ref, updates, { merge: true });
          batchCount += 1;
          if (batchCount >= BATCH_LIMIT) {
            await commitBatch();
          }
        }
      }
    }
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  await commitBatch();

  params.log(
    `${params.collection}: scanned ${scanned}, updated ${updated}${
      params.dryRun ? " (dry run)" : ""
    }`
  );

  return { scanned, updated };
}

const migration: Migration = {
  id: "2026-01-27-encrypt-sensitive-data",
  title: "Encrypt legacy sensitive data",
  description:
    "Encrypt legacy employee PII, bank IBANs, and contract salary data to match current security storage.",
  async up(context) {
    const notes: string[] = [];
    let scanned = 0;
    let updated = 0;

    const employeeResult = await processCollection({
      collection: "employees",
      dryRun: context.dryRun,
      log: context.log,
      getUpdates: (data) => {
        const fields = [
          "nationalId",
          "iqamaNumber",
          "passportNumber",
          "dob",
          "email",
          "phone",
          "address",
        ];
        const updates: Record<string, unknown> = {};
        fields.forEach((field) => {
          const value = coerceString(data[field]);
          if (!value || isEncrypted(value)) {
            return;
          }
          updates[field] = encryptString(value);
        });
        return Object.keys(updates).length > 0 ? updates : null;
      },
    });
    scanned += employeeResult.scanned;
    updated += employeeResult.updated;
    notes.push(`Employees: ${employeeResult.scanned} scanned, ${employeeResult.updated} updated`);

    const bankResult = await processCollection({
      collection: "cash_bank_accounts",
      dryRun: context.dryRun,
      log: context.log,
      getUpdates: (data) => {
        const ibanValue = coerceString(data.iban);
        if (!ibanValue || isEncrypted(ibanValue)) {
          return null;
        }
        return { iban: encryptString(ibanValue) };
      },
    });
    scanned += bankResult.scanned;
    updated += bankResult.updated;
    notes.push(
      `Cash/bank accounts: ${bankResult.scanned} scanned, ${bankResult.updated} updated`
    );

    const contractResult = await processCollection({
      collection: "employee_contracts",
      dryRun: context.dryRun,
      log: context.log,
      getUpdates: (data, docId) => {
        const salaryEnc =
          typeof data.salaryEnc === "string" && data.salaryEnc.length > 0
            ? data.salaryEnc
            : null;
        if (salaryEnc && isEncrypted(salaryEnc)) {
          return null;
        }

        let salarySource: SalarySource | null = null;
        if (salaryEnc && !isEncrypted(salaryEnc)) {
          try {
            const parsed: unknown = JSON.parse(salaryEnc);
            if (parsed && typeof parsed === "object") {
              salarySource = parsed as SalarySource;
            }
          } catch {
            context.log(`employee_contracts/${docId}: invalid salaryEnc JSON.`);
          }
        }

        if (!salarySource) {
          const legacySalary = data.salary;
          if (legacySalary && typeof legacySalary === "object") {
            salarySource = legacySalary as SalarySource;
          }
        }

        if (!salarySource) {
          return null;
        }

        const normalized = normalizeSalary(salarySource);
        return {
          salaryEnc: encryptString(JSON.stringify(normalized)),
          salary: null,
        };
      },
    });
    scanned += contractResult.scanned;
    updated += contractResult.updated;
    notes.push(
      `Employee contracts: ${contractResult.scanned} scanned, ${contractResult.updated} updated`
    );

    return {
      scanned,
      updated,
      notes,
    };
  },
};

export default migration;
