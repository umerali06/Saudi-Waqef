import { describe, expect, it } from "vitest";
import {
  detectEmailLocale,
  htmlToText,
  renderBilingualEmail,
  renderEmail,
  wrapEmailBody,
} from "@/lib/email/template";

describe("renderEmail", () => {
  const html = renderEmail({
    locale: "ar",
    heading: "إعادة تعيين كلمة المرور",
    paragraphs: ["مرحبًا <b>أحمد</b>"],
    action: { label: "إعادة التعيين", url: "https://example.com/reset?a=1&b=2" },
    companyName: "شركة & أبناؤه",
  });

  it("lays Arabic out right to left", () => {
    expect(html).toContain('<html dir="rtl" lang="ar">');
    expect(html).toContain("text-align:right");
    expect(html).not.toContain("text-align:left");
  });

  it("escapes text and shows the button link as plain text too", () => {
    expect(html).toContain("&lt;b&gt;أحمد&lt;/b&gt;");
    expect(html).toContain("شركة &amp; أبناؤه");
    expect(html.match(/https:\/\/example\.com\/reset\?a=1&amp;b=2/g)).toHaveLength(3);
  });
});

describe("renderBilingualEmail", () => {
  it("puts the preferred language first and gives each its own direction", () => {
    const html = renderBilingualEmail({
      first: "en",
      ar: { heading: "تم استلام الطلب" },
      en: { heading: "Request received" },
    });
    expect(html.indexOf("Request received")).toBeLessThan(html.indexOf("تم استلام الطلب"));
    expect(html).toContain('<td dir="rtl" lang="ar"');
    expect(html).toContain('<td dir="ltr" lang="en"');
  });
});

describe("wrapEmailBody", () => {
  it("wraps fragments by their own language and leaves documents alone", () => {
    expect(wrapEmailBody("<p>فاتورة رقم INV-1</p>")).toContain('dir="rtl"');
    expect(wrapEmailBody("<p>Invoice INV-1</p>")).toContain('<html dir="ltr" lang="en">');
    const full = "<html><body>x</body></html>";
    expect(wrapEmailBody(full)).toBe(full);
    expect(wrapEmailBody("line one\nline two")).toContain("line one<br>line two");
  });

  it("ignores links and addresses when detecting the language", () => {
    expect(detectEmailLocale("مرحبا https://a-very-long-domain.example.com/path")).toBe("ar");
    expect(detectEmailLocale("Hello from شركة to all of our customers")).toBe("en");
  });
});

describe("htmlToText", () => {
  it("keeps links and line structure", () => {
    expect(
      htmlToText('<p>Hello &amp; welcome</p><p><a href="https://x.sa/a">Open</a></p><ul><li>One</li></ul>')
    ).toBe("Hello & welcome\nOpen: https://x.sa/a\n\n- One");
  });

  it("turns a rendered mail into readable text without the link twice", () => {
    const text = htmlToText(
      renderEmail({
        locale: "en",
        heading: "Reset",
        paragraphs: ["Use the button."],
        details: [["Email", "a@b.sa"]],
        action: { label: "Reset now", url: "https://x.sa/r" },
      })
    );
    expect(text).toContain("Email a@b.sa");
    expect(text).toContain("Reset now: https://x.sa/r");
    expect(text.match(/https:\/\/x\.sa\/r/g)).toHaveLength(1);
    expect(text).not.toContain("<");
  });
});
