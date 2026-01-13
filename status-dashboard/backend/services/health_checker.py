"""Health checking service - adapted from gcp-monitor."""

import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

import requests

from backend.config import SERVICES, HEALTH_API_URL, HEALTH_API_KEY, PLEX_URL, PLEX_TOKEN

logger = logging.getLogger(__name__)

# In-memory cache for status data
_status_cache: dict[str, Any] = {}
_last_check: datetime | None = None


def check_endpoint(name: str, url: str, timeout: int = 15) -> dict[str, Any]:
    """Check if an endpoint is reachable."""
    start_time = time.time()
    try:
        resp = requests.get(url, timeout=timeout, allow_redirects=True)
        response_time = int((time.time() - start_time) * 1000)
        # Accept 2xx, 3xx, and 401 (protected but reachable)
        is_up = resp.status_code < 400 or resp.status_code == 401
        return {
            "name": name,
            "url": url,
            "status": "up" if is_up else "down",
            "status_code": resp.status_code,
            "response_time_ms": response_time,
            "last_check": datetime.now(timezone.utc).isoformat(),
        }
    except requests.exceptions.Timeout:
        return {
            "name": name,
            "url": url,
            "status": "down",
            "error": "timeout",
            "response_time_ms": timeout * 1000,
            "last_check": datetime.now(timezone.utc).isoformat(),
        }
    except requests.exceptions.RequestException as e:
        return {
            "name": name,
            "url": url,
            "status": "down",
            "error": str(e)[:100],
            "response_time_ms": None,
            "last_check": datetime.now(timezone.utc).isoformat(),
        }


def check_health_api() -> dict[str, Any]:
    """Fetch health API data from home server."""
    try:
        headers = {"X-API-Key": HEALTH_API_KEY} if HEALTH_API_KEY else {}
        resp = requests.get(HEALTH_API_URL, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return {
            "reachable": True,
            "data": data,
        }
    except requests.exceptions.Timeout:
        return {"reachable": False, "error": "timeout"}
    except requests.exceptions.RequestException as e:
        return {"reachable": False, "error": str(e)[:100]}
    except Exception as e:
        return {"reachable": False, "error": str(e)[:100]}


def fetch_internal_services() -> dict[str, Any]:
    """Fetch internal service status from health-api."""
    try:
        headers = {"X-API-Key": HEALTH_API_KEY} if HEALTH_API_KEY else {}
        base_url = HEALTH_API_URL.replace("/api/health", "")
        resp = requests.get(
            f"{base_url}/api/health/services",
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        # Convert to dict keyed by service name for easy lookup
        return {
            svc["name"]: {
                "container_name": svc["container"].get("name"),
                "container_running": svc["container"]["running"],
                "container_health": svc["container"].get("health"),
                "container_uptime": svc["container"].get("uptime_seconds"),
                "port_responding": svc["local_port"]["responding"],
                "port_status_code": svc["local_port"].get("status_code"),
            }
            for svc in data.get("services", [])
        }
    except requests.exceptions.RequestException:
        return {}
    except Exception:
        return {}


def check_plex_library() -> dict[str, Any]:
    """Check Plex library directly."""
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
        return {"checked": True, "reachable": False, "error": str(e)[:100]}


def run_health_check() -> dict[str, Any]:
    """Run all health checks and return aggregated status."""
    global _status_cache, _last_check

    results = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": [],
        "metrics": None,
        "plex": None,
        "home_server_reachable": False,
        "overall_status": "healthy",
    }

    # Fetch internal service status (container + local port)
    internal_status = fetch_internal_services()

    # Check all services externally in parallel (prevents timeout cascade)
    down_count = 0
    service_checks = {}

    with ThreadPoolExecutor(max_workers=len(SERVICES)) as executor:
        futures = {
            executor.submit(check_endpoint, svc["name"], svc["url"]): svc
            for svc in SERVICES
        }
        for future in as_completed(futures):
            svc = futures[future]
            check = future.result()
            check["category"] = svc.get("category", "unknown")
            service_checks[svc["name"]] = check

    # Merge with internal status and build results (preserve SERVICES order)
    for service in SERVICES:
        check = service_checks[service["name"]]
        internal = internal_status.get(service["name"], {})
        if internal:
            check["internal"] = {
                "container_name": internal.get("container_name"),
                "container_running": internal.get("container_running"),
                "container_health": internal.get("container_health"),
                "container_uptime": internal.get("container_uptime"),
                "port_responding": internal.get("port_responding"),
            }
        else:
            check["internal"] = None

        results["services"].append(check)
        if check["status"] != "up":
            down_count += 1

    # Check health API for metrics
    health = check_health_api()
    if health.get("reachable"):
        results["home_server_reachable"] = True
        data = health.get("data", {})

        # Convert disk dict to array for frontend
        # Health API returns *_gb fields, convert to bytes for frontend
        disk_data = data.get("disk", {})
        disks_array = []
        for mount, info in disk_data.items():
            disks_array.append({
                "mount": mount,
                "total": info.get("total_gb", 0) * (1024**3) if info.get("total_gb") else None,
                "used": info.get("used_gb", 0) * (1024**3) if info.get("used_gb") else None,
                "free": info.get("free_gb", 0) * (1024**3) if info.get("free_gb") else None,
                "percent": info.get("percent"),
            })

        results["metrics"] = {
            "cpu": {"percent": data.get("cpu_percent")},
            "memory": {"percent": data.get("memory", {}).get("percent")},
            "load": {
                "load_1m": data.get("load", {}).get("load_1m"),
                "load_5m": data.get("load", {}).get("load_5m"),
                "cpu_count": data.get("load", {}).get("cpu_count", 4),
            },
            "disks": disks_array,
            "speed_test": data.get("speed_test"),
            "storage": data.get("storage"),
        }
        # Include Plex from health API
        results["plex"] = data.get("plex")
    else:
        # Try direct Plex check
        results["plex"] = check_plex_library()

    # Determine overall status
    if not results["home_server_reachable"]:
        results["overall_status"] = "unhealthy"
    elif down_count > 3:
        results["overall_status"] = "unhealthy"
    elif down_count > 0:
        results["overall_status"] = "degraded"
    else:
        results["overall_status"] = "healthy"

    # Cache results
    _status_cache = results
    _last_check = datetime.now(timezone.utc)

    return results


def get_cached_status() -> dict[str, Any]:
    """Get cached status or run new check if cache is stale."""
    global _status_cache, _last_check

    # If no cache or cache older than 1 minute, run new check
    if _last_check is None:
        return run_health_check()

    age = (datetime.now(timezone.utc) - _last_check).total_seconds()
    if age > 60:
        return run_health_check()

    return _status_cache


def get_status_summary() -> dict[str, Any]:
    """Get a summary suitable for the API response."""
    status = get_cached_status()

    # Count services by status
    up_count = sum(1 for s in status["services"] if s["status"] == "up")
    total_count = len(status["services"])

    return {
        **status,
        "summary": {
            "services_up": up_count,
            "services_total": total_count,
            "uptime_percent": round((up_count / total_count) * 100, 1) if total_count > 0 else 0,
        }
    }
