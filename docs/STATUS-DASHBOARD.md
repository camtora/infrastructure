# Status Dashboard

Public monitoring dashboard for camerontora.ca services, hosted on GCP Cloud Run.

**URL:** https://monitor.camerontora.ca
**Alternate URL:** https://status-dashboard-jkdghbnxoq-uc.a.run.app

## Overview

The status dashboard provides real-time visibility into all camerontora.ca services, system metrics, and network performance. Unlike local monitoring tools that fail when the internet is down, this dashboard runs externally on GCP and remains accessible even during home server outages.

## Features

- **Service Status**: Real-time health checks for 14 services
- **System Metrics**: CPU, RAM, load average, disk usage
- **Speed Tests**: Home internet + all VPN locations (Montreal, Toronto, Vancouver)
- **DNS Controls**: View current DNS state, manual failover capability
- **Auto-refresh**: Updates every 30 seconds
- **Failover Banner**: Alerts visitors when services are offline

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           GCP Cloud Platform                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Cloud Scheduler (every 5 min)                                          │
│        │                                                                 │
│        ▼ POST /api/check                                                 │
│                                                                          │
│   status-dashboard (Cloud Run) ◄──── Users via monitor.camerontora.ca   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Frontend (Preact + Tailwind)                                    │   │
│   │  ├── Status grid (all services)                                  │   │
│   │  ├── Metrics panel (CPU, RAM, disk gauges)                       │   │
│   │  ├── Speed test display (home + VPN locations)                   │   │
│   │  └── DNS control panel (failover button)                         │   │
│   │                                                                   │   │
│   │  Backend (Python/Flask)                                          │   │
│   │  ├── GET /api/status - aggregated status                         │   │
│   │  ├── GET /api/dns/state - current DNS config                     │   │
│   │  ├── POST /api/dns/failover - switch DNS (admin only)            │   │
│   │  └── POST /api/check - scheduler trigger                         │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                 │
│        ├──► GoDaddy API (read DNS state, write on failover)             │
│        ├──► Health API (system metrics)                                  │
│        └──► All services (HTTP health checks)                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Services Monitored

### Public Services
| Service | URL | Description |
|---------|-----|-------------|
| Main Site | camerontora.ca | Personal website |
| Plex | plex.camerontora.ca | Media server |
| Overseerr | overseerr.camerontora.ca | Media requests |
| Ombi | ombi.camerontora.ca | Media requests (legacy) |
| Status (Uptime Kuma) | status.camerontora.ca | Local status page |

### Protected Services (OAuth)
| Service | URL | Description |
|---------|-----|-------------|
| Haymaker | haymaker.camerontora.ca | Golf handicap tracker |
| Watchmap | watchmap.camerontora.ca | Watch collection |
| Radarr | radarr.camerontora.ca | Movie management |
| Sonarr | sonarr.camerontora.ca | TV management |
| Jackett | jackett.camerontora.ca | Indexer proxy |
| Tautulli | tautulli.camerontora.ca | Plex statistics |
| Transmission | transmission.camerontora.ca | Torrent client |
| Netdata | netdata.camerontora.ca | System monitoring |

### API Services
| Service | URL | Description |
|---------|-----|-------------|
| Health API | health.camerontora.ca/api/health/ping | System metrics API |

## How Health Checks Work

### Service Endpoint Checks
For each of the 14 services, the dashboard performs an HTTP GET request:

| Check | Result |
|-------|--------|
| HTTP 2xx, 3xx | **Up** - Service responding normally |
| HTTP 401 | **Up** - Protected but reachable (OAuth services) |
| HTTP 4xx/5xx (except 401) | **Down** - Service error |
| Timeout (15s) | **Down** - Service unreachable |
| Connection error | **Down** - Service unreachable |

**Why 401 = Up:** OAuth-protected services (Radarr, Sonarr, etc.) return 401 when accessed without authentication. This proves the service is running, even though it's protected.

### System Metrics
The dashboard calls `health.camerontora.ca/api/health` to collect:
- **CPU:** Current usage percentage
- **Memory:** Current usage percentage
- **Load Average:** 1m, 5m, 15m averages
- **Disks:** Usage for /, /home, /var, /tmp, /dev (RAM), /CAMRAID, /HOMENAS
- **Speed Test:** Results from home + VPN locations (with active indicator)
- **Plex:** Library count and reachability

### Overall Status Logic
| Condition | Status |
|-----------|--------|
| Health API unreachable | `unhealthy` (red) |
| More than 3 services down | `unhealthy` (red) |
| 1-3 services down | `degraded` (yellow) |
| All services up | `healthy` (green) |

### Internal vs External Checks
Each service is checked both externally (from GCP) and internally (from health-api on home server):

| External | Internal | Status | Meaning |
|----------|----------|--------|---------|
| Up | Up | **Operational** (green) | Everything working |
| Down | Up | **Network Issue** (orange) | Service works locally, problem is nginx/DNS/network |
| Down | Down | **Down** (red) | Service itself is broken |
| Up | Down | Operational | External works, internal check unavailable |

