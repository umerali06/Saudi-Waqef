import { escapeHtml } from "@/lib/email/html";

export type EmailLocale = "ar" | "en";

export type EmailContent = {
  heading?: string;
  /** Plain text; escaped here. */
  paragraphs?: string[];
  /** Label and value pairs, e.g. sign-in details. Plain text; escaped here. */
  details?: Array<[string, string]>;
  /** Trusted markup. User input inside it must already be escaped. */
  html?: string;
  action?: { label: string; url: string };
};

export type EmailOptions = EmailContent & {
  locale: EmailLocale;
  companyName?: string | null;
  footer?: string;
};

const FONT = "Tahoma,'Segoe UI',Arial,sans-serif";
const APP_NAME: Record<EmailLocale, string> = { ar: "سعودي واقف", en: "Saudi Waqef" };
const FOOTER: Record<EmailLocale, string> = {
  ar: "أُرسلت هذه الرسالة تلقائيًا من سعودي واقف.",
  en: "This message was sent automatically by Saudi Waqef.",
};
const LINK_FALLBACK: Record<EmailLocale, string> = {
  ar: "إذا لم يعمل الزر، انسخ هذا الرابط إلى المتصفح:",
  en: "If the button does not work, copy this link into your browser:",
};

const ARABIC = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufefc]/;
const ARABIC_LETTERS = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufefc]/g;
const LATIN_LETTERS = /[A-Za-z]/g;

/** Arabic when Arabic letters outnumber Latin ones in the visible text. */
export const detectEmailLocale = (body: string): EmailLocale => {
  const text = body.replace(/<[^>]+>/g, " ").replace(/https?:\/\/\S+|\S+@\S+/g, " ");
  if (!ARABIC.test(text)) {
    return "en";
  }
  const arabic = text.match(ARABIC_LETTERS)?.length ?? 0;
  const latin = text.match(LATIN_LETTERS)?.length ?? 0;
  return arabic >= latin ? "ar" : "en";
};

const textStyle = (locale: EmailLocale) =>
  `font-family:${FONT};font-size:15px;line-height:1.7;color:#22303f;text-align:${
    locale === "ar" ? "right" : "left"
  };`;

const renderSection = (locale: EmailLocale, content: EmailContent) => {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const base = textStyle(locale);
  const parts: string[] = [];

  if (content.heading) {
    parts.push(
      `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:20px;line-height:1.4;font-weight:bold;color:#0b2239;text-align:${align};">${escapeHtml(content.heading)}</h1>`
    );
  }
  (content.paragraphs ?? []).forEach((paragraph) => {
    parts.push(
      `<p style="margin:0 0 14px;${base}">${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`
    );
  });
  if (content.details?.length) {
    const rows = content.details
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 12px;${base}color:#5b6b7c;">${escapeHtml(label)}</td><td style="padding:6px 12px;${base}font-weight:bold;"><bdi>${escapeHtml(value)}</bdi></td></tr>`
      )
      .join("");
    parts.push(
      `<table role="presentation" dir="${dir}" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px;background:#f4f7fa;border:1px solid #dde4ec;">${rows}</table>`
    );
  }
  if (content.html) {
    parts.push(`<div style="margin:0 0 14px;${base}">${content.html}</div>`);
  }
  if (content.action) {
    const url = escapeHtml(content.action.url);
    parts.push(
      `<table role="presentation" dir="${dir}" align="${align}" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 16px;"><tr><td bgcolor="#185fa5" style="background:#185fa5;border-radius:6px;"><a href="${url}" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(content.action.label)}</a></td></tr></table>`,
      `<div style="clear:both;font-size:0;line-height:0;">&nbsp;</div>`,
      `<!--no-text--><p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:#5b6b7c;text-align:${align};">${LINK_FALLBACK[locale]}<br><a href="${url}" dir="ltr" style="color:#185fa5;word-break:break-all;">${url}</a></p><!--/no-text-->`
    );
  }

  return `<tr><td dir="${dir}" lang="${locale}" align="${align}" style="padding:26px 30px;${base}">${parts.join("")}</td></tr>`;
};

const renderLayout = (params: {
  locale: EmailLocale;
  title: string;
  sections: string[];
  footer: string[];
}) => {
  const dir = params.locale === "ar" ? "rtl" : "ltr";
  const align = params.locale === "ar" ? "right" : "left";
  const divider = `<tr><td style="padding:0 30px;"><div style="border-top:1px solid #dde4ec;font-size:0;line-height:0;">&nbsp;</div></td></tr>`;
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${params.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(params.title)}</title>
</head>
<body dir="${dir}" style="margin:0;padding:0;background:#eef2f6;">
<table role="presentation" dir="${dir}" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef2f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" dir="${dir}" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dde4ec;">
<tr><td dir="${dir}" align="${align}" style="padding:18px 30px;border-bottom:1px solid #dde4ec;font-family:${FONT};font-size:16px;font-weight:bold;color:#0b2239;text-align:${align};">${escapeHtml(params.title)}</td></tr>
${params.sections.join(divider)}
<tr><td dir="${dir}" align="${align}" style="padding:16px 30px;background:#f4f7fa;border-top:1px solid #dde4ec;font-family:${FONT};font-size:12px;line-height:1.7;color:#5b6b7c;text-align:${align};">${params.footer.map(escapeHtml).join("<br>")}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

export function renderEmail(options: EmailOptions) {
  return renderLayout({
    locale: options.locale,
    title: options.companyName?.trim() || APP_NAME[options.locale],
    sections: [renderSection(options.locale, options)],
    footer: [options.footer ?? FOOTER[options.locale]],
  });
}

/** Both languages in one mail, the reader's likely one first. */
export function renderBilingualEmail(options: {
  first: EmailLocale;
  ar: EmailContent;
  en: EmailContent;
}) {
  const order: EmailLocale[] = options.first === "en" ? ["en", "ar"] : ["ar", "en"];
  return renderLayout({
    locale: order[0],
    title: `${APP_NAME[order[0]]} | ${APP_NAME[order[1]]}`,
    sections: order.map((locale) => renderSection(locale, options[locale])),
    footer: order.map((locale) => FOOTER[locale]),
  });
}

/** Puts a bare fragment into the standard layout; complete documents pass unchanged. */
export function wrapEmailBody(body: string) {
  if (/<html[\s>]/i.test(body)) {
    return body;
  }
  const html = /<(p|div|table|ul|ol|h[1-6]|br)[\s/>]/i.test(body)
    ? body
    : body.trim().replace(/\r?\n/g, "<br>");
  return renderEmail({ locale: detectEmailLocale(body), html });
}

const decodeEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");

/** Plain-text alternative: links become "label: url" and blocks become lines. */
export function htmlToText(html: string) {
  const text = html
    .replace(/<!--no-text-->[\s\S]*?<!--\/no-text-->/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script)[\s>][\s\S]*?<\/\1>/gi, "")
    .replace(/\s+/g, " ")
    .replace(
      /<a\s[^>]*?href=(["'])(.*?)\1[^>]*>(.*?)<\/a>/gi,
      (_, _quote: string, url: string, inner: string) => {
        const label = inner.replace(/<[^>]+>/g, "").trim();
        const target = url.replace(/^mailto:/i, "");
        return !label || label === target ? target : `${label}: ${target}`;
      }
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/td>\s*<td[^>]*>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
