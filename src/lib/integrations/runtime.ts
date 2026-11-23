import { listAttendanceRecords } from "@/lib/data/attendance-records";
import type { IntegrationRecord } from "@/lib/data/integrations";
import { listPurchaseBills } from "@/lib/data/purchase-bills";
import { listPayrollRunItems } from "@/lib/data/payroll-run-items";
import { listPayrollRuns } from "@/lib/data/payroll-runs";
import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { listEmployees } from "@/lib/data/employees";
import { getCompanyById } from "@/lib/data/companies";
import { getEmployeeContractById } from "@/lib/data/employee-contracts";
import {
  buildFilingRows,
  describeFilingIssues,
  findFilingIssues,
  findFilingRun,
} from "@/lib/integrations/payroll-source";
import { assertPublicUrl } from "@/lib/integrations/url-guard";
import { buildGosiPayload } from "@/lib/integrations/gosi/payload";
import { buildMudadPayload } from "@/lib/integrations/mudad/payload";

type IntegrationMode = "test" | "sync";

type IntegrationResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  bodyPreview: string;
  bodyJson: unknown | null;
  requestUrl: string;
  durationMs: number;
  attempt: number;
  responseHeaders: Record<string, string>;
  callback?: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    statusText?: string;
    error?: string;
  };
};

const trimString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const getConfigValue = (config: Record<string, unknown> | undefined, key: string) =>
  config && key in config ? config[key] : undefined;

const parseTimeout = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 15000;
  }
  return Math.min(Math.max(parsed, 1000), 60000);
};

const parseRetries = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 5);
};

const parseBackoff = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1000;
  }
  return Math.min(Math.max(Math.trunc(parsed), 200), 5000);
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getStringArrayConfig = (
  config: Record<string, unknown> | undefined,
  key: string
) => {
  const raw = getConfigValue(config, key);
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

const getAuthHeaders = (integration: IntegrationRecord) => {
  const config = integration.config ?? {};
  const credentials = integration.credentials ?? {};
  const authType = trimString(getConfigValue(config, "authType")) || "bearer";
  const apiKey = trimString(credentials.apiKey);
  const username = trimString(credentials.username);
  const password = trimString(credentials.password);

  if (authType === "none") {
    return {};
  }
  if (authType === "basic" && username && password) {
    return {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    };
  }
  if (!apiKey) {
    return {};
  }
  if (authType === "api_key") {
    const headerName = trimString(getConfigValue(config, "apiKeyHeader")) || "X-API-Key";
    return { [headerName]: apiKey };
  }
  return { Authorization: `Bearer ${apiKey}` };
};

const getCustomHeaders = (config: Record<string, unknown> | undefined) => {
  const candidate = getConfigValue(config, "headers");
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }

  const headers: Record<string, string> = {};
  Object.entries(candidate as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim()) {
      headers[key] = value.trim();
    }
  });
  return headers;
};

const getDefaultIdempotencyHeader = (connector: string) => {
  if (connector === "zatca") {
    return "X-Correlation-Id";
  }
  return "Idempotency-Key";
};

const resolveRequestUrl = (integration: IntegrationRecord, mode: IntegrationMode) => {
  const config = integration.config ?? {};
  const endpoint = trimString(getConfigValue(config, mode === "test" ? "testEndpoint" : "syncEndpoint"));
  const baseEndpoint = endpoint || trimString(getConfigValue(config, "endpoint"));

  if (!baseEndpoint) {
    throw new Error("Integration endpoint is required");
  }

  const path = trimString(getConfigValue(config, mode === "test" ? "testPath" : "syncPath"));
  return path ? new URL(path, baseEndpoint).toString() : baseEndpoint;
};

const getMethod = (integration: IntegrationRecord, mode: IntegrationMode) => {
  const config = integration.config ?? {};
  const configured = trimString(
    getConfigValue(config, mode === "test" ? "testMethod" : "syncMethod")
  );
  if (configured) {
    return configured.toUpperCase();
  }
  return mode === "test" ? "GET" : "POST";
};

const setPathValue = (target: Record<string, unknown>, dottedPath: string, value: unknown) => {
  const segments = dottedPath.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) return;

  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const existing = cursor[key];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
};

