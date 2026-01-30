# Failover Runbook

## When to trigger
- Database unavailable for > 15 minutes.
- Authentication outage > 10 minutes.
- Storage corruption or region outage.

## Steps
1) Declare incident and assign incident commander.
2) Freeze writes at application layer (maintenance mode).
3) Promote secondary backup environment.
4) Validate auth and critical ledger routes.
5) Resume read-only access, then full access.
6) Communicate status to stakeholders.

## Verification checklist
- Login + MFA.
- Create GL entry in staging failover.
- Run payroll calculation in sandbox.
- VAT summary report renders without errors.
