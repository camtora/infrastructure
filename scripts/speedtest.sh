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

# Known VPN locations (gluetun containers)
VPN_LOCATIONS=("montreal" "toronto" "vancouver")

# Detect which VPN is active (Transmission uses it)
log "Detecting active VPN..."
ACTIVE_VPN=""
if transmission_network=$(docker inspect transmission --format '{{.HostConfig.NetworkMode}}' 2>/dev/null); then
    # NetworkMode can be "container:<id>" or "container:gluetun-toronto"
    if [[ "$transmission_network" =~ ^container:(.+)$ ]]; then
        container_ref="${BASH_REMATCH[1]}"
        # If it's a container ID, look up the name
        if [[ "$container_ref" =~ ^[a-f0-9]+$ ]]; then
            container_name=$(docker inspect "$container_ref" --format '{{.Name}}' 2>/dev/null | sed 's|^/||')
        else
            container_name="$container_ref"
        fi
        # Extract location from gluetun-<location>
        if [[ "$container_name" =~ gluetun-([a-z]+) ]]; then
            ACTIVE_VPN="${BASH_REMATCH[1]}"
            log "Active VPN: $ACTIVE_VPN (Transmission via $container_name)"
        fi
    fi
fi

# Run VPN speedtests CONCURRENTLY for all gluetun containers
log "Running VPN speedtests concurrently..."
TEMP_DIR=$(mktemp -d)

# Function to test a single VPN
test_vpn() {
    local location="$1"
    local active_vpn="$2"
    local temp_dir="$3"
    local container="gluetun-$location"
    local location_cap=$(echo "$location" | sed 's/.*/\u&/')
    local is_active=$([[ "$location" == "$active_vpn" ]] && echo "true" || echo "false")
    local result_file="$temp_dir/$location.json"

    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "{\"download\": null, \"upload\": null, \"ping\": null, \"status\": \"stopped\", \"active\": $is_active}" > "$result_file"
        echo "$(date '+%F %T') ✗ VPN ($location_cap): Container not running" >> "$LOGFILE"
        return
    fi

    if output=$(docker run --rm --network=container:$container appropriate/curl -s "https://speed.cloudflare.com/__down?bytes=25000000" -w '{"time": %{time_total}}' -o /dev/null 2>&1); then
        time_sec=$(echo "$output" | jq -r '.time // 1')
        if [[ "$time_sec" != "0" && "$time_sec" != "null" ]]; then
            download_mbps=$(echo "scale=2; (25 * 8) / $time_sec" | bc)
            echo "{\"download\": $download_mbps, \"upload\": null, \"ping\": null, \"status\": \"healthy\", \"active\": $is_active}" > "$result_file"
            echo "$(date '+%F %T') ✓ VPN ($location_cap): Download≈${download_mbps}Mbps" >> "$LOGFILE"
        else
            echo "{\"download\": null, \"upload\": null, \"ping\": null, \"status\": \"error\", \"active\": $is_active}" > "$result_file"
            echo "$(date '+%F %T') ✗ VPN ($location_cap): Invalid response" >> "$LOGFILE"
        fi
    else
        echo "{\"download\": null, \"upload\": null, \"ping\": null, \"status\": \"unhealthy\", \"active\": $is_active}" > "$result_file"
        echo "$(date '+%F %T') ✗ VPN ($location_cap) speedtest failed (DNS/network issue)" >> "$LOGFILE"
    fi
}

# Export function and variables for subshells
export -f test_vpn
export LOGFILE

# Start all VPN tests in parallel
for location in "${VPN_LOCATIONS[@]}"; do
    test_vpn "$location" "$ACTIVE_VPN" "$TEMP_DIR" &
done

# Wait for all tests to complete
wait

# Collect results
VPN_RESULTS="{}"
for location in "${VPN_LOCATIONS[@]}"; do
    location_cap=$(echo "$location" | sed 's/.*/\u&/')
    if [[ -f "$TEMP_DIR/$location.json" ]]; then
        result=$(cat "$TEMP_DIR/$location.json")
        VPN_RESULTS=$(echo "$VPN_RESULTS" | jq --arg loc "$location_cap" --argjson data "$result" '. + {($loc): $data}')
    fi
done

# Cleanup
rm -rf "$TEMP_DIR"

# Build final JSON
cat > "$OUTPUT_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "home": $HOME_RESULT,
  "vpn": $VPN_RESULTS
}
EOF

log "Results written to $OUTPUT_FILE"
log "Speed tests complete"
