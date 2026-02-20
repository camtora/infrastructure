#!/bin/bash
# GoDaddy Dynamic DNS updater for camerontora.ca (batch update)

set -euo pipefail

DOMAIN="camerontora.ca"
# Add any subdomains you want to update here:
RECORDS=("@" "ombi" "plex" "sonarr" "radarr" "tautulli" "transmission" "jackett" "overseerr" "watchmap" "haymaker" "netdata" "health" "whosup")
TTL=600

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

# Fetch all current A records in one call
CURRENT_RECORDS="$(curl -fsS -X GET "https://api.godaddy.com/v1/domains/$DOMAIN/records/A" \
  -H "Authorization: sso-key $API_KEY:$API_SECRET" \
  -H "Accept: application/json")"

# Check if DNS failover is active (@ record pointing to a GCP IP)
# If so, skip the update entirely to avoid undoing the failover
GCP_IPS=("216.239.32.21" "216.239.34.21" "216.239.36.21" "216.239.38.21")
CURRENT_AT_IP="$(echo "$CURRENT_RECORDS" | jq -r '.[] | select(.name == "@") | .data // empty' | head -1)"
for gcp_ip in "${GCP_IPS[@]}"; do
  if [[ "$CURRENT_AT_IP" == "$gcp_ip" ]]; then
    log "↻ DNS failover active (@→${CURRENT_AT_IP}), skipping DDNS update"
    exit 0
  fi
done

# Check if any records need updating
NEEDS_UPDATE=false
for RECORD in "${RECORDS[@]}"; do
  CURRENT_IP="$(echo "$CURRENT_RECORDS" | jq -r --arg name "$RECORD" '.[] | select(.name == $name) | .data // empty')"
  if [[ "$CURRENT_IP" != "$IP" ]]; then
    NEEDS_UPDATE=true
    log "↻ Will update ${RECORD}.${DOMAIN} from '${CURRENT_IP:-none}' to '$IP'"
  fi
done

if $NEEDS_UPDATE; then
  # Build JSON array for batch update
  JSON_ARRAY="["
  for i in "${!RECORDS[@]}"; do
    [[ $i -gt 0 ]] && JSON_ARRAY+=","
    JSON_ARRAY+="{\"name\":\"${RECORDS[$i]}\",\"type\":\"A\",\"data\":\"$IP\",\"ttl\":$TTL}"
  done
  JSON_ARRAY+="]"

  # Single PUT to update all A records
  curl -fsS -X PUT "https://api.godaddy.com/v1/domains/$DOMAIN/records/A" \
    -H "Authorization: sso-key $API_KEY:$API_SECRET" \
    -H "Content-Type: application/json" \
    -d "$JSON_ARRAY" >> "$LOGFILE" 2>&1

  mkdir -p "$(dirname "$LASTFILE")"
  echo "$(date '+%F %T') $IP" > "$LASTFILE"
  log "✓ Updated ${#RECORDS[@]} records to $IP"
else
  log "✓ All ${#RECORDS[@]} records already up to date ($IP)"
fi

