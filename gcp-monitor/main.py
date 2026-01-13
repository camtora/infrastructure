#!/usr/bin/env python3
"""
GCP Cloud Run Home Monitor Service.
Runs external health checks and alerts via Discord.
Triggered by Cloud Scheduler every 5 minutes.
"""

import json
import logging
import os
import socket
import ssl
import sys
from datetime import datetime, timezone
from typing import Any

import requests
from flask import Flask, jsonify, request

# Configure logging to stdout for Cloud Run
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration from environment/secrets
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "")
HEALTH_API_URL = os.environ.get("HEALTH_API_URL", "https://health.camerontora.ca/api/health")
HEALTH_API_KEY = os.environ.get("HEALTH_API_KEY", "")
PLEX_URL = os.environ.get("PLEX_URL", "https://plex.camerontora.ca")
PLEX_TOKEN = os.environ.get("PLEX_TOKEN", "")

# Thresholds (configurable via environment)
THRESHOLD_CPU = float(os.environ.get("THRESHOLD_CPU", "90"))
THRESHOLD_RAM = float(os.environ.get("THRESHOLD_RAM", "95"))
THRESHOLD_DISK_HOMENAS = float(os.environ.get("THRESHOLD_DISK_HOMENAS", "95"))
THRESHOLD_DISK_CAMRAID = float(os.environ.get("THRESHOLD_DISK_CAMRAID", "95"))
THRESHOLD_DISK_VAR = float(os.environ.get("THRESHOLD_DISK_VAR", "90"))
THRESHOLD_UPLOAD_MBPS = float(os.environ.get("THRESHOLD_UPLOAD_MBPS", "5"))
THRESHOLD_SPEEDTEST_STALE_HOURS = float(os.environ.get("THRESHOLD_SPEEDTEST_STALE_HOURS", "2"))
THRESHOLD_CERT_EXPIRY_DAYS = int(os.environ.get("THRESHOLD_CERT_EXPIRY_DAYS", "14"))

# Endpoints to check (home server services only)
PUBLIC_ENDPOINTS = [
    ("camerontora.ca", "https://camerontora.ca"),
]

# State file for alert deduplication (in-memory for Cloud Run, could use Firestore)
_alert_state: dict[str, bool] = {}


def send_discord_alert(title: str, message: str, is_recovery: bool = False):
    """Send alert to Discord webhook."""
    if not DISCORD_WEBHOOK_URL:
        logger.info(f"Discord webhook not configured. Alert: {title} - {message}")
        return

    color = 0x00FF00 if is_recovery else 0xFF0000  # Green for recovery, red for alert

    payload = {
        "embeds": [{
            "title": f"{'✅' if is_recovery else '🚨'} {title}",
            "description": message,
            "color": color,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "footer": {"text": "Home Monitor (GCP Cloud Run)"}
        }]
    }

    try:
        resp = requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info(f"Discord alert sent: {title}")
    except requests.exceptions.RequestException as e:
        logger.info(f"Failed to send Discord alert: {e}")


def alert_with_dedup(key: str, title: str, message: str):
    """Send alert with deduplication - only alert on state change."""
    global _alert_state

    was_failing = _alert_state.get(key, False)

    if not was_failing:
        # New failure
        send_discord_alert(title, message, is_recovery=False)
        _alert_state[key] = True


def recovery_with_dedup(key: str, title: str, message: str):
    """Send recovery notification if previously failing."""
    global _alert_state

    was_failing = _alert_state.get(key, False)

    if was_failing:
        # Recovered from failure
        send_discord_alert(title, message, is_recovery=True)
        _alert_state[key] = False


def check_endpoint(name: str, url: str) -> dict[str, Any]:
    """Check if an endpoint is reachable."""
    try:
        resp = requests.get(url, timeout=15, allow_redirects=True)
        # Accept 2xx and 3xx as "up", also 401 for Plex (requires auth)
        is_up = resp.status_code < 400 or resp.status_code == 401
        return {"name": name, "url": url, "up": is_up, "status_code": resp.status_code}
    except requests.exceptions.Timeout:
        return {"name": name, "url": url, "up": False, "error": "timeout"}
    except requests.exceptions.RequestException as e:
        return {"name": name, "url": url, "up": False, "error": str(e)}


