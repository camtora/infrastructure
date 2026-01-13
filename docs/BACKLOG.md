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
- **Status:** Planned
- **Description:** Automatically switch VPN if current one is unhealthy for 10+ minutes
- **Considerations:**
  - Which VPN to fail over to?
  - How to detect "unhealthy" reliably?
  - Should notify on failover

## Alerting Improvements

### Outage Severity Levels
- **Status:** Planned
- **Description:** Differentiate between major and minor outages
- **Proposal:**
  - **Major Outage:** Plex is inaccessible
  - **Outage:** Any other service is inaccessible
- **Questions:** What actions should each level trigger?

## UX Improvements

### Custom 403 Error Page
- **Status:** Planned
- **Description:** Instead of generic 403, redirect to camerontora.ca or show a friendly page
- **Options:**
  - Redirect to main site
  - Custom "Access Denied" page with contact info

## Technical Debt

### Per-Service Authorization
- **Status:** Blocked
- **Description:** Admin-only access for Radarr/Sonarr/Jackett/Tautulli/Transmission/Netdata while allowing other users on Haymaker
- **Problem:** nginx `auth_request_set` doesn't capture oauth2-proxy's `X-Auth-Request-Email` header
- **Needs:** Investigation of oauth2-proxy configuration or alternative approach

### Nginx http2 Deprecation
- **Status:** Low Priority
- **Description:** `listen 443 ssl http2` syntax is deprecated
- **Fix:** Change to `listen 443 ssl` + separate `http2 on;` directive

## New Services

### Jellyfin / Emby
- **Status:** Decision Needed
- **Description:** What to do about Jellyfin and Emby?
- **Options:**
  - Add to monitoring
  - Remove/decommission
  - Keep but don't monitor

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

### RAID Array Health Monitoring (2026-01-13)
- Added: StoragePanel component showing RAID array health on dashboard
- HOMENAS (md1): Software RAID5, 8 drives, sync status, usage %
- CAMRAID (sdk): Hardware RAID5, mount status, usage %
- health-api parses /proc/mdstat for software RAID status
- Critical warning displayed if HOMENAS is degraded/failed
