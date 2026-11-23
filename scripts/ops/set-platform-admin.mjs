// Creates a platform (super) admin account, or sets a new password for an existing one.
//
//   node scripts/ops/set-platform-admin.mjs <email> [--production] [--login-only]
//
// --production  uses the commented-out Firebase credentials in .env.local instead of the active ones
// --login-only  for an address without a mailbox: no password reset links and no alert emails go to
//               it, because whoever registers that domain later would receive them
//
// The password is asked for in the terminal, so it never ends up in a file or the shell history.
import crypto from "node:crypto";
import fs from "node:fs";
import readline from "node:readline";
import { Writable } from "node:stream";
import bcrypt from "bcryptjs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getPasswordIssues } from "../../src/lib/security/password-policy.ts";

const args = process.argv.slice(2);
const production = args.includes("--production");
const loginOnly = args.includes("--login-only");
const email = args.find((arg) => !arg.startsWith("--"))?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node scripts/ops/set-platform-admin.mjs <email> [--production] [--login-only]");
  process.exit(1);
}

const envText = fs.readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
const env = (key) => {
  const match = envText.match(new RegExp(`^${production ? "#[ ]*" : ""}${key}=(.*)$`, "m"));
  if (!match) throw new Error(`${key} is missing in .env.local`);
  const value = match[1].trim();
  return value.startsWith('"') ? value.slice(1, value.lastIndexOf('"')) : value;
};

let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  },
});
const rl = readline.createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();
const ask = async (question, hidden = false) => {
  process.stdout.write(question);
  muted = hidden;
  const { value } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  return value ?? "";
};

const projectId = env("FIREBASE_PROJECT_ID");
initializeApp({
  credential: cert({
    projectId,
    clientEmail: env("FIREBASE_CLIENT_EMAIL"),
    privateKey: env("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

const emailLower = email.toLowerCase();
const found = await db.collection("users").where("emailLower", "==", emailLower).limit(1).get();
const existing = found.docs[0];
console.log(`Project: ${projectId}`);
console.log(`Account: ${email} (${existing ? "exists, its password will be replaced" : "new"}, super admin${loginOnly ? ", login only" : ""})`);
if ((await ask("Type YES to continue: ")).trim() !== "YES") {
  console.log("Nothing was changed.");
  process.exit(0);
}

const password = await ask("Password: ", true);
const issues = getPasswordIssues(password);
if (issues.length > 0) {
  console.error(`Password refused (${issues.join(", ")}). Use at least 10 characters with upper and lower case letters, a number and a symbol, and no common words such as "admin" or "12345678".`);
  process.exit(1);
}
if ((await ask("Password again: ", true)) !== password) {
  console.error("The two passwords differ. Nothing was changed.");
  process.exit(1);
}

const userId = existing?.id ?? crypto.randomUUID();
const now = Timestamp.now();
const batch = db.batch();
batch.set(
  db.collection("users").doc(userId),
  {
    ...(existing ? {} : { email, emailLower, name: "Platform admin", createdAt: now }),
    passwordHash: await bcrypt.hash(password, 12),
    status: "active",
    loginOnly,
    updatedAt: now,
  },
  { merge: true }
);
batch.set(
  db.collection("system_admins").doc(userId),
  { userId, email, name: existing?.data().name ?? "Platform admin", role: "super_admin", loginOnly, updatedAt: now, createdAt: now },
  { merge: true }
);
batch.set(db.collection("audit_logs").doc(), {
  companyId: "system",
  userId,
  userEmail: email,
  action: "admin.platform_admin.set",
  entity: "user",
  entityId: userId,
  metadata: { via: "script", loginOnly },
  createdAt: now,
});
await batch.commit();
console.log("Done. Sign in at /login; the admin console is at /admin.");
process.exit(0);
