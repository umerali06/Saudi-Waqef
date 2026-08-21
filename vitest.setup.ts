import { generateKeyPairSync, randomBytes } from "node:crypto";

const testPrivateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
  type: "pkcs8",
  format: "pem",
});

process.env.FIREBASE_PROJECT_ID ??= "saudi-waqef-test";
process.env.FIREBASE_CLIENT_EMAIL ??= "firebase-adminsdk@test.invalid";
process.env.FIREBASE_PRIVATE_KEY ??= testPrivateKey.toString();
process.env.APP_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
