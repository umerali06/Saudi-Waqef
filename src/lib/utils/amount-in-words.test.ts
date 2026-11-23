import { describe, expect, it } from "vitest";
import { amountInWords } from "@/lib/utils/amount-in-words";

const ar = (amount: number) => amountInWords(amount, "ar");
const en = (amount: number) => amountInWords(amount, "en");

describe("amountInWords in Arabic", () => {
  it.each([
    [0, "صفر ريال سعودي فقط لا غير"],
    [1, "ريال سعودي واحد فقط لا غير"],
    [2, "ريالان سعوديان فقط لا غير"],
    [3, "ثلاثة ريالات سعودية فقط لا غير"],
    [10, "عشرة ريالات سعودية فقط لا غير"],
    [11, "أحد عشر ريالًا سعوديًا فقط لا غير"],
    [12, "اثنا عشر ريالًا سعوديًا فقط لا غير"],
    [21, "واحد وعشرون ريالًا سعوديًا فقط لا غير"],
    [99, "تسعة وتسعون ريالًا سعوديًا فقط لا غير"],
    [100, "مئة ريال سعودي فقط لا غير"],
    [103, "مئة وثلاثة ريالات سعودية فقط لا غير"],
    [115, "مئة وخمسة عشر ريالًا سعوديًا فقط لا غير"],
    [200, "مئتا ريال سعودي فقط لا غير"],
    [1000, "ألف ريال سعودي فقط لا غير"],
    [1150, "ألف ومئة وخمسون ريالًا سعوديًا فقط لا غير"],
    [1200, "ألف ومئتا ريال سعودي فقط لا غير"],
    [2000, "ألفا ريال سعودي فقط لا غير"],
    [2500, "ألفان وخمسمئة ريال سعودي فقط لا غير"],
    [3000, "ثلاثة آلاف ريال سعودي فقط لا غير"],
    [11000, "أحد عشر ألف ريال سعودي فقط لا غير"],
    [11500, "أحد عشر ألفًا وخمسمئة ريال سعودي فقط لا غير"],
    [100000, "مئة ألف ريال سعودي فقط لا غير"],
    [200000, "مئتا ألف ريال سعودي فقط لا غير"],
    [1000000, "مليون ريال سعودي فقط لا غير"],
    [2000000, "مليونا ريال سعودي فقط لا غير"],
    [2003004, "مليونان وثلاثة آلاف وأربعة ريالات سعودية فقط لا غير"],
    [5000000000, "خمسة مليارات ريال سعودي فقط لا غير"],
  ])("%d", (amount, expected) => {
    expect(ar(amount)).toBe(expected);
  });

  it("declines halalas as a feminine noun", () => {
    expect(ar(0.01)).toBe("هللة واحدة فقط لا غير");
    expect(ar(0.02)).toBe("هللتان فقط لا غير");
    expect(ar(0.05)).toBe("خمس هللات فقط لا غير");
    expect(ar(0.1)).toBe("عشر هللات فقط لا غير");
    expect(ar(0.11)).toBe("إحدى عشرة هللة فقط لا غير");
    expect(ar(0.5)).toBe("خمسون هللة فقط لا غير");
    expect(ar(38.33)).toBe("ثمانية وثلاثون ريالًا سعوديًا وثلاث وثلاثون هللة فقط لا غير");
    expect(ar(1.21)).toBe("ريال سعودي واحد وإحدى وعشرون هللة فقط لا غير");
  });
});

describe("amountInWords in English", () => {
  it.each([
    [0, "Zero Saudi riyals only"],
    [1, "One Saudi riyal only"],
    [21.01, "Twenty-one Saudi riyals and one halala only"],
    [0.5, "Fifty halalas only"],
    [1150, "One thousand one hundred fifty Saudi riyals only"],
    [1234567.89, "One million two hundred thirty-four thousand five hundred sixty-seven Saudi riyals and eighty-nine halalas only"],
    [2000000000, "Two billion Saudi riyals only"],
  ])("%d", (amount, expected) => {
    expect(en(amount)).toBe(expected);
  });
});

describe("amountInWords limits", () => {
  it("handles rounding, negatives and what it cannot express", () => {
    expect(en(0.999)).toBe("One Saudi riyal only");
    expect(en(-5)).toBe("Minus five Saudi riyals only");
    expect(ar(-3)).toBe("سالب ثلاثة ريالات سعودية فقط لا غير");
    expect(amountInWords(1e12, "en")).toBeNull();
    expect(amountInWords(5, "en", "USD")).toBeNull();
  });
});
