# Secure Development Lifecycle

## Dependency Scanning
- Run `npm audit` or equivalent weekly.
- Enable Dependabot or Renovate for automated PRs.
- Block deploys when critical CVEs are open.

## Code Review Checklist (Security)
- Validate authorization checks on every API route.
- Confirm tenant scoping for all data queries.
- Ensure PII fields are encrypted and masked where required.
- Avoid logging secrets or sensitive personal data.
- Verify input validation with Zod schemas.

## Patch Management
- Apply security patches within 72 hours for critical issues.
- Schedule monthly dependency upgrades for medium/low issues.
- Rotate secrets after any incident or access changes.
