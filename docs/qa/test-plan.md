# QA Test Plan

## Scope
- Core accounting flows (invoices, bills, payments, VAT).
- HR payroll runs and approvals.
- RTL/LTR UI validation for critical forms.

## Automated Coverage
- Unit tests: VAT calculations, payroll calculations, numbering sequences, validators.
- Integration smoke: API routes for create/approve flows (manual or scripted).
- UI sanity: login, onboarding, invoice, bill, payroll pages.

## Manual Checks
- Language switch (Arabic default, English secondary) across critical flows.
- Document print previews (invoice/bill) with branding and templates.
- Approval thresholds for bills and payroll.

## Exit Criteria
- All automated tests pass.
- No high-severity defects open.
- UAT sign-off completed.
