#!/bin/bash
# GoDaddy Dynamic DNS updater for camerontora.ca (multi-record)

set -euo pipefail

DOMAIN="camerontora.ca"
# Add any subdomains you want to update here:
RECORDS=("@" "ombi" "plex" "sonarr" "radarr" "tautulli" "transmission" "jackett" "status" "emby" "jellyfin" "overseerr" "watchmap" "haymaker" "netdata")
TTL="600"

# API credentials - set via environment or /etc/godaddy-ddns.env
# DO NOT hardcode keys here - this file is in git
if [[ -f /etc/godaddy-ddns.env ]]; then
  source /etc/godaddy-ddns.env
fi
API_KEY="${API_KEY:?ERROR: API_KEY not set. Create /etc/godaddy-ddns.env with API_KEY=xxx}"
API_SECRET="${API_SECRET:?ERROR: API_SECRET not set. Create /etc/godaddy-ddns.env with API_SECRET=xxx}"

LOGFILE="/var/log/godaddy-ddns.log"
LASTFILE="/var/lib/godaddy-ddns.last_update"

log() { echo "$(date '+%F %T') $*" | tee -a "$LOGFILE"; }

# Get current public IPv4 with fallbacks
IP="$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me || curl -fsS https://ipv4.icanhazip.com || true)"
if [[ -z "${IP:-}" || ! "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  log "❌ Could not determine public IPv4 address"; exit 1
fi

UPDATED_ANY=false

for RECORD in "${RECORDS[@]}"; do
  # Fetch current DNS value for this record
  GD_IP="$(curl -fsS -X GET "https://api.godaddy.com/v1/domains/$DOMAIN/records/A/$RECORD" \
           -H "Authorization: sso-key $API_KEY:$API_SECRET" \
           -H "Accept: application/json" \
          | jq -r '.[0].data // empty')"

  if [[ -z "$GD_IP" ]]; then
    log "ℹ️  No existing A record for ${RECORD}.${DOMAIN} (will create/update)"
  fi

  if [[ "$IP" != "$GD_IP" ]]; then
    log "↻ Updating ${RECORD}.${DOMAIN} from '${GD_IP:-none}' to '$IP'"
    curl -fsS -X PUT "https://api.godaddy.com/v1/domains/$DOMAIN/records/A/$RECORD" \
      -H "Authorization: sso-key $API_KEY:$API_SECRET" \
      -H "Content-Type: application/json" \
      -d "[{\"data\": \"$IP\", \"ttl\": $TTL}]" >> "$LOGFILE" 2>&1
    UPDATED_ANY=true
  else
    log "✓ No change for ${RECORD}.${DOMAIN} (still $IP)"
  fi
done

if $UPDATED_ANY; then
  mkdir -p "$(dirname "$LASTFILE")"
  echo "$(date '+%F %T') $IP" > "$LASTFILE"
  log "✓ Finished updates. Last-change timestamp stored in $LASTFILE"
else
  log "✓ All records already up to date"
fi

