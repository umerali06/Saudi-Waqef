/*
 * XAdES layout adapted from @talha7k/zatca (MIT License, Copyright (c) 2025-2026
 * talha7k). Kept here because its published versions are removed from npm.
 */
import crypto from "crypto";
import type { Element as XmlElement } from "@xmldom/xmldom";
import { canonicalize } from "@/lib/integrations/zatca/c14n";
import { describeCertificate, extractCertificateSignature } from "@/lib/integrations/zatca/certificate";
import { ZatcaError, ZatcaErrorCode } from "@/lib/integrations/zatca/errors";

const DS = "http://www.w3.org/2000/09/xmldsig#";
const XADES = "http://uri.etsi.org/01903/v1.3.2#";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const C14N11 = "http://www.w3.org/2006/12/xml-c14n11";
const XPATH = "http://www.w3.org/TR/1999/REC-xpath-19991116";

/** ZATCA digests properties as base64 of the hexadecimal hash, not of its bytes. */
const hexDigest = (value: string) =>
  Buffer.from(crypto.createHash("sha256").update(value, "utf8").digest("hex"), "utf8").toString("base64");

const isExcludedFromHash = (element: XmlElement) => {
  if (element.localName === "UBLExtensions") return true;
  if (element.tagName === "cac:Signature") return true;
  if (element.localName !== "AdditionalDocumentReference") return false;
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if ((child as XmlElement).localName === "ID") return child.textContent === "QR";
  }
  return false;
};

/** Hash of the document itself: without extensions, signature and QR. */
export const hashInvoice = (xml: string) =>
  crypto.createHash("sha256").update(canonicalize(xml, isExcludedFromHash), "utf8").digest("base64");

const tlv = (tag: number, value: Buffer) => {
  const length =
    value.length < 0x80
      ? [value.length]
      : value.length < 0x100
        ? [0x81, value.length]
        : [0x82, value.length >> 8, value.length & 0xff];
  return Buffer.concat([Buffer.from([tag, ...length]), value]);
};

export type QrFields = {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: string;
  vat: string;
};

/** Phase-2 QR: nine TLV fields. Hash and signature are text, key and stamp raw bytes. */
const buildQr = (
  fields: QrFields & { invoiceHash: string; signature: string; publicKeySpki: string; certificateSignature: string }
) =>
  Buffer.concat([
    tlv(1, Buffer.from(fields.sellerName, "utf8")),
    tlv(2, Buffer.from(fields.vatNumber, "utf8")),
    tlv(3, Buffer.from(fields.timestamp, "utf8")),
    tlv(4, Buffer.from(fields.total, "utf8")),
    tlv(5, Buffer.from(fields.vat, "utf8")),
    tlv(6, Buffer.from(fields.invoiceHash, "utf8")),
    tlv(7, Buffer.from(fields.signature, "utf8")),
    tlv(8, Buffer.from(fields.publicKeySpki, "base64")),
    tlv(9, Buffer.from(fields.certificateSignature, "base64")),
  ]).toString("base64");

const signedPropertiesXml = (
  certificate: ReturnType<typeof describeCertificate>,
  signingTime: string,
  namespaces: { root: string; ds: string }
) =>
  `<xades:SignedProperties${namespaces.root} Id="xadesSignedProperties"><xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod${namespaces.ds} Algorithm="${SHA256}"/><ds:DigestValue${namespaces.ds}>${certificate.digest}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName${namespaces.ds}>${certificate.issuer}</ds:X509IssuerName><ds:X509SerialNumber${namespaces.ds}>${certificate.serialNumber}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>`;

const signedInfoXml = (invoiceHash: string, propertiesDigest: string) => {
  const exclude = (path: string) =>
    `<ds:Transform Algorithm="${XPATH}"><ds:XPath>not(//ancestor-or-self::${path})</ds:XPath></ds:Transform>`;
  return `<ds:SignedInfo xmlns:ds="${DS}" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><ds:CanonicalizationMethod Algorithm="${C14N11}"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/><ds:Reference Id="invoiceSignedData" URI=""><ds:Transforms>${exclude("ext:UBLExtensions")}${exclude("cac:Signature")}${exclude("cac:AdditionalDocumentReference[cbc:ID='QR']")}<ds:Transform Algorithm="${C14N11}"/></ds:Transforms><ds:DigestMethod Algorithm="${SHA256}"/><ds:DigestValue>${invoiceHash}</ds:DigestValue></ds:Reference><ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties"><ds:DigestMethod Algorithm="${SHA256}"/><ds:DigestValue>${propertiesDigest}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
};

/** Signs a UBL invoice (XAdES-BES, ECDSA-SHA256) and stamps its QR code. */
export const signInvoice = (params: {
  xml: string;
  privateKeyPem: string;
  certificate: string;
  qr: QrFields;
}) => {
  const certificate = describeCertificate(params.certificate);
  const keySpki = crypto
    .createPublicKey(params.privateKeyPem)
    .export({ type: "spki", format: "der" })
    .toString("base64");
  if (keySpki !== certificate.publicKeySpki) {
    throw new ZatcaError(
      "The private key does not belong to this ZATCA certificate.",
      ZatcaErrorCode.SIGN_ERROR
    );
  }

  const invoiceHash = hashInvoice(params.xml);
  const signingTime = new Date().toISOString().slice(0, 19);
  const propertiesDigest = hexDigest(
    signedPropertiesXml(certificate, signingTime, {
      root: ` xmlns:xades="${XADES}"`,
      ds: ` xmlns:ds="${DS}"`,
    })
  );
  const signedInfo = signedInfoXml(invoiceHash, propertiesDigest);
  const signature = crypto
    .createSign("SHA256")
    .update(canonicalize(signedInfo), "utf8")
    .sign(params.privateKeyPem, "base64");
  const properties = signedPropertiesXml(certificate, signingTime, { root: "", ds: "" });

  const extensions = `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2"><sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID><sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID><ds:Signature xmlns:ds="${DS}" Id="signature">${signedInfo}<ds:SignatureValue>${signature}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificate.body}</ds:X509Certificate></ds:X509Data></ds:KeyInfo><ds:Object><xades:QualifyingProperties xmlns:xades="${XADES}" Target="signature">${properties}</xades:QualifyingProperties></ds:Object></ds:Signature></sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>`;

  const qr = buildQr({
    ...params.qr,
    invoiceHash,
    signature,
    publicKeySpki: keySpki,
    certificateSignature: extractCertificateSignature(params.certificate),
  });
  const qrReference = `<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qr}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;

  const signedXml = params.xml
    // Replacement functions, so "$" in the data is never read as a pattern.
    .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, () => extensions)
    .replace("<cac:Signature>", () => `${qrReference}<cac:Signature>`);
  if (hashInvoice(signedXml) !== invoiceHash) {
    throw new ZatcaError("Signing altered the invoice content.", ZatcaErrorCode.SIGN_ERROR);
  }
  return { signedXml, invoiceHash, qr };
};
