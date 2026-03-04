# Saudi Waqef API Integration Documentation (Detailed)

Generated on: 2026-03-03T08:39:37.896Z

## Scope
This document is generated from the current source code and covers all discovered API operations under `src/app/api`.

## Platform API Summary
- Total API operations: **376**
- Total unique routes: **272**
- Endpoint inventory CSV: `docs/developer/api-endpoints-inventory.csv`
- Validator schema catalog CSV: `docs/developer/api-schema-fields.csv`

## Module Coverage
- admin: 35 operations
- billing: 18 operations
- customers: 18 operations
- attendance: 16 operations
- vendors: 16 operations
- employees: 14 operations
- invoices: 13 operations
- items: 13 operations
- bills: 12 operations
- leaves: 12 operations
- payroll: 11 operations
- reports: 11 operations
- integrations: 10 operations
- credit-notes: 9 operations
- expenses: 9 operations
- payments: 9 operations
- vat: 8 operations
- companies: 7 operations
- developer: 7 operations
- documents: 7 operations
- notifications: 7 operations
- recurring-invoices: 6 operations
- vendor-credit-notes: 6 operations
- departments: 5 operations
- help: 5 operations
- journal-entries: 5 operations
- positions: 5 operations
- reconciliation: 5 operations
- accounting-periods: 4 operations
- coa: 4 operations
- email: 4 operations
- opening-balances: 4 operations
- security: 4 operations
- support: 4 operations
- users: 4 operations
- adjustments: 3 operations
- auth: 3 operations
- cash-bank-accounts: 3 operations
- expense-categories: 3 operations
- invites: 3 operations
- payment-methods: 3 operations
- payment-terms: 3 operations
- tax-categories: 3 operations
- transfers: 3 operations
- analytics: 2 operations
- audit-logs: 2 operations
- company-defaults: 2 operations
- contacts: 2 operations
- document-branding: 2 operations
- hr: 2 operations
- notification-preferences: 2 operations
- setup: 2 operations
- health: 1 operations
- import-jobs: 1 operations
- open-items: 1 operations
- register: 1 operations
- telemetry: 1 operations
- uploads: 1 operations

## Authentication Model
- API key bearer authentication is currently implemented for:
  - `GET /api/developer/ping`
- Most routes are authenticated with application sessions and role/system guards.
- Authentication mode distribution:
- session_cookie: 332
- system_session: 30
- public_or_system: 13
- api_key_bearer: 1

### API Key Scopes (Defined in Code)
- read:accounting
- write:accounting
- read:hr
- write:hr
- read:reports
- write:reports
- read:settings
- write:settings

### API Key Header
```http
Authorization: Bearer <API_KEY>
```

## Data Formats
- `application/json` for standard API responses
- `text/csv; charset=utf-8` for exports/import templates
- `application/pdf` for printable/report exports
- XML is not implemented in current API routes.

## Rate Limits and Security Controls
- Documented rate limits (`docs/developer/api-overview.md`):
  - Default: 300 requests/minute per API key
  - Burst: 50 requests
- Implemented controls:
  - Session authentication with NextAuth
  - Role/system guard checks in routes
  - Zod schema validation for request payloads
  - Audit logging and telemetry events
  - API key hashing/revocation and usage logging
  - MFA and login-throttling controls

## Usage Examples
```bash
curl -H "Authorization: Bearer <API_KEY>" https://<your-domain>/api/developer/ping
```

```json
{
  "ok": true,
  "companyId": "<company-id>",
  "scopes": ["read:accounting"]
}
```

---

# Complete Route Catalog (All Modules)

## Module: accounting-periods

Operations: **4**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/accounting-periods | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, endDate, frequency, name, startDate | json | 400, 401, 403, 409 | src/app/api/accounting-periods/route.ts |
| POST | /api/accounting-periods | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, endDate, frequency, name, startDate | json | 400, 401, 403, 409 | src/app/api/accounting-periods/route.ts |
| PATCH | /api/accounting-periods/{periodId} | Update existing data | session_cookie | requireCompanyRole | periodId | - | status | json | 400, 401, 403 | src/app/api/accounting-periods/[periodId]/route.ts |
| POST | /api/accounting-periods/generate | Create or execute action | session_cookie | requireCompanyRole | - | - | companyId, frequency, year | json | 400, 401, 403, 409 | src/app/api/accounting-periods/generate/route.ts |

## Module: adjustments

Operations: **3**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/adjustments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | accountId, companyId, from, q, to, type | accountId, adjustmentDate, amount, companyId, memo, offsetAccountId, reason, type | json | 400, 401, 403 | src/app/api/adjustments/route.ts |
| POST | /api/adjustments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | accountId, companyId, from, q, to, type | accountId, adjustmentDate, amount, companyId, memo, offsetAccountId, reason, type | json | 400, 401, 403 | src/app/api/adjustments/route.ts |
| GET | /api/adjustments/{adjustmentId} | Read data | session_cookie | requireAccountingAccess | adjustmentId | - | - | json | 401, 403, 404 | src/app/api/adjustments/[adjustmentId]/route.ts |

## Module: admin

Operations: **35**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/admin/alerts | Read data | system_session | requireSystemAdmin | - | severity, status | - | json | 200 | src/app/api/admin/alerts/route.ts |
| PATCH | /api/admin/alerts/{alertId} | Update existing data | system_session | requireSystemAdmin | alertId | - | severity, status | json | 400 | src/app/api/admin/alerts/[alertId]/route.ts |
| GET | /api/admin/alerts/export | Export data | system_session | requireSystemAdmin | - | severity, status | - | csv, json | 200 | src/app/api/admin/alerts/export/route.ts |
| GET | /api/admin/audit | Read data | system_session | requireSystemAdmin | - | - | - | json | 200 | src/app/api/admin/audit/route.ts |
| GET | /api/admin/audit/export | Export data | system_session | requireSystemAdmin | - | - | - | csv, json | 200 | src/app/api/admin/audit/export/route.ts |
| GET | /api/admin/dr/drills | Read data | system_session | requireSystemAdmin | - | - | completedAt, notes, rpoAchievedMinutes, rtoAchievedMinutes, runBy, scope, startedAt, status, type | json | 400 | src/app/api/admin/dr/drills/route.ts |
| POST | /api/admin/dr/drills | Create or execute action | system_session | requireSystemAdmin | - | - | completedAt, notes, rpoAchievedMinutes, rtoAchievedMinutes, runBy, scope, startedAt, status, type | json | 400 | src/app/api/admin/dr/drills/route.ts |
| GET | /api/admin/dr/settings | Read data | system_session | requireSystemAdmin | - | - | approvedBy, backupFrequencyHours, backupRegion, lastReviewedAt, priorityCritical, priorityHigh, priorityLow, priorityMedium, retentionDays, rpoMinutes, rtoMinutes | json | 400 | src/app/api/admin/dr/settings/route.ts |
| PUT | /api/admin/dr/settings | Update existing data | system_session | requireSystemAdmin | - | - | approvedBy, backupFrequencyHours, backupRegion, lastReviewedAt, priorityCritical, priorityHigh, priorityLow, priorityMedium, retentionDays, rpoMinutes, rtoMinutes | json | 400 | src/app/api/admin/dr/settings/route.ts |
| GET | /api/admin/health | Read data | system_session | requireSystemAdmin | - | - | - | json | 200 | src/app/api/admin/health/route.ts |
| POST | /api/admin/impersonate | Create or execute action | system_session | requireSystemAdmin | - | - | companyId, reason, targetUserId | json | 400, 404 | src/app/api/admin/impersonate/route.ts |
| POST | /api/admin/impersonate/end | Create or execute action | system_session | requireSystemAdmin | - | - | - | json | 200 | src/app/api/admin/impersonate/end/route.ts |
| GET | /api/admin/impersonation | Read data | session_cookie | - | - | - | - | json | 401 | src/app/api/admin/impersonation/route.ts |
| GET | /api/admin/jobs | Read data | system_session | requireSystemAdmin | - | - | - | json | 200 | src/app/api/admin/jobs/route.ts |
| GET | /api/admin/knowledge-base/articles | Read data | system_session | requireSystemAdmin | - | categoryId, q | categoryId, contentAr, contentEn, isPublished, slug, summaryAr, summaryEn, tags, titleAr, titleEn | json | 400 | src/app/api/admin/knowledge-base/articles/route.ts |
| POST | /api/admin/knowledge-base/articles | Create or execute action | system_session | requireSystemAdmin | - | categoryId, q | categoryId, contentAr, contentEn, isPublished, slug, summaryAr, summaryEn, tags, titleAr, titleEn | json | 400 | src/app/api/admin/knowledge-base/articles/route.ts |
| PUT | /api/admin/knowledge-base/articles/{articleId} | Update existing data | system_session | requireSystemAdmin | articleId | - | categoryId, contentAr, contentEn, isPublished, slug, summaryAr, summaryEn, tags, titleAr, titleEn | json | 400 | src/app/api/admin/knowledge-base/articles/[articleId]/route.ts |
| GET | /api/admin/knowledge-base/categories | Read data | system_session | requireSystemAdmin | - | - | descriptionAr, descriptionEn, nameAr, nameEn, order, slug | json | 400 | src/app/api/admin/knowledge-base/categories/route.ts |
| POST | /api/admin/knowledge-base/categories | Create or execute action | system_session | requireSystemAdmin | - | - | descriptionAr, descriptionEn, nameAr, nameEn, order, slug | json | 400 | src/app/api/admin/knowledge-base/categories/route.ts |
| PUT | /api/admin/knowledge-base/categories/{categoryId} | Update existing data | system_session | requireSystemAdmin | categoryId | - | descriptionAr, descriptionEn, nameAr, nameEn, order, slug | json | 400 | src/app/api/admin/knowledge-base/categories/[categoryId]/route.ts |
| GET | /api/admin/knowledge-base/glossary | Read data | system_session | requireSystemAdmin | - | q | category, definitionAr, definitionEn, termAr, termEn | json | 400 | src/app/api/admin/knowledge-base/glossary/route.ts |
| POST | /api/admin/knowledge-base/glossary | Create or execute action | system_session | requireSystemAdmin | - | q | category, definitionAr, definitionEn, termAr, termEn | json | 400 | src/app/api/admin/knowledge-base/glossary/route.ts |
| PUT | /api/admin/knowledge-base/glossary/{termId} | Update existing data | system_session | requireSystemAdmin | termId | - | category, definitionAr, definitionEn, termAr, termEn | json | 400 | src/app/api/admin/knowledge-base/glossary/[termId]/route.ts |
| GET | /api/admin/kpis | Read data | system_session | requireSystemAdmin | - | - | - | json | 200 | src/app/api/admin/kpis/route.ts |
| GET | /api/admin/me | Read data | session_cookie | - | - | - | - | json | 401 | src/app/api/admin/me/route.ts |
| GET | /api/admin/migrations | Read data | system_session | requireSystemAdmin | - | - | - | json | 200 | src/app/api/admin/migrations/route.ts |
| POST | /api/admin/migrations/run | Create or execute action | system_session | requireSystemAdmin | - | - | dryRun, migrationId | json | 400, 404, 409, 500 | src/app/api/admin/migrations/run/route.ts |
| GET | /api/admin/overview | Read data | system_session | requireSystemAdmin | - | - | - | json | 200 | src/app/api/admin/overview/route.ts |
| GET | /api/admin/registrations | Read data | public_or_system | - | - | status | - | json | 500 | src/app/api/admin/registrations/route.ts |
| POST | /api/admin/registrations/{id}/approve | Approve entity workflow state | public_or_system | - | id | - | - | json | 400, 404, 500 | src/app/api/admin/registrations/[id]/approve/route.ts |
| POST | /api/admin/registrations/{id}/reject | Create or execute action | public_or_system | - | id | - | - | json | 400, 404, 500 | src/app/api/admin/registrations/[id]/reject/route.ts |
| POST | /api/admin/support/reset-password | Create or execute action | system_session | requireSystemAdmin | - | - | email, password, userId | json | 400, 404 | src/app/api/admin/support/reset-password/route.ts |
| GET | /api/admin/tenants | Read data | system_session | requireSystemAdmin | - | - | - | json | 200 | src/app/api/admin/tenants/route.ts |
| PATCH | /api/admin/tenants/{companyId} | Update existing data | system_session | requireSystemAdmin | companyId | - | status | json | 400 | src/app/api/admin/tenants/[companyId]/route.ts |
| GET | /api/admin/tenants/export | Export data | system_session | requireSystemAdmin | - | q, status | - | csv, json | 200 | src/app/api/admin/tenants/export/route.ts |