const getPathValue = (source: unknown, dottedPath: string) => {
  if (!dottedPath) return undefined;
  const segments = dottedPath.split(".").map((segment) => segment.trim()).filter(Boolean);
  let cursor: unknown = source;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

const applyTemplate = (template: unknown, source: unknown): unknown => {
  if (typeof template === "string") {
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, path: string) => {
      const value = getPathValue(source, path.trim());
      return value === undefined || value === null ? "" : String(value);
    });
  }
  if (Array.isArray(template)) {
    return template.map((item) => applyTemplate(item, source));
  }
  if (template && typeof template === "object") {
    const result: Record<string, unknown> = {};
    Object.entries(template as Record<string, unknown>).forEach(([key, value]) => {
      result[key] = applyTemplate(value, source);
    });
    return result;
  }
  return template;
};

const buildBasePayload = async (integration: IntegrationRecord) => {
  const [employees, payrollRuns, attendanceRecords, salesInvoices, purchaseBills] = await Promise.all([
    listEmployees(integration.companyId),
    listPayrollRuns(integration.companyId),
    listAttendanceRecords(integration.companyId),
    listSalesInvoices(integration.companyId),
    listPurchaseBills(integration.companyId),
  ]);

  const latestRun =
    [...payrollRuns].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0] ?? null;
  const latestRunItems = latestRun ? await listPayrollRunItems(latestRun.id) : [];
  const attendanceWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const recentAttendance = attendanceRecords.filter((record) => record.date >= attendanceWindowStart);

  return {
    source: "saudi-waqef",
    connector: integration.connector,
    companyId: integration.companyId,
    environment: integration.environment,
    triggeredAt: new Date().toISOString(),
    employees: {
      total: employees.length,
      active: employees.filter((employee) => employee.status === "active").length,
      terminated: employees.filter((employee) => employee.status === "terminated").length,
      records: employees.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employeeNumber ?? null,
        nameAr: employee.nameAr,
        nameEn: employee.nameEn,
        departmentId: employee.departmentId ?? null,
        positionId: employee.positionId ?? null,
        hireDate: employee.hireDate ?? null,
        status: employee.status,
      })),
    },
    payroll: latestRun
      ? {
          run: latestRun,
          items: latestRunItems.map((item) => ({
            employeeId: item.employeeId,
            currency: item.currency,
            grossPay: item.grossPay,
            totalDeductions: item.totalDeductions,
            netPay: item.netPay,
            absenceDeduction: item.absenceDeduction,
            unpaidLeaveDeduction: item.unpaidLeaveDeduction,
            gosiDeduction: item.gosiDeduction,
          })),
        }
      : null,
    attendance: {
      windowStart: attendanceWindowStart,
      totalRecords: recentAttendance.length,
      absences: recentAttendance.filter((record) => record.status === "absent").length,
      lateRecords: recentAttendance.filter((record) => record.status === "late").length,
      overtimeMinutes: recentAttendance.reduce(
        (sum, record) => sum + (record.overtimeMinutes ?? 0),
        0
      ),
    },
    sales: {
      invoiceCount: salesInvoices.length,
      approvedInvoiceCount: salesInvoices.filter((invoice) =>
        ["approved", "sent", "partially_paid", "paid"].includes(invoice.status)
      ).length,
      invoices: salesInvoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        currency: invoice.currency,
        customerName: invoice.customerName,
        subtotal: invoice.subtotal,
        discountTotal: invoice.discountTotal,
        taxTotal: invoice.taxTotal,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        balance: invoice.balance,
        lines: invoice.lines,
      })),
    },
    purchases: {
      billCount: purchaseBills.length,
      approvedBillCount: purchaseBills.filter((bill) =>
        ["approved", "partially_paid", "paid"].includes(bill.status)
      ).length,
      bills: purchaseBills.map((bill) => ({
        id: bill.id,
        billNumber: bill.billNumber,
        vendorBillNumber: bill.vendorBillNumber ?? null,
        status: bill.status,
        billDate: bill.billDate,
        dueDate: bill.dueDate,
        currency: bill.currency,
        vendorName: bill.vendorName,
        subtotal: bill.subtotal,
        discountTotal: bill.discountTotal,
        taxTotal: bill.taxTotal,
        total: bill.total,
        amountPaid: bill.amountPaid,
        balance: bill.balance,
        lines: bill.lines,
      })),
    },
  };
};

