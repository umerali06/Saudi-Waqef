import { writeFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { printableUnit, renderTaxDocument, type TaxDocumentModel } from "@/lib/pdf/tax-document";
import { toVisualRuns, wrapText } from "@/lib/pdf/text";

const visual = (text: string, base: "rtl" | "ltr") => toVisualRuns(text, base).map((run) => run.text);

describe("bidirectional text", () => {
  it("places numbers and Latin words to the left of the Arabic they follow", () => {
    expect(visual("فاتورة 123", "rtl")).toEqual(["123", " فاتورة"].map((s) => expect.stringContaining(s.trim())));
    expect(visual("رقم INV-4", "rtl")[0]).toContain("INV-4");
  });

  it("keeps Latin sentences in order", () => {
    expect(visual("Total 100", "ltr").join("")).toBe("Total 100");
  });

  it("mirrors brackets, which the shaper then reverses together with the Arabic", () => {
    expect(visual("(سعودي)", "rtl")).toEqual([")سعودي("]);
  });

  it("wraps on words and breaks words that cannot fit", () => {
    const measure = (text: string) => text.length;
    expect(wrapText("aa bb cc", 5, measure)).toEqual(["aa bb", "cc"]);
    expect(wrapText("abcdefgh", 3, measure)).toEqual(["abc", "def", "gh"]);
    expect(wrapText("a\nb", 5, measure)).toEqual(["a", "b"]);
  });
});

const model = (over: Partial<TaxDocumentModel> = {}): TaxDocumentModel => ({
  kind: "invoice", simplified: false, status: "approved", number: "INV-4", issueDate: "2026-11-23",
  issueTime: "20:13:00", supplyDate: "2026-11-23", dueDate: "2026-12-23", currency: "SAR",
  seller: { name: "شركة الاختبار لخدمات الأعمال", vatNumber: "399999999900003", crNumber: "1010010000", address: "1234، طريق الملك فهد، العليا، الرياض، 12211" },
  buyer: { name: "شركة العميل للمحاماة والاستشارات القانونية", vatNumber: "399999999800003", address: "مكة المكرمة" },
  lines: [
    { description: "استشارة قانونية (عقد رقم A-12) مع مراجعة المستندات وإعداد المذكرات اللازمة", quantity: 1, unit: "1", unitPrice: 500, discount: 0, net: 500, taxPercent: 15, tax: 75, total: 575 },
    { description: "Consulting session", quantity: 2.5, unit: "ساعة", unitPrice: 200, discount: 50, net: 450, taxPercent: 15, tax: 67.5, total: 517.5 },
  ],
  subtotal: 950, discountTotal: 50, taxTotal: 142.5, total: 1092.5, amountPaid: 92.5, balance: 1000,
  notes: "تجربة النظام: الدفع خلال 30 يومًا إلى الحساب SA03 8000 0000 6080 1016 7519.", terms: "تطبق الشروط والأحكام.",
  footer: "شكرًا لتعاملكم معنا", accent: "#185fa5", template: "classic",
  qr: "AQxRQSBUZXN0IENvbXBhbnkCDzM5OTk5OTk5OTkwMDAwMw==", ...over,
});

describe("tax document PDF", () => {
  it("drops units that are only digits", () => {
    expect(printableUnit("1")).toBe("");
    expect(printableUnit("١")).toBe("");
    expect(printableUnit("ساعة")).toBe("ساعة");
  });

  it.each(["classic", "modern", "minimal"] as const)("renders the %s template", async (template) => {
    const pdf = await renderTaxDocument(model({ template }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10000);
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${template}.pdf`, pdf);
  });

  it("flows long invoices over several pages", async () => {
    const lines = Array.from({ length: 60 }, () => model().lines[0]);
    const pdf = await renderTaxDocument(model({ lines }));
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/long.pdf`, pdf);
  }, 20000);

  it("embeds the filed XML in a PDF/A-3 file", async () => {
    const pdf = await renderTaxDocument(model({ xml: { name: "invoice.xml", content: Buffer.from("<Invoice/>") } }));
    const raw = pdf.toString("latin1");
    expect(raw).toContain("/AFRelationship /Alternative");
    expect(raw).toContain("pdfaid:part>3<");
  });
});
