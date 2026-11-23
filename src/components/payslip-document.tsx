"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/provider";
import type { Payslip, PayslipDocument as PayslipData } from "@/lib/data/payslips";

export function PayslipDocument({ source }: { source: string }) {
  const { t, locale } = useTranslations();
  const [data, setData] = useState<PayslipData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(source)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((result: PayslipData) => setData(result))
      .catch(() => setFailed(true));
  }, [source]);

  if (!data) {
    return (
      <div className="min-h-screen bg-white p-8 text-sm text-muted">
        {failed ? t("payroll.payslip.notAvailable") : t("common.loading")}
      </div>
    );
  }

  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", {
      style: "currency",
      currency,
    }).format(value);

  const renderRow = (label: string, value: number, currency: string) => (
    <tr key={label} className="border-b border-border">
      <td className="py-1.5 text-start">{label}</td>
      <td className="py-1.5 text-end tabular-nums">{money(value, currency)}</td>
    </tr>
  );

  const renderPayslip = ({ id, employee, item }: Payslip, index: number) => {
    const earnings: Array<[string, number]> = [
      [t("payroll.payslip.basic"), item.baseSalary],
      [t("payroll.payslip.allowances"), item.allowances],
      [t("payroll.itemOvertime"), item.overtimePay],
      [t("payroll.itemAdjustments"), item.adjustmentsTotal],
    ];
    const deductions: Array<[string, number]> = [
      [t("payroll.payslip.gosi"), item.gosiDeduction],
      [t("payroll.payslip.incomeTax"), item.incomeTaxDeduction],
      [t("payroll.payslip.unpaidLeave", { days: String(item.unpaidLeaveDays) }), item.unpaidLeaveDeduction],
      [t("payroll.payslip.absence", { days: String(item.absentDays) }), item.absenceDeduction],
      [t("payroll.payslip.lateness", { minutes: String(item.lateMinutes) }), item.latenessDeduction],
      [t("payroll.payslip.fixedDeductions"), item.fixedDeductions],
    ];
    const department = locale === "ar" ? employee.departmentAr : employee.departmentEn;
    const position = locale === "ar" ? employee.positionAr : employee.positionEn;

    return (
      <article
        key={id}
        className={`rounded-2xl border border-border p-6 print:rounded-none print:border-none print:p-0 ${
          index > 0 ? "mt-6 print:mt-0 print:break-before-page" : ""
        }`}
      >
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-4">
          <div>
            {data.company.logoUrl ? (
              <Image
                src={data.company.logoUrl}
                alt={t("branding.logoAlt")}
                className="h-10 w-auto"
                width={160}
                height={40}
                unoptimized
              />
            ) : null}
            <h2 className="mt-2 text-xl font-semibold">{data.company.name}</h2>
            <p className="text-sm text-muted">{t("payroll.payslip.title")}</p>
          </div>
          <div className="space-y-1 text-sm">
            <p>
              {t("payroll.runPeriod")}:{" "}
              <span className="font-semibold" dir="ltr">
                {data.run.periodStart} – {data.run.periodEnd}
              </span>
            </p>
            <p>
              {t("payroll.runStatus")}: {t(`payroll.status.${data.run.status}`)}
            </p>
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">{t("payroll.itemEmployee")}</dt>
            <dd className="font-semibold">
              {locale === "ar" ? employee.nameAr : employee.nameEn}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("payroll.payslip.employeeNumber")}</dt>
            <dd>{employee.employeeNumber ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("payroll.departmentName")}</dt>
            <dd>{department ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("payroll.payslip.position")}</dt>
            <dd>{position ?? "-"}</dd>
          </div>
        </dl>

        <div className="mt-6 grid gap-8 text-sm md:grid-cols-2 print:grid-cols-2">
          <section>
            <h3 className="mb-2 font-semibold">{t("payroll.payslip.earnings")}</h3>
            <table className="w-full">
              <tbody>
                {earnings.map(([label, value]) => renderRow(label, value, item.currency))}
              </tbody>
            </table>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">{t("payroll.itemDeductions")}</h3>
            <table className="w-full">
              <tbody>
                {deductions.map(([label, value]) => renderRow(label, value, item.currency))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
          <div>
            <p className="text-xs text-muted">{t("payroll.itemGross")}</p>
            <p className="font-semibold tabular-nums">
              {money(item.grossPay + item.adjustmentsTotal, item.currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("payroll.itemDeductions")}</p>
            <p className="font-semibold tabular-nums">
              {money(item.totalDeductions, item.currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("payroll.itemNet")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {money(item.netPay, item.currency)}
            </p>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="mx-auto min-h-screen max-w-4xl bg-white p-8 text-foreground print:max-w-none print:p-0"
    >
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">{t("payroll.payslip.title")}</h1>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold"
        >
          {t("payroll.payslip.print")}
        </button>
      </div>
      {data.payslips.map(renderPayslip)}
    </div>
  );
}
