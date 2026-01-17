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

## VNC Remote Access (RealVNC)

RealVNC Server is used for remote desktop access via RealVNC's cloud service.

- **Service**: `vncserver-x11-serviced`
- **Mode**: Service Mode (runs as system service)
- **Authentication**: RealVNC cloud account (cameron.tora@gmail.com)

### Known Issue: Sticky Cloud Sessions

RealVNC's cloud service sometimes fails to receive disconnect notifications from the local server. This causes "session already active" errors when trying to reconnect, even though no session is actually active locally.

**Quick fix:**
```bash
vnc-reset
```

This restarts the VNC service, forcing re-registration with RealVNC's cloud and clearing stale session state.

### Maintenance

- **Auto-clear on disconnect**: The `vnc-session-monitor` service watches for disconnect events and automatically restarts VNC 10 seconds later to clear cloud state
- **Daily restart**: A cron job restarts the VNC service at 4am daily as a fallback (`/etc/cron.d/vnc-maintenance`)
- **Manual reset**: Run `vnc-reset` if needed

**Scripts:**
- `scripts/vnc-reset.sh` - Manual reset (symlinked to `/usr/local/bin/vnc-reset`)
- `scripts/vnc-session-monitor.sh` - Auto-reset service
- `scripts/vnc-session-monitor.service` - systemd unit file

### Troubleshooting

```bash
# Check VNC service status
systemctl status vncserver-x11-serviced

# View recent connection logs
journalctl -u vncserver-x11-serviced --since "1 hour ago"

# Force clear stuck session
vnc-reset
```

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
│         ↓ VPN Tunnel (WireGuard)            │
└─────────────────────────────────────────────┘
                    ↓
            PIA Toronto (toronto433)
```

- **VPN Provider**: Private Internet Access (PIA)
- **Protocol**: WireGuard (via custom provider - native PIA WireGuard not supported in gluetun)
- **Server**: toronto433 (212.32.48.142)
- **Port Forwarding**: Enabled (dynamic port written to `/tmp/gluetun/forwarded_port`)
- **Health Endpoint**: `http://192.168.2.34:8090/v1/vpn/status` (monitored by Uptime Kuma)
- **Credentials**: Stored in `/home/camerontora/docker-services/.env`:
  - `PIA_USER` / `PIA_PASS` - PIA account credentials
  - `PIA_WG_PRIVATE_KEY` - WireGuard private key for toronto433

**Verifying VPN is working:**
```bash
# Check external IP (should be PIA, not home IP)
docker exec gluetun wget -qO- https://ipinfo.io/ip

# Check VPN status via API
curl -s http://localhost:8090/v1/vpn/status
# Returns: {"status":"running"}

# Check public IP details
curl -s http://localhost:8090/v1/publicip/ip | jq .

# Check forwarded port
cat /home/camerontora/docker-services/gluetun/forwarded_port
# Or via logs:
docker logs gluetun | grep "port forward"
```

### WireGuard Key Regeneration

The WireGuard configuration is tied to a specific PIA server. If you need to regenerate keys (e.g., server issues, key expiry), follow these steps:

```bash
# 1. Get a fresh PIA token (expires in 24h)
PIA_TOKEN=$(curl -s --location --request POST \
  'https://www.privateinternetaccess.com/api/client/v2/token' \
  --form "username=YOUR_PIA_USER" \
  --form "password=YOUR_PIA_PASS" | jq -r '.token')

# 2. Generate new WireGuard keys
docker run --rm alpine:latest sh -c \
  "apk add --no-cache wireguard-tools && wg genkey | tee /dev/stderr | wg pubkey"
# Save the private key (first line) and public key (second line)

# 3. Get server list for port-forwarding enabled servers
curl -s "https://serverlist.piaservers.net/vpninfo/servers/v6" | \
  jq '.regions[] | select(.port_forward == true) | {id, name, servers: .servers.wg[0]}'

# 4. Register key with PIA API (example for toronto433)
WG_SERVER_IP="212.32.48.142"
WG_HOSTNAME="toronto433"
PUB_KEY="YOUR_NEW_PUBLIC_KEY"
curl -s -G \
  --connect-to "$WG_HOSTNAME::$WG_SERVER_IP:" \
  --cacert /tmp/pia-manual/ca.rsa.4096.crt \
  --data-urlencode "pt=${PIA_TOKEN}" \
  --data-urlencode "pubkey=$PUB_KEY" \
  "https://${WG_HOSTNAME}:1337/addKey"

# 5. Update docker-services/.env with new PIA_WG_PRIVATE_KEY
# 6. Update docker-compose.yaml with new server details if changed
# 7. Restart: docker-compose up -d gluetun transmission
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
