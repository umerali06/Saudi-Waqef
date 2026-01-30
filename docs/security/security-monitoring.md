# Security Monitoring and Alerting

## Alerts
- Multiple failed logins from a single account within 15 minutes.
- MFA failures exceeding threshold within 10 minutes.
- Admin role changes or permission escalation.
- Suspicious access to HR/PII endpoints outside business hours.

## Recommended Tools
- Cloud provider logging and alerting.
- Firebase audit log exports to SIEM.
- GitHub Dependabot alerts for dependencies.

## Review Cadence
- Daily review of authentication failures.
- Weekly review of audit log anomalies.
- Monthly security posture review.
