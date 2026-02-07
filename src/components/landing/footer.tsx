"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export function Footer() {
  const { t, locale } = useTranslations();
  const isRtl = locale === "ar";

  const footerLinks = {
    product: [
      { name: t("landing.footer.product.features"), href: "#features" },
      { name: t("landing.footer.product.pricing"), href: "#pricing" },
      { name: t("landing.footer.product.security"), href: "#" },
      { name: t("landing.footer.product.roadmap"), href: "#" },
    ],
    company: [
      { name: t("landing.footer.company.about"), href: "#" },
      { name: t("landing.footer.company.careers"), href: "#" },
      { name: t("landing.footer.company.blog"), href: "#" },
      { name: t("landing.footer.company.contact"), href: "#" },
    ],
    resources: [
      { name: t("landing.footer.resources.help"), href: "#" },
      { name: t("landing.footer.resources.api"), href: "#" },
      { name: t("landing.footer.resources.status"), href: "#" },
      { name: t("landing.footer.resources.partners"), href: "#" },
    ],
    legal: [
      { name: t("landing.footer.legal.privacy"), href: "#" },
      { name: t("landing.footer.legal.terms"), href: "#" },
    ],
  };

  return (
    <footer dir={isRtl ? "rtl" : "ltr"} className="bg-white border-t border-slate-200">
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M3 21h18" />
                  <path d="M5 21V7l8-4 8 4v14" />
                  <path d="M17 21v-8.5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5V21" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">
                {t("app.name")}
              </span>
            </Link>
            <p className="mt-4 text-sm text-slate-500 max-w-sm leading-relaxed">
              {t("landing.footer.description")}
            </p>
            <div className="mt-6 flex space-x-4">
              {/* Social Media Icons - Placeholder */}
              {[1, 2, 3, 4].map((item) => (
                <a key={item} href="#" className="text-slate-400 hover:text-primary transition-colors">
                  <span className="sr-only">Social</span>
                  <div className="h-6 w-6 bg-current rounded-full opacity-20 hover:opacity-100"></div>
                </a>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 tracking-wider uppercase">{t("landing.footer.product.title")}</h3>
            <ul className="mt-4 space-y-4">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-slate-500 hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 tracking-wider uppercase">{t("landing.footer.company.title")}</h3>
            <ul className="mt-4 space-y-4">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-slate-500 hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 tracking-wider uppercase">{t("landing.footer.resources.title")}</h3>
            <ul className="mt-4 space-y-4">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-slate-500 hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-slate-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} {t("app.name")}. {t("landing.footer.rights")}
          </p>
          <div className="flex space-x-6">
            {footerLinks.legal.map((link) => (
              <Link key={link.name} href={link.href} className="text-sm text-slate-400 hover:text-primary transition-colors">
                {link.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