def check_ssl_cert(hostname: str, port: int = 443) -> dict[str, Any]:
    """Check SSL certificate expiry for a hostname."""
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()

        # Parse expiry date
        not_after = cert.get("notAfter")
        if not not_after:
            return {"hostname": hostname, "error": "No expiry date in cert"}

        # Format: 'Apr 12 16:00:18 2026 GMT'
        expiry = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
        expiry = expiry.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        days_remaining = (expiry - now).days

        return {
            "hostname": hostname,
            "expiry": expiry.isoformat(),
            "days_remaining": days_remaining,
            "expiring_soon": days_remaining < THRESHOLD_CERT_EXPIRY_DAYS,
        }
    except socket.timeout:
        return {"hostname": hostname, "error": "Connection timeout"}
    except ssl.SSLError as e:
        return {"hostname": hostname, "error": f"SSL error: {e}"}
    except Exception as e:
        return {"hostname": hostname, "error": str(e)}


def check_health_api() -> dict[str, Any]:
    """Fetch health API and validate metrics."""
    issues = []
    health_data = None

    try:
        headers = {"X-API-Key": HEALTH_API_KEY} if HEALTH_API_KEY else {}
        resp = requests.get(HEALTH_API_URL, headers=headers, timeout=30)
        resp.raise_for_status()
        health_data = resp.json()

        # Check CPU
        cpu = health_data.get("cpu_percent", 0)
        if cpu > THRESHOLD_CPU:
            issues.append(f"CPU at {cpu}% (threshold: {THRESHOLD_CPU}%)")

        # Check RAM
        ram = health_data.get("memory", {}).get("percent", 0)
        if ram > THRESHOLD_RAM:
            issues.append(f"RAM at {ram}% (threshold: {THRESHOLD_RAM}%)")

        # Check disks
        disks = health_data.get("disk", {})
        if disks.get("/HOMENAS", {}).get("percent", 0) > THRESHOLD_DISK_HOMENAS:
            pct = disks["/HOMENAS"]["percent"]
            issues.append(f"/HOMENAS at {pct}% (threshold: {THRESHOLD_DISK_HOMENAS}%)")

        if disks.get("/CAMRAID", {}).get("percent", 0) > THRESHOLD_DISK_CAMRAID:
            pct = disks["/CAMRAID"]["percent"]
            issues.append(f"/CAMRAID at {pct}% (threshold: {THRESHOLD_DISK_CAMRAID}%)")

        if disks.get("/var", {}).get("percent", 0) > THRESHOLD_DISK_VAR:
            pct = disks["/var"]["percent"]
            issues.append(f"/var at {pct}% (threshold: {THRESHOLD_DISK_VAR}%)")

        # Check speed test
        speed_test = health_data.get("speed_test", {})
        if "error" not in speed_test:
            home_speed = speed_test.get("home", {})
            if home_speed:
                upload = home_speed.get("upload", 0)
                if upload < THRESHOLD_UPLOAD_MBPS:
                    issues.append(f"Upload speed {upload} Mbps (threshold: {THRESHOLD_UPLOAD_MBPS} Mbps)")

            # Check if speed test is stale
            timestamp_str = speed_test.get("timestamp")
            if timestamp_str:
                try:
                    test_time = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                    age_hours = (datetime.now(timezone.utc) - test_time).total_seconds() / 3600
                    if age_hours > THRESHOLD_SPEEDTEST_STALE_HOURS:
                        issues.append(f"Speed test is {age_hours:.1f}h old (threshold: {THRESHOLD_SPEEDTEST_STALE_HOURS}h)")
                except ValueError:
                    pass

        # Check Plex status from health API
        plex = health_data.get("plex", {})
        if not plex.get("reachable", False):
            issues.append(f"Plex unreachable: {plex.get('error', 'unknown error')}")
        elif plex.get("library_count", 0) == 0:
            issues.append("Plex has no libraries!")

        return {"reachable": True, "issues": issues, "data": health_data}

    except requests.exceptions.Timeout:
        return {"reachable": False, "error": "Health API timeout"}
    except requests.exceptions.RequestException as e:
        return {"reachable": False, "error": f"Health API error: {e}"}
    except json.JSONDecodeError:
        return {"reachable": False, "error": "Health API returned invalid JSON"}


