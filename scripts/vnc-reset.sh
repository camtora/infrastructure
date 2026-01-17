#!/bin/bash
# Reset VNC service to clear stuck RealVNC cloud sessions
#
# Problem: RealVNC's cloud service doesn't always receive disconnect
# notifications from the local server, causing "session already active" errors.
# Restarting the service forces re-registration with the cloud.
#
# Usage: vnc-reset (or sudo vnc-reset)

set -e

echo "Restarting VNC service to clear cloud session..."
sudo systemctl restart vncserver-x11-serviced
echo "Done. You should now be able to connect."
