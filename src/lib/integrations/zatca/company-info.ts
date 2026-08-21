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

export function assertZatcaCompanyReady(company: CompanyRecord, config: Record<string, unknown> = {}) {
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
