import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { buildSequenceNumber } from "@/lib/utils/numbering";
import { normalizeSearch } from "@/lib/utils/search";

const MAX_ATTEMPTS = 20;

/**
 * Takes the next free number of a document type. It only reads; call `save()`
 * with the other writes of the transaction to move the counter on.
 */
export async function nextDocumentNumber(
  tx: Transaction,
  params: {
    companyId: string;
    key: string;
    defaultPrefix: string;
    collection: string;
    field: string;
    date: string;
  }
) {
  const { key } = params;
  const configRef = db.collection("company_configs").doc(params.companyId);
  const config = (await tx.get(configRef)).data() ?? {};
  const read = <T>(name: string, type: "string" | "number" | "boolean", fallback: T) =>
    typeof config[`${key}${name}`] === type ? (config[`${key}${name}`] as T) : fallback;

  const options = {
    prefix: read("Prefix", "string", params.defaultPrefix),
    suffix: read("Suffix", "string", ""),
    nextNumber: read("NextNumber", "number", 1),
    padding: read("Padding", "number", 0),
    resetYearly: read("ResetYearly", "boolean", false),
    lastResetYear: read<number | null>("LastResetYear", "number", null),
    yearCounters: (config[`${key}YearCounters`] ?? {}) as Record<string, number>,
    date: params.date,
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // Steps widen so a counter that fell far behind still finds a free number.
    const sequence = buildSequenceNumber({ ...options, skip: 2 ** attempt - 1 });
    const taken = await tx.get(
      db
        .collection(params.collection)
        .where("companyId", "==", params.companyId)
        .where(`${params.field}Normalized`, "==", normalizeSearch(sequence.number))
        .limit(1)
    );
    if (!taken.empty) {
      continue;
    }
    return {
      number: sequence.number,
      save: () => {
        tx.set(
          configRef,
          {
            [`${key}NextNumber`]: sequence.nextNumber,
            [`${key}LastResetYear`]: sequence.resetYear ?? null,
            [`${key}YearCounters`]: sequence.yearCounters,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      },
    };
  }

  throw new Error(`No free ${params.field} for company ${params.companyId}`);
}
