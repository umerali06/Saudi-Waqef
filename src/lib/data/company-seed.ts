import { getCompanyConfig } from "@/lib/data/company-config";
import { getCompanyDefaults, updateCompanyDefaults } from "@/lib/data/company-defaults";
import {
  createTaxCategory,
  listTaxCategories,
  updateTaxCategory,
} from "@/lib/data/tax-categories";

/**
 * Gives a company the VAT categories its documents need and makes the standard
 * one the default. Companies that already have categories are left alone.
 */
export async function seedCompanyDefaults(companyId: string) {
  const existing = await listTaxCategories(companyId);
  if (existing.length > 0) {
    return;
  }

  const config = await getCompanyConfig(companyId);
  const standardId = await createTaxCategory({
    companyId,
    name: `VAT ${config.vatRate}% - ضريبة القيمة المضافة`,
    rate: config.vatRate,
    type: "standard",
  });
  await createTaxCategory({
    companyId,
    name: "Zero-rated - نسبة صفرية",
    rate: 0,
    type: "zero",
  });
  await createTaxCategory({
    companyId,
    name: "Exempt - معفى من الضريبة",
    rate: 0,
    type: "exempt",
  });

  const defaults = await getCompanyDefaults(companyId);
  await updateCompanyDefaults(companyId, {
    defaultSalesTaxCategoryId: defaults.defaultSalesTaxCategoryId ?? standardId,
    defaultPurchaseTaxCategoryId: defaults.defaultPurchaseTaxCategoryId ?? standardId,
  });
}

/** Carries a change of the company's VAT rate over to its standard category. */
export async function updateStandardVatRate(
  companyId: string,
  previousRate: number,
  rate: number
) {
  const categories = await listTaxCategories(companyId);
  const standard = categories.filter(
    (category) => category.type === "standard" && category.rate === previousRate
  );
  for (const category of standard) {
    await updateTaxCategory(category.id, {
      rate,
      name: category.name.replace(`${previousRate}%`, `${rate}%`),
    });
  }
}
