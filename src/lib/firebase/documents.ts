import type {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from "firebase-admin/firestore";

/** Reads a document, inside the given transaction when there is one. */
export async function readDoc(
  ref: DocumentReference,
  tx?: Transaction
): Promise<DocumentSnapshot> {
  return tx ? tx.get(ref) : ref.get();
}

/** Writes a document, inside the given transaction when there is one. */
export async function writeDoc(
  ref: DocumentReference,
  data: Record<string, unknown>,
  options: { merge?: boolean; tx?: Transaction } = {}
) {
  const merge = options.merge ?? false;
  if (options.tx) {
    options.tx.set(ref, data, { merge });
    return;
  }
  await ref.set(data, { merge });
}
