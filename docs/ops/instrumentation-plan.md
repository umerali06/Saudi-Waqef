# Instrumentation Plan

## Core events
- onboarding.started
- onboarding.completed
- invoice.created
- payroll.run.created
- support.ticket.created
- api.key.created

## Funnels
- Onboarding start → completion
- Invoice creation within first 7 days

## Data privacy
- Avoid storing PII in telemetry metadata.
- Retain telemetry for 90 days unless compliance requires longer.
