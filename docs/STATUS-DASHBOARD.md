# Status Dashboard

Public monitoring dashboard for camerontora.ca services, hosted on GCP Cloud Run.

**URL:** https://status.camerontora.ca
**Alternate URL:** https://status-dashboard-jkdghbnxoq-uc.a.run.app

## Overview

The status dashboard provides real-time visibility into all camerontora.ca services, system metrics, and network performance. Unlike local monitoring tools that fail when the internet is down, this dashboard runs externally on GCP and remains accessible even during home server outages.

## Features

- **Service Status**: Real-time health checks for 15 services
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
│   status-dashboard (Cloud Run) ◄──── Users via status.camerontora.ca    │
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
| Who's Up API | whosup.camerontora.ca | Social discovery app API |
| Status Dashboard | status.camerontora.ca | GCP-hosted status page |

> **Note:** `monitor.camerontora.ca` has been decommissioned. Uptime Kuma was replaced by the GCP status dashboard at `status.camerontora.ca`.

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
For each of the 15 services, the dashboard performs an HTTP GET request:

| Check | Result |
|-------|--------|
| HTTP 2xx, 3xx | **Up** - Service responding normally |
| HTTP 401 | **Up** - Protected but reachable (OAuth services) |
| HTTP 4xx/5xx (except 401) | **Down** - Service error |
| Timeout (15s) | **Down** - Service unreachable |
| Connection error | **Down** - Service unreachable |

**Why 401 = Up:** OAuth-protected services (Radarr, Sonarr, etc.) return 401 when accessed without authentication. This proves the service is running, even though it's protected.

### System Metrics
The dashboard collects metrics from two sources:

**Real-time (every 10 seconds) from Netdata:**
- **CPU:** 10-second rolling average (shows "Live" indicator)
- **Memory:** 10-second rolling average

Public endpoints exposed at `netdata.camerontora.ca/api/metrics/cpu` and `/api/metrics/ram` (bypass OAuth, only expose these specific charts).

**Periodic (every 5 minutes) from health-api:**
- **Load Average:** 1m, 5m averages
- **Disks:** Usage for /, /home, /var, /tmp, /dev (RAM), /CAMRAID, /HOMENAS
- **Speed Test:** Results from home + VPN locations (with active indicator)
- **Plex:** Library count and reachability

If Netdata metrics fail, the dashboard falls back to health-api values and shows "Using cached data" warning.

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
- **Real-time metrics (CPU/RAM):** 10 seconds (from Netdata)
- **Service status & other metrics:** 30 seconds (from backend API)
- **Cloud Scheduler:** Triggers backend health check every 5 minutes
- **Backend cache:** 60 seconds

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
curl -X POST https://status.camerontora.ca/api/dns/failover \
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
- **Domain:** status.camerontora.ca
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
1. Cron job runs every 5 minutes: `/etc/cron.d/speedtest`
2. Script tests home internet + all VPN containers **concurrently** (~30 seconds total)
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
- gluetun-vancouver

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
3. Dashboard calls GoDaddy API to update `@` A record
4. Points to Google's anycast IP (`192.178.192.121`)
5. Visitors to camerontora.ca see status dashboard with failover banner

**Failback to Home:**
1. Click "Switch to Home" button
2. Dashboard calls health-api (`/api/health/public-ip`) to get current home IP
3. Updates GoDaddy DNS with the fresh IP
4. Works even if home IP changed during outage

### DNS Records Managed
```
@
```

Only the root record is failed over. Other subdomains (plex, radarr, etc.) stay pointed at home and will timeout cleanly during an outage. This avoids SSL certificate warnings since Cloud Run only has a valid cert for `status.camerontora.ca`.

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

## Admin Panel (Phase 4)

The dashboard includes an admin panel for authenticated users to manage home server services.

### Authentication

The admin panel uses the existing OAuth infrastructure:

1. Dashboard checks `health.camerontora.ca/api/admin/whoami` on load
2. If user has valid OAuth cookie (from logging into radarr, sonarr, etc.) → panel appears
3. If not authenticated → panel is hidden entirely

Admin endpoints on health-api are protected by nginx's oauth2-proxy integration. The email of the authenticated user is passed via `X-Forwarded-Email` header.

### Admin Features

#### VPN Location Switching
Switch Transmission between VPN locations (Toronto, Montreal, Vancouver) with one click.

**What happens when you switch:**
1. Updates docker-compose.yaml (network_mode and depends_on)
2. Recreates transmission container
3. Updates nginx config (proxy port)
4. Reloads nginx

#### Container Restart
Restart any monitored container directly from the dashboard. Each service card shows a restart button (refresh icon) for authenticated admins.

**How it works:**
1. Click restart icon → "Confirm?" prompt appears
2. Click again to confirm → spinner appears
3. Backend triggers `docker restart` asynchronously (returns immediately)
4. Spinner continues until status refresh shows new uptime
5. Uptime displays in green for 5 minutes after restart

**Container uptime display:**
- Shows "Up Xs", "Up 5m", "Up 2h", "Up 3d" etc. under response time
- Green text for first 5 minutes after restart
- Confirms restart worked without checking Docker manually

#### Server Reboot
Reboot the entire home server from the dashboard. Useful for recovering from system issues or applying updates that require a restart.

