/**
 * ZATCA's closed list of reasons for charging no VAT. A 0% line without one of
 * these codes is rejected (BR-KSA-CL-04), so each 0% tax category must name its
 * reason. Safe to import from client components.
 */
export type ZatcaExemption = {
  code: string;
  category: "Z" | "E" | "O";
  reasonEn: string;
  reasonAr: string;
};

export const ZATCA_EXEMPTIONS: ZatcaExemption[] = [
  { code: "VATEX-SA-29", category: "E", reasonEn: "Financial services mentioned in Article 29 of the VAT Regulations", reasonAr: "الخدمات المالية الواردة في المادة التاسعة والعشرين من اللائحة" },
  { code: "VATEX-SA-29-7", category: "E", reasonEn: "Life insurance services mentioned in Article 29 of the VAT Regulations", reasonAr: "خدمات التأمين على الحياة الواردة في المادة التاسعة والعشرين من اللائحة" },
  { code: "VATEX-SA-30", category: "E", reasonEn: "Real estate transactions mentioned in Article 30 of the VAT Regulations", reasonAr: "التوريدات العقارية الواردة في المادة الثلاثين من اللائحة" },
  { code: "VATEX-SA-32", category: "Z", reasonEn: "Export of goods", reasonAr: "صادرات السلع من المملكة" },
  { code: "VATEX-SA-33", category: "Z", reasonEn: "Export of services", reasonAr: "صادرات الخدمات من المملكة" },
  { code: "VATEX-SA-34-1", category: "Z", reasonEn: "The international transport of goods", reasonAr: "النقل الدولي للسلع" },
  { code: "VATEX-SA-34-2", category: "Z", reasonEn: "International transport of passengers", reasonAr: "النقل الدولي للركاب" },
  { code: "VATEX-SA-34-3", category: "Z", reasonEn: "Services directly connected and incidental to a supply of international passenger transport", reasonAr: "الخدمات المرتبطة مباشرة أو عرضياً بتوريد النقل الدولي للركاب" },
  { code: "VATEX-SA-34-4", category: "Z", reasonEn: "Supply of a qualifying means of transport", reasonAr: "توريد وسائل النقل المؤهلة" },
  { code: "VATEX-SA-34-5", category: "Z", reasonEn: "Any services relating to goods or passenger transportation, as defined in Article 25 of the VAT Regulations", reasonAr: "الخدمات ذات الصلة بنقل السلع أو الركاب وفقاً للمادة الخامسة والعشرين من اللائحة" },
  { code: "VATEX-SA-35", category: "Z", reasonEn: "Medicines and medical equipment", reasonAr: "الأدوية والمعدات الطبية" },
  { code: "VATEX-SA-36", category: "Z", reasonEn: "Qualifying metals", reasonAr: "المعادن المؤهلة" },
  { code: "VATEX-SA-EDU", category: "Z", reasonEn: "Private education to citizen", reasonAr: "الخدمات التعليمية الخاصة للمواطنين" },
  { code: "VATEX-SA-HEA", category: "Z", reasonEn: "Private healthcare to citizen", reasonAr: "الخدمات الصحية الخاصة للمواطنين" },
  { code: "VATEX-SA-MLTRY", category: "Z", reasonEn: "Supply of qualified military goods", reasonAr: "توريد السلع العسكرية المؤهلة" },
  { code: "VATEX-SA-OOS", category: "O", reasonEn: "Not subject to VAT", reasonAr: "التوريدات الخارجة عن نطاق ضريبة القيمة المضافة" },
];

export const findExemption = (code?: string | null) =>
  ZATCA_EXEMPTIONS.find((item) => item.code === code) ?? null;
