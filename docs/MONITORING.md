# External Monitoring System

This document describes the external monitoring infrastructure that monitors camerontora.ca services from Google Cloud Platform.

## Why External Monitoring?

Local monitoring tools (Uptime Kuma, Netdata) run on the home server. When the home internet goes down, these tools cannot send alerts because they have no connectivity.

The external monitoring system runs on GCP Cloud Run and checks the home server from outside. When it cannot reach the home server, it knows the internet is down and alerts via Discord.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  GOOGLE CLOUD PLATFORM (cameron-tora)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Cloud Scheduler: "home-health-check"                           │
│  Schedule: */5 * * * * (every 5 minutes)                        │
│       │                                                          │
│       ▼ POST /check                                             │
│                                                                  │
│  Cloud Run: "home-monitor"                                      │
│  Region: us-central1                                            │
│  URL: https://home-monitor-848530510810.us-central1.run.app     │
│       │                                                          │
│       ├──► HTTPS GET https://camerontora.ca                     │
│       ├──► HTTPS GET https://status.camerontora.ca              │
│       ├──► HTTPS GET https://health.camerontora.ca/api/health   │
│       └──► HTTPS GET https://plex.camerontora.ca/library/sections│
│                                                                  │
│       ▼ On failure or threshold breach                          │
│                                                                  │
│  Discord Webhook ──────────────────────────────────────────────►│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (port 443)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     HOME SERVER (192.168.2.34)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  nginx-proxy (ports 80/443)                                     │
│       │                                                          │
│       ├──► health.camerontora.ca ──► health-api:5000            │
│       ├──► camerontora.ca ──► camerontora_web:3002              │
│       ├──► status.camerontora.ca ──► uptime-kuma:3001           │
│       └──► plex.camerontora.ca ──► plex:32400                   │
│                                                                  │
│  health-api container (port 5000)                               │
│       └──► Reads: /proc, disk mounts, Plex API, speedtest.json  │
│                                                                  │
│  Cron: /etc/cron.d/speedtest (every 30 minutes)                 │
│       └──► Writes: /var/lib/health-api/speedtest.json           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Health API (Home Server)

**Container**: `health-api`
**Port**: 5000
**URL**: https://health.camerontora.ca
**Source**: `/home/camerontora/infrastructure/health-api/`

#### Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/health/ping` | None | Simple liveness check, returns `{"status": "ok"}` |
| `GET /api/health` | X-API-Key header | Full system metrics (CPU, RAM, disk, Plex, speed test) |
| `GET /` | None | Service info and available endpoints |

#### Authentication

The `/api/health` endpoint requires the `X-API-Key` header:
```bash
curl -H "X-API-Key: YOUR_KEY" https://health.camerontora.ca/api/health
```

The API key is stored in `/home/camerontora/infrastructure/.env` as `HEALTH_API_KEY`.

#### Response Format

```json
{
  "timestamp": "2026-01-11T22:00:00.000000+00:00",
  "cpu_percent": 45.2,
  "load": {
    "load_1m": 1.5,
    "load_5m": 1.2,
    "load_15m": 1.0,
    "cpu_count": 6,
    "load_percent_1m": 25.0
  },
  "memory": {
    "percent": 50.4,
    "used_gb": 15.7,
    "total_gb": 31.2,
    "available_gb": 15.5
  },
  "disk": {
    "/": {"percent": 22.1, "used_gb": 12.5, "total_gb": 59.8, "free_gb": 44.2},
    "/home": {"percent": 77.2, "used_gb": 52.6, "total_gb": 71.8, "free_gb": 15.5},
    "/var": {"percent": 64.1, "used_gb": 36.4, "total_gb": 59.8, "free_gb": 20.3},
    "/CAMRAID": {"percent": 59.8, "used_gb": 9477.7, "total_gb": 16699.0, "free_gb": 6383.0},
    "/HOMENAS": {"percent": 90.7, "used_gb": 90171.8, "total_gb": 103897.8, "free_gb": 9255.5}
  },
  "plex": {
    "reachable": true,
    "library_count": 22,
    "libraries": ["Movies", "TV Shows", "..."]
  },
  "speed_test": {
    "timestamp": "2026-01-11T21:30:00Z",
    "home": {"download_mbps": 150.2, "upload_mbps": 25.4, "ping_ms": 12.5},
    "vpn": {"toronto": {"download_mbps": 80.5, "upload_mbps": 20.1}}
  }
}
```

### 2. Speed Test Cron (Home Server)

**Script**: `/home/camerontora/infrastructure/scripts/speedtest.sh`
**Cron**: `/etc/cron.d/speedtest`
**Schedule**: Every 30 minutes (`*/30 * * * *`)
**Output**: `/var/lib/health-api/speedtest.json`

