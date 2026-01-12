#!/bin/bash
# Speed test script for health monitoring
# Runs speed tests for home internet connection
# Results written to /var/lib/health-api/speedtest.json

set -euo pipefail

OUTPUT_DIR="/var/lib/health-api"
OUTPUT_FILE="${OUTPUT_DIR}/speedtest.json"
LOGFILE="/var/log/speedtest.log"
SPEEDTEST_BIN="/snap/bin/speedtest"

log() { echo "$(date '+%F %T') $*" | tee -a "$LOGFILE" >&2; }

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Initialize
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

log "Starting speed test..."

# Run speedtest using local CLI
if output=$($SPEEDTEST_BIN --accept-license --accept-gdpr -f json 2>/dev/null); then
    # Extract download/upload speeds (in bytes/sec, convert to Mbps)
    download_bps=$(echo "$output" | jq -r '.download.bandwidth // 0')
    upload_bps=$(echo "$output" | jq -r '.upload.bandwidth // 0')
    ping_ms=$(echo "$output" | jq -r '.ping.latency // 0')
    server_name=$(echo "$output" | jq -r '.server.name // "Unknown"')
    server_location=$(echo "$output" | jq -r '.server.location // "Unknown"')

    # Convert bytes/sec to Mbps (divide by 125000)
    download_mbps=$(echo "scale=2; $download_bps / 125000" | bc)
    upload_mbps=$(echo "scale=2; $upload_bps / 125000" | bc)

    log "✓ Speed test complete: Download=${download_mbps}Mbps, Upload=${upload_mbps}Mbps, Ping=${ping_ms}ms"
    log "  Server: $server_name ($server_location)"

    # Build result JSON
    cat > "$OUTPUT_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "home": {
    "download": $download_mbps,
    "upload": $upload_mbps,
    "ping": $ping_ms,
    "server": "$server_name",
    "location": "$server_location"
  }
}
EOF
else
    log "✗ Speed test failed"
    cat > "$OUTPUT_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "home": null,
  "error": "Speed test failed"
}
EOF
fi

log "Results written to $OUTPUT_FILE"