## Module: analytics

Operations: **2**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/analytics/export | Export data | session_cookie | requireCompanyRole | - | companyId, endDate, startDate | - | csv, json | 400, 401, 403 | src/app/api/analytics/export/route.ts |
| GET | /api/analytics/overview | Read data | session_cookie | requireReportAccess | - | companyId, endDate, refresh, startDate | - | json | 400, 401, 403 | src/app/api/analytics/overview/route.ts |

## Module: attendance

Operations: **16**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/attendance/holidays | Read data | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId | companyId, date, isPaid, name | json | 400, 401, 403 | src/app/api/attendance/holidays/route.ts |
| POST | /api/attendance/holidays | Create or execute action | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId | companyId, date, isPaid, name | json | 400, 401, 403 | src/app/api/attendance/holidays/route.ts |
| DELETE | /api/attendance/holidays/{holidayId} | Delete or revoke data | session_cookie | requireCompanyRole | holidayId | companyId | - | json | 400, 401, 403 | src/app/api/attendance/holidays/[holidayId]/route.ts |
| PATCH | /api/attendance/holidays/{holidayId} | Update existing data | session_cookie | requireCompanyRole | holidayId | companyId | - | json | 400, 401, 403 | src/app/api/attendance/holidays/[holidayId]/route.ts |
| GET | /api/attendance/records | Read data | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId, employeeId, endDate, startDate, status | checkIn, checkOut, companyId, date, employeeId, notes, source, status | json | 400, 401, 403, 404, 409 | src/app/api/attendance/records/route.ts |
| POST | /api/attendance/records | Create or execute action | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId, employeeId, endDate, startDate, status | checkIn, checkOut, companyId, date, employeeId, notes, source, status | json | 400, 401, 403, 404, 409 | src/app/api/attendance/records/route.ts |
| DELETE | /api/attendance/records/{recordId} | Delete or revoke data | session_cookie | requireCompanyRole | recordId | companyId | - | json | 400, 401, 403, 404 | src/app/api/attendance/records/[recordId]/route.ts |
| PATCH | /api/attendance/records/{recordId} | Update existing data | session_cookie | requireCompanyRole | recordId | companyId | - | json | 400, 401, 403, 404 | src/app/api/attendance/records/[recordId]/route.ts |
| GET | /api/attendance/records/export | Export data | session_cookie | requireCompanyMembership | - | companyId, employeeId, endDate, startDate, status | - | csv, json | 400, 401, 403, 404 | src/app/api/attendance/records/export/route.ts |
| GET | /api/attendance/records/import | Import or upload data | session_cookie | requireCompanyRole, requireHrAccess | - | companyId, lang | companyId, csv | csv, json | 400, 401, 403 | src/app/api/attendance/records/import/route.ts |
| POST | /api/attendance/records/import | Import or upload data | session_cookie | requireCompanyRole, requireHrAccess | - | companyId, lang | companyId, csv | csv, json | 400, 401, 403 | src/app/api/attendance/records/import/route.ts |
| POST | /api/attendance/self/check-in | Create or execute action | session_cookie | requireCompanyMembership | - | - | - | json | 400, 401, 403, 404 | src/app/api/attendance/self/check-in/route.ts |
| POST | /api/attendance/self/check-out | Create or execute action | session_cookie | requireCompanyMembership | - | - | - | json | 400, 401, 403, 404 | src/app/api/attendance/self/check-out/route.ts |
| GET | /api/attendance/settings | Read data | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId | companyId, graceMinutes, overtimeThresholdMinutes, roundingMinutes, shiftEnd, shiftStart, weekendDays | json | 400, 401, 403 | src/app/api/attendance/settings/route.ts |
| PUT | /api/attendance/settings | Update existing data | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId | companyId, graceMinutes, overtimeThresholdMinutes, roundingMinutes, shiftEnd, shiftStart, weekendDays | json | 400, 401, 403 | src/app/api/attendance/settings/route.ts |
| GET | /api/attendance/summary | Read data | session_cookie | requireCompanyMembership | - | companyId, employeeId, endDate, startDate | - | json | 400, 401, 403, 404 | src/app/api/attendance/summary/route.ts |

## Module: audit-logs

Operations: **2**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/audit-logs | Read data | session_cookie | requireAdminAccess | - | action, companyId, endDate, entity, limit, q, startDate, userId | - | json | 400, 401, 403 | src/app/api/audit-logs/route.ts |
| GET | /api/audit-logs/export | Export data | session_cookie | requireAdminAccess | - | action, companyId, endDate, entity, limit, q, startDate, userId | - | csv, json | 400, 401, 403 | src/app/api/audit-logs/export/route.ts |

## Module: auth

Operations: **3**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| POST | /api/auth/forgot | Create or execute action | public_or_system | - | - | - | email, locale | json | 400 | src/app/api/auth/forgot/route.ts |
| GET | /api/auth/mfa-status | Read data | public_or_system | - | - | email | - | json | 200 | src/app/api/auth/mfa-status/route.ts |
| POST | /api/auth/reset | Create or execute action | public_or_system | - | - | - | password, token | json | 400, 410 | src/app/api/auth/reset/route.ts |

## Module: billing

Operations: **18**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/billing/invoices | Read data | session_cookie | requireCompanyRole | - | companyId | amount, companyId, currency, periodEnd, periodStart, planId, planName, status, subscriptionId | json | 400, 401, 403 | src/app/api/billing/invoices/route.ts |
| POST | /api/billing/invoices | Create or execute action | session_cookie | requireCompanyRole | - | companyId | amount, companyId, currency, periodEnd, periodStart, planId, planName, status, subscriptionId | json | 400, 401, 403 | src/app/api/billing/invoices/route.ts |
| PATCH | /api/billing/invoices/{invoiceId} | Update existing data | session_cookie | requireCompanyRole | invoiceId | - | companyId, status | json | 400, 401, 403, 404 | src/app/api/billing/invoices/[invoiceId]/route.ts |
| GET | /api/billing/invoices/export | Export data | session_cookie | requireCompanyRole | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/billing/invoices/export/route.ts |
| GET | /api/billing/payment-methods | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | brand, companyId, expMonth, expYear, isDefault, last4, token, type | json | 400, 401, 403 | src/app/api/billing/payment-methods/route.ts |
| POST | /api/billing/payment-methods | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | brand, companyId, expMonth, expYear, isDefault, last4, token, type | json | 400, 401, 403 | src/app/api/billing/payment-methods/route.ts |
| DELETE | /api/billing/payment-methods/{paymentMethodId} | Delete or revoke data | session_cookie | requireCompanyRole | paymentMethodId | companyId | companyId, isDefault | json | 400, 401, 403 | src/app/api/billing/payment-methods/[paymentMethodId]/route.ts |
| PATCH | /api/billing/payment-methods/{paymentMethodId} | Update existing data | session_cookie | requireCompanyRole | paymentMethodId | companyId | companyId, isDefault | json | 400, 401, 403 | src/app/api/billing/payment-methods/[paymentMethodId]/route.ts |
| GET | /api/billing/payment-methods/export | Export data | session_cookie | requireCompanyRole | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/billing/payment-methods/export/route.ts |
| GET | /api/billing/plans | Read data | session_cookie | requireAdminAccess | - | companyId, includeInactive | code, companyId, currency, description, graceDays, isActive, isDefault, maxCompanies, maxUsers, modules, name, priceMonthly, priceYearly, trialDays | json | 400, 401, 403 | src/app/api/billing/plans/route.ts |
| POST | /api/billing/plans | Create or execute action | session_cookie | requireAdminAccess | - | companyId, includeInactive | code, companyId, currency, description, graceDays, isActive, isDefault, maxCompanies, maxUsers, modules, name, priceMonthly, priceYearly, trialDays | json | 400, 401, 403 | src/app/api/billing/plans/route.ts |
| DELETE | /api/billing/plans/{planId} | Delete or revoke data | session_cookie | requireCompanyRole | planId | companyId | - | json | 400, 401, 403 | src/app/api/billing/plans/[planId]/route.ts |
| PATCH | /api/billing/plans/{planId} | Update existing data | session_cookie | requireCompanyRole | planId | companyId | - | json | 400, 401, 403 | src/app/api/billing/plans/[planId]/route.ts |
| GET | /api/billing/subscription | Read data | session_cookie | requireAdminAccess | - | companyId | billingCycle, companyId, planId, status | json | 400, 401, 403 | src/app/api/billing/subscription/route.ts |
| PATCH | /api/billing/subscription | Update existing data | session_cookie | requireAdminAccess | - | companyId | billingCycle, companyId, planId, status | json | 400, 401, 403 | src/app/api/billing/subscription/route.ts |
| POST | /api/billing/subscription | Create or execute action | session_cookie | requireAdminAccess | - | companyId | billingCycle, companyId, planId, status | json | 400, 401, 403 | src/app/api/billing/subscription/route.ts |
| POST | /api/billing/subscription/cancel | Cancel entity workflow state | session_cookie | requireCompanyRole | - | - | cancelAtPeriodEnd, companyId | json | 400, 401, 403, 404 | src/app/api/billing/subscription/cancel/route.ts |
| POST | /api/billing/subscription/reactivate | Create or execute action | session_cookie | requireCompanyRole | - | - | companyId | json | 400, 401, 403, 404 | src/app/api/billing/subscription/reactivate/route.ts |

## Module: bills

