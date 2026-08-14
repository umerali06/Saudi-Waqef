import type { PostalAddress, SupplierInfo } from "@talha7k/zatca";
import type { CompanyRecord } from "@/lib/data/companies";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Single source of truth for ZATCA seller-address fallback defaults. Previously
 * duplicated (with slightly different field names) between the CSR builder in
 * onboarding.ts and the invoice mapper in service.ts.
 */
export function buildZatcaSupplierAddress(
  company: CompanyRecord,
  config: Record<string, unknown> = {}
): PostalAddress {
  const raw = config.sellerAddress;
  const address =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    street: text(address.street) || company.address || "Not provided",
    building: text(address.building) || "0000",
    district: text(address.district) || "Not provided",
    city: text(address.city) || "Riyadh",
    postalCode: text(address.postalCode) || "00000",
    countryCode: text(address.countryCode) || "SA",
  };
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
