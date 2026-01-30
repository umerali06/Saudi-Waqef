import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Cairo, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/messages";
import "./globals.css";

const cairoSans = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Saudi Waqef",
  description: "Saudi accounting and HR platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value as Locale | undefined;
  const locale = cookieLocale ?? DEFAULT_LOCALE;

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body
        className={`${cairoSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
