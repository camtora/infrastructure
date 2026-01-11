# camerontora.ca Infrastructure

Centralized infrastructure for all `*.camerontora.ca` services, providing:

- **Nginx reverse proxy** - SSL termination and routing for all subdomains
- **OAuth2 Proxy** - Unified Google SSO across all protected services
- **Shared authentication** - Log in once, access all protected services

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
                    - transmission:9091
                    - watchmap:5080
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
| Transmission | transmission.camerontora.ca | 9091 |
| Watchmap | watchmap.camerontora.ca | 5080 |

### Public (no authentication)
| Service | Subdomain | Port |
|---------|-----------|------|
| Plex | plex.camerontora.ca | 32400 |
| Ombi | ombi.camerontora.ca | 3579 |
| Overseerr | overseerr.camerontora.ca | 5055 |
| Uptime Kuma | status.camerontora.ca | 3001 |

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

Renewal is handled by certbot on the host system.

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
