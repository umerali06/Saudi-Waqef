# Security Hardening Checklist

## Application
- Enforce strong password policy on all account creation and resets.
- Optional MFA enabled for admin and owner roles.
- Brute-force protection with lockout thresholds and audit logging.
- Security headers enabled (HSTS, X-Frame-Options, X-Content-Type-Options).

## Data Protection
- Encrypt PII at rest using `APP_ENCRYPTION_KEY`.
- Mask PII for non-privileged roles in HR views.
- Restrict access to tenant data using membership checks.

## Logging and Monitoring
- Record login success/failure, lockouts, and MFA events in audit logs.
- Retain security logs for the duration defined in `docs/ops/data-retention.md`.
- Review audit logs weekly during the first 90 days after launch.

## Secrets and Rotation
- Store secrets in environment variables or a managed secrets vault.
- Rotate `NEXTAUTH_SECRET` and `APP_ENCRYPTION_KEY` on a scheduled cadence.
- Re-issue MFA secrets after any key rotation or breach event.

## Operational Controls
- Limit admin access to approved IPs in deployment infrastructure where possible.
- Enforce TLS for all traffic at the edge/load balancer.
- Run dependency scanning and patch high/critical vulnerabilities within 72 hours.