Operations: **12**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/bills | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, from, maxTotal, minTotal, overdue, q, status, to, vendorId | billDate, companyId, currency, dueDate, lines, notes, paymentTermId, status, vendorBillNumber, vendorId | json | 400, 401, 403 | src/app/api/bills/route.ts |
| POST | /api/bills | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, from, maxTotal, minTotal, overdue, q, status, to, vendorId | billDate, companyId, currency, dueDate, lines, notes, paymentTermId, status, vendorBillNumber, vendorId | json | 400, 401, 403 | src/app/api/bills/route.ts |
| GET | /api/bills/{billId} | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | billId | - | billDate, currency, dueDate, lines, notes, paymentTermId, vendorBillNumber, vendorId | json | 400, 401, 403, 404 | src/app/api/bills/[billId]/route.ts |
| PUT | /api/bills/{billId} | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | billId | - | billDate, currency, dueDate, lines, notes, paymentTermId, vendorBillNumber, vendorId | json | 400, 401, 403, 404 | src/app/api/bills/[billId]/route.ts |
| POST | /api/bills/{billId}/approve | Approve entity workflow state | session_cookie | requireCompanyRole | billId | - | - | json | 400, 401, 403, 404 | src/app/api/bills/[billId]/approve/route.ts |
| GET | /api/bills/{billId}/attachments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | billId | - | companyId, content, contentType, name, size, storage, url | json | 400, 401, 403, 404 | src/app/api/bills/[billId]/attachments/route.ts |
| POST | /api/bills/{billId}/attachments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | billId | - | companyId, content, contentType, name, size, storage, url | json | 400, 401, 403, 404 | src/app/api/bills/[billId]/attachments/route.ts |
| DELETE | /api/bills/{billId}/attachments/{attachmentId} | Delete or revoke data | session_cookie | requireCompanyRole | attachmentId, billId | - | - | json | 401, 403, 404 | src/app/api/bills/[billId]/attachments/[attachmentId]/route.ts |
| POST | /api/bills/{billId}/cancel | Cancel entity workflow state | session_cookie | requireCompanyRole | billId | - | - | json | 400, 401, 403, 404 | src/app/api/bills/[billId]/cancel/route.ts |
| GET | /api/bills/{billId}/payments | Read data | session_cookie | requireCompanyRole | billId | - | accountId, amount, companyId, method, paymentDate, reference | json | 400, 401, 403, 404 | src/app/api/bills/[billId]/payments/route.ts |
| POST | /api/bills/{billId}/payments | Create or execute action | session_cookie | requireCompanyRole | billId | - | accountId, amount, companyId, method, paymentDate, reference | json | 400, 401, 403, 404 | src/app/api/bills/[billId]/payments/route.ts |
| GET | /api/bills/export | Export data | session_cookie | requireAccountingAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/bills/export/route.ts |

## Module: cash-bank-accounts

Operations: **3**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/cash-bank-accounts | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | accountId, bankName, companyId, iban, name, openingBalance, status, type | json | 400, 401, 403 | src/app/api/cash-bank-accounts/route.ts |
| POST | /api/cash-bank-accounts | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | accountId, bankName, companyId, iban, name, openingBalance, status, type | json | 400, 401, 403 | src/app/api/cash-bank-accounts/route.ts |
| PATCH | /api/cash-bank-accounts/{accountId} | Update existing data | session_cookie | requireCompanyRole | accountId | - | accountId, bankName, iban, name, openingBalance, status, type | json | 400, 401, 403, 404 | src/app/api/cash-bank-accounts/[accountId]/route.ts |

## Module: coa

Operations: **4**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/coa | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | code, companyId, isPosting, name, parentId, status, type | json | 400, 401, 403, 409 | src/app/api/coa/route.ts |
| POST | /api/coa | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | code, companyId, isPosting, name, parentId, status, type | json | 400, 401, 403, 409 | src/app/api/coa/route.ts |
| PATCH | /api/coa/{accountId} | Update existing data | session_cookie | requireCompanyRole | accountId | - | code, isPosting, name, parentId, status, type | json | 400, 401, 403, 404, 409 | src/app/api/coa/[accountId]/route.ts |
| POST | /api/coa/seed | Create or execute action | session_cookie | requireCompanyRole | - | - | companyId, template | json | 400, 401, 403 | src/app/api/coa/seed/route.ts |

## Module: companies

Operations: **7**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/companies | Read data | session_cookie | - | - | - | name | json | 400, 401 | src/app/api/companies/route.ts |
| POST | /api/companies | Create or execute action | session_cookie | - | - | - | name | json | 400, 401 | src/app/api/companies/route.ts |
| GET | /api/companies/{companyId} | Read data | session_cookie | requireAdminAccess, requireCompanyMembership | companyId | - | - | json | 400, 401, 403, 404 | src/app/api/companies/[companyId]/route.ts |
| PUT | /api/companies/{companyId} | Update existing data | session_cookie | requireAdminAccess, requireCompanyMembership | companyId | - | - | json | 400, 401, 403, 404 | src/app/api/companies/[companyId]/route.ts |
| GET | /api/companies/{companyId}/config | Read data | session_cookie | requireAccountingAccess, requireAdminAccess | companyId | - | adjustmentLastResetYear, adjustmentNextNumber, adjustmentPadding, adjustmentPrefix, adjustmentResetYearly, adjustmentSuffix, billApprovalThreshold, billLastResetYear, billNextNumber, billPadding, billPrefix, billResetYearly, billSuffix, billTemplate, creditLastResetYear, creditNextNumber, creditPadding, creditPrefix, creditResetYearly, creditSuffix, dateFormat, expenseLastResetYear, expenseNextNumber, expensePadding, expensePrefix, expenseResetYearly, expenseSuffix, invoiceLastResetYear, invoiceNextNumber, invoicePadding, invoicePrefix, invoiceResetYearly, invoiceSuffix, invoiceTemplate, onboardingCompleted, payrollApprovalThreshold, periodLockDate, receiptLastResetYear, receiptNextNumber, receiptPadding, receiptPrefix, receiptResetYearly, receiptSuffix, roundingMode, roundingPrecision, signatureEnabled, signatureImageUrl, signatureName, signatureTitle, taxInclusive, timeFormat, transferLastResetYear, transferNextNumber, transferPadding, transferPrefix, transferResetYearly, transferSuffix, vatEnabled, vatFilingFrequency, vatRate, vendorCreditLastResetYear, vendorCreditNextNumber, vendorCreditPadding, vendorCreditPrefix, vendorCreditResetYearly, vendorCreditSuffix, vendorPaymentLastResetYear, vendorPaymentNextNumber, vendorPaymentPadding, vendorPaymentPrefix, vendorPaymentResetYearly, vendorPaymentSuffix | json | 400, 401, 403 | src/app/api/companies/[companyId]/config/route.ts |
| PUT | /api/companies/{companyId}/config | Update existing data | session_cookie | requireAccountingAccess, requireAdminAccess | companyId | - | adjustmentLastResetYear, adjustmentNextNumber, adjustmentPadding, adjustmentPrefix, adjustmentResetYearly, adjustmentSuffix, billApprovalThreshold, billLastResetYear, billNextNumber, billPadding, billPrefix, billResetYearly, billSuffix, billTemplate, creditLastResetYear, creditNextNumber, creditPadding, creditPrefix, creditResetYearly, creditSuffix, dateFormat, expenseLastResetYear, expenseNextNumber, expensePadding, expensePrefix, expenseResetYearly, expenseSuffix, invoiceLastResetYear, invoiceNextNumber, invoicePadding, invoicePrefix, invoiceResetYearly, invoiceSuffix, invoiceTemplate, onboardingCompleted, payrollApprovalThreshold, periodLockDate, receiptLastResetYear, receiptNextNumber, receiptPadding, receiptPrefix, receiptResetYearly, receiptSuffix, roundingMode, roundingPrecision, signatureEnabled, signatureImageUrl, signatureName, signatureTitle, taxInclusive, timeFormat, transferLastResetYear, transferNextNumber, transferPadding, transferPrefix, transferResetYearly, transferSuffix, vatEnabled, vatFilingFrequency, vatRate, vendorCreditLastResetYear, vendorCreditNextNumber, vendorCreditPadding, vendorCreditPrefix, vendorCreditResetYearly, vendorCreditSuffix, vendorPaymentLastResetYear, vendorPaymentNextNumber, vendorPaymentPadding, vendorPaymentPrefix, vendorPaymentResetYearly, vendorPaymentSuffix | json | 400, 401, 403 | src/app/api/companies/[companyId]/config/route.ts |
| POST | /api/companies/active | Create or execute action | session_cookie | requireCompanyMembership | - | - | - | json | 400, 401, 403 | src/app/api/companies/active/route.ts |

## Module: company-defaults

Operations: **2**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/company-defaults | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, defaultPurchasePaymentTermId, defaultPurchaseTaxCategoryId, defaultSalesPaymentTermId, defaultSalesTaxCategoryId, discountAccountId, payableAccountId, purchasesAccountId, receivableAccountId, salesAccountId, vatInputAccountId, vatOutputAccountId | json | 400, 401, 403 | src/app/api/company-defaults/route.ts |
| PUT | /api/company-defaults | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, defaultPurchasePaymentTermId, defaultPurchaseTaxCategoryId, defaultSalesPaymentTermId, defaultSalesTaxCategoryId, discountAccountId, payableAccountId, purchasesAccountId, receivableAccountId, salesAccountId, vatInputAccountId, vatOutputAccountId | json | 400, 401, 403 | src/app/api/company-defaults/route.ts |

## Module: contacts

Operations: **2**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| DELETE | /api/contacts/{contactId} | Delete or revoke data | session_cookie | requireCompanyRole | contactId | - | - | json | 400, 401, 403, 404 | src/app/api/contacts/[contactId]/route.ts |
| PATCH | /api/contacts/{contactId} | Update existing data | session_cookie | requireCompanyRole | contactId | - | - | json | 400, 401, 403, 404 | src/app/api/contacts/[contactId]/route.ts |

## Module: credit-notes

Operations: **9**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/credit-notes | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, customerId, invoiceId, q, status | companyId, currency, invoiceId, issueDate, lines, notes, reason, status | json | 400, 401, 403 | src/app/api/credit-notes/route.ts |
| POST | /api/credit-notes | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, customerId, invoiceId, q, status | companyId, currency, invoiceId, issueDate, lines, notes, reason, status | json | 400, 401, 403 | src/app/api/credit-notes/route.ts |
| GET | /api/credit-notes/{creditNoteId} | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | creditNoteId | - | issueDate, lines, notes, reason, status | json | 400, 401, 403, 404 | src/app/api/credit-notes/[creditNoteId]/route.ts |
| PATCH | /api/credit-notes/{creditNoteId} | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | creditNoteId | - | issueDate, lines, notes, reason, status | json | 400, 401, 403, 404 | src/app/api/credit-notes/[creditNoteId]/route.ts |
| POST | /api/credit-notes/{creditNoteId}/cancel | Cancel entity workflow state | session_cookie | requireCompanyRole | creditNoteId | - | - | json | 400, 401, 403, 404 | src/app/api/credit-notes/[creditNoteId]/cancel/route.ts |
| POST | /api/credit-notes/{creditNoteId}/issue | Issue or finalize document | session_cookie | requireCompanyRole | creditNoteId | - | - | json | 400, 401, 403, 404 | src/app/api/credit-notes/[creditNoteId]/issue/route.ts |
| POST | /api/credit-notes/{creditNoteId}/refund | Create or execute action | session_cookie | requireCompanyRole | creditNoteId | - | accountId, amount, companyId, reference, refundDate | json | 400, 401, 403, 404 | src/app/api/credit-notes/[creditNoteId]/refund/route.ts |
| GET | /api/credit-notes/{creditNoteId}/refunds | Read data | session_cookie | requireCompanyRole | creditNoteId | - | - | json | 401, 403, 404 | src/app/api/credit-notes/[creditNoteId]/refunds/route.ts |
| POST | /api/credit-notes/{creditNoteId}/send | Dispatch communication or document | session_cookie | requireCompanyRole | creditNoteId | - | - | json | 400, 401, 403, 404 | src/app/api/credit-notes/[creditNoteId]/send/route.ts |

