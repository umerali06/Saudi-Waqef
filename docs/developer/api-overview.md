# API Overview

## Authentication
Use the API key in the `Authorization` header:

```
Authorization: Bearer <API_KEY>
```

## Rate limits
- Default: 300 requests per minute per key.
- Burst limit: 50 requests.

## Base URL
Use the same domain as your tenant application.

## Environments
- Production: primary domain.
- Sandbox: staging environment with sample data.
