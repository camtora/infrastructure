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
)

logger = logging.getLogger(__name__)

# Cache DNS state
_dns_cache: dict[str, Any] = {}
_dns_last_check: datetime | None = None


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

        result = {
            "domain": GODADDY_DOMAIN,
            "current_ip": current_ip,
            "target": target,
            "home_ip": current_ip if target == "home" else None,
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
        return {"error": str(e)[:100]}


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
            # For home, we need the home IP - if we're currently on GCP,
            # we might not know the home IP. This should be stored/configured.
            # For now, return error if we don't have it
            if current.get("target") == "gcp":
                return {
                    "success": False,
                    "error": "Cannot determine home IP - currently on GCP. Please configure HOME_IP.",
                }
            new_ip = previous_ip  # Already on home

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
