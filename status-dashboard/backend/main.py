#!/usr/bin/env python3
"""
GCP Status Dashboard Service.
Public monitoring dashboard for camerontora.ca infrastructure.
"""

import logging
import os
import sys
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, jsonify, request, send_from_directory

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Import services
from backend.services.health_checker import run_health_check, get_status_summary
from backend.services.dns_manager import get_cached_dns_state, failover_dns
from backend.services.discord import send_discord_alert, notify_failover
from backend.services.history_store import store_status_snapshot, get_status_history, get_service_uptime
from backend.config import ADMIN_API_KEY

# Determine static folder path
# In Docker: /app/static
# In dev: relative to this file's directory
_dir = os.path.dirname(os.path.abspath(__file__))
if os.path.exists('/app/static'):
    static_folder = '/app/static'
else:
    static_folder = os.path.join(_dir, '..', 'frontend', 'dist')
app = Flask(__name__, static_folder=static_folder, static_url_path='')


def require_admin_key(f):
    """Decorator to require admin API key for protected endpoints."""
    @wraps(f)
    def decorated(*args, **kwargs):
        api_key = request.headers.get('X-Admin-Key')
        if not ADMIN_API_KEY:
            return jsonify({"error": "Admin API key not configured"}), 500
        if api_key != ADMIN_API_KEY:
            return jsonify({"error": "Invalid or missing admin key"}), 401
        return f(*args, **kwargs)
    return decorated


# ============== Frontend Routes ==============

@app.route('/')
def index():
    """Serve the frontend dashboard."""
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    """Serve static files."""
    return send_from_directory(app.static_folder, path)


# ============== API Routes ==============

@app.route('/api/status')
def api_status():
    """
    Get aggregated status of all services.
    Public endpoint - no authentication required.
    """
    try:
        status = get_status_summary()

        # Add DNS state
        dns = get_cached_dns_state()
        status["dns"] = dns

        return jsonify(status)
    except Exception as e:
        logger.error(f"Error in /api/status: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/dns/state')
def api_dns_state():
    """
    Get current DNS configuration.
    Public endpoint - no authentication required.
    """
    try:
        dns = get_cached_dns_state()
        return jsonify(dns)
    except Exception as e:
        logger.error(f"Error in /api/dns/state: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/dns/failover', methods=['POST'])
@require_admin_key
def api_dns_failover():
    """
    Manually trigger DNS failover.
    Protected endpoint - requires X-Admin-Key header.

    Body:
        - target: "home" or "gcp"
        - reason: optional reason string
        - dry_run: if true, skip actual GoDaddy API call (for testing)
    """
    try:
        data = request.get_json() or {}
        target = data.get('target')
        reason = data.get('reason', 'Manual failover from dashboard')
        dry_run = data.get('dry_run', False)

        if target not in ('home', 'gcp'):
            return jsonify({"error": "target must be 'home' or 'gcp'"}), 400

        # Dry run mode - return success without calling GoDaddy API
        if dry_run:
            logger.info(f"DNS failover DRY RUN: would switch to {target}")
            dns_state = get_cached_dns_state()
            return jsonify({
                "success": True,
                "dry_run": True,
                "target": target,
                "previous_ip": dns_state.get("current_ip"),
                "new_ip": dns_state.get("gcp_ip") if target == "gcp" else dns_state.get("home_ip"),
                "message": f"Dry run - would switch to {target} (no GoDaddy API call made)",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        result = failover_dns(target, reason)

        if result.get('success'):
            # Send Discord notification
            notify_failover(
                target,
                result.get('previous_ip', ''),
                result.get('new_ip', ''),
                reason
            )

        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in /api/dns/failover: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/check', methods=['GET', 'POST'])
def api_check():
    """
    Run health check - triggered by Cloud Scheduler.
    Stores snapshot to Firestore for historical tracking.
    """
    logger.info("=== Starting scheduled health check ===")
    try:
        status = run_health_check()

        # Log summary
        up_count = sum(1 for s in status.get("services", []) if s.get("status") == "up")
        total = len(status.get("services", []))
        logger.info(f"Health check complete: {status.get('overall_status')}, {up_count}/{total} services up")

        # Log metrics if available
        metrics = status.get("metrics")
        if metrics:
            logger.info(f"  CPU: {metrics.get('cpu', {}).get('percent')}%, RAM: {metrics.get('memory', {}).get('percent')}%")

        # Store to Firestore for history
        if store_status_snapshot(status):
            logger.info("  Stored snapshot to Firestore")
        else:
            logger.warning("  Failed to store snapshot to Firestore")

        return jsonify(status)
    except Exception as e:
        logger.error(f"Error in /api/check: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/health')
def api_health():
    """Simple health check for the dashboard service itself."""
    return jsonify({
        "status": "ok",
        "service": "status-dashboard",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.route('/api/history')
def api_history():
    """
    Get historical status data.
    Query params:
      - hours: number of hours to look back (default 24, max 168)
      - service: specific service name to get uptime stats for
    """
    try:
        hours = request.args.get('hours', 24, type=int)
        hours = min(max(hours, 1), 168)  # Clamp to 1-168 hours

        service_name = request.args.get('service')

        if service_name:
            # Get uptime stats for specific service
            result = get_service_uptime(service_name, hours)
        else:
            # Get full history
            history = get_status_history(hours)
            result = {
                "hours": hours,
                "snapshot_count": len(history),
                "snapshots": history,
            }

        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in /api/history: {e}")
        return jsonify({"error": str(e)}), 500


# ============== Error Handlers ==============

@app.errorhandler(404)
def not_found(e):
    """Handle 404 - serve index.html for SPA routing."""
    return send_from_directory(app.static_folder, 'index.html')


@app.errorhandler(500)
def server_error(e):
    """Handle 500 errors."""
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=True)
