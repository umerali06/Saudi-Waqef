import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { Preloader } from "@/components/preloader";
import { Providers } from "@/components/providers";
import { DEFAULT_LOCALE, messages, type Locale } from "@/i18n/messages";
import "./globals.css";

const plexSans = IBM_Plex_Sans_Arabic({
  variable: "--font-plex",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Saudi Waqef", template: "%s | Saudi Waqef" },
  description: "Saudi accounting, ZATCA e-invoicing and HR",
  applicationName: "Saudi Waqef",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;
  // The cookie is editable by the visitor; anything unknown falls back.
  const locale: Locale = cookieLocale === "ar" || cookieLocale === "en" ? cookieLocale : DEFAULT_LOCALE;
  const text = messages[locale];

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body
        className={`${plexSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <Preloader name={text["app.name"]} tagline={text["app.tagline"]} />
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
