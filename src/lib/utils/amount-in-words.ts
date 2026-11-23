import { roundMoney } from "@/lib/utils/invoice";

type Gender = "masculine" | "feminine";

const AR_ONES: Record<Gender, string[]> = {
  masculine: ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"],
  feminine: ["", "واحدة", "اثنتان", "ثلاث", "أربع", "خمس", "ست", "سبع", "ثماني", "تسع", "عشر"],
};
const AR_TEENS: Record<Gender, string[]> = {
  masculine: [
    "", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر",
    "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
  ],
  feminine: [
    "", "إحدى عشرة", "اثنتا عشرة", "ثلاث عشرة", "أربع عشرة", "خمس عشرة",
    "ست عشرة", "سبع عشرة", "ثماني عشرة", "تسع عشرة",
  ],
};
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = [
  "", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة",
];

type Scale = { one: string; two: string; twoConstruct: string; few: string; many: string };
const AR_SCALES: Array<[number, Scale]> = [
  [1e9, { one: "مليار", two: "ملياران", twoConstruct: "مليارا", few: "مليارات", many: "مليارًا" }],
  [1e6, { one: "مليون", two: "مليونان", twoConstruct: "مليونا", few: "ملايين", many: "مليونًا" }],
  [1e3, { one: "ألف", two: "ألفان", twoConstruct: "ألفا", few: "آلاف", many: "ألفًا" }],
];

/** Below one hundred, e.g. "خمسة وعشرون". */
function arabicTens(value: number, gender: Gender) {
  const forms = AR_ONES[gender];
  if (value <= 10) return forms[value];
  if (value < 20) return AR_TEENS[gender][value - 10];
  const ones = value % 10;
  const oneWord =
    ones === 1 ? (gender === "feminine" ? "إحدى" : "واحد") : ones === 8 && gender === "feminine" ? "ثمانٍ" : forms[ones];
  return [oneWord, AR_TENS[Math.floor(value / 10)]].filter(Boolean).join(" و");
}

/**
 * Words for 1..999. `construct` drops the nun of a final "مئتان" because a
 * counted noun follows it.
 */
function arabicHundreds(value: number, gender: Gender, construct: boolean) {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) {
    parts.push(hundreds === 2 && rest === 0 && construct ? "مئتا" : AR_HUNDREDS[hundreds]);
  }
  if (rest) parts.push(arabicTens(rest, gender));
  return parts.join(" و");
}

/** Arabic words for a whole number that is followed by the noun it counts. */
function arabicNumber(value: number, gender: Gender) {
  const parts: string[] = [];
  let rest = value;
  for (const [size, scale] of AR_SCALES) {
    const count = Math.floor(rest / size);
    rest %= size;
    if (!count) continue;
    const isLast = rest === 0;
    const tail = count % 100;
    if (count === 1) parts.push(scale.one);
    else if (count === 2) parts.push(isLast ? scale.twoConstruct : scale.two);
    else if (tail >= 3 && tail <= 10) parts.push(`${arabicHundreds(count, "masculine", true)} ${scale.few}`);
    else if (tail >= 11 && !isLast) parts.push(`${arabicHundreds(count, "masculine", true)} ${scale.many}`);
    else parts.push(`${arabicHundreds(count, "masculine", true)} ${scale.one}`);
  }
  if (rest) parts.push(arabicHundreds(rest, gender, true));
  return parts.join(" و");
}

function arabicRiyals(value: number) {
  if (value === 0) return "صفر ريال سعودي";
  if (value === 1) return "ريال سعودي واحد";
  if (value === 2) return "ريالان سعوديان";
  const words = arabicNumber(value, "masculine");
  const tail = value % 100;
  if (tail >= 3 && tail <= 10) return `${words} ريالات سعودية`;
  if (tail >= 11) return `${words} ريالًا سعوديًا`;
  return `${words} ريال سعودي`;
}

function arabicHalalas(value: number) {
  if (value === 1) return "هللة واحدة";
  if (value === 2) return "هللتان";
  const words = arabicTens(value, "feminine");
  return value <= 10 ? `${words} هللات` : `${words} هللة`;
}

const EN_ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES: Array<[number, string]> = [
  [1e9, "billion"],
  [1e6, "million"],
  [1e3, "thousand"],
];

function englishHundreds(value: number) {
  const parts: string[] = [];
  if (value >= 100) parts.push(`${EN_ONES[Math.floor(value / 100)]} hundred`);
  const rest = value % 100;
  if (rest > 0 && rest < 20) parts.push(EN_ONES[rest]);
  else if (rest) {
    parts.push([EN_TENS[Math.floor(rest / 10)], EN_ONES[rest % 10]].filter(Boolean).join("-"));
  }
  return parts.join(" ");
}

function englishNumber(value: number) {
  if (value === 0) return "zero";
  const parts: string[] = [];
  let rest = value;
  for (const [size, name] of EN_SCALES) {
    const count = Math.floor(rest / size);
    rest %= size;
    if (count) parts.push(`${englishHundreds(count)} ${name}`);
  }
  if (rest) parts.push(englishHundreds(rest));
  return parts.join(" ");
}

/**
 * A SAR amount the way it is written on vouchers and cheques. Returns null for
 * amounts of a trillion riyals and above, and for other currencies.
 */
export function amountInWords(
  amount: number,
  locale: "ar" | "en",
  currency = "SAR"
): string | null {
  const rounded = roundMoney(Math.abs(amount));
  if (currency !== "SAR" || rounded >= 1e12) {
    return null;
  }
  const totalHalalas = Math.round(rounded * 100);
  const riyals = Math.floor(totalHalalas / 100);
  const halalas = totalHalalas % 100;
  const isNegative = amount < 0 && totalHalalas > 0;

  if (locale === "ar") {
    const parts = [
      ...(riyals > 0 || halalas === 0 ? [arabicRiyals(riyals)] : []),
      ...(halalas > 0 ? [arabicHalalas(halalas)] : []),
    ];
    return `${isNegative ? "سالب " : ""}${parts.join(" و")} فقط لا غير`;
  }

  const parts = [
    ...(riyals > 0 || halalas === 0
      ? [`${englishNumber(riyals)} Saudi ${riyals === 1 ? "riyal" : "riyals"}`]
      : []),
    ...(halalas > 0 ? [`${englishNumber(halalas)} ${halalas === 1 ? "halala" : "halalas"}`] : []),
  ];
  const sentence = `${isNegative ? "minus " : ""}${parts.join(" and ")} only`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
