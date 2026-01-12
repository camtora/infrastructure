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
- gluetun-toronto
- gluetun-vancouver

The script automatically discovers and tests all running `gluetun-*` containers.

## DNS Failover

The dashboard includes manual DNS failover capability for disaster recovery.

### How It Works
1. Enter admin key in dashboard (stored in localStorage)
2. Click "Failover to GCP" button
3. Dashboard calls GoDaddy API to update all A records
4. All *.camerontora.ca traffic routes to GCP
5. Visitors see the status dashboard with failover banner

### Failover Banner
When DNS points to GCP, the dashboard displays:
```
⚠️ camerontora.ca services are currently offline
You've been redirected to this status page. We're working on restoring services.
```

### DNS Records Managed
```
@, ombi, plex, sonarr, radarr, tautulli, transmission,
jackett, status, emby, jellyfin, overseerr, watchmap,
haymaker, netdata, health
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

## Future Enhancements (Phase 4)

- VPN location switching from dashboard
- Auto-failover after N consecutive failures
- Docker container status monitoring
- SSL certificate expiry warnings
- Historical data and charts (Firestore)