Runs speed tests for:
- Home internet (direct connection)
- VPN connection (through gluetun-toronto container)

### 3. Cloud Run Monitor (GCP)

**Service**: `home-monitor`
**Project**: `cameron-tora`
**Region**: `us-central1`
**Source**: `/home/camerontora/infrastructure/gcp-monitor/`

#### What It Checks

Every 5 minutes, the monitor performs these checks in order:

##### 1. Public Endpoint Checks

| URL | Expected | Timeout |
|-----|----------|---------|
| https://camerontora.ca | HTTP 2xx/3xx | 15s |
| https://status.camerontora.ca | HTTP 2xx/3xx | 15s |

**Alert if**: Connection timeout, connection refused, or HTTP 4xx/5xx (except 401)

##### 2. Health API Check

| URL | Method | Auth |
|-----|--------|------|
| https://health.camerontora.ca/api/health | GET | X-API-Key header |

**Alert if**: Unreachable (likely means internet is down)

##### 3. System Metrics Thresholds

| Metric | Threshold | Alert Condition |
|--------|-----------|-----------------|
| CPU | 90% | `cpu_percent > 90` |
| RAM | 95% | `memory.percent > 95` |
| Disk `/` | 95% | `disk["/"].percent > 95` |
| Disk `/home` | 95% | `disk["/home"].percent > 95` |
| Disk `/var` | 90% | `disk["/var"].percent > 90` |
| Disk `/CAMRAID` | 95% | `disk["/CAMRAID"].percent > 95` |
| Disk `/HOMENAS` | 95% | `disk["/HOMENAS"].percent > 95` |
| Upload Speed | 5 Mbps | `speed_test.home.upload_mbps < 5` |
| Speed Test Age | 2 hours | `now - speed_test.timestamp > 2h` |

##### 4. Plex Library Check

| URL | Method | Auth |
|-----|--------|------|
| https://plex.camerontora.ca/library/sections | GET | X-Plex-Token header |

**Alert if**:
- Plex unreachable
- Zero libraries returned (indicates storage mount issue)

### 4. Cloud Scheduler (GCP)

**Job**: `home-health-check`
**Location**: `us-central1`
**Schedule**: `*/5 * * * *` (every 5 minutes, UTC)
**Target**: `POST https://home-monitor-848530510810.us-central1.run.app/check`
**Auth**: OIDC token via `scheduler-invoker@cameron-tora.iam.gserviceaccount.com`

## Alert Behavior

### Discord Notifications

Alerts are sent to Discord via webhook. The webhook URL is stored in GCP Secret Manager.

**Alert deduplication**: The system only alerts on state changes:
- First failure triggers an alert
- Subsequent failures (while still failing) do NOT re-alert
- Recovery triggers a "back online" notification

### Alert Format

**Failure Alert:**
```
🚨 Home Server Unreachable
Cannot reach health API.
Health API timeout

This likely means your internet is down!
```

**Threshold Alert:**
```
🚨 Threshold Alert
/HOMENAS at 96% (threshold: 95%)
```

**Recovery Alert:**
```
✅ Home Server Back Online
Health API is now reachable. Internet connection restored.
```

## Configuration

### Environment Variables (Cloud Run)

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_WEBHOOK_URL` | (secret) | Discord webhook for alerts |
| `HEALTH_API_URL` | https://health.camerontora.ca/api/health | Health API endpoint |
| `HEALTH_API_KEY` | (secret) | API key for health endpoint |
| `PLEX_URL` | https://plex.camerontora.ca | Plex server URL |
| `PLEX_TOKEN` | (secret) | Plex authentication token |
| `THRESHOLD_CPU` | 90 | CPU alert threshold % |
| `THRESHOLD_RAM` | 95 | RAM alert threshold % |
| `THRESHOLD_DISK_HOMENAS` | 95 | /HOMENAS alert threshold % |
| `THRESHOLD_DISK_CAMRAID` | 95 | /CAMRAID alert threshold % |
| `THRESHOLD_DISK_VAR` | 90 | /var alert threshold % |
| `THRESHOLD_UPLOAD_MBPS` | 5 | Minimum upload speed Mbps |
| `THRESHOLD_SPEEDTEST_STALE_HOURS` | 2 | Max speed test age in hours |

### GCP Secrets

Secrets are stored in GCP Secret Manager (`cameron-tora` project):
- `discord-webhook-url`
- `health-api-key`
- `plex-token`

### Home Server Environment (.env)

Located at `/home/camerontora/infrastructure/.env`:
- `HEALTH_API_KEY` - Must match the GCP secret
- `PLEX_TOKEN` - Plex authentication token

## Viewing Logs

### Command Line

```bash
# Recent logs
~/google-cloud-sdk/bin/gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="home-monitor"' \
  --limit=50 \
  --format="table(timestamp,textPayload)"

