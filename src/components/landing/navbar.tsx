"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/auth-helpers";
import { useTranslations } from "@/i18n/provider";

interface NavbarProps {
  user: SessionUser | null;
}

export function Navbar({ user }: NavbarProps) {
  const { t, locale, setLocale } = useTranslations();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: t("landing.nav.features"), href: "#features" },
    { name: t("landing.nav.pricing"), href: "#pricing" },
  ];

  const toggleLanguage = () => {
    setLocale(locale === "ar" ? "en" : "ar");
  };

  return (
    <header
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-white/80 backdrop-blur-md border-b border-slate-200/50 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white transition-transform group-hover:scale-110">
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
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-sm font-medium text-slate-600 hover:text-primary transition-colors"
              >
                {link.name}
              </Link>
            ))}
            <button
              onClick={toggleLanguage}
              className="text-sm font-medium text-slate-600 hover:text-primary transition-colors"
            >
              {locale === "ar" ? "English" : "العربية"}
            </button>
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <Link
                href="/dashboard"
                className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 hover:shadow-md"
              >
                {t("landing.nav.dashboard")}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {t("landing.nav.login")}
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 hover:shadow-md"
                >
                  {t("landing.nav.startTrial")}
                </Link>
              </>
            )}
          </div>


          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-slate-600 hover:text-slate-900"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-4 py-6 shadow-lg">
          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-base font-medium text-slate-600 hover:text-primary"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.name}
              </Link>
            ))}
             <button
                onClick={() => {
                  toggleLanguage();
                  setIsMobileMenuOpen(false);
                }}
                className="text-base font-medium text-slate-600 hover:text-primary text-right"
              >
                {locale === "ar" ? "English" : "العربية"}
              </button>
            <div className="mt-4 flex flex-col gap-3">
              {user ? (
                <Link
                  href="/dashboard"
                  className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {t("landing.nav.dashboard")}
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-700"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {t("landing.nav.login")}
                  </Link>
                  <Link
                    href="/register"
                    className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {t("landing.nav.startTrial")}
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