def check_vpn_health(health_data: dict[str, Any]) -> dict[str, Any]:
    """Check VPN health status from health API data."""
    results = {"checked": False, "locations": []}

    if not health_data:
        return results

    speed_test = health_data.get("speed_test", {})
    if "error" in speed_test or not speed_test:
        return results

    vpn_data = speed_test.get("vpn", {})
    if not vpn_data or not isinstance(vpn_data, dict):
        return results

    results["checked"] = True

    for location, data in vpn_data.items():
        if not isinstance(data, dict):
            continue

        status = data.get("status", "unknown")
        is_active = data.get("active", False)

        location_result = {
            "name": location,
            "status": status,
            "active": is_active,
            "healthy": status == "healthy",
        }
        results["locations"].append(location_result)

        # Alert on unhealthy VPN (but not stopped - that's intentional)
        if status == "unhealthy":
            alert_with_dedup(
                f"vpn_{location.lower()}",
                f"VPN {location} is Unhealthy",
                f"VPN connection to {location} is experiencing issues.\n"
                f"Status: {status}\n"
                f"Active: {'Yes' if is_active else 'No'}"
            )
        elif status in ("healthy", "stopped"):
            recovery_with_dedup(
                f"vpn_{location.lower()}",
                f"VPN {location} Recovered",
                f"VPN connection to {location} is now {status}."
            )

    return results


def check_plex_library() -> dict[str, Any]:
    """Check Plex library directly via external API."""
    if not PLEX_TOKEN:
        return {"checked": False, "error": "No PLEX_TOKEN configured"}

    try:
        headers = {
            "X-Plex-Token": PLEX_TOKEN,
            "Accept": "application/json",
        }
        resp = requests.get(f"{PLEX_URL}/library/sections", headers=headers, timeout=15)
        resp.raise_for_status()

        data = resp.json()
        libraries = []
        for section in data.get("MediaContainer", {}).get("Directory", []):
            libraries.append(section.get("title"))

        return {
            "checked": True,
            "reachable": True,
            "libraries": libraries,
            "library_count": len(libraries),
        }
    except requests.exceptions.RequestException as e:
        return {"checked": True, "reachable": False, "error": str(e)}


def run_health_check() -> dict[str, Any]:
    """Run all health checks and return results."""
    results = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "endpoints": [],
        "health_api": None,
        "vpn": None,
        "plex": None,
        "ssl_cert": None,
        "alerts": [],
        "overall_status": "healthy",
    }

    # Check public endpoints
    for name, url in PUBLIC_ENDPOINTS:
        check = check_endpoint(name, url)
        results["endpoints"].append(check)

        if not check["up"]:
            error_detail = check.get('error') or f"Status: {check.get('status_code', 'N/A')}"
            alert_with_dedup(f"endpoint_{name}", f"{name} is DOWN",
                           f"Endpoint {url} is unreachable.\n{error_detail}")
            results["alerts"].append(f"{name} is down")
            results["overall_status"] = "unhealthy"
        else:
            recovery_with_dedup(f"endpoint_{name}", f"{name} is UP",
                              f"Endpoint {url} is now reachable.")

    # Check health API
    health = check_health_api()
    results["health_api"] = health

    if not health.get("reachable"):
        alert_with_dedup("health_api", "Home Server Unreachable",
                        f"Cannot reach health API.\n{health.get('error', 'Unknown error')}\n\n**This likely means your internet is down!**")
        results["alerts"].append("Health API unreachable")
        results["overall_status"] = "unhealthy"
    else:
        recovery_with_dedup("health_api", "Home Server Back Online",
                          "Health API is now reachable. Internet connection restored.")

        # Check for threshold issues
        for issue in health.get("issues", []):
            alert_with_dedup(f"threshold_{issue[:20]}", "Threshold Alert", issue)
            results["alerts"].append(issue)
            results["overall_status"] = "warning" if results["overall_status"] == "healthy" else results["overall_status"]

        # Check VPN health (from health API data)
        vpn_result = check_vpn_health(health.get("data", {}))
        results["vpn"] = vpn_result

        if vpn_result.get("checked"):
            for loc in vpn_result.get("locations", []):
                if not loc.get("healthy") and loc.get("status") == "unhealthy":
                    results["alerts"].append(f"VPN {loc['name']} unhealthy")
                    results["overall_status"] = "warning" if results["overall_status"] == "healthy" else results["overall_status"]

    # Direct Plex check
    plex = check_plex_library()
    results["plex"] = plex

    if plex.get("checked") and not plex.get("reachable"):
        alert_with_dedup("plex", "Plex Server Unreachable",
                        f"Cannot reach Plex at {PLEX_URL}.\n{plex.get('error', 'Unknown error')}")
        results["alerts"].append("Plex unreachable")
        results["overall_status"] = "unhealthy"
    elif plex.get("checked") and plex.get("reachable"):
        recovery_with_dedup("plex", "Plex Server Back Online",
                          f"Plex is now reachable. Libraries: {', '.join(plex.get('libraries', []))}")

    # Check SSL certificate expiry
    ssl_result = check_ssl_cert("camerontora.ca")
    results["ssl_cert"] = ssl_result

    if ssl_result.get("error"):
        alert_with_dedup("ssl_cert", "SSL Certificate Check Failed",
                        f"Cannot check SSL cert for camerontora.ca.\n{ssl_result['error']}")
    elif ssl_result.get("expiring_soon"):
        days = ssl_result.get("days_remaining", 0)
        alert_with_dedup("ssl_cert_expiry", "SSL Certificate Expiring Soon",
                        f"camerontora.ca SSL certificate expires in **{days} days**.\n"
                        f"Expiry: {ssl_result.get('expiry', 'unknown')}\n\n"
                        f"Run `certbot renew` on home server to renew.")
        results["alerts"].append(f"SSL cert expires in {days} days")
        results["overall_status"] = "warning" if results["overall_status"] == "healthy" else results["overall_status"]
    else:
        recovery_with_dedup("ssl_cert_expiry", "SSL Certificate Renewed",
                          f"camerontora.ca SSL certificate is valid for {ssl_result.get('days_remaining', '?')} more days.")

    return results


