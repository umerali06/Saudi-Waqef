import { db } from "@/lib/firebase/admin";
import { encryptString } from "@/lib/security/crypto";
import type { Migration } from "@/lib/migrations/types";

const migration: Migration = {
  id: "2026-06-20-encrypt-integration-credentials",
  title: "Encrypt external integration credentials",
  description: "Moves legacy API tokens, ZATCA CSIDs, certificates, and private keys into AES-256-GCM encrypted storage.",
  async up(context) {
    const snapshot = await db.collection("integrations").get();
    let updated = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data.credentials || typeof data.credentials !== "object" || data.credentialsEnc) continue;
      updated += 1;
      if (!context.dryRun) {
        await doc.ref.set({
          credentialsEnc: encryptString(JSON.stringify(data.credentials)),
          credentials: null,
        }, { merge: true });
      }
    }
    context.log(`integrations: scanned ${snapshot.size}, encrypted ${updated}`);
    return { scanned: snapshot.size, updated, notes: ["Legacy integration credentials encrypted."] };
  },
};

export default migration;