The UI shows small indicators for each service:
- **Container**: Is the Docker container running?
- **Local**: Does the local port respond?

This helps quickly identify whether an issue is with the service itself or the external access path.

### Caching & Refresh
- **Cache duration:** 60 seconds
- **Cloud Scheduler:** Triggers fresh check every 5 minutes
- **Frontend:** Auto-refreshes display every 30 seconds

## API Endpoints

### GET /api/status
Returns aggregated status of all services, metrics, and DNS state.

```json
{
  "timestamp": "2026-01-12T01:00:00Z",
  "overall_status": "healthy",
  "summary": {
    "services_up": 14,
    "services_total": 14,
    "uptime_percent": 100.0
  },
  "services": [...],
  "metrics": {
    "cpu": {"percent": 11.1},
    "memory": {"percent": 69.0},
    "load": {"load_1m": 3.09, "load_5m": 3.25, "cpu_count": 6},
    "disks": [...],
    "speed_test": {...}
  },
  "dns": {
    "target": "home",
    "current_ip": "xxx.xxx.xxx.xxx",
    "record_count": 16
  }
}
```

### GET /api/dns/state
Returns current DNS configuration from GoDaddy.

### POST /api/dns/failover
Manually switch DNS between home and GCP. Requires `X-Admin-Key` header.

```bash
curl -X POST https://monitor.camerontora.ca/api/dns/failover \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  -d '{"target": "gcp", "reason": "Manual failover"}'
```

### POST /api/check
Triggers a health check. Called by Cloud Scheduler every 5 minutes.

### GET /api/health
Simple health check for the dashboard service itself.

## Health API Endpoints (Home Server)

The health-api runs on the home server and provides internal metrics.

### GET /api/health/ping
Simple liveness check (no auth required).

### GET /api/health
Full system metrics: CPU, memory, disk, load, Plex status, speed test (requires API key).

### GET /api/health/public-ip
Returns current public IP address - used for DNS failback (requires API key).

### GET /api/health/services
Internal service status - checks each container and local port (requires API key).

```json
{
  "services": [
    {
      "name": "Plex",
      "container": {"name": "plex", "running": true, "health": null},
      "local_port": {"port": 32400, "responding": true, "status_code": 200}
    }
  ]
}
```

## GCP Configuration

### Cloud Run Service
- **Name:** status-dashboard
- **Project:** cameron-tora
- **Region:** us-central1
- **Memory:** 256Mi
- **CPU:** 1
- **Min instances:** 0
- **Max instances:** 2

### Cloud Scheduler Job
- **Name:** status-check
- **Schedule:** `*/5 * * * *` (every 5 minutes)
- **Target:** POST /api/check

### Domain Mapping
- **Domain:** monitor.camerontora.ca
- **Type:** CNAME to ghs.googlehosted.com

### Secrets (GCP Secret Manager)
| Secret | Description |
|--------|-------------|
| health-api-key | API key for health.camerontora.ca |
| discord-webhook-url | Discord notifications |
| godaddy-api-key | GoDaddy DNS API key |
| godaddy-api-secret | GoDaddy DNS API secret |
| admin-api-key | Admin key for failover controls |
| gcp-static-ip | Reserved IP for DNS failover (future) |

## Speed Test

The dashboard displays speed test results from the home server.

### How It Works
1. Cron job runs every 30 minutes: `/etc/cron.d/speedtest`
2. Script tests home internet + all active VPN containers
3. Results written to: `/var/lib/health-api/speedtest.json`
4. Health API serves the results
5. Status dashboard fetches and displays

### Speed Test Script
```bash
# Run manually
sudo /home/camerontora/infrastructure/scripts/speedtest.sh

# View results
cat /var/lib/health-api/speedtest.json

# View logs
tail -f /var/log/speedtest.log
```

### VPN Locations Tested
- gluetun-montreal
- gluetun-toronto (currently active for Transmission)
- gluetun-vancouver (unhealthy - DNS issues)

The script tests all 3 locations and shows:
- **Status:** healthy/unhealthy/stopped
- **Active indicator:** Shows which VPN Transmission is using
- **Speed:** Download speed when healthy

## DNS Failover

The dashboard includes manual DNS failover capability for disaster recovery.

### How It Works

**Failover to GCP:**
1. Enter admin key in dashboard (stored in localStorage)
2. Click "Failover to GCP" button
3. Dashboard calls GoDaddy API to update `@` and `monitor` A records
4. Points to Google's anycast IP (`192.178.192.121`)
5. Visitors to camerontora.ca see status dashboard with failover banner

**Failback to Home:**
1. Click "Switch to Home" button
2. Dashboard calls health-api (`/api/health/public-ip`) to get current home IP
3. Updates GoDaddy DNS with the fresh IP
4. Works even if home IP changed during outage

### DNS Records Managed
```
@, monitor
```