const buildPayloadFromFields = (
  basePayload: Record<string, unknown>,
  fields: Record<string, unknown>
) => {
  const output: Record<string, unknown> = {};
  Object.entries(fields).forEach(([targetPath, sourcePath]) => {
    if (typeof sourcePath !== "string" || !sourcePath.trim()) return;
    const value = getPathValue(basePayload, sourcePath.trim());
    setPathValue(output, targetPath, value ?? null);
  });
  return output;
};

const filterBasePayload = (
  basePayload: Record<string, unknown>,
  includeDatasets: string[]
) => {
  if (includeDatasets.length === 0) {
    return basePayload;
  }
  const filtered: Record<string, unknown> = {};
  includeDatasets.forEach((dataset) => {
    const value = getPathValue(basePayload, dataset);
    if (value !== undefined) {
      setPathValue(filtered, dataset, value);
    }
  });
  return filtered;
};

/** GOSI and Mudad file one approved payroll run; incomplete records stop the filing. */
const buildPayrollFiling = async (integration: IntegrationRecord) => {
  const config = integration.config ?? {};
  const [company, employees, runs] = await Promise.all([
    getCompanyById(integration.companyId),
    listEmployees(integration.companyId),
    listPayrollRuns(integration.companyId),
  ]);
  const run = findFilingRun(runs);
  if (!run) throw new Error("PAYROLL_RUN_REQUIRED: approve a payroll run before filing.");
  const items = await listPayrollRunItems(run.id);
  const contracts = new Map(
    await Promise.all(
      [...new Set(items.map((item) => item.contractId))].map(
        async (id) => [id, id ? await getEmployeeContractById(id) : null] as const
      )
    )
  );
  const rows = buildFilingRows({ employees, items, contracts });
  const issues = findFilingIssues(rows, { requireIban: integration.connector === "mudad" });
  if (issues.length > 0) throw new Error(describeFilingIssues(issues));

  const establishment = {
    name: company?.legalName || company?.name || "",
    crNumber: company?.crNumber ?? null,
  };
  return integration.connector === "gosi"
    ? buildGosiPayload({
        establishment: {
          ...establishment,
          gosiNumber: trimString(getConfigValue(config, "establishmentNumber")) || null,
        },
        run,
        rows,
      })
    : buildMudadPayload({
        establishment: {
          ...establishment,
          molNumber: trimString(getConfigValue(config, "establishmentNumber")) || null,
          payerIban: trimString(getConfigValue(config, "payerIban")) || null,
        },
        run,
        rows,
      });
};

export const buildRequestPayload = async (integration: IntegrationRecord) => {
  const config = integration.config ?? {};
  if (integration.connector === "gosi" || integration.connector === "mudad") {
    return buildPayrollFiling(integration);
  }
  const basePayload = await buildBasePayload(integration);
  const includeDatasets = getStringArrayConfig(config, "includeDatasets");
  const filteredBase = filterBasePayload(basePayload as Record<string, unknown>, includeDatasets);

  const payloadMode = trimString(getConfigValue(config, "payloadMode")) || "base";
  const mapping = getConfigValue(config, "mapping");

  if (
    payloadMode === "fields" &&
    mapping &&
    typeof mapping === "object" &&
    !Array.isArray(mapping)
  ) {
    return buildPayloadFromFields(filteredBase as Record<string, unknown>, mapping as Record<string, unknown>);
  }

  const template = getConfigValue(config, "payloadTemplate");
  if (payloadMode === "template" && template && typeof template === "object") {
    return applyTemplate(template, filteredBase);
  }

  return filteredBase;
};

const shouldRetry = (status: number, attempt: number, retries: number, retryOn: number[]) => {
  if (attempt >= retries) return false;
  if (retryOn.length === 0) {
    return status >= 500 || status === 429;
  }
  return retryOn.includes(status);
};

const parseRetryOnStatus = (config: Record<string, unknown> | undefined) => {
  const raw = getConfigValue(config, "retryOnStatus");
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.trunc(value));
};

