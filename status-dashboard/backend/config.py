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
# Protected services use health endpoints that bypass OAuth
SERVICES = [
    {"name": "Main Site", "url": "https://camerontora.ca", "category": "public"},
    {"name": "Plex", "url": "https://plex.camerontora.ca", "category": "public"},
    {"name": "Haymaker", "url": "https://haymaker.camerontora.ca", "category": "protected"},  # TODO: add /api/health endpoint
    {"name": "Watchmap", "url": "https://watchmap.camerontora.ca/health", "category": "protected"},
    {"name": "Overseerr", "url": "https://overseerr.camerontora.ca", "category": "public"},
    {"name": "Ombi", "url": "https://ombi.camerontora.ca", "category": "public"},
    {"name": "Radarr", "url": "https://radarr.camerontora.ca/ping", "category": "protected"},
    {"name": "Sonarr", "url": "https://sonarr.camerontora.ca/ping", "category": "protected"},
    {"name": "Jackett", "url": "https://jackett.camerontora.ca/UI/Login", "category": "protected"},
    {"name": "Tautulli", "url": "https://tautulli.camerontora.ca/status", "category": "protected"},
    {"name": "Transmission", "url": "https://transmission.camerontora.ca/transmission/web/", "category": "protected"},
    {"name": "Netdata", "url": "https://netdata.camerontora.ca/api/v1/info", "category": "protected"},
    {"name": "Health API", "url": "https://health.camerontora.ca/api/health/ping", "category": "api"},
]

# DNS records to manage during failover
# Only @ - other subdomains timeout cleanly rather than showing SSL warnings
DNS_RECORDS = ["@"]