Only these two records are failed over. Other subdomains (plex, radarr, etc.) stay pointed at home and will timeout cleanly during an outage. This avoids SSL certificate warnings since Cloud Run only has a valid cert for `monitor.camerontora.ca`.

### Failover Banner
When DNS points to GCP, the dashboard displays:
```
⚠️ camerontora.ca services are currently offline
You've been redirected to this status page. We're working on restoring services.
```

## Deployment

### Deploy from Cloud Shell

```bash
# Open Cloud Shell
# https://console.cloud.google.com/cloudshell?project=cameron-tora

# Clone and deploy
git clone https://github.com/camtora/infrastructure.git
cd infrastructure/status-dashboard
./deploy.sh
```

### Deploy Script Actions
1. Checks for required GCP secrets
2. Builds Docker image via Cloud Build
3. Deploys to Cloud Run
4. Creates/updates Cloud Scheduler job

### Manual Redeploy
```bash
cd infrastructure/status-dashboard
git pull
./deploy.sh
```

## Local Development

### Run Backend Locally
```bash
cd status-dashboard/backend
pip install -r ../requirements.txt
export HEALTH_API_KEY="your-key"
export DISCORD_WEBHOOK_URL="your-webhook"
python main.py
```

### Run Frontend Locally
```bash
cd status-dashboard/frontend
npm install
npm run dev
```

## Files Reference

| Path | Description |
|------|-------------|
| `status-dashboard/` | Project root |
| `status-dashboard/Dockerfile` | Multi-stage build (Node + Python) |
| `status-dashboard/deploy.sh` | GCP deployment script |
| `status-dashboard/requirements.txt` | Python dependencies |
| `status-dashboard/backend/main.py` | Flask application |
| `status-dashboard/backend/config.py` | Configuration and service list |
| `status-dashboard/backend/services/health_checker.py` | Service health checks |
| `status-dashboard/backend/services/dns_manager.py` | GoDaddy DNS integration |
| `status-dashboard/backend/services/discord.py` | Discord notifications |
| `status-dashboard/frontend/` | Preact + Tailwind frontend |
| `status-dashboard/frontend/src/App.jsx` | Main application component |
| `status-dashboard/frontend/src/components/` | UI components |
| `scripts/speedtest.sh` | Speed test script |
| `scripts/speedtest.cron` | Cron job template |

## Troubleshooting

### Dashboard Not Loading
1. Check Cloud Run service status in GCP Console
2. View logs: `gcloud run services logs read status-dashboard --region=us-central1`
3. Verify public access is enabled (allUsers has roles/run.invoker)

### Services Showing as Down
1. Check if service is actually running: `docker ps`
2. Check nginx-proxy: `docker logs nginx-proxy --tail 20`
3. Test endpoint directly: `curl -I https://service.camerontora.ca`

### Speed Test Empty
1. Run speedtest manually: `sudo ./scripts/speedtest.sh`
2. Check JSON output: `cat /var/lib/health-api/speedtest.json`
3. Verify health-api can read the file: `docker exec health-api cat /data/speedtest.json`

### DNS Panel Shows Error
1. GoDaddy API rate limit (10 min cache)
2. Check secrets are configured in GCP Secret Manager
3. Verify API credentials in `/etc/godaddy-ddns.env`

### Failover Button Not Working
1. Ensure admin key is entered (click "Configure Admin Key")
2. Check browser console for errors
3. Verify admin-api-key secret in GCP matches your key

## Historical Data (Phase 3)

The dashboard stores status snapshots to Firestore every 5 minutes, enabling historical uptime tracking.

### Data Stored
- Service status (up/down) per check
- Response times
- System metrics (CPU, RAM, load)
- Speed test results

### Uptime History Panel
- Shows colored bars for each service over time
- Toggle between 24 hours and 7 days view
- Green = operational, Red = down, Gray = no data
- Displays uptime percentage per service

### API Endpoint
```
GET /api/history?hours=24&service=Plex
```

Returns timeline and uptime statistics for the specified service and time range.

### Data Retention
- Snapshots stored with minute precision
- Cleanup function available for old data (default: 7 days)
- Firestore free tier: 1GB storage, 50K reads/day

### GCP Setup
Firestore must be enabled in Native mode:
1. Go to https://console.cloud.google.com/firestore
2. Create Database → Native mode → us-central1
3. Grant Firestore access to Cloud Run service account:
   ```bash
   gcloud projects add-iam-policy-binding cameron-tora \
     --member="serviceAccount:848530510810-compute@developer.gserviceaccount.com" \
     --role="roles/datastore.user"
   ```
4. Redeploy Cloud Run service to pick up new permissions

## Future Enhancements (Phase 4)

- VPN location switching from dashboard
- Auto-failover after N consecutive failures
- SSL certificate expiry warnings
- **Integrate into camerontora.ca:** Replace Uptime Kuma status widget
  - Update StatusIndicator component to fetch from monitor.camerontora.ca/api/status
  - Display overall status with service count
  - Link to full dashboard for details
  - Deprecate status.camerontora.ca (Uptime Kuma)