## Module: customers

Operations: **18**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/customers | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | balance, companyId, q, status, vatRegistered | companyId, ids, status | json | 400, 401, 403, 409 | src/app/api/customers/route.ts |
| PATCH | /api/customers | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | - | balance, companyId, q, status, vatRegistered | companyId, ids, status | json | 400, 401, 403, 409 | src/app/api/customers/route.ts |
| POST | /api/customers | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | balance, companyId, q, status, vatRegistered | companyId, ids, status | json | 400, 401, 403, 409 | src/app/api/customers/route.ts |
| GET | /api/customers/{customerId} | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | customerId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/customers/[customerId]/route.ts |
| PUT | /api/customers/{customerId} | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | customerId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/customers/[customerId]/route.ts |
| GET | /api/customers/{customerId}/activity | Read data | session_cookie | requireAccountingAccess | customerId | - | - | json | 401, 403, 404 | src/app/api/customers/[customerId]/activity/route.ts |
| GET | /api/customers/{customerId}/contacts | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | customerId | - | companyId, email, isPrimary, name, partyId, partyType, phone, role | json | 400, 401, 403, 404 | src/app/api/customers/[customerId]/contacts/route.ts |
| POST | /api/customers/{customerId}/contacts | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | customerId | - | companyId, email, isPrimary, name, partyId, partyType, phone, role | json | 400, 401, 403, 404 | src/app/api/customers/[customerId]/contacts/route.ts |
| DELETE | /api/customers/{customerId}/contacts/{contactId} | Delete or revoke data | session_cookie | requireCompanyRole | contactId, customerId | - | companyId, email, isPrimary, name, partyId, partyType, phone, role | json | 400, 401, 403, 404 | src/app/api/customers/[customerId]/contacts/[contactId]/route.ts |
| PUT | /api/customers/{customerId}/contacts/{contactId} | Update existing data | session_cookie | requireCompanyRole | contactId, customerId | - | companyId, email, isPrimary, name, partyId, partyType, phone, role | json | 400, 401, 403, 404 | src/app/api/customers/[customerId]/contacts/[contactId]/route.ts |
| GET | /api/customers/{customerId}/statement | Read data | session_cookie | requireAccountingAccess | customerId | - | - | json | 401, 403, 404 | src/app/api/customers/[customerId]/statement/route.ts |
| POST | /api/customers/{customerId}/statement/email | Create or execute action | session_cookie | requireCompanyRole | customerId | - | - | json | 400, 401, 403, 404 | src/app/api/customers/[customerId]/statement/email/route.ts |
| GET | /api/customers/{customerId}/statement/export | Export data | session_cookie | requireAccountingAccess | customerId | - | - | csv, json | 401, 403, 404 | src/app/api/customers/[customerId]/statement/export/route.ts |
| GET | /api/customers/{customerId}/statement/history | Read data | session_cookie | requireCompanyRole | customerId | - | - | json | 401, 403, 404 | src/app/api/customers/[customerId]/statement/history/route.ts |
| POST | /api/customers/{customerId}/statement/resend | Create or execute action | session_cookie | requireCompanyRole | customerId | - | emailId | json | 400, 401, 403, 404 | src/app/api/customers/[customerId]/statement/resend/route.ts |
| GET | /api/customers/export | Export data | session_cookie | requireAccountingAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/customers/export/route.ts |
| GET | /api/customers/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | companyId, csv, dryRun | csv, json | 400, 401, 403 | src/app/api/customers/import/route.ts |
| POST | /api/customers/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | companyId, csv, dryRun | csv, json | 400, 401, 403 | src/app/api/customers/import/route.ts |

## Module: departments

Operations: **5**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/departments | Read data | session_cookie | requireCompanyRole, requireHrAccess | - | companyId | - | json | 400, 401, 403, 409 | src/app/api/departments/route.ts |
| POST | /api/departments | Create or execute action | session_cookie | requireCompanyRole, requireHrAccess | - | companyId | - | json | 400, 401, 403, 409 | src/app/api/departments/route.ts |
| GET | /api/departments/{departmentId} | Read data | session_cookie | requireCompanyRole, requireHrAccess | departmentId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/departments/[departmentId]/route.ts |
| PATCH | /api/departments/{departmentId} | Update existing data | session_cookie | requireCompanyRole, requireHrAccess | departmentId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/departments/[departmentId]/route.ts |
| GET | /api/departments/export | Export data | session_cookie | requireHrAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/departments/export/route.ts |

## Module: developer

Operations: **7**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/developer/keys | Read data | session_cookie | requireAdminAccess | - | companyId | companyId, name, scopes | json | 400, 401, 403 | src/app/api/developer/keys/route.ts |
| POST | /api/developer/keys | Create or execute action | session_cookie | requireAdminAccess | - | companyId | companyId, name, scopes | json | 400, 401, 403 | src/app/api/developer/keys/route.ts |
| DELETE | /api/developer/keys/{keyId} | Delete or revoke data | session_cookie | requireAdminAccess | keyId | companyId | - | json | 400, 401, 403 | src/app/api/developer/keys/[keyId]/route.ts |
| GET | /api/developer/keys/export | Export data | session_cookie | requireAdminAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/developer/keys/export/route.ts |
| GET | /api/developer/ping | Read data | api_key_bearer | - | - | - | - | json | 200, 401 | src/app/api/developer/ping/route.ts |
| GET | /api/developer/usage | Read data | session_cookie | requireAdminAccess | - | companyId | - | json | 400, 401, 403 | src/app/api/developer/usage/route.ts |
| GET | /api/developer/usage/export | Export data | session_cookie | requireAdminAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/developer/usage/export/route.ts |

## Module: document-branding

Operations: **2**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/document-branding | Read data | session_cookie | requireAdminAccess, requireCompanyRole | - | companyId | accentColor, companyId, footer, header, logoUrl | json | 400, 401, 403 | src/app/api/document-branding/route.ts |
| PUT | /api/document-branding | Update existing data | session_cookie | requireAdminAccess, requireCompanyRole | - | companyId | accentColor, companyId, footer, header, logoUrl | json | 400, 401, 403 | src/app/api/document-branding/route.ts |

## Module: documents

Operations: **7**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/documents | Read data | session_cookie | requireCompanyRole, requireDocumentAccess | - | companyId, docType, entityType, q, tag | companyId, content, contentType, docType, entityId, entityType, name, size, storage, tags, url | json, pdf | 400, 401, 403 | src/app/api/documents/route.ts |
| POST | /api/documents | Create or execute action | session_cookie | requireCompanyRole, requireDocumentAccess | - | companyId, docType, entityType, q, tag | companyId, content, contentType, docType, entityId, entityType, name, size, storage, tags, url | json, pdf | 400, 401, 403 | src/app/api/documents/route.ts |
| DELETE | /api/documents/{documentId} | Delete or revoke data | session_cookie | requireCompanyRole, requireDocumentAccess | documentId | - | docType, entityId, entityType, name, tags | json | 400, 401, 403, 404 | src/app/api/documents/[documentId]/route.ts |
| GET | /api/documents/{documentId} | Read data | session_cookie | requireCompanyRole, requireDocumentAccess | documentId | - | docType, entityId, entityType, name, tags | json | 400, 401, 403, 404 | src/app/api/documents/[documentId]/route.ts |
| PATCH | /api/documents/{documentId} | Update existing data | session_cookie | requireCompanyRole, requireDocumentAccess | documentId | - | docType, entityId, entityType, name, tags | json | 400, 401, 403, 404 | src/app/api/documents/[documentId]/route.ts |
| POST | /api/documents/{documentId}/replace | Create or execute action | session_cookie | requireCompanyRole | documentId | - | companyId, content, contentType, size, storage, url | json, pdf | 400, 401, 403, 404 | src/app/api/documents/[documentId]/replace/route.ts |
| GET | /api/documents/export | Export data | session_cookie | requireDocumentAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/documents/export/route.ts |

## Module: email

Operations: **4**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| POST | /api/email/dispatch | Create or execute action | public_or_system | - | - | token | - | json | 401 | src/app/api/email/dispatch/route.ts |
| POST | /api/email/dispatch-now | Create or execute action | session_cookie | requireAdminAccess | - | - | - | json | 400, 401, 403 | src/app/api/email/dispatch-now/route.ts |
| GET | /api/email/status | Read data | session_cookie | - | - | - | - | json | 401 | src/app/api/email/status/route.ts |
| POST | /api/email/verify | Create or execute action | session_cookie | requireAdminAccess | - | - | - | json | 400, 401, 403 | src/app/api/email/verify/route.ts |

## Module: employees

Operations: **14**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/employees | Read data | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId, departmentId, managerId, positionId, q, scope, status | - | json | 400, 401, 403, 409 | src/app/api/employees/route.ts |
| POST | /api/employees | Create or execute action | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId, departmentId, managerId, positionId, q, scope, status | - | json | 400, 401, 403, 409 | src/app/api/employees/route.ts |
| GET | /api/employees/{employeeId} | Read data | session_cookie | requireCompanyRole, requireHrAccess | employeeId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/employees/[employeeId]/route.ts |
| PUT | /api/employees/{employeeId} | Update existing data | session_cookie | requireCompanyRole, requireHrAccess | employeeId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/employees/[employeeId]/route.ts |
| GET | /api/employees/{employeeId}/contracts | Read data | session_cookie | requireCompanyRole, requireHrAccess | employeeId | - | - | json | 400, 401, 403, 404 | src/app/api/employees/[employeeId]/contracts/route.ts |
| POST | /api/employees/{employeeId}/contracts | Create or execute action | session_cookie | requireCompanyRole, requireHrAccess | employeeId | - | - | json | 400, 401, 403, 404 | src/app/api/employees/[employeeId]/contracts/route.ts |
| PATCH | /api/employees/{employeeId}/contracts/{contractId} | Update existing data | session_cookie | requireCompanyRole | contractId, employeeId | - | - | json | 400, 401, 403, 404 | src/app/api/employees/[employeeId]/contracts/[contractId]/route.ts |
| GET | /api/employees/{employeeId}/documents | Read data | session_cookie | requireCompanyRole, requireHrAccess | employeeId | - | companyId, content, contentType, expiresAt, issuedAt, name, size, storage, type, url | json | 400, 401, 403, 404 | src/app/api/employees/[employeeId]/documents/route.ts |
| POST | /api/employees/{employeeId}/documents | Create or execute action | session_cookie | requireCompanyRole, requireHrAccess | employeeId | - | companyId, content, contentType, expiresAt, issuedAt, name, size, storage, type, url | json | 400, 401, 403, 404 | src/app/api/employees/[employeeId]/documents/route.ts |
| DELETE | /api/employees/{employeeId}/documents/{documentId} | Delete or revoke data | session_cookie | requireCompanyRole | documentId, employeeId | - | - | json | 401, 403, 404 | src/app/api/employees/[employeeId]/documents/[documentId]/route.ts |
| GET | /api/employees/{employeeId}/transfers | Read data | session_cookie | requireAccountingAccess | employeeId | - | - | json | 401, 403, 404 | src/app/api/employees/[employeeId]/transfers/route.ts |
| GET | /api/employees/export | Export data | session_cookie | requireHrAccess | - | companyId, departmentId, managerId, positionId, q, status | - | csv, json | 400, 401, 403 | src/app/api/employees/export/route.ts |
| GET | /api/employees/self | Read data | session_cookie | requireCompanyMembership | - | companyId | address, companyId, email, phone | json | 400, 401, 403, 404 | src/app/api/employees/self/route.ts |
| PATCH | /api/employees/self | Update existing data | session_cookie | requireCompanyMembership | - | companyId | address, companyId, email, phone | json | 400, 401, 403, 404 | src/app/api/employees/self/route.ts |

