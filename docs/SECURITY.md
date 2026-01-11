# Security Configuration

This document describes the security hardening applied to the camerontora.ca infrastructure.

## Firewall (UFW)

UFW is enabled with the following rules:

```
# External access (from internet)
22/tcp      - SSH
80/tcp      - HTTP (nginx)
443/tcp     - HTTPS (nginx)
32400/tcp   - Plex

# Docker networks (internal container-to-host communication)
172.17.0.0/16   - Docker bridge network
172.18.0.0/16   - haymaker_default
172.19.0.0/16   - docker-services_default
172.20.0.0/16   - camerontoraca_default
172.21.0.0/16   - infrastructure_default
```

### Managing UFW

```bash
# Check status
sudo ufw status numbered

# Add new Docker network (if created)
sudo ufw allow from 172.XX.0.0/16 to any comment 'Docker network name'

# Reload after changes
sudo ufw reload
```

## SSH Security

- Root login: **Disabled**
- Password authentication: **Disabled**
- Public key authentication: **Enabled**

Config location: `/etc/ssh/sshd_config`

## Disabled Services

- **Samba (smbd, nmbd)**: Disabled - not in use

## Docker Network Architecture

All services communicate via Docker networks:

```
┌─────────────────────────────────────────────────────────────┐
│                    docker-services_default                   │
│  plex, radarr, sonarr, jackett, tautulli, ombi, overseerr,  │
│  bazarr, tdarr, flaresolverr, watchmap, gluetun             │
│  (transmission runs inside gluetun's network namespace)      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────┐  ┌─────────────────────┐
│ infrastructure_default│  │ camerontoraca_default│
│  nginx-proxy         │  │  camerontora_web     │
│  oauth2-proxy        │  └─────────────────────┘
└─────────────────────┘

┌─────────────────────┐
│  haymaker_default    │
│  db, minio, api, web │
└─────────────────────┘
```

Services access host ports via `host.docker.internal`, which requires UFW rules for Docker subnets.

## Secrets Management

All secrets are stored in `.env` files with permissions `600`:

| Location | Contains |
|----------|----------|
| `/home/camerontora/infrastructure/.env` | OAuth2 credentials, API keys |
| `/home/camerontora/docker-services/.env` | Transmission password, Plex token, Tautulli key, PIA VPN credentials |
| `/home/camerontora/haymaker/.env` | Postgres password, Minio password |
| `/home/camerontora/camerontora.ca/.env` | Discord webhook, Tautulli API key |

**Never commit .env files to git** - they are in `.gitignore`.

## Bell HomeHub Port Forwarding

External ports forwarded at router level:

| External | Internal | Service |
|----------|----------|---------|
| 2222 | 22 | SSH |
| 80 | 80 | HTTP |
| 443 | 443 | HTTPS |
| 32400 | 32400 | Plex |

All other ports are blocked at the router.

## VPN (Transmission)

Transmission runs behind a VPN using **Gluetun** container with PIA (Private Internet Access):

```
┌─────────────────────────────────────────────┐
│              gluetun container               │
│  ┌─────────────────────────────────────┐    │
│  │  transmission (network_mode: service)│    │
│  └─────────────────────────────────────┘    │
│         ↓ VPN Tunnel (OpenVPN)              │
└─────────────────────────────────────────────┘
                    ↓
            PIA Toronto Server
```

- **VPN Provider**: Private Internet Access (PIA)
- **Protocol**: OpenVPN
- **Server**: CA Toronto
- **Port Forwarding**: Enabled (dynamic port written to `/gluetun/forwarded_port`)
- **Credentials**: Stored in `/home/camerontora/docker-services/.env` as `PIA_USER` and `PIA_PASS`

**Verifying VPN is working:**
```bash
# Check external IP (should be PIA, not home IP)
docker exec gluetun wget -qO- https://ipinfo.io/ip

# Check VPN status
docker logs gluetun | grep -i "completed\|error"

# Check forwarded port
docker logs gluetun | grep "port forward"
```

## OAuth2 / SSO

All protected services use centralized OAuth2 Proxy with Google authentication:
- Cookie domain: `.camerontora.ca`
- Allowed users: See `/home/camerontora/infrastructure/oauth2-proxy/authenticated_emails.txt`

## Security Checklist for New Services

- [ ] Add nginx config with OAuth2 protection (if needed)
- [ ] Bind ports to `0.0.0.0` (UFW handles external blocking)
- [ ] Add to appropriate Docker network
- [ ] Verify UFW allows the Docker subnet
- [ ] Add callback URL to Google OAuth Console (for protected services)
- [ ] Store any secrets in `.env` file with `chmod 600`
