# VPN Switch Troubleshooting Guide

Session: 2026-01-14

## Issues Fixed This Session

### 1. Transmission Container Missing After VPN Switch

**Symptoms:**
- Transmission container not running
- `docker ps` shows no transmission container

**Root Cause:**
Docker Compose network label mismatch. Newer docker compose versions require specific labels on networks. The `docker-services_default` network was created before these requirements existed.

**Error:**
```
network docker-services_default was found but has incorrect label com.docker.compose.network set to "" (expected: "default")
```

**Fix Applied:**
Added `networks:` section to `/home/camerontora/docker-services/docker-compose.yaml`:
```yaml
networks:
  default:
    name: docker-services_default
    external: true
```

### 2. Sonarr/Radarr Port Not Updating During VPN Switch

**Symptoms:**
- VPN switch completes but Sonarr/Radarr still point to old port
- Error in steps_completed: "Sonarr API error 400"

**Root Causes Found:**
1. Missing URL base paths (`/sonarr` and `/radarr`)
2. Timing issue - Sonarr/Radarr validate connection when updating download client, but Transmission was already stopped

**Fixes Applied:**
- Added `/sonarr` and `/radarr` to API URLs in `health-api/app.py`
- Moved Sonarr/Radarr updates to BEFORE stopping Transmission
- Added `Content-Type: application/json` header
- Improved error handling to show actual API error messages

### 3. "Failed to Fetch" Error in Browser During VPN Switch

**Symptoms:**
- Browser shows "failed to fetch" even though switch succeeded
- Switch takes ~2 minutes, browser times out

**Fixes Applied:**
- Increased nginx proxy timeout from 120s to 180s in `nginx/conf.d/25-health.conf`
- Added 180s AbortController timeout in frontend `status-dashboard/frontend/src/App.jsx`

## Diagnostic Commands

### Check Current State
```bash
# Container status
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(transmission|gluetun)"

# Nginx port
grep "proxy_pass.*909" /home/camerontora/infrastructure/nginx/conf.d/10-protected-services.conf | head -1

# Sonarr port
curl -s "http://localhost:8989/sonarr/api/v3/downloadclient/1" \
  -H "X-Api-Key: $(grep SONARR_API_KEY /home/camerontora/infrastructure/.env | cut -d= -f2)" \
  | jq '.fields[] | select(.name=="port") | .value'

# Radarr port
curl -s "http://localhost:7878/radarr/api/v3/downloadclient/1" \
  -H "X-Api-Key: $(grep RADARR_API_KEY /home/camerontora/infrastructure/.env | cut -d= -f2)" \
  | jq '.fields[] | select(.name=="port") | .value'
```

### Check health-api Environment
```bash
# Verify API keys are set (should NOT be empty)
docker exec health-api env | grep -E "(SONARR|RADARR)_API_KEY"

# If empty, recreate container:
cd /home/camerontora/infrastructure
docker-compose stop health-api && docker-compose rm -f health-api && docker-compose up -d health-api
```

### Manual VPN Switch Test
```bash
curl -s -X POST "http://localhost:5000/api/health/vpn/switch" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $(grep HEALTH_API_KEY /home/camerontora/infrastructure/.env | cut -d= -f2)" \
  -d '{"location": "vancouver", "reason": "manual-test"}' | jq .
```

### Rebuild health-api After Code Changes
```bash
cd /home/camerontora/infrastructure
docker-compose build health-api
docker-compose stop health-api && docker-compose rm -f health-api && docker-compose up -d health-api
```

## VPN Port Mapping

| Location   | Container         | Port |
|------------|-------------------|------|
| Toronto    | gluetun-toronto   | 9091 |
| Montreal   | gluetun-montreal  | 9092 |
| Vancouver  | gluetun-vancouver | 9093 |

## Key Files

| File | Purpose |
|------|---------|
| `/home/camerontora/infrastructure/health-api/app.py` | VPN switch logic |
| `/home/camerontora/infrastructure/nginx/conf.d/10-protected-services.conf` | Transmission nginx proxy |
| `/home/camerontora/infrastructure/nginx/conf.d/25-health.conf` | Health API nginx (timeouts) |
| `/home/camerontora/docker-services/docker-compose.yaml` | Transmission container config |
| `/home/camerontora/infrastructure/.env` | API keys for Sonarr/Radarr |

## VPN Switch Order of Operations

1. Update docker-compose.yaml (network_mode)
2. Update Sonarr port (while Transmission still running)
3. Update Radarr port (while Transmission still running)
4. Stop and remove Transmission container
5. Verify target VPN container is running
6. Start Transmission with docker compose
7. Update nginx config
8. Reload nginx
9. Update speedtest.json active status
