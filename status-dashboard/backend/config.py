"""Configuration management for status dashboard."""

import os

# Health API
HEALTH_API_URL = os.environ.get("HEALTH_API_URL", "https://health.camerontora.ca/api/health")
HEALTH_API_KEY = os.environ.get("HEALTH_API_KEY", "")

# Plex
PLEX_URL = os.environ.get("PLEX_URL", "https://plex.camerontora.ca")
PLEX_TOKEN = os.environ.get("PLEX_TOKEN", "")

# Discord
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "")

# GoDaddy DNS
GODADDY_API_KEY = os.environ.get("GODADDY_API_KEY", "")
GODADDY_API_SECRET = os.environ.get("GODADDY_API_SECRET", "")
GODADDY_DOMAIN = os.environ.get("GODADDY_DOMAIN", "camerontora.ca")

# Failover
HOME_IP = os.environ.get("HOME_IP", "")  # Dynamic, fetched from health API or GoDaddy
GCP_IP = os.environ.get("GCP_IP", "")  # Static GCP IP for failover
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")

# Services to monitor (external HTTP checks)
SERVICES = [
    {"name": "Main Site", "url": "https://camerontora.ca", "category": "public"},
    {"name": "Plex", "url": "https://plex.camerontora.ca", "category": "public"},
    {"name": "Haymaker", "url": "https://haymaker.camerontora.ca", "category": "protected"},
    {"name": "Watchmap", "url": "https://watchmap.camerontora.ca", "category": "protected"},
    {"name": "Overseerr", "url": "https://overseerr.camerontora.ca", "category": "public"},
    {"name": "Ombi", "url": "https://ombi.camerontora.ca", "category": "public"},
    {"name": "Radarr", "url": "https://radarr.camerontora.ca", "category": "protected"},
    {"name": "Sonarr", "url": "https://sonarr.camerontora.ca", "category": "protected"},
    {"name": "Jackett", "url": "https://jackett.camerontora.ca", "category": "protected"},
    {"name": "Tautulli", "url": "https://tautulli.camerontora.ca", "category": "protected"},
    {"name": "Transmission", "url": "https://transmission.camerontora.ca", "category": "protected"},
    {"name": "Netdata", "url": "https://netdata.camerontora.ca", "category": "protected"},
    {"name": "Status (Uptime Kuma)", "url": "https://status.camerontora.ca", "category": "public"},
    {"name": "Health API", "url": "https://health.camerontora.ca/api/health/ping", "category": "api"},
]

# DNS records to manage during failover
DNS_RECORDS = [
    "@", "ombi", "plex", "sonarr", "radarr", "tautulli", "transmission",
    "jackett", "status", "emby", "jellyfin", "overseerr", "watchmap",
    "haymaker", "netdata", "health"
]
