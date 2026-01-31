# Who's Up - Infrastructure Project Plan

**Project:** Who's Up Social Discovery App
**Domain:** whosup.camerontora.ca
**Status:** Infrastructure Ready, Awaiting Backend Completion
**Last Updated:** January 31, 2026

---

## Executive Summary

Who's Up is a commercial iOS social discovery app that allows users to broadcast their availability for activities and connect with nearby people. This document outlines the infrastructure integration plan for hosting the backend API on camerontora.ca infrastructure.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Completed Work](#3-completed-work)
4. [Pending Work](#4-pending-work)
5. [Security Considerations](#5-security-considerations)
6. [Backend Team Requirements](#6-backend-team-requirements)
7. [Deployment Guide](#7-deployment-guide)
8. [Monitoring & Alerting](#8-monitoring--alerting)
9. [Follow-Up Tasks](#9-follow-up-tasks)
10. [Appendix](#10-appendix)

---

## 1. Project Overview

### 1.1 Application Description

Who's Up is a map-first social application that helps people discover and connect with others who are currently available for activities. Key features include:

- Users broadcast availability with specific activities (golf, surfing, yoga, etc.)
- Real-time discovery of nearby active users
- Direct messaging between connected users
- Group activity rooms for coordination
- Privacy-first design with location fuzzing

### 1.2 Target Markets

- Muskoka, Ontario, Canada (cottage country)
- Santa Teresa, Costa Rica (beach/wellness)

### 1.3 Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Express.js + TypeScript |
| Database | PostgreSQL 15+ with PostGIS |
| Real-time | Socket.io |
| Authentication | Apple Sign In, Google Sign In |
| ORM | Prisma |
| iOS App | Swift/SwiftUI |

---

## 2. Architecture

### 2.1 Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    NGINX REVERSE PROXY                       │
│                    (ports 80/443, SSL)                       │
│                                                              │
│  whosup.camerontora.ca ──────────────────────────────────┐  │
│    │                                                      │  │
│    ├── /api/auth/*  ─► Rate limit: 5 req/min per IP      │  │
│    ├── /api/*       ─► Rate limit: 10 req/sec per IP     │  │
│    ├── /socket.io/* ─► WebSocket upgrade enabled         │  │
│    └── /*           ─► 503 (future web app)              │  │
│                                                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼ host.docker.internal:3001
┌─────────────────────────────────────────────────────────────┐
│                    WHO'S UP BACKEND                          │
│                    (Express.js, port 3001)                   │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ REST API    │  │ Socket.io   │  │ Background Jobs     │  │
│  │ /api/*      │  │ Real-time   │  │ Presence expiry     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                          │                                   │
└──────────────────────────┼──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    POSTGRESQL + POSTGIS                      │
│                    (whosup-db container)                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 URL Structure

| URL Pattern | Destination | Auth |
|-------------|-------------|------|
| `whosup.camerontora.ca/api/*` | Backend API | App-managed |
| `whosup.camerontora.ca/socket.io/*` | WebSocket | App-managed |
| `whosup.camerontora.ca/*` | Future web app | App-managed |

### 2.3 Key Difference from Other Services

Unlike internal services (Haymaker, Radarr, etc.) which are protected by OAuth2 Proxy with Google SSO, Who's Up is a **public-facing commercial API**. The backend must handle all authentication and security internally.

| Service | Auth Method |
|---------|-------------|
| Haymaker | OAuth2 Proxy (Google SSO) |
| Radarr/Sonarr | OAuth2 Proxy (Admin only) |
| **Who's Up** | **App-managed (Apple/Google Sign In)** |

---

## 3. Completed Work

### 3.1 DNS Configuration ✅

- A record created for `whosup.camerontora.ca`
- Points to home server public IP
- Included in GoDaddy DDNS update script

### 3.2 SSL Certificate ✅

- Let's Encrypt certificate expanded to include `whosup.camerontora.ca`
- Certificate path: `/etc/letsencrypt/live/camerontora-services/`
- Auto-renewal configured via certbot timer

### 3.3 Nginx Configuration ✅

**File:** `nginx/conf.d/03-whosup.conf`

Features implemented:
- HTTP to HTTPS redirect
- SSL termination with HTTP/2
- Rate limiting zones (auth: 5/min, general: 10/sec)
- WebSocket upgrade support for Socket.io
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- Request body size limit (10MB)

### 3.4 Health Monitoring ✅

**File:** `health-api/app.py`

- Added Who's Up API to SERVICE_CHECKS
- Monitors container status and port availability
- Currently shows as "down" (expected until backend implements health endpoint)

### 3.5 Documentation ✅

| Document | Purpose |
|----------|---------|
| `docs/WHOSUP.md` | Infrastructure overview |
| `docs/WHOSUP-BACKEND-REQUIREMENTS.md` | Requirements for backend team |
| `docs/WHOSUP-PROJECT-PLAN.md` | This document |

---

## 4. Pending Work

### 4.1 Backend Team Tasks

| Task | Priority | Status |
|------|----------|--------|
| Implement `/api/health` endpoint | High | Pending |
| Review security requirements | High | Pending |
| Configure CORS properly | High | Pending |
| Implement Socket.io authentication | High | Pending |
| Container deployment (Docker) | Medium | Pending |

### 4.2 Infrastructure Tasks

| Task | Priority | Status |
|------|----------|--------|
| Add Uptime Kuma monitor | Medium | Blocked (needs health endpoint) |
| Update main README.md | Low | Pending |
| Add to GCP external monitor | Low | Pending |

### 4.3 iOS Tasks

| Task | Priority | Status |
|------|----------|--------|
| Update API base URL to production | Medium | Pending |
| Review App Store security requirements | Medium | Pending |
| Implement certificate pinning (optional) | Low | Pending |

---

## 5. Security Considerations

### 5.1 Public API Exposure

Since Who's Up does not use OAuth2 Proxy, the backend is directly exposed to the internet. This requires careful attention to security.

### 5.2 Nginx-Level Protections (Implemented)

| Protection | Configuration |
|------------|---------------|
| Rate Limiting (Auth) | 5 requests/minute per IP |
| Rate Limiting (API) | 10 requests/second per IP |
| Request Size Limit | 10 MB max body |
| Security Headers | X-Content-Type-Options, X-Frame-Options, etc. |
| HTTPS Enforcement | HTTP redirects to HTTPS |

### 5.3 Backend-Level Protections (Required)

| Protection | Responsibility |
|------------|----------------|
| Authentication | Validate Apple/Google tokens |
| Authorization | Verify resource ownership |
| Input Validation | Sanitize all user input |
| CORS | Restrict to allowed origins |
| Socket.io Auth | Authenticate on connection |
| Per-User Rate Limits | Prevent abuse by authenticated users |

### 5.4 Database Security

- PostgreSQL should only be accessible from backend container
- Do not expose database port to host network
- Use strong passwords stored in environment variables

---

## 6. Backend Team Requirements

### 6.1 Minimum Requirements

```
Port:           3001
Container Name: whosup-api (if using Docker)
Health Check:   GET /api/health → {"status": "ok"}
```

### 6.2 Health Endpoint Specification

```http
GET /api/health HTTP/1.1
Host: whosup.camerontora.ca

HTTP/1.1 200 OK
Content-Type: application/json

{"status": "ok"}
```

Requirements:
- Must return HTTP 200
- Must respond within 5 seconds
- Do not include sensitive information

### 6.3 Security Checklist

- [ ] Apple Sign In token validation
- [ ] Google Sign In token validation
- [ ] CORS configured (only allow `https://whosup.camerontora.ca`)
- [ ] Socket.io connections authenticated
- [ ] Input validation on all endpoints
- [ ] Authorization checks on all protected resources
- [ ] Per-user rate limiting implemented

### 6.4 Full Requirements Document

See: `docs/WHOSUP-BACKEND-REQUIREMENTS.md`

---

## 7. Deployment Guide

### 7.1 Docker Deployment (Recommended)

```bash
# Build image
docker build -t whosup-api ./backend

# Run container
docker run -d \
  --name whosup-api \
  --restart unless-stopped \
  -p 3001:3001 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  whosup-api
```

### 7.2 PM2 Deployment

```bash
cd /home/camerontora/whosup/backend
pnpm build
pm2 start dist/index.js --name whosup-api
pm2 save
```

### 7.3 Verification

```bash
# Test health endpoint
curl https://whosup.camerontora.ca/api/health

# Test WebSocket
curl "https://whosup.camerontora.ca/socket.io/?EIO=4&transport=polling"

# Check SSL
echo | openssl s_client -connect whosup.camerontora.ca:443 2>/dev/null | \
  openssl x509 -noout -dates
```

---

## 8. Monitoring & Alerting

### 8.1 Current Monitoring

| System | Status | Notes |
|--------|--------|-------|
| Health API | ✅ Active | Shows "down" until health endpoint works |
| Uptime Kuma | ⏳ Pending | Add once health endpoint is available |
| GCP External Monitor | ⏳ Pending | Optional, for internet-down alerts |

### 8.2 Adding Uptime Kuma Monitor

Once the health endpoint is working:

1. Go to `https://status.camerontora.ca`
2. Add new monitor:
   - Type: HTTP(s)
   - URL: `https://whosup.camerontora.ca/api/health`
   - Interval: 60 seconds
   - Retries: 3
3. Configure Discord alert

### 8.3 Health Check Command

```bash
curl -H "X-API-Key: $HEALTH_API_KEY" \
  https://health.camerontora.ca/api/health/services | \
  jq '.services[] | select(.name == "Who'\''s Up API")'
```

---

## 9. Follow-Up Tasks

### 9.1 Immediate (Before Launch)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | Add `GET /api/health` endpoint | Backend Team | Pending |
| 2 | Review `WHOSUP-BACKEND-REQUIREMENTS.md` | Backend Team | Pending |
| 3 | Implement security checklist items | Backend Team | Pending |
| 4 | Update iOS app API base URL | iOS Team | Pending |

### 9.2 Post-Launch

| # | Task | Owner | Status |
|---|------|-------|--------|
| 5 | Add Uptime Kuma monitor | Infrastructure | Blocked |
| 6 | Update infrastructure README.md | Infrastructure | Pending |
| 7 | Add to GCP external monitor | Infrastructure | Optional |
| 8 | Review iOS App Store requirements | iOS Team | Pending |

### 9.3 Future Considerations

| Task | Priority |
|------|----------|
| Web app deployment (Next.js) | Future |
| CDN for static assets | Future |
| Horizontal scaling | Future |
| Database backups | High (when live) |

---

## 10. Appendix

### 10.1 File Locations

| File | Description |
|------|-------------|
| `/home/camerontora/infrastructure/nginx/conf.d/03-whosup.conf` | Nginx configuration |
| `/home/camerontora/infrastructure/health-api/app.py` | Health API (SERVICE_CHECKS) |
| `/home/camerontora/infrastructure/docs/WHOSUP.md` | Infrastructure docs |
| `/home/camerontora/infrastructure/docs/WHOSUP-BACKEND-REQUIREMENTS.md` | Backend requirements |
| `/home/camerontora/infrastructure/docs/WHOSUP-PROJECT-PLAN.md` | This document |
| `/home/camerontora/whosup/` | Application repository |

### 10.2 Useful Commands

```bash
# Reload nginx after config changes
docker exec nginx-proxy nginx -t && docker exec nginx-proxy nginx -s reload

# Check nginx logs for whosup
docker logs nginx-proxy 2>&1 | grep whosup

# Test rate limiting
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code} " https://whosup.camerontora.ca/api/health
done

# Check SSL certificate expiry
echo | openssl s_client -connect whosup.camerontora.ca:443 2>/dev/null | \
  openssl x509 -noout -enddate

# Expand SSL cert (add new domain)
sudo certbot certonly --webroot -w /var/www/acme \
  --cert-name camerontora-services -d example.camerontora.ca
```

### 10.3 Contact

| Issue | Contact |
|-------|---------|
| Infrastructure | Check nginx logs, health API |
| Backend | Who's Up development team |
| iOS | Who's Up iOS team |

---

*Document generated by Infrastructure Team*
*Last commit: ae6c48f*
