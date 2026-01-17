#!/bin/bash
# Monitor VNC session disconnects and restart service to clear cloud state
#
# RealVNC's cloud doesn't reliably receive disconnect notifications.
# This script watches for disconnect events and restarts the service
# after a short delay to force re-registration with the cloud.

LOGFILE="/var/log/vnc-session-monitor.log"

log() {
    echo "$(date '+%F %T') $*" | tee -a "$LOGFILE"
}

log "VNC session monitor started"

# Watch journalctl for VNC disconnect events
journalctl -u vncserver-x11-serviced -f --no-pager | while read -r line; do
    if echo "$line" | grep -q "Connections: disconnected:"; then
        log "Disconnect detected: $line"

        # Wait 10 seconds to see if cloud syncs naturally
        sleep 10

        log "Restarting VNC service to clear cloud session state..."
        systemctl restart vncserver-x11-serviced

        log "VNC service restarted"
    fi
done
