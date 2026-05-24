"use client";

import { useTranslations } from "@/i18n/provider";
import { ROLE_OPTIONS } from "@/lib/constants";
import type { Role } from "@/lib/types";

const PERMISSION_SECTIONS: Array<{
  titleKey: string;
  items: Array<{ key: string; roles: Role[] }>;
}> = [
  {
    titleKey: "permissions.section.company",
    items: [
      { key: "permissions.manageCompanyProfile", roles: ["owner", "admin"] },
      { key: "permissions.manageUsersRoles", roles: ["owner", "admin"] },
      { key: "permissions.viewAuditLogs", roles: ["owner", "admin"] },
      { key: "permissions.manageCompanySettings", roles: ["owner", "admin"] },
      { key: "permissions.manageSecurity", roles: ["owner", "admin"] },
    ],
  },
  {
    titleKey: "permissions.section.accounting",
    items: [
      { key: "permissions.manageChartOfAccounts", roles: ["owner", "admin", "accountant"] },
      { key: "permissions.postJournalEntries", roles: ["owner", "admin", "accountant"] },
      { key: "permissions.viewFinancialReports", roles: ["owner", "admin", "accountant"] },
    ],
  },
  {
    titleKey: "permissions.section.sales",
    items: [
      { key: "permissions.manageSales", roles: ["owner", "admin", "accountant"] },
    ],
  },
  {
    titleKey: "permissions.section.purchases",
    items: [
      { key: "permissions.managePurchases", roles: ["owner", "admin", "accountant"] },
    ],
  },
  {
    titleKey: "permissions.section.hr",
    items: [
      { key: "permissions.manageEmployees", roles: ["owner", "admin", "hr"] },
      { key: "permissions.manageAttendanceLeave", roles: ["owner", "admin", "hr"] },
      { key: "permissions.managePayroll", roles: ["owner", "admin", "hr"] },
      { key: "permissions.employeeSelfService", roles: ["employee"] },
    ],
  },
  {
    titleKey: "permissions.section.reports",
    items: [
      { key: "permissions.viewReports", roles: ["owner", "admin", "accountant", "hr", "viewer"] },
      { key: "permissions.exportReports", roles: ["owner", "admin", "accountant", "hr"] },
    ],
  },
];

export default function RolesPermissionsPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("permissions.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("permissions.subtitle")}</p>
      </div>

      {PERMISSION_SECTIONS.map((section) => (
        <div key={section.titleKey} className="app-card overflow-hidden card-modern">
          <div className="border-b border-border px-4 py-2 text-sm font-semibold">
            {t(section.titleKey)}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("permissions.permissionHeader")}</th>
                  {ROLE_OPTIONS.map((role) => (
                    <th key={role} className={`px-4 py-2 ${alignClass}`}>
                      {t(`role.${role}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {section.items.map((item) => (
                  <tr key={item.key}>
                    <td className="px-4 py-2 font-medium">{t(item.key)}</td>
                    {ROLE_OPTIONS.map((role) => (
                      <td key={role} className={`px-4 py-2 ${alignClass}`}>
                        {item.roles.includes(role) ? t("common.yes") : t("common.no")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