## Module: expense-categories

Operations: **3**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/expense-categories | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, status | companyId, expenseAccountId, name, status | json | 400, 401, 403 | src/app/api/expense-categories/route.ts |
| POST | /api/expense-categories | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, status | companyId, expenseAccountId, name, status | json | 400, 401, 403 | src/app/api/expense-categories/route.ts |
| PATCH | /api/expense-categories/{categoryId} | Update existing data | session_cookie | requireCompanyRole | categoryId | - | expenseAccountId, name, status | json | 400, 401, 403, 404 | src/app/api/expense-categories/[categoryId]/route.ts |

## Module: expenses

Operations: **9**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/expenses | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | categoryId, companyId, from, paymentMethod, q, reimbursable, reimbursementStatus, status, to | amount, categoryId, companyId, currency, description, expenseDate, notes, paymentAccountId, paymentMethod, reimbursable, reimburseTo, reimbursementStatus, status, taxCategoryId, vendorId | json | 400, 401, 403 | src/app/api/expenses/route.ts |
| POST | /api/expenses | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | categoryId, companyId, from, paymentMethod, q, reimbursable, reimbursementStatus, status, to | amount, categoryId, companyId, currency, description, expenseDate, notes, paymentAccountId, paymentMethod, reimbursable, reimburseTo, reimbursementStatus, status, taxCategoryId, vendorId | json | 400, 401, 403 | src/app/api/expenses/route.ts |
| GET | /api/expenses/{expenseId} | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | expenseId | - | amount, categoryId, currency, description, expenseDate, notes, paymentAccountId, paymentMethod, reimbursable, reimburseTo, reimbursementStatus, taxCategoryId, vendorId | json | 400, 401, 403, 404 | src/app/api/expenses/[expenseId]/route.ts |
| PATCH | /api/expenses/{expenseId} | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | expenseId | - | amount, categoryId, currency, description, expenseDate, notes, paymentAccountId, paymentMethod, reimbursable, reimburseTo, reimbursementStatus, taxCategoryId, vendorId | json | 400, 401, 403, 404 | src/app/api/expenses/[expenseId]/route.ts |
| POST | /api/expenses/{expenseId}/approve | Approve entity workflow state | session_cookie | requireCompanyRole | expenseId | - | - | json | 400, 401, 403, 404 | src/app/api/expenses/[expenseId]/approve/route.ts |
| GET | /api/expenses/{expenseId}/attachments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | expenseId | - | companyId, content, contentType, name, size, storage, url | json | 400, 401, 403, 404 | src/app/api/expenses/[expenseId]/attachments/route.ts |
| POST | /api/expenses/{expenseId}/attachments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | expenseId | - | companyId, content, contentType, name, size, storage, url | json | 400, 401, 403, 404 | src/app/api/expenses/[expenseId]/attachments/route.ts |
| DELETE | /api/expenses/{expenseId}/attachments/{attachmentId} | Delete or revoke data | session_cookie | requireCompanyRole | attachmentId, expenseId | - | - | json | 401, 403, 404 | src/app/api/expenses/[expenseId]/attachments/[attachmentId]/route.ts |
| POST | /api/expenses/{expenseId}/reimburse | Create or execute action | session_cookie | requireCompanyRole | expenseId | - | companyId, paymentAccountId, paymentDate, paymentMethod, reference | json | 400, 401, 403, 404 | src/app/api/expenses/[expenseId]/reimburse/route.ts |

## Module: health

Operations: **1**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/health | Read data | public_or_system | - | - | token | - | json | 401 | src/app/api/health/route.ts |

## Module: help

Operations: **5**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/help/articles | Read data | session_cookie | - | - | categoryId, q | - | json | 401 | src/app/api/help/articles/route.ts |
| GET | /api/help/articles/{articleId} | Read data | session_cookie | - | articleId | - | - | json | 401, 404 | src/app/api/help/articles/[articleId]/route.ts |
| GET | /api/help/categories | Read data | session_cookie | - | - | - | - | json | 401 | src/app/api/help/categories/route.ts |
| POST | /api/help/feedback | Create or execute action | session_cookie | - | - | - | articleId, companyId, locale, message, page, rating | json | 400, 401 | src/app/api/help/feedback/route.ts |
| GET | /api/help/glossary | Read data | session_cookie | - | - | q | - | json | 401 | src/app/api/help/glossary/route.ts |

## Module: hr

Operations: **2**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/hr/reports/export | Export data | session_cookie | requireCompanyRole | - | companyId, departmentId, endDate, format, report, startDate | - | csv, json, pdf | 400, 401, 403 | src/app/api/hr/reports/export/route.ts |
| GET | /api/hr/reports/summary | Generate report data | session_cookie | requireCompanyRole | - | companyId, departmentId, endDate, startDate | - | json | 400, 401, 403 | src/app/api/hr/reports/summary/route.ts |

## Module: import-jobs

Operations: **1**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/import-jobs | Import or upload data | session_cookie | requireAccountingAccess | - | companyId | - | json | 400, 401, 403 | src/app/api/import-jobs/route.ts |

## Module: integrations

Operations: **10**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/integrations | Read data | session_cookie | requireAdminAccess, requireCompanyRole | - | companyId | companyId, config, connector, credentials, environment, name, status | json | 400, 401, 403 | src/app/api/integrations/route.ts |
| POST | /api/integrations | Create or execute action | session_cookie | requireAdminAccess, requireCompanyRole | - | companyId | companyId, config, connector, credentials, environment, name, status | json | 400, 401, 403 | src/app/api/integrations/route.ts |
| DELETE | /api/integrations/{integrationId} | Delete or revoke data | session_cookie | requireAdminAccess, requireCompanyRole | integrationId | - | config, credentials, environment, name, status | json | 400, 401, 403, 404 | src/app/api/integrations/[integrationId]/route.ts |
| GET | /api/integrations/{integrationId} | Read data | session_cookie | requireAdminAccess, requireCompanyRole | integrationId | - | config, credentials, environment, name, status | json | 400, 401, 403, 404 | src/app/api/integrations/[integrationId]/route.ts |
| PATCH | /api/integrations/{integrationId} | Update existing data | session_cookie | requireAdminAccess, requireCompanyRole | integrationId | - | config, credentials, environment, name, status | json | 400, 401, 403, 404 | src/app/api/integrations/[integrationId]/route.ts |
| GET | /api/integrations/{integrationId}/jobs | Read data | session_cookie | requireAdminAccess | integrationId | - | - | json | 401, 403, 404 | src/app/api/integrations/[integrationId]/jobs/route.ts |
| GET | /api/integrations/{integrationId}/logs | Read data | session_cookie | requireAdminAccess | integrationId | - | - | json | 401, 403, 404 | src/app/api/integrations/[integrationId]/logs/route.ts |
| POST | /api/integrations/{integrationId}/sync | Run integration synchronization | session_cookie | requireCompanyRole | integrationId | - | - | json | 401, 403, 404 | src/app/api/integrations/[integrationId]/sync/route.ts |
| POST | /api/integrations/{integrationId}/test | Run connection or validation test | session_cookie | requireCompanyRole | integrationId | - | - | json | 401, 403, 404 | src/app/api/integrations/[integrationId]/test/route.ts |
| GET | /api/integrations/zatca/preview | Read data | session_cookie | requireAdminAccess | - | companyId, invoiceId | - | json | 400, 401, 403, 404 | src/app/api/integrations/zatca/preview/route.ts |

## Module: invites

Operations: **3**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| POST | /api/invites | Create or execute action | session_cookie | requireAdminAccess | - | - | companyId, email, role | json | 400, 401, 403 | src/app/api/invites/route.ts |
| GET | /api/invites/{token} | Read data | public_or_system | - | token | - | - | json | 404, 410 | src/app/api/invites/[token]/route.ts |
| POST | /api/invites/accept | Create or execute action | public_or_system | - | - | - | name, password, token | json | 400, 410 | src/app/api/invites/accept/route.ts |

## Module: invoices

Operations: **13**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/invoices | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, customerId, from, maxTotal, minTotal, overdue, q, status, to | companyId, currency, customerId, dueDate, invoiceDate, lines, notes, paymentTermId, status, terms | json | 400, 401, 403 | src/app/api/invoices/route.ts |
| POST | /api/invoices | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, customerId, from, maxTotal, minTotal, overdue, q, status, to | companyId, currency, customerId, dueDate, invoiceDate, lines, notes, paymentTermId, status, terms | json | 400, 401, 403 | src/app/api/invoices/route.ts |
| GET | /api/invoices/{invoiceId} | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | invoiceId | - | currency, customerId, dueDate, invoiceDate, lines, notes, paymentTermId, terms | json | 400, 401, 403, 404 | src/app/api/invoices/[invoiceId]/route.ts |
| PUT | /api/invoices/{invoiceId} | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | invoiceId | - | currency, customerId, dueDate, invoiceDate, lines, notes, paymentTermId, terms | json | 400, 401, 403, 404 | src/app/api/invoices/[invoiceId]/route.ts |
| POST | /api/invoices/{invoiceId}/approve | Approve entity workflow state | session_cookie | requireCompanyRole | invoiceId | - | - | json | 400, 401, 403, 404 | src/app/api/invoices/[invoiceId]/approve/route.ts |
| GET | /api/invoices/{invoiceId}/attachments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | invoiceId | - | companyId, content, contentType, name, size, storage, url | json | 400, 401, 403, 404 | src/app/api/invoices/[invoiceId]/attachments/route.ts |
| POST | /api/invoices/{invoiceId}/attachments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | invoiceId | - | companyId, content, contentType, name, size, storage, url | json | 400, 401, 403, 404 | src/app/api/invoices/[invoiceId]/attachments/route.ts |
| DELETE | /api/invoices/{invoiceId}/attachments/{attachmentId} | Delete or revoke data | session_cookie | requireCompanyRole | attachmentId, invoiceId | - | - | json | 401, 403, 404 | src/app/api/invoices/[invoiceId]/attachments/[attachmentId]/route.ts |
| POST | /api/invoices/{invoiceId}/cancel | Cancel entity workflow state | session_cookie | requireCompanyRole | invoiceId | - | - | json | 400, 401, 403, 404 | src/app/api/invoices/[invoiceId]/cancel/route.ts |
| GET | /api/invoices/{invoiceId}/payments | Read data | session_cookie | requireCompanyRole | invoiceId | - | accountId, amount, companyId, method, paymentDate, reference | json | 400, 401, 403, 404 | src/app/api/invoices/[invoiceId]/payments/route.ts |
| POST | /api/invoices/{invoiceId}/payments | Create or execute action | session_cookie | requireCompanyRole | invoiceId | - | accountId, amount, companyId, method, paymentDate, reference | json | 400, 401, 403, 404 | src/app/api/invoices/[invoiceId]/payments/route.ts |
| POST | /api/invoices/{invoiceId}/send | Dispatch communication or document | session_cookie | requireCompanyRole | invoiceId | - | companyId, message, subject, to | json | 400, 401, 403, 404 | src/app/api/invoices/[invoiceId]/send/route.ts |
| POST | /api/invoices/reminders/overdue | Create or execute action | session_cookie | requireCompanyRole | - | - | - | json | 400, 401, 403 | src/app/api/invoices/reminders/overdue/route.ts |

