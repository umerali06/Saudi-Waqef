import type { ZatcaAddress, ZatcaSupplier } from "@/lib/integrations/zatca/document";
import type { CompanyRecord } from "@/lib/data/companies";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** ZATCA rejects Arabic-Indic digits in building and postal numbers. */
const digits = (value: unknown) =>
  text(value)
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));

export function buildZatcaSupplierAddress(
  company: CompanyRecord,
  config: Record<string, unknown> = {}
): ZatcaAddress {
  const raw = config.sellerAddress;
  const address =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result = {
    street: text(address.street) || company.address || "",
    building: digits(address.building),
    district: text(address.district),
    city: text(address.city),
    postalCode: digits(address.postalCode),
    countryCode: text(address.countryCode) || "SA",
  };
  const missing = Object.entries(result)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`ZATCA_SELLER_ADDRESS_INCOMPLETE:${missing.join(",")}`);
  }
  return result;
}

/**
 * Buyer address for standard (B2B) invoices. Like the seller address this
 * refuses to substitute placeholders: filing an invented building number or
 * postal code with ZATCA misstates the buyer on a tax document.
 * `configOverride` is the per-integration `customerAddress` escape hatch used
 * when a buyer's address cannot be held on the customer record itself.
 */
export function buildZatcaCustomerAddress(
  structured: Partial<ZatcaAddress> | null | undefined,
  freeTextFallback?: string,
  configOverride?: unknown
): ZatcaAddress {
  const override =
    configOverride && typeof configOverride === "object" && !Array.isArray(configOverride)
      ? (configOverride as Record<string, unknown>)
      : {};
  const source = structured ?? {};
  const pick = (key: keyof ZatcaAddress) => text(override[key]) || text(source[key]);
  const result = {
    street: pick("street") || text(freeTextFallback),
    building: digits(pick("building")),
    district: pick("district"),
    city: pick("city"),
    postalCode: digits(pick("postalCode")),
    countryCode: pick("countryCode") || "SA",
  };
  const missing = Object.entries(result)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`ZATCA_BUYER_ADDRESS_INCOMPLETE:${missing.join(",")}`);
  }
  return result;
}

export function assertZatcaCompanyReady(
  company: CompanyRecord,
  config: Record<string, unknown> = {}
): asserts company is CompanyRecord & {
  legalName: string;
  crNumber: string;
  vatNumber: string;
} {
  const missing: string[] = [];
  if (!company.legalName?.trim()) missing.push("legalName");
  if (!company.crNumber?.trim()) missing.push("crNumber");
  if (!/^3\d{13}3$/.test(company.vatNumber?.trim() ?? "")) missing.push("vatNumber");
  if (missing.length) throw new Error(`ZATCA_COMPANY_INFORMATION_INCOMPLETE:${missing.join(",")}`);
  buildZatcaSupplierAddress(company, config);
}

export function buildZatcaSupplierInfo(
  company: CompanyRecord,
  config: Record<string, unknown> = {}
): ZatcaSupplier {
  return {
    // The QR code and XML carry one seller name, and ZATCA requires it in Arabic.
    name: text(config.sellerNameAr) || company.legalName || company.name,
    vatNumber: company.vatNumber?.trim() ?? "",
    crNumber: company.crNumber?.trim() || undefined,
    address: buildZatcaSupplierAddress(company, config),
  };
}
