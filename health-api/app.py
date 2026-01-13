#!/usr/bin/env python3
"""
Health API for external monitoring.
Exposes system metrics, Plex status, and speed test results.
Also provides admin endpoints for VPN management (OAuth protected via nginx).
"""

import json
import os
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import docker
import psutil
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

# Note: CORS is handled by nginx for /api/admin/* endpoints

# Configuration
API_KEY = os.environ.get("HEALTH_API_KEY", "")
PLEX_URL = os.environ.get("PLEX_URL", "http://host.docker.internal:32400")
PLEX_TOKEN = os.environ.get("PLEX_TOKEN", "")
SPEEDTEST_FILE = os.environ.get("SPEEDTEST_FILE", "/data/speedtest.json")
HOST_URL = "http://host.docker.internal"

# Admin configuration
ADMIN_EMAILS = os.environ.get("ADMIN_EMAILS", "cameron.tora@gmail.com").split(",")
DOCKER_COMPOSE_FILE = "/docker-services/docker-compose.yaml"
NGINX_TRANSMISSION_CONF = "/nginx-conf/10-protected-services.conf"

# Sonarr/Radarr API configuration for VPN switch port updates
SONARR_API_KEY = os.environ.get("SONARR_API_KEY", "")
SONARR_URL = "http://host.docker.internal:8989"
RADARR_API_KEY = os.environ.get("RADARR_API_KEY", "")
RADARR_URL = "http://host.docker.internal:7878"

# VPN location configuration
VPN_LOCATIONS = {
    "toronto": {"container": "gluetun-toronto", "port": 9091},
    "montreal": {"container": "gluetun-montreal", "port": 9092},
    "vancouver": {"container": "gluetun-vancouver", "port": 9093},
}

# Service checks: map service names to container names and local ports
# These match the services monitored by the status dashboard
SERVICE_CHECKS = [
    {"name": "Main Site", "container": "camerontora_web", "port": 3002},
    {"name": "Plex", "container": "plex", "port": 32400, "path": "/web"},
    {"name": "Haymaker", "container": "haymaker_web_1", "port": 3000},
    {"name": "Watchmap", "container": "watchmap-web", "port": 5080},
    {"name": "Overseerr", "container": "overseerr", "port": 5055},
    {"name": "Ombi", "container": "ombi", "port": 3579},
    {"name": "Radarr", "container": "radarr", "port": 7878},
    {"name": "Sonarr", "container": "sonarr", "port": 8989},
    {"name": "Jackett", "container": "jackett", "port": 9117},
    {"name": "Tautulli", "container": "tautulli", "port": 8181},
    {"name": "Transmission", "container": "transmission", "port": 9091, "path": "/transmission/web/"},
    {"name": "Netdata", "container": "netdata", "port": 19999, "path": "/api/v1/info"},
    {"name": "Health API", "container": "health-api", "port": 5000, "path": "/api/health/ping"},
]

