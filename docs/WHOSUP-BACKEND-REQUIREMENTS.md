# Who's Up Backend - Infrastructure Requirements

**Date:** January 31, 2026
**From:** Infrastructure Team
**To:** Who's Up Development Team

---

## Overview

The infrastructure for `whosup.camerontora.ca` is ready. This document outlines what the backend must implement before going live.

**Current Status:** Routing is active, SSL is configured, but the backend returns 404 for all endpoints.

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
- Uptime Kuma status page
- GCP external monitor

**Requirements:**
- Must return HTTP 200
- Must respond within 5 seconds
- Do NOT include sensitive data (user counts, database stats, etc.)

---

## Port Configuration

| Setting | Value |
|---------|-------|
| **Port** | `3001` |
| **Host** | `0.0.0.0` (bind to all interfaces) |

The firewall is already configured for port 3001.

---

## Container Requirements (If Using Docker)

| Setting | Value |
|---------|-------|
| **Container Name** | `whosup-api` |
| **Exposed Port** | `3001` |

This name is used by the health monitoring system to check container status.

---

## Security Requirements

Since this is a **public-facing API** (no OAuth2 proxy), the backend must handle all security:

### 1. Authentication
- [ ] Properly validate Apple Sign In tokens
- [ ] Properly validate Google Sign In tokens
- [ ] Reject requests with invalid/expired tokens

### 2. Authorization
- [ ] Users can only access their own data
- [ ] Users can only modify their own resources
- [ ] Verify ownership before any write operation

### 3. CORS Configuration
Allow only these origins:
```
https://whosup.camerontora.ca
```
Plus your iOS app bundle identifier for mobile requests.

### 4. Socket.io Authentication
- [ ] Authenticate connections on the `connection` event
- [ ] Reject unauthenticated socket connections
- [ ] Validate JWT/token before allowing real-time events

### 5. Input Validation
- [ ] Sanitize ALL user input
- [ ] Validate request body schemas (use Zod or similar)
- [ ] Reject malformed requests with 400 status

### 6. Rate Limiting (App-Level)
Nginx provides IP-based rate limiting, but you should also implement:
- [ ] Per-user rate limits
- [ ] Per-endpoint rate limits
- [ ] Stricter limits on sensitive endpoints (auth, presence updates)

---

## Nginx Rate Limits (Already Configured)

| Endpoint Pattern | Limit | Burst |
|------------------|-------|-------|
| `/api/auth/*` | 5 req/minute per IP | 3 |
| `/api/*` | 10 req/second per IP | 20 |
| `/socket.io/*` | 10 req/second per IP | 20 |

Users exceeding these limits receive HTTP 429.

---

## Request Limits

| Setting | Value |
|---------|-------|
| Max body size | 10 MB |
| WebSocket timeout | 24 hours |

---

## Database Requirements

- **PostgreSQL 15+** with **PostGIS** extension
- Database should NOT be exposed to host network
- Only accessible from the backend container

---

## Environment Variables

Recommended `.env` structure:

```bash
# Server
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@whosup-db:5432/whosup

# Authentication
JWT_SECRET=<secure-random-string>
APPLE_CLIENT_ID=<your-apple-client-id>
APPLE_TEAM_ID=<your-apple-team-id>
APPLE_KEY_ID=<your-apple-key-id>
APPLE_PRIVATE_KEY=<your-apple-private-key>
GOOGLE_CLIENT_ID=<your-google-client-id>

# App Config
PRESENCE_DEFAULT_DURATION_HOURS=4
PRESENCE_MAX_DURATION_HOURS=12
```

---

## Deployment Checklist

Before going live:

- [ ] `/api/health` endpoint returns `{"status": "ok"}`
- [ ] Container named `whosup-api` (if using Docker)
- [ ] Running on port 3001
- [ ] CORS configured for allowed origins only
- [ ] Apple Sign In tokens validated correctly
- [ ] Google Sign In tokens validated correctly
- [ ] Socket.io connections authenticated
- [ ] All user input validated
- [ ] Database not exposed to host

---

## Testing Your Setup

Once deployed, verify with:

```bash
# Health check
curl https://whosup.camerontora.ca/api/health
# Expected: {"status": "ok"}

# WebSocket handshake
curl "https://whosup.camerontora.ca/socket.io/?EIO=4&transport=polling"
# Expected: Socket.io handshake response

# Rate limit test (should get 429 after burst)
for i in {1..10}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://whosup.camerontora.ca/api/auth/apple
done
```

---

## Monitoring

Once the health endpoint is working:
- Health checks run every 5 minutes
- Downtime alerts sent to Discord
- Status visible at `https://status.camerontora.ca`

---

## Contact

Infrastructure issues: Check nginx logs
```bash
docker logs nginx-proxy 2>&1 | grep whosup
```

Questions: Contact infrastructure team

---

## Quick Reference

| Item | Value |
|------|-------|
| Domain | `whosup.camerontora.ca` |
| Port | `3001` |
| Container Name | `whosup-api` |
| Health Endpoint | `GET /api/health` |
| SSL | Automatic (Let's Encrypt) |
| Rate Limiting | Nginx (IP-based) |
