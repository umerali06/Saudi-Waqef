"use client";

import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import type { Role } from "@/lib/types";

export default function HrPage() {
  const { activeCompany } = useCompany();
  const { t } = useTranslations();
  const role = (activeCompany?.role ?? "viewer") as Role;
  const isEmployeeOnly = role === "employee";

  const cards = [
    {
      key: "employees",
      href: "/hr/employees",
      title: t("hr.cards.employeesTitle"),
      description: t("hr.cards.employeesDescription"),
      roles: ["owner", "admin", "hr"],
    },
    {
      key: "departments",
      href: "/hr/departments",
      title: t("hr.cards.departmentsTitle"),
      description: t("hr.cards.departmentsDescription"),
      roles: ["owner", "admin", "hr"],
    },
    {
      key: "positions",
      href: "/hr/positions",
      title: t("hr.cards.positionsTitle"),
      description: t("hr.cards.positionsDescription"),
      roles: ["owner", "admin", "hr"],
    },
    {
      key: "attendance",
      href: "/hr/attendance",
      title: t("hr.cards.attendanceTitle"),
      description: t("hr.cards.attendanceDescription"),
      roles: ["owner", "admin", "hr", "employee"],
    },
    {
      key: "leave",
      href: "/hr/leave",
      title: t("hr.cards.leaveTitle"),
      description: t("hr.cards.leaveDescription"),
      roles: ["owner", "admin", "hr", "employee"],
    },
    {
      key: "payroll",
      href: "/hr/payroll",
      title: t("hr.cards.payrollTitle"),
      description: t("hr.cards.payrollDescription"),
      roles: ["owner", "admin", "hr"],
    },
    {
      key: "reports",
      href: "/hr/reports",
      title: t("hr.cards.reportsTitle"),
      description: t("hr.cards.reportsDescription"),
      roles: ["owner", "admin", "hr"],
    },
    {
      key: "myProfile",
      href: "/hr/my-profile",
      title: t("hr.cards.myProfileTitle"),
      description: t("hr.cards.myProfileDescription"),
      roles: ["owner", "admin", "hr", "employee"],
    },
  ];

  const visibleCards = cards.filter((card) => card.roles.includes(role));
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("hr.title")}</h1>
        <p className="text-sm text-muted">
          {t("labels.activeCompany", {
            company: activeCompany?.name ?? t("common.na"),
          })}
        </p>
        {isEmployeeOnly ? (
          <p className="mt-2 text-xs text-muted">{t("hr.employeeScopeNotice")}</p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {visibleCards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="app-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <h2 className="text-lg font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm text-muted">{card.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
