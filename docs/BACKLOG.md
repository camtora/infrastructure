# Infrastructure Backlog

## Admin/Status Dashboard Features

### SSH Restart Server
- **Status:** Completed (2026-01-13)
- **Description:** Ability to restart the home server from the dashboard
- **Implementation:**
  - "Restart" button in MetricsPanel (admin only)
  - Confirmation dialog before proceeding
  - RebootDialog shows all services going from red → green
  - Auto-detects when all services are back online

### Reboot Health Verification
- **Status:** Completed (2026-01-13)
- **Description:** After reboot is detected, verify system is healthy
- **Implementation:**
  - RebootDialog shows storage array status during reboot polling
  - Verifies HOMENAS (RAID5) and CAMRAID are healthy and mounted
  - Only transitions to "complete" phase when all services UP AND storage healthy
  - StoragePanel added to main dashboard showing RAID health

### Auto-Failover VPN
- **Status:** Completed (2026-01-13)
- **Description:** Automatically switch VPN if current one is unhealthy for 30+ minutes
- **Implementation:**
  - gcp-monitor tracks consecutive unhealthy checks (6 checks = ~30 minutes)
  - Failover target: healthy VPN with highest download speed
  - Discord notifications: "Starting" (yellow), "Complete" (green), or "Failed" (red)
  - If all VPNs unhealthy, alerts but doesn't switch
- **Files:**
  - `health-api/app.py` - Added `/api/health/vpn/switch` endpoint (API key auth)
  - `gcp-monitor/main.py` - Added `check_vpn_and_failover()` and `trigger_failover()`

## Alerting Improvements

### Outage Severity Levels
- **Status:** Completed (2026-01-13)
- **Description:** Differentiate between major and minor outages
- **Implementation:**
  - **Major (Red):** Home internet down, Plex down, HOMENAS RAID unhealthy
  - **Minor (Orange):** Other services down (Radarr, Sonarr, Jackett, etc.)
  - **Degraded (Yellow):** CPU maxed (>90%), RAM maxed (>95%), upload speed low (<5Mbps)
  - **Healthy (Green):** All systems operational
- **Updated Files:**
  - `status-dashboard/backend/services/health_checker.py` - severity determination logic
  - `status-dashboard/frontend/src/components/Header.jsx` - status display configs
  - `gcp-monitor/main.py` - Discord alert colors and prefixes
  - `camerontora.ca/app/app/api/status/route.ts` - API mapping
  - `camerontora.ca/app/app/components/StatusBanner.tsx` - banner colors/messages

## Technical Debt

### Haymaker Health Endpoint
- **Status:** Resolved — not needed
- **Description:** Health checker accepts 2xx, 3xx, and 401 as "up", so the OAuth 302 redirect is sufficient to confirm Haymaker is reachable. No bypass endpoint required.

### Per-Service Authorization
- **Status:** Blocked
- **Description:** Admin-only access for Radarr/Sonarr/Jackett/Tautulli/Transmission/Netdata while allowing other users on Haymaker
- **Problem:** nginx `auth_request_set` doesn't capture oauth2-proxy's `X-Auth-Request-Email` header
- **Needs:** Investigation of oauth2-proxy configuration or alternative approach

### DNS Failover
- **Status:** Completed (2026-02-20)
- **Description:** Automatically switch DNS to GCP when home internet is down
- **Implementation:**
  - GCP Cloud Run domain mappings created for `camerontora.ca`, `plex`, `ombi`, `overseerr` → `status-dashboard`
  - `gcp-static-ip` secret updated to `216.239.32.21` (GCP anycast)
  - `DNS_RECORDS` in `status-dashboard/backend/config.py` expanded to `["@", "plex", "ombi", "overseerr"]`
  - DDNS sentinel check added to `scripts/godaddy-ddns.sh` — prevents cron from undoing active failover
- **Tested:** Failover and failback both confirmed working. DDNS cron correctly skips update when `@` points to GCP IP.
- **See:** `docs/DNS-FAILOVER.md` for full documentation

---

## Completed

### Migrate monitor.camerontora.ca → status.camerontora.ca (2026-01-13)
- Migrated status dashboard URL from monitor.camerontora.ca to status.camerontora.ca
- Updated GCP domain mapping, nginx CORS headers, documentation
- Decommissioned monitor.camerontora.ca subdomain

### VPN Switch Port Update (2026-01-13)
- Fixed: VPN switch now updates both nginx proxy_pass lines (health endpoint + main)

### GCP Timeout Fix (2026-01-13)
- Fixed: Concurrent health checks prevent Cloud Run 60s timeout

### GitHub Actions Deployment (2026-01-13)
- Added: Automated deployment to GCP Cloud Run on push

### Montreal VPN Port (2026-01-13)
- Fixed: nginx config updated to use port 9092 for Montreal VPN

### Discord Alerts Not Firing (2026-01-13)
- Fixed: Discord webhook URL in GCP Secret Manager had embedded newline corrupting the URL
- Fixed: gcp-monitor looked for `upload_mbps` but health API returns `upload`, causing false "0 Mbps" alerts

### GitHub Actions OIDC Provider (2026-01-13)
- Fixed: Created missing `github-provider` OIDC provider in GCP Workload Identity Pool
- Added: Attribute condition restricting to `camtora/infrastructure` repo

### Sonarr/Radarr VPN Port Sync (2026-01-13)
- Fixed: VPN switch now updates Sonarr/Radarr download client ports via API
- Each VPN location has different port (Toronto=9091, Montreal=9092, Vancouver=9093)

### SMART Disk Health Monitoring (2026-01-13)
- Added: Per-drive SMART health monitoring for HOMENAS RAID5 array
- Parses smartctl output for each of the 8 drives (sdc-sdj)
- Displays: model, serial, temperature, power-on hours, SMART status
- Monitors critical attributes: reallocated sectors, pending sectors, uncorrectable
- Expandable drive list in StoragePanel shows individual drive health
- Warnings triggered if any drive has non-zero sector counts

### RAID Array Health Monitoring (2026-01-13)
- Added: StoragePanel component showing RAID array health on dashboard
- HOMENAS (md1): Software RAID5, 8 drives, sync status, usage %
- CAMRAID (sdk): Hardware RAID5, mount status, usage %
- health-api parses /proc/mdstat for software RAID status
- Critical warning displayed if HOMENAS is degraded/failed

### Custom 403 Error Page (2026-01-13)
- Added: Stylish "Access Denied" page for unauthorized users (authenticated but not on allowed list)
- Dark glassmorphism design matching status dashboard theme
- Shows friendly message with links to home page and status dashboard
- Applied to all 7 protected services: Radarr, Sonarr, Jackett, Tautulli, Transmission, Watchmap, Netdata

### Jellyfin / Emby (2026-01-13)
- Decision: Keep containers but don't run them, not monitored
- DNS entries removed

### Nginx http2 Deprecation Fix (2026-01-13)
- Fixed: Changed deprecated `listen 443 ssl http2;` to `listen 443 ssl;` + `http2 on;`
- Updated all 5 nginx config files (14 server blocks total)
- No more deprecation warnings on nginx reload

### VPN Switch Sonarr/Radarr Update Order (2026-01-16)
- Fixed: VPN switch was updating Sonarr/Radarr ports BEFORE recreating Transmission
- Problem: Sonarr/Radarr validate connection on update, so API call failed if Transmission wasn't ready
- Solution: Move Sonarr/Radarr update to AFTER Transmission is recreated, with 30s wait loop
- New order: recreate transmission → wait for ready → update Sonarr/Radarr → update nginx
