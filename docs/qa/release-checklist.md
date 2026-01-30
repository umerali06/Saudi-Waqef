# Release Checklist

## Functional
- [ ] Login, onboarding, and company setup completed in AR/EN.
- [ ] Invoice and bill lifecycles tested (draft → approve → pay).
- [ ] VAT report aligns with ledger and transaction data.
- [ ] Payroll run approvals and payment recorded.
- [ ] Data imports (items, opening balances) validated.

## Technical
- [ ] `npm run test` passes.
- [ ] `npm run lint` passes.
- [ ] Firestore indexes created for required queries.
- [ ] Cloudinary uploads verified for images/PDFs.

## Security
- [ ] Role access verified for owner/admin/accountant/hr.
- [ ] Suspended company lock verified.
- [ ] Audit log entries appear for sensitive actions.

## UX
- [ ] RTL layout checked across top pages.
- [ ] Print templates render in AR and EN.
- [ ] Error messages localized.
