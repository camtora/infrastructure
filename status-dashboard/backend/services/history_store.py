"""Historical data storage using Firestore."""

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any

from google.cloud import firestore

logger = logging.getLogger(__name__)

# GCP Project - use environment variable or default
GCP_PROJECT = os.environ.get("GCP_PROJECT", "cameron-tora")

# Firestore client (initialized lazily)
_db = None


def get_db():
    """Get Firestore client, initializing if needed."""
    global _db
    if _db is None:
        try:
            _db = firestore.Client(project=GCP_PROJECT)
            logger.info(f"Initialized Firestore client for project: {GCP_PROJECT}")
        except Exception as e:
            logger.error(f"Failed to initialize Firestore: {e}")
            return None
    return _db


def store_status_snapshot(status_data: dict[str, Any]) -> bool:
    """
    Store a status snapshot to Firestore.

    Called every 5 minutes by Cloud Scheduler via /api/check.

    Structure:
    - Collection: status_history
    - Document ID: timestamp (ISO format)
    - Fields: services[], metrics{}, overall_status, timestamp
    """
    db = get_db()
    if not db:
        return False

    try:
        timestamp = datetime.now(timezone.utc)
        doc_id = timestamp.strftime("%Y-%m-%dT%H:%M")  # Minute precision

        # Extract just what we need for history
        snapshot = {
            "timestamp": timestamp,
            "overall_status": status_data.get("overall_status", "unknown"),
            "services": [],
            "metrics": None,
        }

        # Store service status (compact format)
        for svc in status_data.get("services", []):
            snapshot["services"].append({
                "name": svc.get("name"),
                "status": svc.get("status"),  # up/down
                "response_time_ms": svc.get("response_time_ms"),
                "internal_ok": (
                    svc.get("internal", {}).get("container_running", False) and
                    svc.get("internal", {}).get("port_responding", False)
                ) if svc.get("internal") else None,
            })

        # Store key metrics
        metrics = status_data.get("metrics")
        if metrics:
            snapshot["metrics"] = {
                "cpu_percent": metrics.get("cpu", {}).get("percent"),
                "memory_percent": metrics.get("memory", {}).get("percent"),
                "load_1m": metrics.get("load", {}).get("load_1m"),
            }
            # Store speed test if available
            speed = metrics.get("speed_test")
            if speed and speed.get("home"):
                snapshot["metrics"]["speed_download"] = speed["home"].get("download")
                snapshot["metrics"]["speed_upload"] = speed["home"].get("upload")

        # Store to Firestore
        db.collection("status_history").document(doc_id).set(snapshot)
        logger.info(f"Stored status snapshot: {doc_id}")
        return True

    except Exception as e:
        logger.error(f"Failed to store status snapshot: {e}")
        return False


def get_status_history(hours: int = 24) -> list[dict[str, Any]]:
    """
    Get status history for the specified time range.

    Args:
        hours: Number of hours to look back (default 24, max 168 for 7 days)

    Returns:
        List of status snapshots, oldest first
    """
    db = get_db()
    if not db:
        return []

    try:
        # Calculate time range
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(hours=min(hours, 168))

        # Query Firestore
        query = (
            db.collection("status_history")
            .where("timestamp", ">=", start_time)
            .order_by("timestamp")
        )

        results = []
        for doc in query.stream():
            data = doc.to_dict()
            # Convert Firestore timestamp to ISO string
            if data.get("timestamp"):
                data["timestamp"] = data["timestamp"].isoformat()
            results.append(data)

        return results

    except Exception as e:
        logger.error(f"Failed to get status history: {e}")
        return []


def get_service_uptime(service_name: str, hours: int = 24) -> dict[str, Any]:
    """
    Get uptime statistics for a specific service.

    Returns:
        {
            "uptime_percent": 99.5,
            "total_checks": 288,
            "up_count": 286,
            "down_count": 2,
            "timeline": [{"time": "...", "status": "up"}, ...]
        }
    """
    history = get_status_history(hours)

    timeline = []
    up_count = 0
    down_count = 0

    for snapshot in history:
        for svc in snapshot.get("services", []):
            if svc.get("name") == service_name:
                status = svc.get("status", "unknown")
                timeline.append({
                    "time": snapshot.get("timestamp"),
                    "status": status,
                    "response_time_ms": svc.get("response_time_ms"),
                })
                if status == "up":
                    up_count += 1
                else:
                    down_count += 1
                break

    total = up_count + down_count
    uptime_percent = (up_count / total * 100) if total > 0 else 0

    return {
        "service_name": service_name,
        "hours": hours,
        "uptime_percent": round(uptime_percent, 2),
        "total_checks": total,
        "up_count": up_count,
        "down_count": down_count,
        "timeline": timeline,
    }


def cleanup_old_data(days_to_keep: int = 7) -> int:
    """
    Delete status snapshots older than specified days.

    Should be called periodically (e.g., daily) to manage storage.

    Returns:
        Number of documents deleted
    """
    db = get_db()
    if not db:
        return 0

    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_to_keep)

        # Query old documents
        query = (
            db.collection("status_history")
            .where("timestamp", "<", cutoff)
        )

        deleted = 0
        batch = db.batch()
        batch_count = 0

        for doc in query.stream():
            batch.delete(doc.reference)
            batch_count += 1
            deleted += 1

            # Firestore batches limited to 500 operations
            if batch_count >= 500:
                batch.commit()
                batch = db.batch()
                batch_count = 0

        if batch_count > 0:
            batch.commit()

        logger.info(f"Cleaned up {deleted} old status snapshots")
        return deleted

    except Exception as e:
        logger.error(f"Failed to cleanup old data: {e}")
        return 0