## Module: items

Operations: **13**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/items | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | category, companyId, lowStock, q, status, taxCategoryId, trackInventory, type | companyId, ids, status | json | 400, 401, 403, 409 | src/app/api/items/route.ts |
| PATCH | /api/items | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | - | category, companyId, lowStock, q, status, taxCategoryId, trackInventory, type | companyId, ids, status | json | 400, 401, 403, 409 | src/app/api/items/route.ts |
| POST | /api/items | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | category, companyId, lowStock, q, status, taxCategoryId, trackInventory, type | companyId, ids, status | json | 400, 401, 403, 409 | src/app/api/items/route.ts |
| GET | /api/items/{itemId} | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | itemId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/items/[itemId]/route.ts |
| PUT | /api/items/{itemId} | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | itemId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/items/[itemId]/route.ts |
| GET | /api/items/{itemId}/adjustments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | itemId | - | companyId, note, quantity, reason, unit | json | 400, 401, 403, 404 | src/app/api/items/[itemId]/adjustments/route.ts |
| POST | /api/items/{itemId}/adjustments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | itemId | - | companyId, note, quantity, reason, unit | json | 400, 401, 403, 404 | src/app/api/items/[itemId]/adjustments/route.ts |
| GET | /api/items/{itemId}/attachments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | itemId | - | companyId, content, contentType, name, size, storage, url | json | 400, 401, 403, 404 | src/app/api/items/[itemId]/attachments/route.ts |
| POST | /api/items/{itemId}/attachments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | itemId | - | companyId, content, contentType, name, size, storage, url | json | 400, 401, 403, 404 | src/app/api/items/[itemId]/attachments/route.ts |
| DELETE | /api/items/{itemId}/attachments/{attachmentId} | Delete or revoke data | session_cookie | requireCompanyRole | attachmentId, itemId | - | - | json | 400, 401, 403, 404 | src/app/api/items/[itemId]/attachments/[attachmentId]/route.ts |
| GET | /api/items/export | Export data | session_cookie | requireAccountingAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/items/export/route.ts |
| GET | /api/items/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | companyId, csv, dryRun | csv, json | 400, 401, 403 | src/app/api/items/import/route.ts |
| POST | /api/items/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | companyId, csv, dryRun | csv, json | 400, 401, 403 | src/app/api/items/import/route.ts |

## Module: journal-entries

Operations: **5**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/journal-entries | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, endDate, startDate, status | - | json | 400, 401, 403 | src/app/api/journal-entries/route.ts |
| POST | /api/journal-entries | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, endDate, startDate, status | - | json | 400, 401, 403 | src/app/api/journal-entries/route.ts |
| DELETE | /api/journal-entries/{entryId} | Delete or revoke data | session_cookie | requireCompanyRole | entryId | companyId | - | json | 400, 401, 403, 404 | src/app/api/journal-entries/[entryId]/route.ts |
| PATCH | /api/journal-entries/{entryId} | Update existing data | session_cookie | requireCompanyRole | entryId | companyId | - | json | 400, 401, 403, 404 | src/app/api/journal-entries/[entryId]/route.ts |
| POST | /api/journal-entries/{entryId}/reverse | Create or execute action | session_cookie | requireCompanyRole | entryId | companyId | - | json | 400, 401, 403, 404 | src/app/api/journal-entries/[entryId]/reverse/route.ts |

## Module: leaves

Operations: **12**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/leaves/adjustments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, employeeId, leaveTypeId | amount, companyId, employeeId, leaveTypeId, reason | json | 400, 401, 403 | src/app/api/leaves/adjustments/route.ts |
| POST | /api/leaves/adjustments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, employeeId, leaveTypeId | amount, companyId, employeeId, leaveTypeId, reason | json | 400, 401, 403 | src/app/api/leaves/adjustments/route.ts |
| GET | /api/leaves/balances | Read data | session_cookie | requireCompanyMembership | - | companyId, employeeId, year | - | json | 400, 401, 403, 404 | src/app/api/leaves/balances/route.ts |
| GET | /api/leaves/balances/export | Export data | session_cookie | requireCompanyMembership | - | companyId, employeeId, year | - | csv, json | 400, 401, 403, 404 | src/app/api/leaves/balances/export/route.ts |
| GET | /api/leaves/requests | Read data | session_cookie | requireCompanyMembership | - | companyId, employeeId, status | companyId, employeeId, endDate, leaveTypeId, reason, startDate | json | 400, 401, 403, 404 | src/app/api/leaves/requests/route.ts |
| POST | /api/leaves/requests | Create or execute action | session_cookie | requireCompanyMembership | - | companyId, employeeId, status | companyId, employeeId, endDate, leaveTypeId, reason, startDate | json | 400, 401, 403, 404 | src/app/api/leaves/requests/route.ts |
| PATCH | /api/leaves/requests/{requestId} | Update existing data | session_cookie | requireCompanyMembership, requireCompanyRole | requestId | - | companyId, reason, status | json | 400, 401, 403, 404 | src/app/api/leaves/requests/[requestId]/route.ts |
| GET | /api/leaves/requests/export | Export data | session_cookie | requireCompanyMembership | - | companyId, employeeId, status | - | csv, json | 400, 401, 403, 404 | src/app/api/leaves/requests/export/route.ts |
| GET | /api/leaves/types | Read data | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId | code, companyId, defaultAllowance, isPaid, name, requiresApproval, status | json | 400, 401, 403, 409 | src/app/api/leaves/types/route.ts |
| POST | /api/leaves/types | Create or execute action | session_cookie | requireCompanyMembership, requireCompanyRole | - | companyId | code, companyId, defaultAllowance, isPaid, name, requiresApproval, status | json | 400, 401, 403, 409 | src/app/api/leaves/types/route.ts |
| DELETE | /api/leaves/types/{typeId} | Delete or revoke data | session_cookie | requireCompanyRole | typeId | companyId | - | json | 400, 401, 403 | src/app/api/leaves/types/[typeId]/route.ts |
| PATCH | /api/leaves/types/{typeId} | Update existing data | session_cookie | requireCompanyRole | typeId | companyId | - | json | 400, 401, 403 | src/app/api/leaves/types/[typeId]/route.ts |

## Module: notification-preferences

Operations: **2**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/notification-preferences | Read data | session_cookie | requireCompanyMembership | - | companyId | channels, companyId, types | json | 400, 401, 403 | src/app/api/notification-preferences/route.ts |
| PATCH | /api/notification-preferences | Update existing data | session_cookie | requireCompanyMembership | - | companyId | channels, companyId, types | json | 400, 401, 403 | src/app/api/notification-preferences/route.ts |

## Module: notifications

Operations: **7**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/notifications | Read data | session_cookie | requireCompanyMembership | - | companyId, status | - | json | 400, 401, 403, 500 | src/app/api/notifications/route.ts |
| POST | /api/notifications | Create or execute action | session_cookie | requireCompanyMembership | - | companyId, status | - | json | 400, 401, 403, 500 | src/app/api/notifications/route.ts |
| PATCH | /api/notifications/{notificationId} | Update existing data | session_cookie | - | notificationId | - | - | json | 401, 404 | src/app/api/notifications/[notificationId]/route.ts |
| GET | /api/notifications/export | Export data | session_cookie | requireCompanyMembership | - | companyId, status | - | csv, json | 401, 403 | src/app/api/notifications/export/route.ts |
| POST | /api/notifications/mark-all-read | Create or execute action | session_cookie | requireCompanyMembership | - | - | - | json | 401, 403 | src/app/api/notifications/mark-all-read/route.ts |
| GET | /api/notifications/preview | Read data | session_cookie | - | - | locale, type | - | json | 400, 401 | src/app/api/notifications/preview/route.ts |
| POST | /api/notifications/test | Run connection or validation test | session_cookie | requireAdminAccess | - | - | companyId, email, locale, type | json | 400, 401, 403 | src/app/api/notifications/test/route.ts |

## Module: open-items

Operations: **1**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/open-items | Read data | session_cookie | requireAccountingAccess | - | companyId, partyId, partyType | - | json | 400, 401, 403 | src/app/api/open-items/route.ts |

## Module: opening-balances

Operations: **4**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/opening-balances | Read data | session_cookie | requireCompanyRole | - | companyId | asOfDate, companyId, entries | json | 400, 401, 403 | src/app/api/opening-balances/route.ts |
| PUT | /api/opening-balances | Update existing data | session_cookie | requireCompanyRole | - | companyId | asOfDate, companyId, entries | json | 400, 401, 403 | src/app/api/opening-balances/route.ts |
| GET | /api/opening-balances/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | companyId, csv, dryRun | csv, json | 400, 401, 403 | src/app/api/opening-balances/import/route.ts |
| POST | /api/opening-balances/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | companyId, csv, dryRun | csv, json | 400, 401, 403 | src/app/api/opening-balances/import/route.ts |

## Module: payment-methods

Operations: **3**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/payment-methods | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | code, companyId, defaultAccountId, name, status | json | 400, 401, 403 | src/app/api/payment-methods/route.ts |
| POST | /api/payment-methods | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | code, companyId, defaultAccountId, name, status | json | 400, 401, 403 | src/app/api/payment-methods/route.ts |
| PATCH | /api/payment-methods/{methodId} | Update existing data | session_cookie | requireCompanyRole | methodId | - | defaultAccountId, name, status | json | 400, 401, 403, 404 | src/app/api/payment-methods/[methodId]/route.ts |

## Module: payment-terms

