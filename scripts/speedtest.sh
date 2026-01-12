#!/bin/bash
# Speed test script for health monitoring
# Runs speed tests for home internet and VPN connections
# Results written to /var/lib/health-api/speedtest.json

set -euo pipefail

OUTPUT_DIR="/var/lib/health-api"
OUTPUT_FILE="${OUTPUT_DIR}/speedtest.json"
LOGFILE="/var/log/speedtest.log"
SPEEDTEST_BIN="/snap/bin/speedtest"

log() { echo "$(date '+%F %T') $*" | tee -a "$LOGFILE" >&2; }

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Function to parse speedtest JSON output
parse_speedtest() {
    local output="$1"
    local download_bps upload_bps ping_ms server_name server_location

    download_bps=$(echo "$output" | jq -r '.download.bandwidth // 0')
    upload_bps=$(echo "$output" | jq -r '.upload.bandwidth // 0')
    ping_ms=$(echo "$output" | jq -r '.ping.latency // 0')
    server_name=$(echo "$output" | jq -r '.server.name // "Unknown"')
    server_location=$(echo "$output" | jq -r '.server.location // "Unknown"')

    # Convert bytes/sec to Mbps (divide by 125000)
    local download_mbps upload_mbps
    download_mbps=$(echo "scale=2; $download_bps / 125000" | bc)
    upload_mbps=$(echo "scale=2; $upload_bps / 125000" | bc)

    echo "{\"download\": $download_mbps, \"upload\": $upload_mbps, \"ping\": $ping_ms, \"server\": \"$server_name\", \"location\": \"$server_location\"}"
}

# Run home speedtest (local CLI)
log "Starting speed tests..."
log "Running home speedtest..."
HOME_RESULT="null"
if output=$($SPEEDTEST_BIN --accept-license --accept-gdpr -f json 2>/dev/null); then
    HOME_RESULT=$(parse_speedtest "$output")
    download=$(echo "$HOME_RESULT" | jq -r '.download')
    upload=$(echo "$HOME_RESULT" | jq -r '.upload')
    log "✓ Home: Download=${download}Mbps, Upload=${upload}Mbps"
else
    log "✗ Home speedtest failed"
fi

# Run VPN speedtest through gluetun-vancouver (using Docker)
log "Running VPN speedtest (Vancouver)..."
VPN_RESULT="null"
if docker ps --format '{{.Names}}' | grep -q '^gluetun-vancouver$'; then
    # Use a lightweight speedtest Docker image through VPN network
    if output=$(docker run --rm --network=container:gluetun-vancouver appropriate/curl -s "https://speed.cloudflare.com/__down?bytes=25000000" -w '{"time": %{time_total}}' -o /dev/null 2>/dev/null); then
        # Cloudflare speed test - rough estimate
        time_sec=$(echo "$output" | jq -r '.time // 1')
        download_mbps=$(echo "scale=2; (25 * 8) / $time_sec" | bc)
        VPN_RESULT="{\"download\": $download_mbps, \"upload\": null, \"ping\": null, \"server\": \"Cloudflare\", \"location\": \"Vancouver VPN\"}"
        log "✓ VPN (Vancouver): Download≈${download_mbps}Mbps (estimate)"
    else
        log "✗ VPN speedtest failed"
    fi
else
    log "⚠ gluetun-vancouver not running, skipping VPN test"
fi

# Build final JSON
cat > "$OUTPUT_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "home": $HOME_RESULT,
  "vpn": $VPN_RESULT
}
EOF

log "Results written to $OUTPUT_FILE"
log "Speed tests complete"
