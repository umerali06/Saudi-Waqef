import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvLocal();

const confirmed = process.argv.includes("--yes");
if (!confirmed) {
  console.error("Refusing to wipe Firestore without --yes confirmation flag.");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

const db = getFirestore(app);

async function deleteCollectionRecursive(collectionRef, batchSize = 200) {
  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      const subcollections = await doc.ref.listCollections();
      for (const subcollection of subcollections) {
        await deleteCollectionRecursive(subcollection, batchSize);
      }
      await doc.ref.delete();
    }
  }
}

async function wipeAll() {
  const rootCollections = await db.listCollections();
  if (rootCollections.length === 0) {
    console.log(`No data found in Firestore project '${projectId}'.`);
    return;
  }

  console.log(`Wiping Firestore project '${projectId}' (${rootCollections.length} root collections)...`);
  for (const collection of rootCollections) {
    console.log(`Deleting collection '${collection.id}'...`);
    await deleteCollectionRecursive(collection);
  }
  console.log("Firestore wipe completed.");
}

wipeAll().catch((error) => {
  console.error("Failed to wipe Firestore:", error);
  process.exit(1);
});