# Filter for alerts only
~/google-cloud-sdk/bin/gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="home-monitor" AND textPayload:("Alert" OR "alert" OR "DOWN")' \
  --limit=20 \
  --format="table(timestamp,textPayload)"
```

### GCP Console

https://console.cloud.google.com/logs?project=cameron-tora

Search filter: `resource.labels.service_name="home-monitor"`

### Log Output Example

```
2026-01-11 22:17:10 === Starting health check ===
2026-01-11 22:17:11 Endpoint camerontora.ca: UP
2026-01-11 22:17:11 Endpoint status.camerontora.ca: UP
2026-01-11 22:17:11 Health API: reachable, CPU=43.1%, RAM=62.6%
2026-01-11 22:17:11   Disk /: 22.1%
2026-01-11 22:17:11   Disk /CAMRAID: 59.8%
2026-01-11 22:17:11   Disk /HOMENAS: 90.7%
2026-01-11 22:17:11   Disk /home: 79.3%
2026-01-11 22:17:11   Disk /var: 80.4%
2026-01-11 22:17:11 Plex: reachable, 22 libraries
2026-01-11 22:17:11 === Health check complete: healthy, 0 alerts ===
```

## Manual Operations

### Trigger a Health Check Manually

```bash
~/google-cloud-sdk/bin/gcloud scheduler jobs run home-health-check --location=us-central1
```

### Update a Threshold

```bash
~/google-cloud-sdk/bin/gcloud run services update home-monitor \
  --region=us-central1 \
  --update-env-vars=THRESHOLD_DISK_HOMENAS=90
```

### Redeploy After Code Changes

```bash
cd /home/camerontora/infrastructure/gcp-monitor
docker build -t home-monitor .
docker tag home-monitor gcr.io/cameron-tora/home-monitor:latest
docker push gcr.io/cameron-tora/home-monitor:latest
~/google-cloud-sdk/bin/gcloud run services update home-monitor \
  --region=us-central1 \
  --image=gcr.io/cameron-tora/home-monitor:latest
```

### Test Health API Locally

```bash
# Ping (no auth)
curl https://health.camerontora.ca/api/health/ping

# Full health (with auth)
curl -H "X-API-Key: $(grep HEALTH_API_KEY .env | cut -d= -f2)" \
  https://health.camerontora.ca/api/health | jq .
```

## Troubleshooting

### No Discord Alerts

1. Check Cloud Run logs for "Discord alert sent" or errors
2. Verify Discord webhook URL in GCP Secret Manager
3. Test webhook manually:
   ```bash
   curl -X POST "YOUR_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d '{"content": "Test message"}'
   ```

### Health API Unreachable

1. Check if health-api container is running: `docker ps | grep health-api`
2. Check nginx-proxy is running: `docker ps | grep nginx-proxy`
3. Test locally: `curl http://localhost:5000/api/health/ping`
4. Check DNS: `dig health.camerontora.ca`

### Speed Test Not Updating

1. Check cron is installed: `cat /etc/cron.d/speedtest`
2. Check log: `tail -f /var/log/speedtest.log`
3. Run manually: `sudo /home/camerontora/infrastructure/scripts/speedtest.sh`
4. Check output: `cat /var/lib/health-api/speedtest.json`

### Plex Check Failing

1. Verify PLEX_TOKEN is correct in both `.env` and GCP Secret Manager
2. Test Plex API directly:
   ```bash
   curl -H "X-Plex-Token: YOUR_TOKEN" \
     "http://localhost:32400/library/sections" | head
   ```

## Files Reference

| Path | Description |
|------|-------------|
| `infrastructure/health-api/` | Health API service source |
| `infrastructure/health-api/app.py` | Flask application |
| `infrastructure/health-api/Dockerfile` | Container build |
| `infrastructure/gcp-monitor/` | Cloud Run monitor source |
| `infrastructure/gcp-monitor/main.py` | Monitor application |
| `infrastructure/gcp-monitor/Dockerfile` | Container build |
| `infrastructure/scripts/speedtest.sh` | Speed test script |
| `infrastructure/scripts/speedtest.cron` | Cron job template |
| `infrastructure/nginx/conf.d/25-health.conf` | Nginx proxy config |
| `infrastructure/docker-compose.yaml` | health-api service definition |
| `infrastructure/.env` | Local secrets (HEALTH_API_KEY, PLEX_TOKEN) |
| `/etc/cron.d/speedtest` | Installed cron job |
| `/var/lib/health-api/speedtest.json` | Speed test results |
| `/var/log/speedtest.log` | Speed test log |
