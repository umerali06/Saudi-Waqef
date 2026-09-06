import type { PostalAddress, SupplierInfo } from "@talha7k/zatca";
import type { CompanyRecord } from "@/lib/data/companies";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function buildZatcaSupplierAddress(
  company: CompanyRecord,
  config: Record<string, unknown> = {}
): PostalAddress {
  const raw = config.sellerAddress;
  const address =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result = {
    street: text(address.street) || company.address || "",
    building: text(address.building),
    district: text(address.district),
    city: text(address.city),
    postalCode: text(address.postalCode),
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
  structured: Partial<PostalAddress> | null | undefined,
  freeTextFallback?: string,
  configOverride?: unknown
): PostalAddress {
  const override =
    configOverride && typeof configOverride === "object" && !Array.isArray(configOverride)
      ? (configOverride as Record<string, unknown>)
      : {};
  const source = structured ?? {};
  const pick = (key: keyof PostalAddress) => text(override[key]) || text(source[key]);
  const result = {
    street: pick("street") || text(freeTextFallback),
    building: pick("building"),
    district: pick("district"),
    city: pick("city"),
    postalCode: pick("postalCode"),
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
): SupplierInfo {
  return {
    nameAr: text(config.sellerNameAr) || company.legalName || company.name,
    nameEn: company.legalName || company.name,
    vatNumber: company.vatNumber || "",
    crNumber: company.crNumber,
    address: buildZatcaSupplierAddress(company, config),
  };
}
