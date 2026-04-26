# Infrastructure — Claude Operating Reference

This file is auto-read by Claude Code at session start. Read it in full before touching anything.
When this file and a user instruction conflict, ask for clarification.

---

## Project Scope

This repo manages all `*.camerontora.ca` networking and infrastructure:
- **nginx-proxy** — SSL termination and subdomain routing (all traffic enters here)
- **oauth2-proxy** — Google SSO shared across all protected services
- **health-api** — System metrics endpoint; VPN switch logic; server reboot
- **netdata** — Real-time CPU/RAM/disk/network monitoring
- **mod-picker** — Minecraft mod browser / packwiz builder
- **GCP status-dashboard** — Cloud Run service monitor (deployed separately)
- **GCP gcp-monitor** — External availability monitor (Cloud Run)
- **Scripts** — DDNS, speedtest, VPN watch, VNC reset

**Working directory:** `/home/camerontora/infrastructure/`
**Docker Compose version:** `2.4` — do not change; `mem_limit` not supported in v3.

---

## CRITICAL: SSL Certificate

**This is the most common source of errors. Read this section completely before touching the cert.**

### Current state
- **Cert name:** `camerontora-services`
- **Location:** `/etc/letsencrypt/live/camerontora-services/`
- **Method:** webroot — **nginx stays running during renewal. Do NOT stop nginx.**
- **Webroot:** `/var/www/acme`
- **Domains:** 22 (see command below)
- **Expires:** 2026-07-25

### Adding a subdomain — always use this exact command

`--cert-name` and `-w` are required. You **must list every existing domain plus the new one**.
Omitting any domain silently removes it from the certificate.

```bash
sudo certbot certonly --webroot \
  -w /var/www/acme \
  --cert-name camerontora-services \
  -d camerontora.ca \
  -d www.camerontora.ca \
  -d haymaker.camerontora.ca \
  -d health.camerontora.ca \
  -d jackett.camerontora.ca \
  -d netdata.camerontora.ca \
  -d ombi.camerontora.ca \
  -d overseerr.camerontora.ca \
  -d seerr.camerontora.ca \
  -d plex.camerontora.ca \
  -d radarr.camerontora.ca \
  -d sonarr.camerontora.ca \
  -d tautulli.camerontora.ca \
  -d transmission.camerontora.ca \
  -d watchmap.camerontora.ca \
  -d whosup.camerontora.ca \
  -d sba.camerontora.ca \
  -d admin.sba.camerontora.ca \
  -d metro.sba.camerontora.ca \
  -d wiki.camerontora.ca \
  -d minecraft.camerontora.ca \
  -d mods.camerontora.ca \
  -d NEWSUBDOMAIN.camerontora.ca   # ← append new domain here

# Then reload nginx to pick up the new cert
docker exec nginx-proxy nginx -s reload
```

After running: update the domain count comment above and the expires date (check with `sudo certbot certificates`).

### What is NOT on this cert

`status.camerontora.ca` — this is a CNAME to GCP Cloud Run. SSL is managed by Google. **Never add it to the certbot command.**

### ACME challenge gotcha

`00-http-redirect.conf` catches all HTTP traffic as `default_server`. Any nginx server block with a named `server_name` on port 80 intercepts before the default server, bypassing the ACME handler.

**Every named HTTP server block must include its own ACME location:**