Operations: **3**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/payment-terms | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, days, name, status | json | 400, 401, 403 | src/app/api/payment-terms/route.ts |
| POST | /api/payment-terms | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, days, name, status | json | 400, 401, 403 | src/app/api/payment-terms/route.ts |
| PATCH | /api/payment-terms/{termId} | Update existing data | session_cookie | requireCompanyRole | termId | - | days, name, status | json | 400, 401, 403, 404 | src/app/api/payment-terms/[termId]/route.ts |

## Module: payments

Operations: **9**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/payments/receipts | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, customerId, from, q, status, to | accountId, allocations, companyId, currency, customerId, method, receiptDate, reference, totalAmount | json | 400, 401, 403 | src/app/api/payments/receipts/route.ts |
| POST | /api/payments/receipts | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, customerId, from, q, status, to | accountId, allocations, companyId, currency, customerId, method, receiptDate, reference, totalAmount | json | 400, 401, 403 | src/app/api/payments/receipts/route.ts |
| GET | /api/payments/receipts/{receiptId} | Read data | session_cookie | requireAccountingAccess | receiptId | - | - | json | 401, 403, 404 | src/app/api/payments/receipts/[receiptId]/route.ts |
| GET | /api/payments/receipts/export | Export data | session_cookie | requireAccountingAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/payments/receipts/export/route.ts |
| GET | /api/payments/transfers/export | Export data | session_cookie | requireAccountingAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/payments/transfers/export/route.ts |
| GET | /api/payments/vendor-payments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, from, q, status, to, vendorId | accountId, allocations, companyId, currency, method, paymentDate, reference, totalAmount, vendorId | json | 400, 401, 403 | src/app/api/payments/vendor-payments/route.ts |
| POST | /api/payments/vendor-payments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, from, q, status, to, vendorId | accountId, allocations, companyId, currency, method, paymentDate, reference, totalAmount, vendorId | json | 400, 401, 403 | src/app/api/payments/vendor-payments/route.ts |
| GET | /api/payments/vendor-payments/{paymentId} | Read data | session_cookie | requireAccountingAccess | paymentId | - | - | json | 401, 403, 404 | src/app/api/payments/vendor-payments/[paymentId]/route.ts |
| GET | /api/payments/vendor-payments/export | Export data | session_cookie | requireAccountingAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/payments/vendor-payments/export/route.ts |

## Module: payroll

Operations: **11**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/payroll/adjustments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, runId | amount, companyId, reason, runId, runItemId | json | 400, 401, 403, 404 | src/app/api/payroll/adjustments/route.ts |
| POST | /api/payroll/adjustments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, runId | amount, companyId, reason, runId, runItemId | json | 400, 401, 403, 404 | src/app/api/payroll/adjustments/route.ts |
| GET | /api/payroll/payslips/{runItemId}/export | Export data | session_cookie | requireHrAccess | runItemId | companyId, format, lang | - | csv, json, pdf | 400, 401, 403, 404 | src/app/api/payroll/payslips/[runItemId]/export/route.ts |
| GET | /api/payroll/runs | Read data | session_cookie | requireCompanyRole, requireHrAccess | - | companyId | companyId, employeeIds, periodEnd, periodStart | json | 400, 401, 403, 409 | src/app/api/payroll/runs/route.ts |
| POST | /api/payroll/runs | Create or execute action | session_cookie | requireCompanyRole, requireHrAccess | - | companyId | companyId, employeeIds, periodEnd, periodStart | json | 400, 401, 403, 409 | src/app/api/payroll/runs/route.ts |
| GET | /api/payroll/runs/{runId} | Read data | session_cookie | requireHrAccess | runId | companyId | - | json | 400, 401, 403, 404 | src/app/api/payroll/runs/[runId]/route.ts |
| POST | /api/payroll/runs/{runId}/approve | Approve entity workflow state | session_cookie | requireCompanyRole | runId | - | - | json | 400, 401, 403, 404 | src/app/api/payroll/runs/[runId]/approve/route.ts |
| GET | /api/payroll/runs/{runId}/export | Export data | session_cookie | requireHrAccess | runId | companyId, format, lang | - | csv, json, pdf | 400, 401, 403, 404 | src/app/api/payroll/runs/[runId]/export/route.ts |
| POST | /api/payroll/runs/{runId}/pay | Create or execute action | session_cookie | requireCompanyRole | runId | - | companyId, paymentAccountId, paymentDate, paymentMethod | json | 400, 401, 403, 404 | src/app/api/payroll/runs/[runId]/pay/route.ts |
| GET | /api/payroll/settings | Read data | session_cookie | requireCompanyRole, requireHrAccess | - | companyId | companyId, cycle, gosiEmployeeRate, gosiEmployerRate, gosiEnabled, incomeTaxEnabled, incomeTaxRate, latenessPenaltyPerMinute, overtimeMultiplier, paymentAccountId, payrollPayableAccountId, salaryDeductionsAccountId, salaryExpenseAccountId | json | 400, 401, 403 | src/app/api/payroll/settings/route.ts |
| PUT | /api/payroll/settings | Update existing data | session_cookie | requireCompanyRole, requireHrAccess | - | companyId | companyId, cycle, gosiEmployeeRate, gosiEmployerRate, gosiEnabled, incomeTaxEnabled, incomeTaxRate, latenessPenaltyPerMinute, overtimeMultiplier, paymentAccountId, payrollPayableAccountId, salaryDeductionsAccountId, salaryExpenseAccountId | json | 400, 401, 403 | src/app/api/payroll/settings/route.ts |

## Module: positions

Operations: **5**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/positions | Read data | session_cookie | requireCompanyRole, requireHrAccess | - | companyId | - | json | 400, 401, 403, 409 | src/app/api/positions/route.ts |
| POST | /api/positions | Create or execute action | session_cookie | requireCompanyRole, requireHrAccess | - | companyId | - | json | 400, 401, 403, 409 | src/app/api/positions/route.ts |
| GET | /api/positions/{positionId} | Read data | session_cookie | requireCompanyRole, requireHrAccess | positionId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/positions/[positionId]/route.ts |
| PATCH | /api/positions/{positionId} | Update existing data | session_cookie | requireCompanyRole, requireHrAccess | positionId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/positions/[positionId]/route.ts |
| GET | /api/positions/export | Export data | session_cookie | requireHrAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/positions/export/route.ts |

## Module: reconciliation

Operations: **5**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| POST | /api/reconciliation/auto-match | Create or execute action | session_cookie | requireCompanyRole | - | - | accountId, companyId | json | 400, 401, 403 | src/app/api/reconciliation/auto-match/route.ts |
| GET | /api/reconciliation/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | accountId, companyId, lines | csv, json | 400, 401, 403 | src/app/api/reconciliation/import/route.ts |
| POST | /api/reconciliation/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | accountId, companyId, lines | csv, json | 400, 401, 403 | src/app/api/reconciliation/import/route.ts |
| GET | /api/reconciliation/lines | Read data | session_cookie | requireAccountingAccess | - | accountId, companyId | - | json | 400, 401, 403 | src/app/api/reconciliation/lines/route.ts |
| PATCH | /api/reconciliation/lines/{lineId} | Update existing data | session_cookie | requireCompanyRole | lineId | - | matchedCashTransactionId, status | json | 400, 401, 403, 404 | src/app/api/reconciliation/lines/[lineId]/route.ts |

## Module: recurring-invoices

Operations: **6**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/recurring-invoices | Read data | session_cookie | requireCompanyRole | - | companyId | companyId, customerId, frequency, nextRunDate, template | json | 400, 401, 403 | src/app/api/recurring-invoices/route.ts |
| POST | /api/recurring-invoices | Create or execute action | session_cookie | requireCompanyRole | - | companyId | companyId, customerId, frequency, nextRunDate, template | json | 400, 401, 403 | src/app/api/recurring-invoices/route.ts |
| DELETE | /api/recurring-invoices/{recurringId} | Delete or revoke data | session_cookie | requireCompanyRole | recurringId | - | frequency, nextRunDate, status, template | json | 400, 401, 403, 404 | src/app/api/recurring-invoices/[recurringId]/route.ts |
| GET | /api/recurring-invoices/{recurringId} | Read data | session_cookie | requireCompanyRole | recurringId | - | frequency, nextRunDate, status, template | json | 400, 401, 403, 404 | src/app/api/recurring-invoices/[recurringId]/route.ts |
| PATCH | /api/recurring-invoices/{recurringId} | Update existing data | session_cookie | requireCompanyRole | recurringId | - | frequency, nextRunDate, status, template | json | 400, 401, 403, 404 | src/app/api/recurring-invoices/[recurringId]/route.ts |
| POST | /api/recurring-invoices/run | Create or execute action | session_cookie | requireCompanyRole | - | - | - | json | 400, 401, 403 | src/app/api/recurring-invoices/run/route.ts |

## Module: register

Operations: **1**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| POST | /api/register | Create or execute action | public_or_system | - | - | - | - | json | 400, 500 | src/app/api/register/route.ts |

## Module: reports

Operations: **11**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/reports/balance-sheet | Generate report data | session_cookie | requireReportAccess | - | asOfDate, companyId | - | json | 400, 401, 403 | src/app/api/reports/balance-sheet/route.ts |
| GET | /api/reports/balance-sheet/export | Export data | session_cookie | requireReportAccess | - | asOfDate, companyId, format | - | csv, json, pdf | 400, 401, 403 | src/app/api/reports/balance-sheet/export/route.ts |
| GET | /api/reports/cash-flow | Generate report data | session_cookie | requireReportAccess | - | companyId, endDate, startDate | - | json | 400, 401, 403 | src/app/api/reports/cash-flow/route.ts |
| GET | /api/reports/cash-flow/export | Export data | session_cookie | requireReportAccess | - | companyId, endDate, format, startDate | - | csv, json, pdf | 400, 401, 403 | src/app/api/reports/cash-flow/export/route.ts |
| GET | /api/reports/exports | Export data | session_cookie | requireReportAccess | - | companyId, endDate, format, limit, reportType, startDate, userId | - | json | 400, 401, 403 | src/app/api/reports/exports/route.ts |
| GET | /api/reports/general-ledger | Generate report data | session_cookie | requireReportAccess | - | accountId, companyId, endDate, startDate | - | json | 400, 401, 403 | src/app/api/reports/general-ledger/route.ts |
| GET | /api/reports/general-ledger/export | Export data | session_cookie | requireReportAccess | - | accountId, companyId, endDate, format, startDate | - | csv, json, pdf | 400, 401, 403 | src/app/api/reports/general-ledger/export/route.ts |
| GET | /api/reports/profit-loss | Generate report data | session_cookie | requireReportAccess | - | companyId, compareEndDate, compareStartDate, endDate, startDate | - | json | 400, 401, 403 | src/app/api/reports/profit-loss/route.ts |
| GET | /api/reports/profit-loss/export | Export data | session_cookie | requireReportAccess | - | companyId, compareEndDate, compareStartDate, endDate, format, startDate | - | csv, json, pdf | 400, 401, 403 | src/app/api/reports/profit-loss/export/route.ts |
| GET | /api/reports/trial-balance | Generate report data | session_cookie | requireReportAccess | - | companyId, compareEndDate, compareStartDate, endDate, startDate | - | json | 400, 401, 403 | src/app/api/reports/trial-balance/route.ts |
| GET | /api/reports/trial-balance/export | Export data | session_cookie | requireReportAccess | - | companyId, compareEndDate, compareStartDate, endDate, format, startDate | - | csv, json, pdf | 400, 401, 403 | src/app/api/reports/trial-balance/export/route.ts |

