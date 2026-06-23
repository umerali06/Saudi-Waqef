# External API v1 Guide

This guide is for third-party integrators who need API-key access to operational data.

## Current status

Internal application routes such as `/api/invoices`, `/api/vat/report`, `/api/reports/*`, `/api/payroll/*`, and `/api/hr/*` are still protected by user session authentication. API keys are not accepted on those internal UI routes.

For external integration, use the dedicated external API layer:

- Preferred base URL: `/api/external/v1`
- Alias base URL: `/external/v1`

Both use the same API key authentication.

## Authentication

Send the API key as a bearer token:

```bash
Authorization: Bearer <API_KEY>
```

The API key is already bound to one company. If a `companyId` query parameter is provided, it must match the API key company.

## Required scopes

| Area | Scope required |
| --- | --- |
| Ping | Any of `read:accounting`, `read:reports`, `read:hr` |
| Invoices | `read:accounting` |
| VAT | `read:reports` |
| Financial reports | `read:reports` |
| HR summary | `read:hr` |
| Payroll runs | `read:hr` |

## Endpoint mapping

Do not use the internal route for external integrations. Use the external route.

| Client need | Internal route, session only | External API-key route |
| --- | --- | --- |
| Ping | `/api/developer/ping` | `/api/external/v1/ping` or `/external/v1/ping` |
| Invoices list | `/api/invoices` | `/api/external/v1/invoices` |
| Invoice detail | `/api/invoices/{invoiceId}` | `/api/external/v1/invoices/{invoiceId}` |
| VAT report | `/api/vat/report` | `/api/external/v1/vat?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` |
| VAT periods | `/api/vat/periods` | `/api/external/v1/vat/periods` |
| Reports list/help | `/api/reports/*` | `/api/external/v1/reports` |
| Profit and loss | `/api/reports/profit-loss` | `/api/external/v1/reports/profit-loss` |
| Trial balance | `/api/reports/trial-balance` | `/api/external/v1/reports/trial-balance` |
| Balance sheet | `/api/reports/balance-sheet` | `/api/external/v1/reports/balance-sheet` |
| Cash flow | `/api/reports/cash-flow` | `/api/external/v1/reports/cash-flow` |
| HR summary | `/api/hr/reports/summary` | `/api/external/v1/hr` |
| Payroll runs | `/api/payroll/runs` | `/api/external/v1/payroll` |
| Payroll run detail | `/api/payroll/runs/{runId}` | `/api/external/v1/payroll/runs/{runId}` |

## Beginner test steps

Replace:

- `<BASE_URL>` with the deployed domain, for example `https://app.example.com`
- `<API_KEY>` with the generated API key
- dates with the period you want to test

### 1. Confirm external API authentication

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/ping"
```

Expected result:

```json
{
  "ok": true,
  "companyId": "company-id-from-api-key",
  "scopes": ["read:accounting", "read:reports", "read:hr"],
  "apiVersion": "external/v1"
}
```

### 2. Test invoices

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/invoices?startDate=2026-01-01&endDate=2026-01-31&includeLines=true"
```

Expected result:

```json
{
  "data": [
    {
      "id": "invoice-id",
      "invoiceNumber": "INV-0001",
      "status": "approved",
      "invoiceDate": "2026-01-10",
      "total": 115,
      "taxTotal": 15,
      "lines": []
    }
  ],
  "meta": {
    "count": 1,
    "total": 1,
    "limit": 100
  }
}
```

### 3. Test VAT report

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/vat?startDate=2026-01-01&endDate=2026-03-31"
```

You can also test by VAT period:

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/vat/periods"
```

Then use:

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/vat?periodId=<PERIOD_ID>"
```

### 4. Test financial reports

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/reports/profit-loss?startDate=2026-01-01&endDate=2026-01-31"
```

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/reports/trial-balance?startDate=2026-01-01&endDate=2026-01-31"
```

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/reports/balance-sheet?asOfDate=2026-01-31"
```

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/reports/cash-flow?startDate=2026-01-01&endDate=2026-01-31"
```

### 5. Test HR summary

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/hr?startDate=2026-01-01&endDate=2026-01-31"
```

### 6. Test payroll

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/payroll?startDate=2026-01-01&endDate=2026-01-31"
```

For one payroll run:

```bash
curl -i ^
  -H "Authorization: Bearer <API_KEY>" ^
  "<BASE_URL>/api/external/v1/payroll/runs/<RUN_ID>?includeItems=true"
```

## Common errors

### 401 Unauthorized

Cause:

- Missing `Authorization` header
- Wrong API key
- Revoked API key

Fix:

- Use `Authorization: Bearer <API_KEY>`
- Generate a fresh active key from the developer/API key screen

### 403 Forbidden

Cause:

- The API key is valid but does not have the required scope
- A different `companyId` was sent in the query string

Fix:

- For invoices, add `read:accounting`
- For VAT and financial reports, add `read:reports`
- For HR and payroll, add `read:hr`
- Remove `companyId` from the URL unless it matches the API key company

### 404 Not found

Cause:

- The invoice/payroll run does not exist
- The record belongs to a different company
- Wrong URL

Fix:

- First list records, then test detail endpoint with an ID returned from the list response

## Notes for client testing

- Use the external API routes above, not the internal UI routes.
- Start with `ping`.
- Then test one endpoint per area: invoices, VAT, reports, HR, payroll.
- Save the full request URL, headers, HTTP status code, and response body for each failed test.
- For ZATCA/ERP integration, invoices and VAT reports should be tested first because they are the critical accounting data sources.
