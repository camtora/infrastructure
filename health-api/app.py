#!/usr/bin/env python3
"""
Health API for external monitoring.
Exposes system metrics, Plex status, and speed test results.
"""

import json
import os
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import psutil
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

# Configuration
API_KEY = os.environ.get("HEALTH_API_KEY", "")
PLEX_URL = os.environ.get("PLEX_URL", "http://host.docker.internal:32400")
PLEX_TOKEN = os.environ.get("PLEX_TOKEN", "")
SPEEDTEST_FILE = os.environ.get("SPEEDTEST_FILE", "/data/speedtest.json")

# Disk mounts to monitor (mapped to container paths via /hostfs)
# Format: (display_name, container_path)
MONITORED_DISKS = [
    ("/", "/hostfs/root"),
    ("/home", "/hostfs/home"),
    ("/var", "/hostfs/var"),
    ("/CAMRAID", "/hostfs/CAMRAID"),
    ("/HOMENAS", "/hostfs/HOMENAS"),
]


def require_api_key(f):
    """Decorator to require API key authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not API_KEY:
            # No API key configured, allow access (for initial setup)
            return f(*args, **kwargs)

        provided_key = request.headers.get("X-API-Key", "")
        if provided_key != API_KEY:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


def get_cpu_percent():
    """Get CPU usage percentage (averaged over 1 second)."""
    return psutil.cpu_percent(interval=1)


def get_memory_info():
    """Get memory usage information."""
    mem = psutil.virtual_memory()
    return {
        "percent": mem.percent,
        "used_gb": round(mem.used / (1024**3), 1),
        "total_gb": round(mem.total / (1024**3), 1),
        "available_gb": round(mem.available / (1024**3), 1),
    }


def get_disk_info():
    """Get disk usage for monitored mounts."""
    disks = {}
    for display_name, container_path in MONITORED_DISKS:
        try:
            usage = psutil.disk_usage(container_path)
            disks[display_name] = {
                "percent": usage.percent,
                "used_gb": round(usage.used / (1024**3), 1),
                "total_gb": round(usage.total / (1024**3), 1),
                "free_gb": round(usage.free / (1024**3), 1),
            }
        except (FileNotFoundError, PermissionError, OSError):
            # Mount doesn't exist or not accessible
            pass
    return disks


def get_plex_status():
    """Check Plex server status and library info."""
    if not PLEX_TOKEN:
        return {"reachable": False, "error": "No PLEX_TOKEN configured"}

    try:
        # Get library sections
        headers = {
            "X-Plex-Token": PLEX_TOKEN,
            "Accept": "application/json",
        }
        resp = requests.get(
            f"{PLEX_URL}/library/sections",
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()

        data = resp.json()
        libraries = []
        for section in data.get("MediaContainer", {}).get("Directory", []):
            libraries.append({
                "title": section.get("title"),
                "type": section.get("type"),
                "key": section.get("key"),
            })

        return {
            "reachable": True,
            "libraries": [lib["title"] for lib in libraries],
            "library_count": len(libraries),
            "library_details": libraries,
        }
    except requests.exceptions.Timeout:
        return {"reachable": False, "error": "Timeout connecting to Plex"}
    except requests.exceptions.RequestException as e:
        return {"reachable": False, "error": str(e)}
    except Exception as e:
        return {"reachable": False, "error": f"Unexpected error: {e}"}


def get_speedtest_results():
    """Read speed test results from file."""
    try:
        path = Path(SPEEDTEST_FILE)
        if not path.exists():
            return {"error": "No speed test results available"}

        with open(path) as f:
            data = json.load(f)

        return data
    except json.JSONDecodeError:
        return {"error": "Invalid speed test data"}
    except Exception as e:
        return {"error": str(e)}


def get_load_average():
    """Get system load averages."""
    load1, load5, load15 = psutil.getloadavg()
    cpu_count = psutil.cpu_count()
    return {
        "load_1m": round(load1, 2),
        "load_5m": round(load5, 2),
        "load_15m": round(load15, 2),
        "cpu_count": cpu_count,
        "load_percent_1m": round((load1 / cpu_count) * 100, 1),
    }


def get_public_ip():
    """Get public IP address using external service."""
    services = [
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
        "https://icanhazip.com",
    ]
    for service in services:
        try:
            resp = requests.get(service, timeout=5)
            resp.raise_for_status()
            ip = resp.text.strip()
            if ip:
                return {"ip": ip, "source": service}
        except requests.exceptions.RequestException:
            continue
    return {"error": "Could not determine public IP"}


@app.route("/api/health/ping")
def ping():
    """Simple liveness check - no auth required."""
    return jsonify({"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()})


@app.route("/api/health/public-ip")
@require_api_key
def public_ip():
    """Get public IP address - for DNS failback."""
    result = get_public_ip()
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    return jsonify(result)


@app.route("/api/health")
@require_api_key
def health():
    """Full health status endpoint."""
    return jsonify({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cpu_percent": get_cpu_percent(),
        "load": get_load_average(),
        "memory": get_memory_info(),
        "disk": get_disk_info(),
        "plex": get_plex_status(),
        "speed_test": get_speedtest_results(),
    })


@app.route("/")
def root():
    """Root endpoint - redirect to health check."""
    return jsonify({
        "service": "health-api",
        "endpoints": {
            "/api/health": "Full health status (requires API key)",
            "/api/health/ping": "Simple liveness check",
            "/api/health/public-ip": "Public IP address (requires API key)",
        }
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
