"""Discord notification service."""

import logging
from datetime import datetime, timezone

import requests

from config import DISCORD_WEBHOOK_URL

logger = logging.getLogger(__name__)


def send_discord_alert(title: str, message: str, is_recovery: bool = False) -> bool:
    """Send alert to Discord webhook."""
    if not DISCORD_WEBHOOK_URL:
        logger.info(f"Discord webhook not configured. Alert: {title} - {message}")
        return False

    color = 0x00FF00 if is_recovery else 0xFF0000  # Green for recovery, red for alert

    payload = {
        "embeds": [{
            "title": f"{'✅' if is_recovery else '🚨'} {title}",
            "description": message,
            "color": color,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "footer": {"text": "Status Dashboard (GCP)"}
        }]
    }

    try:
        resp = requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info(f"Discord alert sent: {title}")
        return True
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to send Discord alert: {e}")
        return False


def notify_failover(target: str, previous_ip: str, new_ip: str, reason: str = "") -> bool:
    """Send DNS failover notification to Discord."""
    if target == "gcp":
        title = "DNS Failover Activated"
        message = f"Traffic is now routing to GCP.\n\n**Previous IP:** {previous_ip}\n**New IP:** {new_ip}"
        if reason:
            message += f"\n**Reason:** {reason}"
        message += "\n\nVisitors will see the status page."
        is_recovery = False
    else:
        title = "DNS Restored to Home"
        message = f"Traffic is now routing back to home server.\n\n**Previous IP:** {previous_ip}\n**New IP:** {new_ip}"
        if reason:
            message += f"\n**Reason:** {reason}"
        is_recovery = True

    return send_discord_alert(title, message, is_recovery)
