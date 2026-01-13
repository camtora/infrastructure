"""GoDaddy DNS management service."""

import logging
from datetime import datetime, timezone
from typing import Any

import requests

from backend.config import (
    GODADDY_API_KEY,
    GODADDY_API_SECRET,
    GODADDY_DOMAIN,
    DNS_RECORDS,
    GCP_IP,
    HEALTH_API_URL,
    HEALTH_API_KEY,
)

logger = logging.getLogger(__name__)

# Cache DNS state
_dns_cache: dict[str, Any] = {}
_dns_last_check: datetime | None = None
_home_ip_cache: str | None = None
_home_ip_last_check: datetime | None = None


def _get_auth_header() -> dict[str, str]:
    """Get GoDaddy authorization header."""
    return {
        "Authorization": f"sso-key {GODADDY_API_KEY}:{GODADDY_API_SECRET}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def get_dns_records() -> dict[str, Any]:
    """Fetch current A records from GoDaddy."""
    global _dns_cache, _dns_last_check

    if not GODADDY_API_KEY or not GODADDY_API_SECRET:
        return {"error": "GoDaddy API credentials not configured"}

    try:
        resp = requests.get(
            f"https://api.godaddy.com/v1/domains/{GODADDY_DOMAIN}/records/A",
            headers=_get_auth_header(),
            timeout=15,
        )
        resp.raise_for_status()
        records = resp.json()

        # Find the current IP (from @ record or first record)
        current_ip = None
        for record in records:
            if record.get("name") == "@":
                current_ip = record.get("data")
                break
        if not current_ip and records:
            current_ip = records[0].get("data")

        # Determine target
        target = "gcp" if current_ip == GCP_IP else "home"

        # Always get home IP - if we're on home, use current_ip; if on GCP, fetch from health-api
        if target == "home":
            home_ip = current_ip
        else:
            home_result = _get_home_ip(use_cache=True)
            home_ip = home_result.get("ip")  # May be None if fetch failed

        result = {
            "domain": GODADDY_DOMAIN,
            "current_ip": current_ip,
            "target": target,
            "home_ip": home_ip,
            "gcp_ip": GCP_IP,
            "records": [r.get("name") for r in records],
            "record_count": len(records),
            "last_check": datetime.now(timezone.utc).isoformat(),
        }

        # Cache result
        _dns_cache = result
        _dns_last_check = datetime.now(timezone.utc)

        return result

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch DNS records: {e}")

        # Return mock data when GoDaddy is unavailable (rate limited, etc.)
        # This allows the UI to be tested while waiting for API access
        home_result = _get_home_ip(use_cache=True)
        home_ip = home_result.get("ip", "Unknown")

        return {
            "domain": GODADDY_DOMAIN,
            "current_ip": home_ip,  # Assume we're on home when can't check
            "target": "home",
            "home_ip": home_ip,
            "gcp_ip": GCP_IP or "192.178.192.121",
            "records": DNS_RECORDS,
            "record_count": len(DNS_RECORDS),
            "last_check": datetime.now(timezone.utc).isoformat(),
            "mock_data": True,
            "api_error": str(e)[:100],
        }


def get_cached_dns_state() -> dict[str, Any]:
    """Get cached DNS state or fetch fresh if stale."""
    global _dns_cache, _dns_last_check

    # Cache for 10 minutes to minimize API calls (GoDaddy has strict rate limits)
    if _dns_last_check is not None:
        age = (datetime.now(timezone.utc) - _dns_last_check).total_seconds()
        if age < 600 and _dns_cache:
            return _dns_cache

    result = get_dns_records()

    # If we hit rate limit but have cached data, return cached data
    if "error" in result and "429" in str(result.get("error", "")) and _dns_cache:
        logger.warning("GoDaddy rate limit hit, returning cached DNS state")
        return {**_dns_cache, "cached": True, "cache_age_seconds": age if _dns_last_check else 0}

    return result


def _get_home_ip(use_cache: bool = True) -> dict[str, Any]:
    """Fetch current public IP from home server via health-api."""
    global _home_ip_cache, _home_ip_last_check

    # Check cache first (5 minute cache for home IP)
    if use_cache and _home_ip_cache and _home_ip_last_check:
        age = (datetime.now(timezone.utc) - _home_ip_last_check).total_seconds()
        if age < 300:
            return {"ip": _home_ip_cache, "cached": True}

    if not HEALTH_API_KEY:
        return {"error": "HEALTH_API_KEY not configured"}

    try:
        # Use the base URL but call the public-ip endpoint
        base_url = HEALTH_API_URL.replace("/api/health", "")
        resp = requests.get(
            f"{base_url}/api/health/public-ip",
            headers={"X-API-Key": HEALTH_API_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        if "error" in data:
            return {"error": data["error"]}

        ip = data.get("ip")
        if ip:
            _home_ip_cache = ip
            _home_ip_last_check = datetime.now(timezone.utc)

        return {"ip": ip}

    except requests.exceptions.RequestException as e:
        # Return cached IP if available
        if _home_ip_cache:
            return {"ip": _home_ip_cache, "cached": True, "fetch_error": str(e)[:50]}
        return {"error": f"Failed to reach home server: {str(e)[:50]}"}


def failover_dns(target: str, reason: str = "") -> dict[str, Any]:
    """
    Failover DNS to home or GCP.

    Args:
        target: "home" or "gcp"
        reason: Optional reason for the failover

    Returns:
        Result of the failover operation
    """
    if not GODADDY_API_KEY or not GODADDY_API_SECRET:
        return {"success": False, "error": "GoDaddy API credentials not configured"}

    if target not in ("home", "gcp"):
        return {"success": False, "error": f"Invalid target: {target}"}

    if target == "gcp" and not GCP_IP:
        return {"success": False, "error": "GCP_IP not configured"}

    try:
        # First, get current state
        current = get_dns_records()
        if "error" in current:
            return {"success": False, "error": current["error"]}

        previous_ip = current.get("current_ip")

        # Determine new IP
        if target == "gcp":
            new_ip = GCP_IP
        else:
            # For home, fetch current public IP from health-api
            home_result = _get_home_ip()
            if "error" in home_result:
                return {
                    "success": False,
                    "error": f"Cannot get home IP: {home_result['error']}. Is the home server reachable?",
                }
            new_ip = home_result["ip"]

        if new_ip == previous_ip:
            return {
                "success": True,
                "message": f"Already pointing to {target}",
                "previous_ip": previous_ip,
                "new_ip": new_ip,
                "records_updated": 0,
            }

        # Build payload for all records
        payload = [
            {"name": name, "type": "A", "data": new_ip, "ttl": 600}
            for name in DNS_RECORDS
        ]

        # Update DNS
        resp = requests.put(
            f"https://api.godaddy.com/v1/domains/{GODADDY_DOMAIN}/records/A",
            headers=_get_auth_header(),
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()

        # Clear cache
        global _dns_cache, _dns_last_check
        _dns_cache = {}
        _dns_last_check = None

        logger.info(f"DNS failover to {target}: {previous_ip} -> {new_ip}")

        return {
            "success": True,
            "target": target,
            "previous_ip": previous_ip,
            "new_ip": new_ip,
            "records_updated": len(DNS_RECORDS),
            "reason": reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except requests.exceptions.RequestException as e:
        logger.error(f"DNS failover failed: {e}")
        return {"success": False, "error": str(e)[:100]}
