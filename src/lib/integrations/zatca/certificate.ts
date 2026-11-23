/*
 * CSR encoding adapted from @talha7k/zatca (MIT License, Copyright (c) 2025-2026
 * talha7k). Kept here because its published versions are removed from npm.
 */
import crypto from "crypto";
import { ZatcaError, ZatcaErrorCode } from "@/lib/integrations/zatca/errors";
import type { ZatcaEnvironment } from "@/lib/integrations/zatca/environment";

const DAY_MS = 86_400_000;

const toPem = (base64: string, label: string) =>
  `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/g)?.join("\n") ?? base64}\n-----END ${label}-----`;

const pemBody = (pem: string) => pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");

/**
 * PEM from whatever form a certificate arrives in. ZATCA's binarySecurityToken is
 * the base64 of an already base64-encoded certificate.
 */
export const asCertificatePem = (certificate: string): string => {
  const compact = certificate.includes("BEGIN CERTIFICATE")
    ? pemBody(certificate)
    : certificate.replace(/\s/g, "");
  const bytes = Buffer.from(compact, "base64");
  if (bytes[0] === 0x30) return toPem(compact, "CERTIFICATE");
  const inner = bytes.toString("utf8").replace(/\s/g, "");
  if (inner.includes("BEGINCERTIFICATE")) return asCertificatePem(bytes.toString("utf8"));
  if (/^[A-Za-z0-9+/=]+$/.test(inner) && Buffer.from(inner, "base64")[0] === 0x30) {
    return toPem(inner, "CERTIFICATE");
  }
  throw new ZatcaError("The ZATCA certificate could not be read.", ZatcaErrorCode.CERT_ERROR);
};

export const parseCertificate = (certificate: string) => {
  const parsed = new crypto.X509Certificate(asCertificatePem(certificate));
  const validTo = new Date(parsed.validTo);
  return {
    validTo: validTo.toISOString(),
    isExpired: validTo.getTime() <= Date.now(),
    daysUntilExpiry: Math.floor((validTo.getTime() - Date.now()) / DAY_MS),
  };
};

const readDer = (der: Buffer, offset: number) => {
  const first = der[offset + 1];
  if (first < 0x80) return { content: offset + 2, length: first };
  const size = first & 0x7f;
  let length = 0;
  for (let i = 0; i < size; i += 1) length = length * 256 + der[offset + 2 + i];
  return { content: offset + 2 + size, length };
};

/** The issuer's signature bytes, base64: QR tag 9. */
export const extractCertificateSignature = (certificate: string) => {
  const der = Buffer.from(pemBody(asCertificatePem(certificate)), "base64");
  let offset = readDer(der, 0).content;
  for (let i = 0; i < 2; i += 1) {
    const part = readDer(der, offset);
    offset = part.content + part.length;
  }
  if (der[offset] !== 0x03) {
    throw new ZatcaError("The ZATCA certificate carries no signature.", ZatcaErrorCode.CERT_ERROR);
  }
  const signature = readDer(der, offset);
  // The first content byte of a BIT STRING counts unused bits.
  return der.subarray(signature.content + 1, signature.content + signature.length).toString("base64");
};

/** What the XAdES signature states about the signing certificate. */
export const describeCertificate = (certificate: string) => {
  const pem = asCertificatePem(certificate);
  const body = pemBody(pem);
  const parsed = new crypto.X509Certificate(pem);
  const digest = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  return {
    body,
    digest: Buffer.from(digest, "utf8").toString("base64"),
    issuer: parsed.issuer.split("\n").reverse().join(", "),
    serialNumber: BigInt(`0x${parsed.serialNumber}`).toString(10),
    publicKeySpki: parsed.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
};

// ---- PKCS#10 request ----

const OID = {
  country: "550406",
  organizationalUnit: "55040b",
  organization: "55040a",
  commonName: "550403",
  surname: "550404",
  userId: "0992268993f22c640101",
  title: "55040c",
  registeredAddress: "55041a",
  businessCategory: "55040f",
  extensionRequest: "2a864886f70d01090e",
  certificateTemplate: "2b0601040182371402",
  subjectAltName: "551d11",
  ecdsaSha256: "2a8648ce3d040302",
} as const;

const TEMPLATE: Record<ZatcaEnvironment, string> = {
  sandbox: "TSTZATCA-Code-Signing",
  simulation: "PREZATCA-Code-Signing",
  production: "ZATCA-Code-Signing",
};

const derLength = (length: number) => {
  if (length < 0x80) return Buffer.from([length]);
  const hex = length.toString(16);
  const bytes = Buffer.from(hex.padStart(hex.length + (hex.length % 2), "0"), "hex");
  return Buffer.concat([Buffer.from([0x80 | bytes.length]), bytes]);
};
const der = (tag: number, ...content: Buffer[]) => {
  const value = Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);
};
const sequence = (...items: Buffer[]) => der(0x30, ...items);
const oid = (key: keyof typeof OID) => der(0x06, Buffer.from(OID[key], "hex"));
const utf8 = (value: string) => der(0x0c, Buffer.from(value, "utf8"));
const rdn = (key: keyof typeof OID, value: Buffer) => der(0x31, sequence(oid(key), value));

export type CsrParams = {
  organizationName: string;
  organizationalUnit: string;
  commonName: string;
  vatNumber: string;
  invoiceType: string;
  businessCategory: string;
  registeredAddress: string;
  egsSerialNumber: string;
};

/** secp256k1 key pair and certificate request, as ZATCA's onboarding manual specifies. */
export const generateCsr = (params: CsrParams, environment: ZatcaEnvironment) => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "secp256k1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const subject = sequence(
    rdn("country", der(0x13, Buffer.from("SA", "ascii"))),
    rdn("organizationalUnit", utf8(params.organizationalUnit)),
    rdn("organization", utf8(params.organizationName)),
    rdn("commonName", utf8(params.commonName))
  );
  const directoryName = sequence(
    rdn("surname", utf8(params.egsSerialNumber)),
    rdn("userId", utf8(params.vatNumber)),
    rdn("title", utf8(params.invoiceType)),
    rdn("registeredAddress", utf8(params.registeredAddress)),
    rdn("businessCategory", utf8(params.businessCategory))
  );
  const extensions = sequence(
    sequence(oid("certificateTemplate"), der(0x04, utf8(TEMPLATE[environment]))),
    sequence(oid("subjectAltName"), der(0x04, sequence(der(0xa4, directoryName))))
  );
  const request = sequence(
    der(0x02, Buffer.from([0])),
    subject,
    crypto.createPublicKey(publicKey).export({ type: "spki", format: "der" }),
    der(0xa0, sequence(oid("extensionRequest"), der(0x31, extensions)))
  );
  const signature = crypto.createSign("SHA256").update(request).sign(privateKey);
  const csr = sequence(
    request,
    sequence(oid("ecdsaSha256")),
    der(0x03, Buffer.from([0]), signature)
  );
  return { csr: `${toPem(csr.toString("base64"), "CERTIFICATE REQUEST")}\n`, privateKey, publicKey };
};