**UI Components:**
- **Restart Button:** Red button in the MetricsPanel header (System Metrics section), only visible to admins
- **Confirmation Dialog:** "Are you sure?" modal with Cancel/Restart buttons
- **Reboot Status Dialog:** Full-screen modal showing all services with live status
- **Completion Screen:** Success message when all services are back online

**How it works:**
1. Admin clicks "Restart" button in System Metrics panel
2. Confirmation dialog appears: "Are you sure you want to restart the server?"
3. User confirms → POST to `/api/admin/server/reboot`
4. Backend triggers reboot via nsenter in background thread (2-second delay to allow HTTP response)
5. Dialog transitions to "Server Restarting" phase with service grid
6. Frontend polls GCP `/api/status` every 5 seconds
7. Each service shows red (offline) or green (online) status dot
8. Progress bar shows "X of Y services online"
9. When all services green → "Server is Back Online" success screen

**Reboot Dialog Phases:**
| Phase | Display |
|-------|---------|
| `confirm` | "Are you sure?" with Cancel/Restart buttons |
| `rebooting` | Service grid with status dots, elapsed timer, progress bar |
| `complete` | Success message with Close button |

**Key Implementation Details:**
- Polling happens from GCP dashboard (not health-api) since health-api goes down during reboot
- 2-second delay before reboot ensures HTTP response is sent
- Timeout after 5 minutes of polling (60 attempts × 5 seconds)
- health-api container runs with `privileged: true` and `pid: host` for host system access
- Reboot command: `nsenter -t 1 -m -u -i -n -- reboot` (enters host's PID 1 namespace from container)

**Files involved:**
| File | Purpose |
|------|---------|
| `health-api/app.py` | `/api/admin/server/reboot` endpoint |
| `health-api/Dockerfile` | sudo + systemd-sysv packages, sudoers.d config |
| `docker-compose.yaml` | `privileged: true` for health-api |
| `frontend/src/App.jsx` | Reboot state management and polling |
| `frontend/src/components/MetricsPanel.jsx` | Restart button |
| `frontend/src/components/RebootDialog.jsx` | Multi-phase dialog component |

#### Storage Monitoring

The dashboard displays RAID array health and mount status for critical storage.

**Storage Arrays Monitored:**
| Array | Device | Type | Mount Point | Purpose |
|-------|--------|------|-------------|---------|
| HOMENAS | /dev/md1 | Software RAID5 (8 drives) | /HOMENAS | Plex media (critical) |
| CAMRAID | /dev/sdk | Hardware RAID5 (JMicron) | /CAMRAID | Personal media |

**StoragePanel displays:**
- Array name and device
- RAID status (healthy/degraded/rebuilding/failed)
- Sync status for software RAID (e.g., `[UUUUUUUU]`)
- Drive count (active/total)
- Mount status
- Usage percentage with color-coded bar

**HOMENAS is critical** - if degraded or failed, the panel shows a red warning border and message. The reboot verification also checks storage status before showing "complete".

**How it works:**
1. health-api parses `/proc/mdstat` for software RAID status
2. Checks mount points via `os.path.ismount()`
3. Returns status via `/api/health` response
4. Frontend displays in StoragePanel component
5. RebootDialog includes storage verification

**Files involved:**
| File | Purpose |
|------|---------|
| `health-api/app.py` | `get_storage_status()`, `parse_mdstat_array()` |
| `status-dashboard/backend/services/health_checker.py` | Passes storage data to frontend |
| `frontend/src/components/StoragePanel.jsx` | Dashboard storage display |
| `frontend/src/components/RebootDialog.jsx` | Storage status during reboot |

### Admin API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/whoami` | GET | Check authentication status |
| `/api/admin/vpn/status` | GET | Get VPN locations and active location |
| `/api/admin/vpn/switch` | POST | Switch VPN location |
| `/api/admin/container/restart` | POST | Restart a container (async) |
| `/api/admin/server/reboot` | POST | Initiate server reboot (async, returns immediately) |

### Configuration

Admin email allowlist is configured via `ADMIN_EMAILS` environment variable in health-api:

```yaml
environment:
  - ADMIN_EMAILS=cameron.tora@gmail.com
```

## Future Enhancements

- Auto-failover after N consecutive failures (waiting for GoDaddy API rate limit reset in Feb)
- Cloudflare Access for defense-in-depth (optional extra auth layer)
- VPN download speed alerting (alert if < 10 Mbps)
- Home download speed alerting

### Completed
- ✅ **Integrate into camerontora.ca:** StatusIndicator fetches from status.camerontora.ca/api/status
- ✅ **Deprecate Uptime Kuma:** Container removed, dashboard now at status.camerontora.ca
- ✅ **Migrate dashboard URL:** Moved from monitor.camerontora.ca to status.camerontora.ca
- ✅ **Server reboot from dashboard:** Admin can reboot server with confirmation dialog and live service status tracking
- ✅ **SSL certificate expiry warnings:** gcp-monitor alerts if cert expires within 14 days
- ✅ **VPN health alerting:** gcp-monitor alerts when VPN goes unhealthy
- ✅ **Container restart from dashboard:** Admin can restart containers via dashboard
- ✅ **RAID array health monitoring:** StoragePanel shows RAID status, mount status, and usage for HOMENAS and CAMRAID
- ✅ **Reboot health verification:** Reboot dialog verifies storage arrays are healthy and mounted before showing complete
