#!/bin/bash
# Speed test script for health monitoring
# Runs speed tests for home internet and VPN connections
# Results written to /var/lib/health-api/speedtest.json

set -euo pipefail

OUTPUT_DIR="/var/lib/health-api"
OUTPUT_FILE="${OUTPUT_DIR}/speedtest.json"
LOGFILE="/var/log/speedtest.log"

log() { echo "$(date '+%F %T') $*" | tee -a "$LOGFILE"; }

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Initialize results
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
RESULTS="{\"timestamp\": \"$TIMESTAMP\", \"home\": null, \"vpn\": {}}"

# Function to run speedtest and extract results
run_speedtest() {
    local label="$1"
    local network_mode="${2:-}"

    log "Running speedtest for: $label"

    local docker_args="--rm"
    if [[ -n "$network_mode" ]]; then
        docker_args="$docker_args --network=container:$network_mode"
    fi

    # Use official Ookla speedtest CLI image
    local output
    if output=$(docker run $docker_args ghcr.io/roest01/docker-speedtest-cli:latest --accept-license --accept-gdpr -f json 2>/dev/null); then
        # Extract download/upload speeds (in bytes/sec, convert to Mbps)
        local download_bps upload_bps ping_ms
        download_bps=$(echo "$output" | jq -r '.download.bandwidth // 0')
        upload_bps=$(echo "$output" | jq -r '.upload.bandwidth // 0')
        ping_ms=$(echo "$output" | jq -r '.ping.latency // 0')

        # Convert bytes/sec to Mbps (divide by 125000)
        local download_mbps upload_mbps
        download_mbps=$(echo "scale=2; $download_bps / 125000" | bc)
        upload_mbps=$(echo "scale=2; $upload_bps / 125000" | bc)

        echo "{\"download_mbps\": $download_mbps, \"upload_mbps\": $upload_mbps, \"ping_ms\": $ping_ms}"
        log "✓ $label: Download=${download_mbps}Mbps, Upload=${upload_mbps}Mbps, Ping=${ping_ms}ms"
    else
        log "✗ $label: speedtest failed"
        echo "null"
    fi
}

# Run home internet speedtest (no VPN)
log "Starting speed tests..."
HOME_RESULT=$(run_speedtest "home")

# Run VPN speedtest (through gluetun-toronto)
VPN_TORONTO_RESULT="null"
if docker ps --format '{{.Names}}' | grep -q '^gluetun-toronto$'; then
    VPN_TORONTO_RESULT=$(run_speedtest "vpn-toronto" "gluetun-toronto")
fi

# Build final JSON
cat > "$OUTPUT_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "home": $HOME_RESULT,
  "vpn": {
    "toronto": $VPN_TORONTO_RESULT
  }
}
EOF

log "Results written to $OUTPUT_FILE"
log "Speed tests complete"
