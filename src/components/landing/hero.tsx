"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export function Hero() {
  const { t, locale } = useTranslations();
  const isRtl = locale === "ar";

  return (
    <section dir={isRtl ? "rtl" : "ltr"} className="relative overflow-hidden pt-32 pb-20 lg:pt-48 lg:pb-32 bg-gradient-to-b from-white to-slate-50/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-sm font-medium text-primary mb-8">
            <span className="flex h-2 w-2 rounded-full bg-primary mx-2"></span>
            {t("landing.hero.badge")}
          </div>
          
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-7xl">
            {t("landing.hero.title1")} <br className="hidden sm:block" />
            <span className="text-primary relative inline-block">
              {t("landing.hero.title2")}
              <svg className="absolute -bottom-2 left-0 w-full h-2 text-primary/20" viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" />
              </svg>
            </span>
          </h1>
          
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 sm:text-xl leading-relaxed">
            {t("landing.hero.description")}
          </p>
          
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row w-full sm:w-auto">
            <Link
              href="/register"
              className="w-full sm:w-auto rounded-xl bg-primary px-8 py-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-xl hover:-translate-y-0.5"
            >
              {t("landing.hero.cta.trial")}
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-8 py-4 text-base font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:-translate-y-0.5"
            >
              {t("landing.hero.cta.demo")}
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{t("landing.hero.trust.noCard")}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{t("landing.hero.trust.cancel")}</span>
            </div>
          </div>
        </div>

        {/* Enhanced Dashboard Preview */}
        <div className="mt-20 relative mx-auto max-w-6xl">
          {/* Background Glow */}
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-blue-600 rounded-2xl blur opacity-20"></div>
          
          {/* Main Container */}
          <div className="relative rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="aspect-[16/10] bg-slate-50 flex flex-col">
              
              {/* Window Header */}
              <div className="h-10 border-b border-slate-200 bg-white flex items-center px-4 gap-2">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400"></div>
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400"></div>
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400"></div>
                </div>
                <div className="ml-4 flex-1 flex justify-center">
                  <div className="h-5 w-64 rounded-md bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                    app.saudiwaqef.com/dashboard
                  </div>
                </div>
              </div>

              {/* App Interface */}
              <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="hidden lg:flex w-64 flex-col border-e border-slate-200 bg-slate-900 pt-5 pb-4">
                  <div className="flex items-center px-6 mb-8">
                    <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-xl">W</div>
                    <span className="mx-3 text-white font-semibold">Saudi Waqef</span>
                  </div>
                  <nav className="flex-1 space-y-1 px-3">
                    {[
                      { name: t("nav.dashboard"), icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", active: true },
                      { name: t("nav.sales"), icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", active: false },
                      { name: t("nav.purchases"), icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z", active: false },
                      { name: t("nav.hr"), icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z", active: false },
                      { name: t("nav.reports"), icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", active: false },
                    ].map((item) => (
                      <div
                        key={item.name}
                        className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg ${
                          item.active
                            ? "bg-primary text-white"
                            : "text-slate-400 hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        <svg className={`mr-3 h-5 w-5 flex-shrink-0 ${item.active ? "text-white" : "text-slate-500 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                        </svg>
                        {item.name}
                      </div>
                    ))}
                  </nav>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
                  {/* Top Bar */}
                  <div className="h-16 flex items-center justify-between border-b border-slate-200 bg-white px-8">
                    <h2 className="text-xl font-bold text-slate-900">{t("nav.dashboard")}</h2>
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        JD
                      </div>
                    </div>
                  </div>

                  {/* Dashboard Content */}
                  <div className="p-8 overflow-auto">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                      {[
                        { label: "Total Revenue", value: "SAR 145,200", change: "+12%", trend: "up", color: "bg-emerald-500" },
                        { label: "Active Invoices", value: "24", change: "+4", trend: "up", color: "bg-blue-500" },
                        { label: "Expenses", value: "SAR 32,450", change: "-2%", trend: "down", color: "bg-amber-500" },
                        { label: "Net Profit", value: "SAR 112,750", change: "+15%", trend: "up", color: "bg-purple-500" },
                      ].map((stat, i) => (
                        <div key={i} className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-slate-100">
                          <dt>
                            <div className={`absolute rounded-md p-3 ${stat.color} opacity-10`}></div>
                            <div className={`absolute rounded-md p-3 ${stat.color} bg-opacity-0`}>
                                <div className={`h-6 w-6 ${stat.color.replace('bg-', 'text-')}`}></div>
                            </div>
                            <p className="ml-16 truncate text-sm font-medium text-slate-500">{stat.label}</p>
                          </dt>
                          <dd className="ml-16 flex items-baseline pb-1 sm:pb-2">
                            <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
                          </dd>
                          <div className="ml-16 flex items-center text-sm">
                             <span className={`font-medium ${stat.trend === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
                                {stat.change}
                             </span>
                             <span className="ml-2 text-slate-400">vs last month</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Main Chart */}
                      <div className="lg:col-span-2 rounded-xl bg-white p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="text-lg font-medium text-slate-900">Revenue Overview</h3>
                          <div className="flex gap-2">
                            <div className="h-8 w-24 rounded-md bg-slate-50 border border-slate-200"></div>
                          </div>
                        </div>
                        <div className="h-64 flex items-end justify-between gap-2 px-2">
                          {[35, 45, 30, 60, 75, 50, 65, 80, 70, 90, 85, 95].map((h, i) => (
                            <div key={i} className="w-full bg-primary/10 rounded-t-sm relative group">
                              <div 
                                className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-sm transition-all duration-500"
                                style={{ height: `${h}%` }}
                              ></div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex justify-between text-xs text-slate-400">
                          <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
                          <span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
                        </div>
                      </div>

                      {/* Recent Activity */}
                      <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
                        <h3 className="text-lg font-medium text-slate-900 mb-6">Recent Activity</h3>
                        <div className="space-y-6">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex gap-4">
                              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                <div className="h-2 w-2 rounded-full bg-slate-400"></div>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">New Invoice #102{i}</p>
                                <p className="text-xs text-slate-500">Created for Client ABC</p>
                              </div>
                              <div className="ml-auto text-xs text-slate-400">2h ago</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
