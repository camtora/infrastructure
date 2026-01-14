# VPN Switch Troubleshooting Guide

Session: 2026-01-14 (updated)

## Issues Fixed 2026-01-14 Afternoon

### 4. Transmission Orphaned When VPN Container Restarts

**Symptoms:**
- Transmission container shows "Up" but has no network connectivity
- `docker exec transmission wget -qO- https://ipinfo.io/ip` fails with "bad address"
- `docker exec gluetun-X nc -z localhost 9091` says port not open
- Status dashboard shows Transmission as down

**Root Cause:**
When a gluetun container restarts, it gets a new network namespace. Transmission keeps running but its `network_mode: container:X` reference becomes stale. Docker doesn't automatically reconnect dependent containers.

**How to Diagnose:**
```bash
# Check if transmission can reach the internet
docker exec transmission wget -qO- --timeout=5 https://ipinfo.io/ip

# Check if port 9091 is visible inside gluetun (should be if sharing namespace)
docker exec gluetun-montreal nc -z localhost 9091

# Compare network namespaces (should match if sharing)
docker inspect transmission --format '{{.HostConfig.NetworkMode}}'
docker inspect gluetun-montreal --format '{{.Id}}'
```

**Fix Applied:**
Updated `/home/camerontora/docker-services/scripts/watch-gluetun.sh`:
- Use `--force-recreate` flag to actually recreate transmission
- Only trigger when the ACTIVE VPN restarts (not inactive ones)

**Manual Fix:**
```bash
cd /home/camerontora/docker-services
docker stop transmission && docker rm transmission && docker-compose up -d transmission
```

### 5. API Keys Missing in Cron Jobs / Scripts

**Symptoms:**
- speedtest.sh logs show: `✗ AUTO-SYNC: Failed to re-sync - Unauthorized`
- Any script calling health-api fails with auth errors

**Root Cause:**
`.env` files are only auto-loaded by docker-compose. Cron jobs and systemd services run in a bare environment with no access to these variables.

**Fix Applied:**
1. Added to `scripts/speedtest.sh`:
```bash
ENV_FILE="/home/camerontora/infrastructure/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
fi
```

2. Added explicit `env_file: .env` to health-api in docker-compose.yaml

**Remember:** Any new script that needs API keys must source the .env file!

### 6. Speedtest Port Detection Finding Wrong Service

**Symptoms:**
- Speedtest logs show: `⚠ PORT MISMATCH: nginx=7878, expected=9093`
- But nginx config actually has correct port

**Root Cause:**
The grep pattern `proxy_pass http://host.docker.internal:\K[0-9]+` matched the FIRST port in the file (Radarr's 7878), not Transmission's port.

**Fix Applied:**
Changed grep in speedtest.sh to look for transmission-specific ports:
```bash
NGINX_PORT=$(grep -oP 'proxy_pass http://host\.docker\.internal:\K909[0-9]' "$NGINX_CONF" | head -1)
```

### 7. docker-compose.yaml Networks Syntax Error

**Symptoms:**
- `docker-compose up` fails with: `networks.default value Additional properties are not allowed ('name' was unexpected)`

**Root Cause:**
docker-compose v1 (1.25.4) uses different syntax for external networks than v2.

**Fix Applied:**
Changed from:
```yaml
networks:
  default:
    name: docker-services_default
    external: true
```
To:
```yaml
networks:
  default:
    external:
      name: docker-services_default
```

### 8. Gluetun Memory Leak When VPN Unhealthy

**Symptoms:**
- Unhealthy gluetun containers using excessive memory (Vancouver: 2.4GB, Toronto: 1GB)
- Containers may crash/restart unexpectedly

**Root Cause:**
When VPN connection is flaky, DNS-over-TLS requests fail repeatedly. Each failed connection accumulates state that isn't cleaned up - memory leak in error handling paths.

Logs show:
```
WARN [dns] getting tls connection... read: connection reset by peer
```

**Fix Applied:**
- Added `mem_limit: 1g` to all gluetun containers
- Changed docker-compose version from "3" to "2.4" (mem_limit not supported in v3)
- Containers auto-restart when hitting limit, resetting the leak

**Check memory usage:**
```bash
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | grep gluetun
```

### 9. watch-gluetun.sh Restart Loop

**Symptoms:**
- gluetun and transmission keep recreating in infinite loop
- Logs show repeated "recreating transmission" messages every few seconds

**Root Cause:**
`docker-compose up -d --force-recreate transmission` also recreates gluetun (dependency), which triggers another watch event.

**Fix Applied:**
Changed from:
```bash
docker-compose up -d --force-recreate transmission
```
To:
```bash
docker stop transmission 2>/dev/null || true
docker rm transmission 2>/dev/null || true
docker-compose up -d transmission
```

## Issues Fixed This Session (Earlier)

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