@app.route("/")
def index():
    """Root endpoint - just returns service info."""
    return jsonify({
        "service": "home-monitor",
        "version": "1.0.0",
        "endpoints": {
            "/": "This info",
            "/check": "Run health check (triggered by Cloud Scheduler)",
        }
    })


@app.route("/check", methods=["GET", "POST"])
def check():
    """
    Main health check endpoint.
    Called by Cloud Scheduler every 5 minutes.
    """
    logger.info("=== Starting health check ===")
    results = run_health_check()

    # Log detailed results
    for ep in results.get("endpoints", []):
        status_str = "UP" if ep.get("up") else "DOWN"
        logger.info(f"Endpoint {ep['name']}: {status_str}")

    health = results.get("health_api", {})
    if health.get("reachable"):
        data = health.get("data", {})
        logger.info(f"Health API: reachable, CPU={data.get('cpu_percent')}%, RAM={data.get('memory', {}).get('percent')}%")
        for mount, info in data.get("disk", {}).items():
            logger.info(f"  Disk {mount}: {info.get('percent')}%")
    else:
        logger.info(f"Health API: UNREACHABLE - {health.get('error')}")

    vpn = results.get("vpn", {})
    if vpn.get("checked"):
        for loc in vpn.get("locations", []):
            status_str = "HEALTHY" if loc.get("healthy") else loc.get("status", "UNKNOWN").upper()
            active_str = " (active)" if loc.get("active") else ""
            logger.info(f"VPN {loc['name']}: {status_str}{active_str}")

    plex = results.get("plex", {})
    if plex.get("reachable"):
        logger.info(f"Plex: reachable, {plex.get('library_count')} libraries")
    else:
        logger.info(f"Plex: UNREACHABLE - {plex.get('error')}")

    ssl_cert = results.get("ssl_cert", {})
    if ssl_cert.get("error"):
        logger.info(f"SSL cert: ERROR - {ssl_cert['error']}")
    elif ssl_cert.get("days_remaining") is not None:
        status_str = "EXPIRING SOON" if ssl_cert.get("expiring_soon") else "OK"
        logger.info(f"SSL cert: {status_str}, {ssl_cert['days_remaining']} days remaining")

    # Log summary
    status = results["overall_status"]
    alert_count = len(results["alerts"])
    logger.info(f"=== Health check complete: {status}, {alert_count} alerts ===")
    if results["alerts"]:
        logger.info(f"Alerts: {results['alerts']}")

    # Return 200 even if unhealthy (so Cloud Scheduler doesn't retry)
    return jsonify(results)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=True)
