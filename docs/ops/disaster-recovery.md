# Disaster Recovery & Business Continuity

## Objectives
- **RPO target:** 60 minutes (default).
- **RTO target:** 240 minutes (default).
- **Priority tiers:** Critical → High → Medium → Low.

## Recovery priorities
- Critical: ledger, payroll, auth
- High: billing, VAT, collections
- Medium: reporting, analytics
- Low: notifications, marketing

## Backup strategy
- Automated Firestore export every 6 hours.
- Retention: 30 days.
- Secondary storage region configured per policy.

## Quarterly restore tests
1) Select the latest export.
2) Restore into staging project.
3) Validate core flows (login, GL, payroll, VAT).
4) Document actual RPO/RTO achieved.

## Business continuity
- If core systems are down, accounting entries are queued offline.
- Critical reports exported and cached for 24 hours.
- Manual approval workflows documented and shared with finance/HR.

## Ownership & review
- DR plan reviewed quarterly.
- Changes require system admin approval.