```nginx
server {
    listen 80;
    server_name example.camerontora.ca;

    location /.well-known/acme-challenge/ {
        root /var/www/acme;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

Do not use a bare `return 301` at the server block level — it intercepts certbot challenges.

### Verify cert domains
```bash
sudo certbot certificates
# or
echo | openssl s_client -connect camerontora.ca:443 2>/dev/null | openssl x509 -noout -text | grep DNS:
```

---

## CRITICAL: .env Values With $ Must Be Single-Quoted

Any `.env` value containing `$` **must be single-quoted**:

```bash
CURSEFORGE_API_KEY='$2a$10$abc...'   # correct — bash treats $ as literal
CURSEFORGE_API_KEY=$2a$10$abc...     # WRONG — kills any script that sources .env
```

Why: `scripts/speedtest.sh` (and others) source `.env` with `set -euo pipefail`. Bash expands
unquoted `$2`, `$10`, etc. as positional params; `set -u` kills the script on the first unset one.
Docker Compose strips surrounding single quotes, so the value reaches containers correctly either way.

**Symptom of this bug:** `speedtest.json` timestamp frozen; cron session closes in ~3s instead of
~13s; no entries in `/var/log/speedtest.log`.

---

## CRITICAL: Cloud Run Deploy Rules

**Always use `status-dashboard/deploy.sh`. Never run `gcloud run deploy` directly.**

`--set-secrets` replaces ALL secret bindings on every deploy. A raw gcloud command that omits any
secret silently drops it — the service starts and health checks pass, but features break.
`ANTHROPIC_API_KEY` has been dropped this way multiple times.

If adding a new secret:
1. Add it to `REQUIRED_SECRETS` in `deploy.sh` first
2. Create it in Secret Manager (`gcloud secrets create ...`)
3. Run `deploy.sh`

If the Wiki Q&A panel breaks: check `gcloud run revisions list --service status-dashboard --region us-central1 --limit 5` before debugging code.

---

## Nginx Reference

### Container name: `nginx-proxy`

```bash
docker exec nginx-proxy nginx -t          # test config (always before reload)
docker exec nginx-proxy nginx -s reload   # reload config
docker compose logs nginx                 # view logs
```

### Config files: `nginx/conf.d/`

| File | Purpose |
|------|---------|
| `00-admin-map.conf` | Maps `$auth_email` → `$is_admin` (admin allowlist) |
| `00-auth.conf` | `upstream oauth2-proxy` definition |
| `00-http-redirect.conf` | Catches all HTTP; serves ACME challenges; redirects to HTTPS |
| `01-camerontora.conf` | camerontora.ca (hybrid: public with optional auth headers) |
| `02-haymaker.conf` | haymaker.camerontora.ca (protected) |
| `03-whosup.conf` | whosup.camerontora.ca (public) |
| `04-sba.conf` | sba.camerontora.ca (public) |
| `05-sba-admin.conf` | admin.sba.camerontora.ca (protected) |
| `06-sba-metro.conf` | metro.sba.camerontora.ca (public) |
| `07-wiki.conf` | wiki.camerontora.ca (protected) |
| `10-protected-services.conf` | All admin-only services + Netdata metrics proxy |
| `11-mods.conf` | mods.camerontora.ca (public) |
| `20-public-services.conf` | plex, seerr, ombi |
| `25-health.conf` | health.camerontora.ca; longer timeouts for VPN switch |

### Protected service template

```nginx
server {
    listen 80;
    server_name example.camerontora.ca;

    location /.well-known/acme-challenge/ {
        root /var/www/acme;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name example.camerontora.ca;

    ssl_certificate /etc/letsencrypt/live/camerontora-services/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/camerontora-services/privkey.pem;

    location /oauth2/ {
        proxy_pass http://oauth2-proxy;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Auth-Request-Redirect $scheme://$host$request_uri;
        proxy_cookie_domain $host .camerontora.ca;   # REQUIRED for SSO
    }

    location = /oauth2/auth {
        internal;
        proxy_pass http://oauth2-proxy/oauth2/auth;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Content-Length "";
        proxy_pass_request_body off;
    }

    location @error401 {
        return 302 https://$host/oauth2/start?rd=$scheme://$host$request_uri;
    }

    location / {
        auth_request /oauth2/auth;
        auth_request_set $auth_email $upstream_http_x_auth_request_email;
        auth_request_set $auth_access_token $upstream_http_x_auth_request_access_token;
        error_page 401 = @error401;

        # Admin-only — omit these two lines for all-authenticated-users access
        if ($is_admin = 0) { return 403; }

        proxy_pass http://host.docker.internal:YOUR_PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Email $auth_email;
        proxy_set_header X-Forwarded-Access-Token $auth_access_token;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Public service template

```nginx
server {
    listen 80;
    server_name example.camerontora.ca;

    location /.well-known/acme-challenge/ {
        root /var/www/acme;
        allow all;
    }

    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name example.camerontora.ca;

    ssl_certificate /etc/letsencrypt/live/camerontora-services/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/camerontora-services/privkey.pem;

    location / {
        proxy_pass http://host.docker.internal:YOUR_PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### SSL directive — use `http2 on;` not `listen 443 ssl http2;`

The `listen 443 ssl http2;` form is deprecated and produces nginx warnings. Use:
```nginx
listen 443 ssl;
http2 on;
```

---

## Adding a New Service — Full Checklist

1. **Port** — pick the next free port in the 3000s (user-built apps) or whatever the third-party service ships with. Current 3000s assignments: `3000` haymaker_web · `3001` whosup · `3002` camerontora_web · `3003` sbca-api · `3004` sbca-admin · `3010` mod-picker. **Next free: 3007** (3005/3006 are unknown host processes; skip them).

2. **DNS** — add subdomain to `RECORDS` array in `scripts/godaddy-ddns.sh`, then run it:
   ```bash
   sudo /home/camerontora/infrastructure/scripts/godaddy-ddns.sh
   ```

3. **SSL** — run the full certbot command from the SSL section above, appending the new domain. Update the domain count in this file.

4. **Nginx** — create `nginx/conf.d/NN-servicename.conf` using the appropriate template above. Number files sequentially to control load order.

5. **Google OAuth Console** (protected services only) — add callback URL:
   `https://newservice.camerontora.ca/oauth2/callback`
   Wait 1–5 minutes for propagation.

6. **Docker Compose** (if containerised) — add service to `docker-compose.yaml`.

7. **Status Dashboard** (optional) — add to `status-dashboard/backend/config.py`. Valid categories: `public`, `protected`, `api` (anything else is silently ignored by the frontend).

8. **Test and reload:**
   ```bash
   docker exec nginx-proxy nginx -t
   docker exec nginx-proxy nginx -s reload
   ```

---

## Port Map

| Port(s) | Service |
|---------|---------|
| 80, 443 | nginx-proxy |
| 3000 | haymaker_web |
| 3001 | whosup |
| 3002 | camerontora_web |
| 3003 | sbca-api |
| 3004 | sbca-admin |
| 3005–3006 | unknown host processes (skip) |
| 3010 | mod-picker (external) → 8000 internal Flask |
| 4180 | oauth2-proxy (internal only) |
| 5000 | health-api |
| 5055 | overseerr container (serving seerr) |
| 5080 | watchmap |
| 5432 | haymaker PostgreSQL |
| 6767 | bazarr |
| 7878 | radarr |
| 8000 | haymaker_api FastAPI |
| 8086, 8088 | influxdb |
| 8090–8092 | gluetun (internal) |
| 8181 | tautulli |
| 8191 | flaresolverr |
| 8265–8266 | tdarr |
| 8989 | sonarr |
| 9000–9001 | haymaker MinIO |
| 9010–9011 | sbca MinIO |
| 9091–9093 | gluetun (Transmission proxy ports: Toronto/Montreal/Vancouver) |
| 9117 | jackett |
| 19999 | netdata |
| 25565 | Minecraft |
| 32400 | Plex |

**Port convention:** User-built apps use the 3000s. Third-party services use their default ports.

---

## Docker Compose Reference

```bash
# Start everything
docker compose up -d

# Rebuild a specific container after code changes
docker compose build health-api
docker compose stop health-api && docker compose rm -f health-api && docker compose up -d health-api

# Logs
docker compose logs -f nginx
docker compose logs -f oauth2-proxy

# Status
docker compose ps
```

**Compose file version is 2.4.** This is intentional — `mem_limit` (used on gluetun containers) is not supported in v3.

The `health-api` uses `env_file: .env` explicitly so API keys are always available even without `docker compose` loading `.env` automatically.

---

## DDNS Reference

```bash
# Script: scripts/godaddy-ddns.sh
# Credentials: /etc/godaddy-ddns.env (chmod 600, not in git)
# Cron: /etc/cron.d/godaddy-ddns (runs every 10 min as root)
# Log: /var/log/godaddy-ddns.log

# Run manually
sudo /home/camerontora/infrastructure/scripts/godaddy-ddns.sh
```

**Current managed records:** `@`, `www`, `haymaker`, `health`, `jackett`, `netdata`, `ombi`, `overseerr`, `seerr`, `plex`, `radarr`, `sonarr`, `tautulli`, `transmission`, `watchmap`, `whosup`, `sba`, `*.sba`, `wiki`, `minecraft`, `mods`

When adding a new subdomain: add it to the `RECORDS` array in the script, then run the script to create the record.

---

## Speedtest / Health Metrics

```bash
# Script: scripts/speedtest.sh
# Cron: /etc/cron.d/speedtest (every 30 min)
# Output: /var/lib/health-api/speedtest.json
# Log: /var/log/speedtest.log

# Check if cron is alive
grep speedtest /var/log/syslog | tail -5
# Normal run takes ~13s; if closing in ~3s with no log output → .env quoting bug (see CRITICAL above)
```

The script sources `.env` with `set -euo pipefail`. Any script that needs API keys must also source `.env` explicitly — cron jobs do not inherit the docker compose environment.

Disk I/O metrics: nginx proxies Netdata `disk_util.*` charts with `after=-60&points=1` (60-second busy-time average). Changed from 10s on 2026-04-26 to smooth transient spikes.

---

## OAuth2 / SSO Reference

- **Allowed users:** `oauth2-proxy/authenticated_emails.txt` — add email, one per line. Changes are live immediately; no restart needed.
- **Admin users:** `nginx/conf.d/00-admin-map.conf` — add email to `$is_admin` map.
- **Cookie:** `_oauth2_proxy`, domain `.camerontora.ca` — SSO works across all subdomains from one login.
- **`proxy_cookie_domain $host .camerontora.ca;`** — required in every `/oauth2/` location block. Missing this breaks SSO.

```bash
# Generate a new cookie secret if needed
python3 -c 'import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())'
```

---

## VPN / Transmission Reference

### VPN port map

| Location | Container | Proxy Port |
|----------|-----------|------------|
| Toronto | gluetun-toronto | 9091 |
| Montreal | gluetun-montreal | 9092 |
| Vancouver | gluetun-vancouver | 9093 |

Transmission runs in `network_mode: container:gluetun-X` — it shares the active VPN's network namespace. If gluetun restarts, Transmission gets a stale namespace.

### VPN switch order of operations

1. Update Sonarr download client port (while Transmission still running)
2. Update Radarr download client port (while Transmission still running)
3. Stop and remove Transmission container
4. Verify target gluetun container is healthy
5. Update docker-compose.yaml `network_mode` to target gluetun
6. Start Transmission
7. Update nginx `proxy_pass` port
8. Reload nginx
9. Update `speedtest.json` active VPN field

### Manual VPN switch via API

```bash
curl -s -X POST "http://localhost:5000/api/health/vpn/switch" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $(grep HEALTH_API_KEY /home/camerontora/infrastructure/.env | cut -d= -f2)" \
  -d '{"location": "vancouver", "reason": "manual-test"}' | jq .
```

### Diagnose Transmission connectivity

```bash
# Can Transmission reach the internet?
docker exec transmission wget -qO- --timeout=5 https://ipinfo.io/ip

# Is port 9091 visible inside the active gluetun?
docker exec gluetun-montreal nc -z localhost 9091

# What network mode is Transmission using?
docker inspect transmission --format '{{.HostConfig.NetworkMode}}'

# Check gluetun DNS (should resolve; if not → DNS init issue)
docker exec gluetun-montreal nslookup ipinfo.io

# Memory usage (gluetun leaks memory when VPN is unhealthy)
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | grep gluetun
```

### Fix: Transmission orphaned after gluetun restart

```bash
docker stop transmission && docker rm transmission
docker compose up -d transmission
```

### Fix: Gluetun DNS broken after recreation

```bash
docker restart gluetun-montreal   # or toronto/vancouver
sleep 10
docker rm -f transmission
docker compose up -d transmission
```

### Transmission peer port

Current PIA-assigned port is written to `/tmp/gluetun/forwarded_port` inside the container. If it changes, update `settings.json` (requires Transmission restart):

```bash
NEW_PORT=$(docker exec gluetun-toronto cat /tmp/gluetun/forwarded_port)
docker stop transmission
sed -i "s/\"peer-port\": [0-9]*/\"peer-port\": $NEW_PORT/" \
  /home/camerontora/docker-services/transmission/config/settings.json
docker compose up -d transmission
```

---

## Status Dashboard Reference

**Deploy:** `cd status-dashboard && ./deploy.sh` — always use the script (see CRITICAL above).

**Local dev:**
```bash
sudo ufw allow 5173/tcp          # open port for LAN access
cd status-dashboard/frontend
npm run dev
# When done:
sudo ufw delete allow 5173/tcp   # REQUIRED — easy to forget
```

**Frontend build (before deploy):**
```bash
cd status-dashboard/frontend && npm run build
```

**ServiceGrid categories:** `public`, `protected`, `api` — anything else is silently dropped.

**Disk I/O averaging:** 60-second window (`after=-60` in `10-protected-services.conf`).

---

## Key Files

| File | Purpose |
|------|---------|
| `docker-compose.yaml` | All containers (nginx, oauth2, netdata, health-api, mod-picker) |
| `.env` | All secrets — chmod 600, never commit |
| `nginx/conf.d/` | Per-service nginx configs |
| `nginx/conf.d/00-admin-map.conf` | Admin email allowlist |
| `nginx/conf.d/10-protected-services.conf` | Admin-only services + Netdata disk proxy |
| `oauth2-proxy/authenticated_emails.txt` | Allowed user emails |
| `scripts/godaddy-ddns.sh` | DDNS updater — RECORDS array here |
| `scripts/speedtest.sh` | Speedtest cron script; sources .env |
| `health-api/app.py` | VPN switch logic, metrics, server reboot |
| `status-dashboard/deploy.sh` | ONLY way to deploy the Cloud Run dashboard |
| `status-dashboard/backend/config.py` | Monitored services list |
| `docs/DNS-AND-SSL.md` | Authoritative SSL and DDNS runbook |
| `docs/SSO-GUIDE.md` | Full SSO patterns and troubleshooting |
| `docs/VPN-SETUP.md` | PIA WireGuard / gluetun runbook |

---

## Troubleshooting Quick Reference

| Symptom | Likely cause | Check |
|---------|-------------|-------|
| `speedtest.json` stale, cron exits in 3s | `.env` has unquoted `$` value | Check `.env` for unquoted keys; fix with single quotes |
| 502 Bad Gateway | Backend container not running or wrong port | `docker ps`, check nginx `proxy_pass` port |
| 401 on protected service | Email not in `authenticated_emails.txt` | Add email; file is live |
| 403 on admin-only service | Email not in `00-admin-map.conf` | Add to `$is_admin` map |
| SSO broken (re-prompted each subdomain) | Missing `proxy_cookie_domain` | Check `/oauth2/` location block |
| `redirect_uri_mismatch` | Callback not in Google OAuth Console | Add `https://sub.camerontora.ca/oauth2/callback`; wait 5 min |
| Certbot challenge fails | Named server block swallows ACME request | Add `/.well-known/acme-challenge/` location to HTTP block |
| Wiki Q&A returns "not configured" | `ANTHROPIC_API_KEY` dropped on deploy | Re-run `deploy.sh`; never run gcloud directly |
| Transmission has no internet | Stale network namespace after gluetun restart | `docker stop transmission && docker rm transmission && docker compose up -d transmission` |
