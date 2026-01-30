# Deployment Guide

## Environments
- **Development**: local machine with `.env.local`.
- **Staging**: mirrors production settings, uses staging Firebase project.
- **Production**: live data and billing.

## Build & Deploy (example)
1. Install dependencies: `npm ci`
2. Run tests: `npm run test`
3. Lint: `npm run lint`
4. Build: `npm run build`
5. Deploy using your hosting provider (Vercel, Cloud Run, or similar).

## Rollback Strategy
- Keep the last two production builds.
- If an issue is detected, roll back to the previous build within 5 minutes.
- Restore Firestore from the most recent backup if data corruption is detected.

## Secrets Management
- Use environment variables in your hosting provider.
- Do not commit production secrets.
- Rotate secrets every 90 days.