const executeCallback = async (params: {
  integration: IntegrationRecord;
  mode: IntegrationMode;
  response: IntegrationResponse;
  idempotencyKey: string;
}) => {
  const config = params.integration.config ?? {};
  const callbackUrl = trimString(getConfigValue(config, "callbackUrl"));
  if (!callbackUrl) {
    return {
      attempted: false,
      ok: true,
    };
  }

  try {
    await assertPublicUrl(callbackUrl);
    const res = await fetch(callbackUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: params.mode,
        connector: params.integration.connector,
        companyId: params.integration.companyId,
        integrationId: params.integration.id,
        idempotencyKey: params.idempotencyKey,
        result: {
          ok: params.response.ok,
          status: params.response.status,
          statusText: params.response.statusText,
          requestUrl: params.response.requestUrl,
          durationMs: params.response.durationMs,
          attempt: params.response.attempt,
          bodyPreview: params.response.bodyPreview,
        },
        emittedAt: new Date().toISOString(),
      }),
    });

    return {
      attempted: true,
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : "Callback failed",
    };
  }
};

export const executeIntegrationRequest = async (params: {
  integration: IntegrationRecord;
  mode: IntegrationMode;
  correlationId?: string;
}): Promise<IntegrationResponse> => {
  if (params.integration.connector === "zatca" && params.mode === "sync") {
    const { executeZatcaSubmission } = await import("@/lib/integrations/zatca/service");
    return executeZatcaSubmission(params.integration);
  }
  const requestUrl = resolveRequestUrl(params.integration, params.mode);
  await assertPublicUrl(requestUrl);
  const method = getMethod(params.integration, params.mode);
  const timeoutMs = parseTimeout(getConfigValue(params.integration.config, "timeoutMs"));
  const retries = parseRetries(getConfigValue(params.integration.config, "retries"));
  const backoffMs = parseBackoff(getConfigValue(params.integration.config, "retryBackoffMs"));
  const retryOn = parseRetryOnStatus(params.integration.config);
  const authHeaders = getAuthHeaders(params.integration);
  const customHeaders = getCustomHeaders(params.integration.config);
  const idempotencyHeader =
    trimString(getConfigValue(params.integration.config, "idempotencyHeader")) ||
    getDefaultIdempotencyHeader(params.integration.connector);
  const idempotencyKey =
    params.correlationId ||
    `${params.integration.id}:${params.mode}:${Date.now().toString(36)}`;

  let attempt = 0;
  // Keep the last response for diagnostics in final non-ok case.
  let lastResponse: IntegrationResponse | null = null;
  while (attempt < retries) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const init: RequestInit = {
        method,
        headers: {
          Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
          "X-Integration-Connector": params.integration.connector,
          "X-Integration-Mode": params.mode,
          "X-Integration-Id": params.integration.id,
          [idempotencyHeader]: idempotencyKey,
          ...customHeaders,
          ...authHeaders,
        },
        signal: controller.signal,
        // Following a redirect would forward credentials to an unchecked host.
        redirect: "manual",
      };

      if (params.mode === "sync" || !["GET", "HEAD"].includes(method)) {
        // A connection test must not push business records.
        const payload =
          params.mode === "test"
            ? { source: "saudi-waqef", connector: params.integration.connector, test: true }
            : await buildRequestPayload(params.integration);
        init.headers = {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        };
        init.body = JSON.stringify(payload);
      }

      const response = await fetch(requestUrl, init);
      const bodyText = await response.text();
      let bodyJson: unknown | null = null;
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        bodyJson = null;
      }
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const execution: IntegrationResponse = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        bodyPreview: bodyText.slice(0, 2000),
        bodyJson,
        requestUrl,
        durationMs: Date.now() - startedAt,
        attempt,
        responseHeaders,
      };

      if (response.ok || !shouldRetry(response.status, attempt, retries, retryOn)) {
        execution.callback = await executeCallback({
          integration: params.integration,
          mode: params.mode,
          response: execution,
          idempotencyKey,
        });
        return execution;
      }

      lastResponse = execution;
      await delay(backoffMs * attempt);
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await delay(backoffMs * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastResponse) {
    lastResponse.callback = await executeCallback({
      integration: params.integration,
      mode: params.mode,
      response: lastResponse,
      idempotencyKey,
    });
    return lastResponse;
  }

  throw new Error("Integration request failed without response");
};
