# SBA Backend - Infrastructure Requirements

**Date:** March 7, 2026
**From:** Infrastructure Team
**To:** SBA Development Team

---

## Overview

The infrastructure for `sba.camerontora.ca` is ready. This document outlines what the backend must implement before going live.

**Current Status:** Routing is active, SSL is configured, but the backend returns a connection error until the backend process is started.

---

## Required Endpoints

### Health Check (Required)

```
GET /api/health
```

**Response:**
```json
{
  "status": "ok"
}
```

This endpoint is used by:
- Infrastructure health monitoring (every 5 minutes)
- Status dashboard at `https://status.camerontora.ca`

**Requirements:**
- Must return HTTP 200
- Must respond within 5 seconds
- Do NOT include sensitive data

---

## Port Configuration

| Setting | Value |
|---------|-------|
| **Port** | `3003` |
| **Host** | `0.0.0.0` (bind to all interfaces) |

---

## Container Requirements (If Using Docker)

| Setting | Value |
|---------|-------|
| **Container Name** | `sba-api` |
| **Exposed Port** | `3003` |

This name is used by the health monitoring system to check container status.

---

## Security Requirements

Since this is a **public-facing API** (no OAuth2 proxy), the backend must handle all security:

### 1. Authentication
- [ ] Validate all incoming tokens/credentials server-side
- [ ] Reject requests with invalid/expired tokens

### 2. Authorization
- [ ] Users can only access their own data
- [ ] Verify ownership before any write operation

### 3. CORS Configuration
Allow only these origins:
```
https://sba.camerontora.ca
```
Plus your app's bundle identifier for mobile requests.

### 4. Input Validation
- [ ] Sanitize ALL user input
- [ ] Validate request body schemas
- [ ] Reject malformed requests with 400 status

### 5. Rate Limiting (App-Level)
Nginx provides IP-based rate limiting. Implement per-user limits as well for sensitive endpoints.

---

## Nginx Rate Limits (Already Configured)

| Endpoint Pattern | Limit | Burst |
|------------------|-------|-------|
| `/api/auth/*` | 5 req/minute per IP | 3 |
| `/api/*` | 10 req/second per IP | 20 |

Users exceeding these limits receive HTTP 429.

---

## Request Limits

| Setting | Value |
|---------|-------|
| Max body size | 10 MB |

---

## Deployment Checklist

Before going live:

- [ ] `/api/health` endpoint returns `{"status": "ok"}`
- [ ] Container named `sba-api` (if using Docker)
- [ ] Running on port `3003`, bound to `0.0.0.0`
- [ ] CORS configured for allowed origins only
- [ ] All user input validated
- [ ] Database (if any) not exposed to host network

---

## Testing Your Setup

Once deployed, verify with:

```bash
# Health check
curl https://sba.camerontora.ca/api/health
# Expected: {"status": "ok"}

# Rate limit test (should get 429 after burst)
for i in {1..10}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://sba.camerontora.ca/api/auth/login
done
```

---

## Monitoring

Once the health endpoint is working:
- Health checks run every 5 minutes
- Downtime alerts sent to Discord
- Status visible at `https://status.camerontora.ca`

---

## Nginx Logs

```bash
docker logs nginx-proxy 2>&1 | grep sba
```

---

## Quick Reference

| Item | Value |
|------|-------|
| Domain | `sba.camerontora.ca` |
| Port | `3003` |
| Container Name | `sba-api` |
| Health Endpoint | `GET /api/health` |
| SSL | Automatic (Let's Encrypt wildcard) |
| Rate Limiting | Nginx (IP-based) |
| Nginx Config | `nginx/conf.d/04-sba.conf` |