## Module: security

Operations: **4**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/security/mfa | Read data | session_cookie | requireAdminAccess | - | companyId | - | json | 400, 401, 403 | src/app/api/security/mfa/route.ts |
| POST | /api/security/mfa/disable | Create or execute action | session_cookie | requireAdminAccess | - | - | - | json | 400, 401, 403, 409 | src/app/api/security/mfa/disable/route.ts |
| POST | /api/security/mfa/enroll | Create or execute action | session_cookie | requireAdminAccess | - | - | - | json | 400, 401, 403, 409 | src/app/api/security/mfa/enroll/route.ts |
| POST | /api/security/mfa/verify | Create or execute action | session_cookie | requireAdminAccess | - | - | - | json | 400, 401, 403, 409 | src/app/api/security/mfa/verify/route.ts |

## Module: setup

Operations: **2**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| POST | /api/setup/bootstrap | Create or execute action | public_or_system | - | - | - | adminName, companyName, email, password | json | 400, 409 | src/app/api/setup/bootstrap/route.ts |
| GET | /api/setup/status | Read data | public_or_system | - | - | - | - | json | 200 | src/app/api/setup/status/route.ts |

## Module: support

Operations: **4**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/support/tickets | Read data | session_cookie | requireCompanyMembership | - | companyId | category, companyId, locale, message, priority, subject | json | 400, 401, 403 | src/app/api/support/tickets/route.ts |
| POST | /api/support/tickets | Create or execute action | session_cookie | requireCompanyMembership | - | companyId | category, companyId, locale, message, priority, subject | json | 400, 401, 403 | src/app/api/support/tickets/route.ts |
| PATCH | /api/support/tickets/{ticketId} | Update existing data | session_cookie | requireAdminAccess, requireCompanyMembership | ticketId | - | status | json | 400, 401, 403, 404 | src/app/api/support/tickets/[ticketId]/route.ts |
| GET | /api/support/tickets/export | Export data | session_cookie | requireAdminAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/support/tickets/export/route.ts |

## Module: tax-categories

Operations: **3**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/tax-categories | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, name, rate, status, type | json | 400, 401, 403 | src/app/api/tax-categories/route.ts |
| POST | /api/tax-categories | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, name, rate, status, type | json | 400, 401, 403 | src/app/api/tax-categories/route.ts |
| PATCH | /api/tax-categories/{categoryId} | Update existing data | session_cookie | requireCompanyRole | categoryId | - | name, rate, status, type | json | 400, 401, 403, 404 | src/app/api/tax-categories/[categoryId]/route.ts |

## Module: telemetry

Operations: **1**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| POST | /api/telemetry/event | Create or execute action | session_cookie | - | - | - | companyId, metadata, name | json | 400, 401 | src/app/api/telemetry/event/route.ts |

## Module: transfers

Operations: **3**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/transfers | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, from, fromAccountId, q, to, toAccountId | amount, companyId, fromAccountId, memo, reference, toAccountId, transferDate | json | 400, 401, 403 | src/app/api/transfers/route.ts |
| POST | /api/transfers | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, from, fromAccountId, q, to, toAccountId | amount, companyId, fromAccountId, memo, reference, toAccountId, transferDate | json | 400, 401, 403 | src/app/api/transfers/route.ts |
| GET | /api/transfers/{transferId} | Read data | session_cookie | requireAccountingAccess | transferId | - | - | json | 401, 403, 404 | src/app/api/transfers/[transferId]/route.ts |

## Module: uploads

Operations: **1**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| POST | /api/uploads/signature | Create or execute action | session_cookie | - | - | - | - | json | 401, 500 | src/app/api/uploads/signature/route.ts |

## Module: users

Operations: **4**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/users | Read data | session_cookie | requireAdminAccess | - | companyId | - | json | 400, 401, 403 | src/app/api/users/route.ts |
| DELETE | /api/users/{userId} | Delete or revoke data | session_cookie | requireAdminAccess | userId | - | companyId, role | json | 400, 401, 403, 404 | src/app/api/users/[userId]/route.ts |
| PATCH | /api/users/{userId} | Update existing data | session_cookie | requireAdminAccess | userId | - | companyId, role | json | 400, 401, 403, 404 | src/app/api/users/[userId]/route.ts |
| GET | /api/users/export | Export data | session_cookie | requireAdminAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/users/export/route.ts |

## Module: vat

Operations: **8**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/vat/adjustments | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, periodId | amount, companyId, periodId, reason, type | json | 400, 401, 403, 404 | src/app/api/vat/adjustments/route.ts |
| POST | /api/vat/adjustments | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, periodId | amount, companyId, periodId, reason, type | json | 400, 401, 403, 404 | src/app/api/vat/adjustments/route.ts |
| GET | /api/vat/periods | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, endDate, frequency, name, startDate | json | 400, 401, 403, 409 | src/app/api/vat/periods/route.ts |
| POST | /api/vat/periods | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId | companyId, endDate, frequency, name, startDate | json | 400, 401, 403, 409 | src/app/api/vat/periods/route.ts |
| PATCH | /api/vat/periods/{periodId} | Update existing data | session_cookie | requireCompanyRole | periodId | - | status | json | 400, 401, 403, 404 | src/app/api/vat/periods/[periodId]/route.ts |
| POST | /api/vat/periods/generate | Create or execute action | session_cookie | requireCompanyRole | - | - | companyId, frequency, year | json | 400, 401, 403, 409 | src/app/api/vat/periods/generate/route.ts |
| GET | /api/vat/report | Generate report data | session_cookie | requireReportAccess | - | companyId, endDate, periodId, startDate | - | json | 400, 401, 403, 404 | src/app/api/vat/report/route.ts |
| GET | /api/vat/report/export | Export data | session_cookie | requireReportAccess | - | companyId, format, periodId | - | csv, json, pdf | 400, 401, 403, 404 | src/app/api/vat/report/export/route.ts |

## Module: vendor-credit-notes

Operations: **6**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/vendor-credit-notes | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | billId, companyId, q, status, vendorId | billId, companyId, currency, issueDate, lines, notes, reason, status | json | 400, 401, 403 | src/app/api/vendor-credit-notes/route.ts |
| POST | /api/vendor-credit-notes | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | billId, companyId, q, status, vendorId | billId, companyId, currency, issueDate, lines, notes, reason, status | json | 400, 401, 403 | src/app/api/vendor-credit-notes/route.ts |
| GET | /api/vendor-credit-notes/{creditNoteId} | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | creditNoteId | - | issueDate, lines, notes, reason, status | json | 400, 401, 403, 404 | src/app/api/vendor-credit-notes/[creditNoteId]/route.ts |
| PATCH | /api/vendor-credit-notes/{creditNoteId} | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | creditNoteId | - | issueDate, lines, notes, reason, status | json | 400, 401, 403, 404 | src/app/api/vendor-credit-notes/[creditNoteId]/route.ts |
| POST | /api/vendor-credit-notes/{creditNoteId}/cancel | Cancel entity workflow state | session_cookie | requireCompanyRole | creditNoteId | - | - | json | 400, 401, 403, 404 | src/app/api/vendor-credit-notes/[creditNoteId]/cancel/route.ts |
| POST | /api/vendor-credit-notes/{creditNoteId}/issue | Issue or finalize document | session_cookie | requireCompanyRole | creditNoteId | - | - | json | 400, 401, 403, 404 | src/app/api/vendor-credit-notes/[creditNoteId]/issue/route.ts |

## Module: vendors

Operations: **16**

| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| GET | /api/vendors | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | - | balance, companyId, q, status, vatRegistered | companyId, ids, status | json | 400, 401, 403, 409 | src/app/api/vendors/route.ts |
| PATCH | /api/vendors | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | - | balance, companyId, q, status, vatRegistered | companyId, ids, status | json | 400, 401, 403, 409 | src/app/api/vendors/route.ts |
| POST | /api/vendors | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | - | balance, companyId, q, status, vatRegistered | companyId, ids, status | json | 400, 401, 403, 409 | src/app/api/vendors/route.ts |
| GET | /api/vendors/{vendorId} | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | vendorId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/vendors/[vendorId]/route.ts |
| PUT | /api/vendors/{vendorId} | Update existing data | session_cookie | requireAccountingAccess, requireCompanyRole | vendorId | - | - | json | 400, 401, 403, 404, 409 | src/app/api/vendors/[vendorId]/route.ts |
| GET | /api/vendors/{vendorId}/activity | Read data | session_cookie | requireAccountingAccess | vendorId | - | - | json | 401, 403, 404 | src/app/api/vendors/[vendorId]/activity/route.ts |
| GET | /api/vendors/{vendorId}/contacts | Read data | session_cookie | requireAccountingAccess, requireCompanyRole | vendorId | - | companyId, email, isPrimary, name, partyId, partyType, phone, role | json | 400, 401, 403, 404 | src/app/api/vendors/[vendorId]/contacts/route.ts |
| POST | /api/vendors/{vendorId}/contacts | Create or execute action | session_cookie | requireAccountingAccess, requireCompanyRole | vendorId | - | companyId, email, isPrimary, name, partyId, partyType, phone, role | json | 400, 401, 403, 404 | src/app/api/vendors/[vendorId]/contacts/route.ts |
| GET | /api/vendors/{vendorId}/statement | Read data | session_cookie | requireAccountingAccess | vendorId | - | - | json | 401, 403, 404 | src/app/api/vendors/[vendorId]/statement/route.ts |
| POST | /api/vendors/{vendorId}/statement/email | Create or execute action | session_cookie | requireCompanyRole | vendorId | - | - | json | 400, 401, 403, 404 | src/app/api/vendors/[vendorId]/statement/email/route.ts |
| GET | /api/vendors/{vendorId}/statement/export | Export data | session_cookie | requireAccountingAccess | vendorId | - | - | csv, json | 401, 403, 404 | src/app/api/vendors/[vendorId]/statement/export/route.ts |
| GET | /api/vendors/{vendorId}/statement/history | Read data | session_cookie | requireCompanyRole | vendorId | - | - | json | 401, 403, 404 | src/app/api/vendors/[vendorId]/statement/history/route.ts |
| POST | /api/vendors/{vendorId}/statement/resend | Create or execute action | session_cookie | requireCompanyRole | vendorId | - | emailId | json | 400, 401, 403, 404 | src/app/api/vendors/[vendorId]/statement/resend/route.ts |
| GET | /api/vendors/export | Export data | session_cookie | requireAccountingAccess | - | companyId | - | csv, json | 400, 401, 403 | src/app/api/vendors/export/route.ts |
| GET | /api/vendors/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | companyId, csv, dryRun | csv, json | 400, 401, 403 | src/app/api/vendors/import/route.ts |
| POST | /api/vendors/import | Import or upload data | session_cookie | requireAccountingAccess, requireCompanyRole | - | companyId, lang | companyId, csv, dryRun | csv, json | 400, 401, 403 | src/app/api/vendors/import/route.ts |

