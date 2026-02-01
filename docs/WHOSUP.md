# Who's Up - Infrastructure Integration

This document describes the infrastructure setup for the Who's Up social discovery app.

## Overview

Who's Up is a **public-facing commercial API** hosted at `whosup.camerontora.ca`. Unlike internal services (Haymaker, Radarr, etc.), it is NOT behind OAuth2 proxy - the app handles its own authentication via Apple/Google Sign In.

## Architecture

```
whosup.camerontora.ca (PUBLIC)
├── /api/*       → Express.js backend (port 3001)
├── /socket.io/* → Socket.io WebSocket (port 3001)
└── /*           → Future Next.js web app (port 3002)
```

## Infrastructure Components

| Component | Status | Notes |
|-----------|--------|-------|
| DNS | ✅ Active | `whosup.camerontora.ca` A record |
| SSL | ✅ Active | Shared Let's Encrypt certificate |
| Nginx | ✅ Active | `nginx/conf.d/03-whosup.conf` |
| Health Check | ✅ Active | Added to `health-api/app.py` SERVICE_CHECKS |
| Status Dashboard | ✅ Active | Added to `status.camerontora.ca` |

## Nginx Configuration

The nginx config (`03-whosup.conf`) provides:

### Rate Limiting
- **Auth endpoints** (`/api/auth/*`): 5 requests/minute per IP (strict)
- **General API** (`/api/*`): 10 requests/second per IP with burst of 20
- **WebSocket** (`/socket.io/*`): 10 requests/second per IP with burst of 20

### Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Request Limits
- Max body size: 10MB (adjustable)

## Requirements for Who's Up Team

### Backend Requirements

1. **Port**: Run on port `3001`
2. **Health endpoint**: `GET /api/health` returning `{"status": "ok"}`
3. **Container name**: `whosup-api` (for Docker health checks)

### Security Requirements (Team Responsibility)

Since this is a public API without OAuth2 proxy protection, the backend MUST handle:

| Requirement | Description |
|-------------|-------------|
| **CORS** | Only allow legitimate origins (`https://whosup.camerontora.ca`, iOS app) |
| **Authentication** | Properly validate Apple/Google Sign In tokens |
| **Authorization** | Verify users can only access their own resources |
| **Socket.io Auth** | Authenticate connections on `connection` event |
| **Input Validation** | Sanitize ALL user input |
| **Rate Limiting** | App-level limits per user/endpoint (nginx only limits by IP) |
| **Health Endpoint** | Don't expose sensitive info (user counts, etc.) |

### Database

- PostgreSQL 15+ with PostGIS extension
- Database should NOT be exposed to host - only accessible from backend container

## Deployment Options

### Docker (Recommended)
```bash
# Build and run
docker build -t whosup-api ./backend
docker run -d --name whosup-api -p 3001:3001 whosup-api
```

### PM2
```bash
cd /home/camerontora/whosup/backend
pnpm build
pm2 start dist/index.js --name whosup-api
```

### Manual (Development)
```bash
cd /home/camerontora/whosup/backend
PORT=3001 pnpm start
```

## Monitoring

### Health Check
The health API monitors Who's Up via:
- Container status check (`whosup-api` container)
- HTTP check to `localhost:3001/api/health`

View status:
```bash
curl -H "X-API-Key: $HEALTH_API_KEY" https://health.camerontora.ca/api/health/services | \
  jq '.services[] | select(.name == "Who'\''s Up API")'
```

### Status Dashboard
Who's Up is monitored on the GCP status dashboard at `status.camerontora.ca`:
- External HTTP check to `https://whosup.camerontora.ca/api/health`
- Shows up/down status alongside other services
- Alerts via Discord when service goes down

## Troubleshooting

### 502 Bad Gateway
Backend not running on port 3001:
```bash
# Check if backend is running
curl http://localhost:3001/api/health

# Check container status
docker ps | grep whosup
```

### 503 Service Unavailable
Root path returns 503 intentionally until web app is deployed.

### Rate Limited (429)
- Auth endpoints: Wait 1 minute
- General API: Wait a few seconds

### WebSocket Connection Failed
Check nginx logs:
```bash
docker logs nginx-proxy 2>&1 | grep whosup
```

## Files Reference

| File | Description |
|------|-------------|
| `nginx/conf.d/03-whosup.conf` | Nginx routing and rate limiting |
| `health-api/app.py` | SERVICE_CHECKS entry for monitoring |
| `docs/WHOSUP.md` | This documentation |

## Contact

For infrastructure issues, check:
- Nginx logs: `docker logs nginx-proxy`
- Health API: `https://health.camerontora.ca/api/health/services`
- Status page: `https://status.camerontora.ca`