# Disk mounts to monitor (mapped to container paths via /hostfs)
# Format: (display_name, container_path)
MONITORED_DISKS = [
    ("/", "/hostfs/root"),
    ("/home", "/hostfs/home"),
    ("/var", "/hostfs/var"),
    ("/tmp", "/hostfs/tmp"),
    ("/dev (RAM)", "/hostfs/shm"),
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


def parse_mdstat_array(mdstat: str, device: str, name: str, mount_point: str) -> dict:
    """Parse a single array from mdstat output."""
    array = {
        "name": name,
        "device": device,
        "type": "raid5",
        "mount_point": mount_point,
        "mounted": os.path.ismount(f"/hostfs{mount_point}"),
        "status": "unknown",
        "active_devices": 0,
        "total_devices": 0,
        "sync_status": None,
        "rebuild_progress": None,
    }

    # Find the array block - pattern matches mdstat format:
    # md1 : active raid5 sdi[6] sdd[0] ...
    #       109380232192 blocks super 1.2 level 5, 512k chunk, algorithm 2 [8/8] [UUUUUUUU]
    pattern = rf"{device}\s*:\s*active\s+(\w+)\s+.+\n\s+\d+\s+blocks.*\[(\d+)/(\d+)\]\s+\[([U_]+)\]"
    match = re.search(pattern, mdstat)

    if match:
        array["type"] = match.group(1)
        array["total_devices"] = int(match.group(2))
        array["active_devices"] = int(match.group(3))
        array["sync_status"] = f"[{match.group(4)}]"

        # Determine status from sync string
        sync = match.group(4)
        if "_" not in sync:
            array["status"] = "healthy"
        elif sync.count("_") == len(sync):
            array["status"] = "failed"
        else:
            array["status"] = "degraded"

        # Check for rebuild/recovery progress
        rebuild_match = re.search(rf"{device}.*?recovery\s*=\s*([\d.]+)%", mdstat, re.DOTALL)
        if rebuild_match:
            array["status"] = "rebuilding"
            array["rebuild_progress"] = float(rebuild_match.group(1))

    # Add usage if mounted
    if array["mounted"]:
        try:
            usage = psutil.disk_usage(f"/hostfs{mount_point}")
            array["usage_percent"] = round(usage.percent, 1)
        except (OSError, FileNotFoundError):
            pass

    return array


def get_smart_status(device: str) -> dict:
    """Get SMART status for a single drive."""
    result = {
        "device": device,
        "smart_status": "unknown",
        "warnings": [],
    }

    try:
        # Run smartctl -a to get all SMART data
        proc = subprocess.run(
            ["sudo", "smartctl", "-a", f"/dev/{device}"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = proc.stdout

        # Parse overall health status
        if "SMART overall-health self-assessment test result: PASSED" in output:
            result["smart_status"] = "PASSED"
        elif "SMART overall-health self-assessment test result: FAILED" in output:
            result["smart_status"] = "FAILED"
            result["warnings"].append("SMART self-assessment FAILED")

        # Parse model and serial
        model_match = re.search(r"Device Model:\s+(.+)", output)
        serial_match = re.search(r"Serial Number:\s+(.+)", output)
        if model_match:
            result["model"] = model_match.group(1).strip()
        if serial_match:
            result["serial"] = serial_match.group(1).strip()

        # Parse temperature - RAW_VALUE is after the last '-' on the line
        temp_match = re.search(r"Temperature_Celsius.*-\s+(\d+)", output)
        if temp_match:
            result["temperature"] = int(temp_match.group(1))

        # Parse power-on hours - RAW_VALUE is after the last '-'
        hours_match = re.search(r"Power_On_Hours.*-\s+(\d+)", output)
        if hours_match:
            result["power_on_hours"] = int(hours_match.group(1))

        # Parse critical attributes - RAW_VALUE is after '-' at end of line
        # SMART format: ID ATTR_NAME FLAGS VALUE WORST THRESH TYPE UPDATED WHEN_FAILED RAW_VALUE
        attrs = {}
        for attr_name, attr_id in [
            ("reallocated_sectors", "Reallocated_Sector_Ct"),
            ("pending_sectors", "Current_Pending_Sector"),
            ("uncorrectable", "Offline_Uncorrectable"),
            ("spin_retry", "Spin_Retry_Count"),
        ]:
            # Match attribute name followed by everything up to '-' then the RAW_VALUE
            match = re.search(rf"{attr_id}.*-\s+(\d+)", output)
            if match:
                val = int(match.group(1))
                attrs[attr_name] = val
                # Warn on non-zero values for sector-related attributes
                if val > 0 and attr_name in ("reallocated_sectors", "pending_sectors", "uncorrectable"):
                    result["warnings"].append(f"{attr_name}: {val}")

        result["attributes"] = attrs

    except subprocess.TimeoutExpired:
        result["warnings"].append("smartctl timeout")
    except Exception as e:
        result["warnings"].append(f"Error: {str(e)}")

    return result


def get_all_smart_status() -> list:
    """Get SMART status for all RAID drives in md1."""
    drives = []
    try:
        with open("/proc/mdstat", "r") as f:
            mdstat = f.read()

        # Extract drive names from md1 line
        # Format: md1 : active raid5 sdi[6] sdd[0] sdf[4] sde[5] sdj[1] sdc[3] sdh[8] sdg[7]
        match = re.search(r"md1\s*:\s*active\s+\w+\s+(.+)\n", mdstat)
        if match:
            # Parse "sdi[6] sdd[0] sdf[4]..." format
            drive_pattern = re.findall(r"(\w+)\[\d+\]", match.group(1))
            for device in sorted(drive_pattern):
                drives.append(get_smart_status(device))
    except Exception as e:
        app.logger.error(f"Failed to get SMART status: {e}")

    return drives


def get_storage_status():
    """Get RAID array and storage mount status."""
    arrays = []
    overall_status = "healthy"

    # Parse /proc/mdstat for software RAID
    try:
        with open("/proc/mdstat", "r") as f:
            mdstat = f.read()

        # Parse md1 (HOMENAS - Plex media, critical)
        if "md1" in mdstat:
            array = parse_mdstat_array(mdstat, "md1", "HOMENAS", "/HOMENAS")
            arrays.append(array)
            # HOMENAS is critical - propagate its status to overall
            if array["status"] in ("degraded", "failed"):
                overall_status = array["status"]
    except Exception as e:
        app.logger.error(f"Failed to read mdstat: {e}")

    # Check hardware RAID mount (CAMRAID - personal media)
    camraid_mounted = os.path.ismount("/hostfs/CAMRAID")
    camraid = {
        "name": "CAMRAID",
        "device": "sdk",
        "type": "hardware_raid",
        "mount_point": "/CAMRAID",
        "mounted": camraid_mounted,
        "status": "healthy" if camraid_mounted else "unmounted",
    }
    # Add usage if mounted
    if camraid_mounted:
        try:
            usage = psutil.disk_usage("/hostfs/CAMRAID")
            camraid["usage_percent"] = round(usage.percent, 1)
        except (OSError, FileNotFoundError):
            pass
    arrays.append(camraid)

    # Get SMART status for all RAID drives
    drives = get_all_smart_status()

    # Update overall status based on drive health
    if any(d.get("smart_status") == "FAILED" for d in drives):
        overall_status = "failed"
    elif any(d.get("warnings") for d in drives):
        if overall_status == "healthy":
            overall_status = "warning"

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": overall_status,
        "arrays": arrays,
        "drives": drives,
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


def get_docker_client():
    """Get Docker client, or None if unavailable."""
    try:
        return docker.from_env()
    except Exception:
        return None


def check_container_status(container_name: str) -> dict:
    """Check if a Docker container is running and healthy."""
    client = get_docker_client()
    if not client:
        return {"running": None, "error": "Docker unavailable"}

    try:
        container = client.containers.get(container_name)
        status = container.status
        health = container.attrs.get("State", {}).get("Health", {}).get("Status")

        # Get uptime if running
        uptime_seconds = None
        if status == "running":
            started_at = container.attrs.get("State", {}).get("StartedAt")
            if started_at:
                try:
                    # Parse ISO format: 2026-01-13T02:15:00.123456789Z
                    started_str = started_at.split(".")[0]  # Remove nanoseconds
                    if started_str.endswith("Z"):
                        started_str = started_str[:-1]
                    started_dt = datetime.fromisoformat(started_str).replace(tzinfo=timezone.utc)
                    uptime_seconds = int((datetime.now(timezone.utc) - started_dt).total_seconds())
                except Exception:
                    pass  # Skip uptime if parsing fails

        return {
            "running": status == "running",
            "status": status,
            "health": health,  # healthy, unhealthy, starting, or None
            "uptime_seconds": uptime_seconds,
        }
    except docker.errors.NotFound:
        return {"running": False, "status": "not_found"}
    except Exception as e:
        return {"running": None, "error": str(e)[:50]}


def check_local_port(port: int, path: str = "/") -> dict:
    """Check if a service responds on a local port."""
    url = f"{HOST_URL}:{port}{path}"
    try:
        resp = requests.get(url, timeout=5, allow_redirects=True)
        # Accept 2xx, 3xx, and 401 (protected but running)
        is_up = resp.status_code < 400 or resp.status_code == 401
        return {
            "responding": is_up,
            "status_code": resp.status_code,
        }
    except requests.exceptions.Timeout:
        return {"responding": False, "error": "timeout"}
    except requests.exceptions.RequestException as e:
        return {"responding": False, "error": str(e)[:50]}


def get_internal_services() -> list:
    """Check all services internally (container + port)."""
    results = []
    for svc in SERVICE_CHECKS:
        name = svc["name"]
        container = svc["container"]
        port = svc["port"]
        path = svc.get("path", "/")

        container_status = check_container_status(container)
        port_status = check_local_port(port, path)

        results.append({
            "name": name,
            "container": {
                "name": container,
                **container_status,
            },
            "local_port": {
                "port": port,
                **port_status,
            },
        })
    return results


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


@app.route("/api/health/services")
@require_api_key
def services():
    """Check internal service status (container + local port)."""
    return jsonify({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": get_internal_services(),
    })


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
        "storage": get_storage_status(),
    })


@app.route("/")
def root():
    """Root endpoint - list available endpoints."""
    return jsonify({
        "service": "health-api",
        "endpoints": {
            "/api/health": "Full health status (requires API key)",
            "/api/health/ping": "Simple liveness check",
            "/api/health/public-ip": "Public IP address (requires API key)",
            "/api/health/services": "Internal service status - container + local port (requires API key)",
            "/api/admin/whoami": "Check authentication status (OAuth protected)",
            "/api/admin/vpn/status": "Get VPN location status (OAuth protected)",
            "/api/admin/vpn/switch": "Switch VPN location (OAuth protected, POST)",
            "/api/admin/container/restart": "Restart a container (OAuth protected, POST)",
            "/api/admin/server/reboot": "Reboot the server (OAuth protected, POST)",
        }
    })


# ============== ADMIN ENDPOINTS ==============
# These are protected by OAuth via nginx (X-Forwarded-Email header)

def require_admin(f):
    """Decorator to require admin authentication via OAuth."""
    @wraps(f)
    def decorated(*args, **kwargs):
        email = request.headers.get("X-Forwarded-Email", "")
        if not email:
            return jsonify({"error": "Not authenticated"}), 401
        if ADMIN_EMAILS and email not in ADMIN_EMAILS:
            return jsonify({"error": "Not authorized", "email": email}), 403
        return f(*args, **kwargs)
    return decorated


@app.route("/api/admin/whoami")
def admin_whoami():
    """Check authentication status. Returns user email if authenticated."""
    email = request.headers.get("X-Forwarded-Email", "")
    if not email:
        return jsonify({"authenticated": False}), 401

    is_admin = email in ADMIN_EMAILS if ADMIN_EMAILS else True
    return jsonify({
        "authenticated": True,
        "email": email,
        "is_admin": is_admin,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/api/admin/vpn/status")
@require_admin
def admin_vpn_status():
    """Get current VPN status - which location is active and health of all locations."""
    client = get_docker_client()
    if not client:
        return jsonify({"error": "Docker unavailable"}), 500

    # Determine which gluetun container transmission is using
    active_location = None
    try:
        transmission = client.containers.get("transmission")
        network_mode = transmission.attrs.get("HostConfig", {}).get("NetworkMode", "")

        # Network mode is "container:<id>" - get the container name
        if network_mode.startswith("container:"):
            container_id = network_mode.replace("container:", "")
            try:
                vpn_container = client.containers.get(container_id)
                vpn_name = vpn_container.name
                # Map container name to location
                for loc, config in VPN_LOCATIONS.items():
                    if config["container"] == vpn_name:
                        active_location = loc
                        break
            except docker.errors.NotFound:
                # VPN container was removed/recreated
                active_location = "unknown"
    except docker.errors.NotFound:
        pass  # Transmission not running

    # Get health status of all VPN containers
    # Note: gluetun's Docker health check is unreliable, so we check:
    # 1. Container is running
    # 2. Speed test data (if available) shows it's working
    speedtest_data = get_speedtest_results()
    vpn_speedtest = speedtest_data.get("vpn", {}) if isinstance(speedtest_data, dict) else {}

    locations = []
    for loc, config in VPN_LOCATIONS.items():
        container_name = config["container"]
        try:
            container = client.containers.get(container_name)
            status = container.status
            health = container.attrs.get("State", {}).get("Health", {}).get("Status")
            is_running = status == "running"

            # Check speed test data for actual VPN health
            speedtest_status = None
            for vpn_name, vpn_data in vpn_speedtest.items():
                if vpn_name.lower() == loc.lower():
                    speedtest_status = vpn_data.get("status")
                    break

            # Healthy if running AND (speedtest says healthy OR no speedtest data)
            is_healthy = is_running and speedtest_status in ("healthy", None)
        except docker.errors.NotFound:
            status = "not_found"
            health = None
            is_running = False
            is_healthy = False
            speedtest_status = None

        locations.append({
            "name": loc,
            "container": container_name,
            "port": config["port"],
            "status": status,
            "docker_health": health,
            "speedtest_status": speedtest_status,
            "healthy": is_healthy,
            "active": loc == active_location,
        })

    return jsonify({
        "active_location": active_location,
        "locations": locations,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def update_arr_download_client_port(app_name: str, api_url: str, api_key: str, new_port: int) -> dict:
    """Update the Transmission download client port in Sonarr/Radarr.

    Returns dict with 'success' bool and 'message' or 'error'.
    """
    if not api_key:
        return {"success": False, "error": f"No API key configured for {app_name}"}

    headers = {"X-Api-Key": api_key}

    try:
        # Get current download clients
        resp = requests.get(f"{api_url}/api/v3/downloadclient", headers=headers, timeout=10)
        resp.raise_for_status()
        clients = resp.json()

        # Find Transmission client
        transmission_client = None
        for client in clients:
            if client.get("implementation") == "Transmission":
                transmission_client = client
                break

        if not transmission_client:
            return {"success": False, "error": f"No Transmission client found in {app_name}"}

        # Update the port in the fields array
        for field in transmission_client.get("fields", []):
            if field.get("name") == "port":
                field["value"] = new_port
                break

        # PUT the updated client
        client_id = transmission_client["id"]
        resp = requests.put(
            f"{api_url}/api/v3/downloadclient/{client_id}",
            headers=headers,
            json=transmission_client,
            timeout=10
        )
        resp.raise_for_status()

        return {"success": True, "message": f"Updated {app_name} Transmission port to {new_port}"}

    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"{app_name} API error: {str(e)}"}


@app.route("/api/admin/vpn/switch", methods=["POST"])
@require_admin
def admin_vpn_switch():
    """Switch VPN location for Transmission."""
    data = request.get_json() or {}
    target = data.get("location", "").lower()

    if target not in VPN_LOCATIONS:
        return jsonify({
            "error": f"Invalid location: {target}",
            "valid_locations": list(VPN_LOCATIONS.keys())
        }), 400

    target_config = VPN_LOCATIONS[target]
    target_container = target_config["container"]
    target_port = target_config["port"]

    email = request.headers.get("X-Forwarded-Email", "unknown")
    steps_completed = []

    try:
        # Step 1: Update docker-compose.yaml
        if not Path(DOCKER_COMPOSE_FILE).exists():
            return jsonify({"error": f"Docker compose file not found: {DOCKER_COMPOSE_FILE}"}), 500

        with open(DOCKER_COMPOSE_FILE, "r") as f:
            compose_content = f.read()

        # Update network_mode line
        new_content = re.sub(
            r'network_mode:\s*"service:gluetun-\w+"',
            f'network_mode: "service:{target_container}"',
            compose_content
        )

        # Update depends_on line for transmission
        new_content = re.sub(
            r'(transmission:.*?depends_on:\s*\n\s*-\s*)gluetun-\w+',
            f'\\1{target_container}',
            new_content,
            flags=re.DOTALL
        )

        with open(DOCKER_COMPOSE_FILE, "w") as f:
            f.write(new_content)
        steps_completed.append("Updated docker-compose.yaml")

        # Step 2: Recreate transmission container using docker commands
        # (docker-compose has project context issues when run from container)

        # Stop and remove existing transmission
        subprocess.run(["docker", "stop", "transmission"], capture_output=True, timeout=30)
        subprocess.run(["docker", "rm", "transmission"], capture_output=True, timeout=30)

        # Run docker-compose up on the HOST via docker exec
        # This ensures correct project context
        result = subprocess.run(
            ["docker", "exec", "docker-services-helper",
             "docker-compose", "-f", "/docker-services/docker-compose.yaml",
             "--project-name", "docker-services", "up", "-d", "transmission"],
            capture_output=True,
            text=True,
            timeout=60
        )

        # Fallback: if helper container doesn't exist, try direct docker run
        if result.returncode != 0:
            # Get the target gluetun container ID
            gluetun_result = subprocess.run(
                ["docker", "inspect", target_container, "--format", "{{.Id}}"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if gluetun_result.returncode != 0:
                return jsonify({
                    "error": f"Target VPN container {target_container} not found",
                    "steps_completed": steps_completed
                }), 500

            gluetun_id = gluetun_result.stdout.strip()

            # Run transmission with docker run
            run_result = subprocess.run([
                "docker", "run", "-d",
                "--name", "transmission",
                "--network", f"container:{gluetun_id}",
                "-e", "PUID=1000",
                "-e", "PGID=1000",
                "-e", "USER=camerontora",
                "-v", "/home/camerontora/docker-services/transmission/config:/config",
                "-v", "/HOMENAS:/HOMENAS",
                "--restart", "unless-stopped",
                "linuxserver/transmission"
            ], capture_output=True, text=True, timeout=60)

            if run_result.returncode != 0:
                return jsonify({
                    "error": "Failed to start transmission container",
                    "stderr": run_result.stderr,
                    "steps_completed": steps_completed
                }), 500

        steps_completed.append("Recreated transmission container")

        # Step 3: Update nginx config
        if not Path(NGINX_TRANSMISSION_CONF).exists():
            return jsonify({"error": f"Nginx config not found: {NGINX_TRANSMISSION_CONF}"}), 500

        with open(NGINX_TRANSMISSION_CONF, "r") as f:
            nginx_content = f.read()

        # Update ALL transmission proxy_pass ports within the TRANSMISSION block
        # The block runs from "# ============== TRANSMISSION ==============" to the next "# =============="
        def update_transmission_block(match):
            block = match.group(0)
            # Replace all proxy_pass host.docker.internal ports in this block
            updated = re.sub(
                r'(proxy_pass http://host\.docker\.internal:)\d+',
                f'\\g<1>{target_port}',
                block
            )
            # Update/add the VPN comment on the main proxy_pass line
            updated = re.sub(
                r'(proxy_pass http://host\.docker\.internal:\d+;)\s*(#.*VPN)?',
                f'\\1  # {target.capitalize()} VPN',
                updated
            )
            return updated

        new_nginx = re.sub(
            r'# ============== TRANSMISSION ==============.*?(?=# ==============|\Z)',
            update_transmission_block,
            nginx_content,
            flags=re.DOTALL
        )

        with open(NGINX_TRANSMISSION_CONF, "w") as f:
            f.write(new_nginx)
        steps_completed.append("Updated nginx config")

        # Step 4: Reload nginx
        result = subprocess.run(
            ["docker", "exec", "nginx-proxy", "nginx", "-s", "reload"],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode != 0:
            return jsonify({
                "error": "Failed to reload nginx",
                "stderr": result.stderr,
                "steps_completed": steps_completed
            }), 500
        steps_completed.append("Reloaded nginx")

        # Step 5: Update speedtest.json to reflect new active VPN immediately
        try:
            speedtest_path = Path(SPEEDTEST_FILE)
            if speedtest_path.exists():
                with open(speedtest_path, "r") as f:
                    speedtest_data = json.load(f)

                # Update active flags for all VPN locations
                if "vpn" in speedtest_data:
                    for vpn_name, vpn_data in speedtest_data["vpn"].items():
                        vpn_data["active"] = vpn_name.lower() == target.lower()

                    with open(speedtest_path, "w") as f:
                        json.dump(speedtest_data, f, indent=2)
                    steps_completed.append("Updated speedtest.json active status")
        except Exception as e:
            # Non-fatal - speedtest will update on next run
            steps_completed.append(f"Note: Could not update speedtest.json: {e}")

        # Step 6: Update Sonarr/Radarr download client ports
        sonarr_result = update_arr_download_client_port("Sonarr", SONARR_URL, SONARR_API_KEY, target_port)
        if sonarr_result["success"]:
            steps_completed.append(sonarr_result["message"])
        else:
            steps_completed.append(f"Note: {sonarr_result['error']}")

        radarr_result = update_arr_download_client_port("Radarr", RADARR_URL, RADARR_API_KEY, target_port)
        if radarr_result["success"]:
            steps_completed.append(radarr_result["message"])
        else:
            steps_completed.append(f"Note: {radarr_result['error']}")

        return jsonify({
            "success": True,
            "message": f"Switched VPN to {target}",
            "new_location": target,
            "new_port": target_port,
            "steps_completed": steps_completed,
            "switched_by": email,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    except subprocess.TimeoutExpired:
        return jsonify({
            "error": "Command timed out",
            "steps_completed": steps_completed
        }), 500
    except Exception as e:
        return jsonify({
            "error": str(e),
            "steps_completed": steps_completed
        }), 500


def _do_container_restart(container_name: str, email: str):
    """Background task to restart a container."""
    try:
        result = subprocess.run(
            ["docker", "restart", container_name],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode != 0:
            app.logger.error(f"Container restart failed: {container_name} by {email}: {result.stderr}")
        else:
            app.logger.info(f"Container restarted: {container_name} by {email}")
    except Exception as e:
        app.logger.error(f"Container restart exception: {container_name} by {email}: {e}")


@app.route("/api/admin/container/restart", methods=["POST"])
@require_admin
def admin_container_restart():
    """Restart a Docker container (async - returns immediately)."""
    data = request.get_json() or {}
    container_name = data.get("container", "").strip()

    if not container_name:
        return jsonify({"error": "container name required"}), 400

    # Build allowed container list from SERVICE_CHECKS and VPN_LOCATIONS
    allowed_containers = set()
    for svc in SERVICE_CHECKS:
        allowed_containers.add(svc["container"])
    for config in VPN_LOCATIONS.values():
        allowed_containers.add(config["container"])

    # Don't allow restarting health-api itself
    allowed_containers.discard("health-api")

    if container_name not in allowed_containers:
        return jsonify({
            "error": f"Container '{container_name}' not in allowed list",
            "allowed": sorted(allowed_containers)
        }), 400

    email = request.headers.get("X-Forwarded-Email", "unknown")

    # Start restart in background thread and return immediately
    thread = threading.Thread(target=_do_container_restart, args=(container_name, email))
    thread.daemon = True
    thread.start()

    # Return immediately - frontend will refresh status to see result
    return jsonify({
        "success": True,
        "status": "restarting",
        "message": f"Container '{container_name}' restart initiated",
        "container": container_name,
        "restarted_by": email,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def _do_server_reboot(email: str):
    """Background task to reboot the server."""
    app.logger.warning(f"SERVER REBOOT executing in 2 seconds (initiated by {email})")
    time.sleep(2)  # Give time for HTTP response to be sent
    subprocess.run(["sudo", "reboot"], check=False)


@app.route("/api/admin/server/reboot", methods=["POST"])
@require_admin
def admin_server_reboot():
    """Initiate server reboot. Returns immediately, server reboots after 2 seconds."""
    email = request.headers.get("X-Forwarded-Email", "unknown")

    # Log the reboot request
    app.logger.warning(f"SERVER REBOOT initiated by {email}")

    # Execute reboot in background thread (returns immediately)
    thread = threading.Thread(target=_do_server_reboot, args=(email,))
    thread.daemon = True
    thread.start()

    return jsonify({
        "success": True,
        "status": "rebooting",
        "message": "Server reboot initiated. System will be offline for ~60-90 seconds.",
        "initiated_by": email,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
