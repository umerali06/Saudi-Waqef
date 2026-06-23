# API Integration Reference

Generated on: 2026-03-03T08:39:37.896Z

## 1. Available API Endpoints
- Full endpoint inventory (method + path + auth + schema reference): `docs/developer/api-endpoints-inventory.csv`
- Detailed route-by-route Markdown: `docs/developer/api-integration-detailed.md`
- Total operations discovered: **376**
- Total route files discovered: **272**

### Module coverage (operation count)
- admin: 35
- billing: 18
- customers: 18
- attendance: 16
- vendors: 16
- employees: 14
- invoices: 13
- items: 13
- bills: 12
- leaves: 12
- payroll: 11
- reports: 11
- integrations: 10
- credit-notes: 9
- expenses: 9
- payments: 9
- vat: 8
- companies: 7
- developer: 7
- documents: 7
- notifications: 7
- recurring-invoices: 6
- vendor-credit-notes: 6
- departments: 5
- help: 5
- journal-entries: 5
- positions: 5
- reconciliation: 5
- accounting-periods: 4
- coa: 4
- email: 4
- opening-balances: 4
- security: 4
- support: 4
- users: 4
- adjustments: 3
- auth: 3
- cash-bank-accounts: 3
- expense-categories: 3
- invites: 3
- payment-methods: 3
- payment-terms: 3
- tax-categories: 3
- transfers: 3
- analytics: 2
- audit-logs: 2
- company-defaults: 2
- contacts: 2
- document-branding: 2
- hr: 2
- notification-preferences: 2
- setup: 2
- health: 1
- import-jobs: 1
- open-items: 1
- register: 1
- telemetry: 1
- uploads: 1

## 2. Authentication and Scopes
- Internal application APIs use authenticated sessions and role/system guards.
- API key (Bearer token) is implemented for developer health checks and the external API v1 layer.
- External integrations should use `/api/external/v1/*` or `/external/v1/*`, not internal session routes such as `/api/invoices`.
- API key scopes currently defined in code:
  - read:accounting
  - write:accounting
  - read:hr
  - write:hr
  - read:reports
  - write:reports
  - read:settings
  - write:settings
- API key storage and verification:
  - Token is generated once and only token hash is stored.
  - Revoked keys cannot authenticate.
  - Usage logs are captured in `api_key_usage`.

## 3. Data Formats and Field Definitions
- Response formats detected in routes:
  - JSON (default across API routes)
  - CSV exports (`text/csv; charset=utf-8`)
  - PDF exports (`application/pdf`)
- Request payload validation is implemented with Zod schemas.
- Endpoint-level schema references and request field hints are listed in `docs/developer/api-endpoints-inventory.csv` (`requestSchema`, `requestFields`).
- Schema-level field catalog is available in `docs/developer/api-schema-fields.csv`.
- Source validator definitions are in: `src/lib/validators/*.ts`.

## 4. Usage Examples
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

External API v1 examples:

```bash
curl -H "Authorization: Bearer <API_KEY>" https://<your-domain>/api/external/v1/ping
curl -H "Authorization: Bearer <API_KEY>" "https://<your-domain>/api/external/v1/invoices?startDate=2026-01-01&endDate=2026-01-31"
curl -H "Authorization: Bearer <API_KEY>" "https://<your-domain>/api/external/v1/vat?startDate=2026-01-01&endDate=2026-03-31"
curl -H "Authorization: Bearer <API_KEY>" "https://<your-domain>/api/external/v1/reports/profit-loss?startDate=2026-01-01&endDate=2026-01-31"
curl -H "Authorization: Bearer <API_KEY>" "https://<your-domain>/api/external/v1/hr?startDate=2026-01-01&endDate=2026-01-31"
curl -H "Authorization: Bearer <API_KEY>" "https://<your-domain>/api/external/v1/payroll?startDate=2026-01-01&endDate=2026-01-31"
```

Full beginner guide: `docs/developer/external-v1-api-guide.md`.

## 5. Rate Limits and Security Policies
- Documented API policy in `docs/developer/api-overview.md`:
  - Default: 300 requests/minute per key
  - Burst: 50 requests
- Security controls implemented in code include:
  - Session authentication (NextAuth JWT strategy)
  - Role/system authorization checks
  - Zod payload validation
  - Audit logging and telemetry events
  - API key hashing and revocation support
  - MFA endpoints and login throttling controls

## Notes for External Integrators
- The codebase currently exposes many internal application endpoints under `/api/*`.
- Treat internal routes as implementation-level APIs unless a stable integration contract is explicitly published.
- For stable external integrations, use the approved `/api/external/v1/*` endpoint subset.
