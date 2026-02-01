# camerontora.ca Infrastructure

Centralized infrastructure for all `*.camerontora.ca` services, providing:

- **Nginx reverse proxy** - SSL termination and routing for all subdomains
- **OAuth2 Proxy** - Unified Google SSO across all protected services
- **Shared authentication** - Log in once, access all protected services
- **Status Dashboard** - GCP-hosted service monitoring (status.camerontora.ca)
- **Netdata** - Real-time system monitoring with Discord alerts (netdata.camerontora.ca)
- **External Monitoring** - GCP Cloud Run monitor that alerts when home internet is down
- **Health API** - System metrics endpoint for external monitoring (health.camerontora.ca)

## Architecture

```
                    ┌─────────────────┐
                    │   Internet      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Nginx Proxy    │
                    │  (ports 80/443) │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ OAuth2 Proxy  │   │ Protected     │   │ Public        │
│ (auth only)   │   │ Services      │   │ Services      │
└───────────────┘   └───────────────┘   └───────────────┘
                    - haymaker:3000     - plex:32400
                    - radarr:7878       - ombi:3579
                    - sonarr:8989       - overseerr:5055
                    - jackett:9117      - status:3001
                    - tautulli:8181
                    - transmission:9093
                    - watchmap:5080
                    - netdata:19999
```

## Services

### Protected (require authentication)
| Service | Subdomain | Port |
|---------|-----------|------|
| Haymaker | haymaker.camerontora.ca | 3000 |
| Radarr | radarr.camerontora.ca | 7878 |
| Sonarr | sonarr.camerontora.ca | 8989 |
| Jackett | jackett.camerontora.ca | 9117 |
| Tautulli | tautulli.camerontora.ca | 8181 |
| Transmission | transmission.camerontora.ca | 9093 |
| Watchmap | watchmap.camerontora.ca | 5080 |
| Netdata | netdata.camerontora.ca | 19999 |

### Public (no authentication)
| Service | Subdomain | Port |
|---------|-----------|------|
| Plex | plex.camerontora.ca | 32400 |
| Ombi | ombi.camerontora.ca | 3579 |
| Overseerr | overseerr.camerontora.ca | 5055 |
| Who's Up API | whosup.camerontora.ca | 3001 |
| Health API | health.camerontora.ca | 5000 |
| Status Dashboard | status.camerontora.ca | GCP |

### Special
| Service | Subdomain | Port | Notes |
|---------|-----------|------|-------|
| camerontora.ca | camerontora.ca | 3002 | Public with optional auth headers |

## Quick Start

```bash
# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f nginx
docker-compose logs -f oauth2-proxy

# Reload nginx after config changes
docker exec nginx-proxy nginx -s reload
```

## Configuration

### Environment Variables (.env)
```bash
# Google OAuth credentials
OAUTH2_PROXY_CLIENT_ID=your-client-id
OAUTH2_PROXY_CLIENT_SECRET=your-client-secret

# Cookie secret (32 bytes, base64 encoded)
OAUTH2_PROXY_COOKIE_SECRET=your-cookie-secret

# App-specific secrets
DISCORD_WEBHOOK_URL=your-webhook
TAUTULLI_API_KEY=your-api-key
HOME_LAT=your-latitude
HOME_LON=your-longitude
```

### Allowed Users
Edit `oauth2-proxy/authenticated_emails.txt`:
```
user1@example.com
user2@gmail.com
```

## Adding New Services

See [docs/SSO-GUIDE.md](docs/SSO-GUIDE.md) for detailed instructions on adding new protected or public services.

## SSL Certificates

Using Let's Encrypt certificates from `/etc/letsencrypt/live/camerontora-services/`.

See [docs/DNS-AND-SSL.md](docs/DNS-AND-SSL.md) for:
- Adding new subdomains to the certificate
- GoDaddy Dynamic DNS setup
- Certbot commands (must stop nginx-proxy first)

## External Monitoring

The infrastructure includes an external monitoring system that runs on GCP Cloud Run. This solves the problem of local monitoring tools (Uptime Kuma, Netdata) being unable to alert when the home internet goes down.

**How it works:**
- GCP Cloud Scheduler triggers a health check every 5 minutes
- Cloud Run service checks home server endpoints and system metrics
- If unreachable or thresholds exceeded, alerts are sent to Discord
- When services recover, a recovery notification is sent

**What gets monitored:**
- Public endpoints (camerontora.ca, status.camerontora.ca)
- Health API metrics (CPU, RAM, disk usage)
- Plex server and library availability
- Internet upload speed

See [docs/MONITORING.md](docs/MONITORING.md) for detailed documentation including:
- Complete architecture diagrams
- All monitored metrics and thresholds
- Configuration options
- Troubleshooting guides
- Manual operation commands

## Troubleshooting

### Check nginx config
```bash
docker exec nginx-proxy nginx -t
```

### View OAuth2 Proxy logs
```bash
docker-compose logs oauth2-proxy | tail -50
```

### Check cookie domain
In browser dev tools (F12 → Application → Cookies), the `_oauth2_proxy` cookie should have domain `.camerontora.ca`.

### Force re-authentication
Clear cookies for `*.camerontora.ca` in your browser.
