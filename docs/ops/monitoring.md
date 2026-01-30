# Monitoring & Alerting

## Logs
- Use structured logs (JSON) for API routes.
- Forward logs to a centralized sink (e.g., Cloud Logging).

## Health Checks
- Public health check: `/api/health` (protect with `HEALTHCHECK_TOKEN`).
- Admin health dashboard: `/admin/health`.

## Alerts
- Critical API error rate > 2% for 5 minutes.
- Firestore latency > 1s sustained for 5 minutes.
- Background job failures > 0 in last hour.

## Performance
- Track Web Vitals and API response times.
- Monitor dashboard KPI cache hit ratio.
