# Overseerr → Seerr Migration

Seerr is the successor to Overseerr (a merge of Overseerr and Jellyseerr). This document tracks the phased migration.

**Migration guide:** https://docs.seerr.dev/migration-guide

---

## Phase 1 — New subdomain + redirect (completed 2026-03-28)

- Added `seerr.camerontora.ca` → proxies to port 5055 (still running Overseerr)
- `overseerr.camerontora.ca` now 301-redirects to `seerr.camerontora.ca`
- Added `seerr` to DDNS records and SSL cert
- Status dashboard and DNS failover updated to monitor `seerr.camerontora.ca`

**Result:** Users hitting the old URL are transparently bounced to the new one. No container changes yet.

---

## Phase 2 — Migrate container (pending)

When ready to swap the actual service from Overseerr to Seerr:

1. **Back up config:**
   ```bash
   cp -a /path/to/overseerr/config /path/to/overseerr/config.bak
   ```

2. **Fix permissions** (Seerr runs as non-root UID 1000; Overseerr didn't):
   ```bash
   docker run --rm -v /path/to/overseerr/config:/data alpine chown -R 1000:1000 /data
   ```

3. **Update docker-compose** in `docker-services/`:
   - Change image from `sctx/overseerr:latest` to the Seerr image (check https://docs.seerr.dev for current tag)
   - Add `init: true` to the service (now required)
   - Optionally rename container from `overseerr` to `seerr`

4. **Restart container** — Seerr auto-migrates the database on first start. Verify in logs.

5. **Update `health-api/app.py`** SERVICE_CHECKS — change name to `Seerr` and container name if renamed.

No nginx changes needed — both subdomains still point to port 5055.

---

## Phase 3 — Remove overseerr subdomain (pending, after Phase 2)

Once users are fully on `seerr.camerontora.ca`:

1. **Nginx** — remove the `overseerr.camerontora.ca` redirect block from `nginx/conf.d/20-public-services.conf`

2. **DDNS** — remove `"overseerr"` from `RECORDS` in `scripts/godaddy-ddns.sh`

3. **SSL cert** — shrink cert to drop `overseerr.camerontora.ca`:
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
     -d plex.camerontora.ca \
     -d radarr.camerontora.ca \
     -d seerr.camerontora.ca \
     -d sonarr.camerontora.ca \
     -d tautulli.camerontora.ca \
     -d transmission.camerontora.ca \
     -d watchmap.camerontora.ca \
     -d whosup.camerontora.ca \
     -d sba.camerontora.ca \
     -d admin.sba.camerontora.ca \
     -d metro.sba.camerontora.ca
   docker exec nginx-proxy nginx -s reload
   ```

4. **Update `docs/DNS-AND-SSL.md`** — remove `overseerr` from the domain list and certbot command.

---

## Key files

| File | Role |
|------|------|
| `nginx/conf.d/20-public-services.conf` | Seerr proxy + overseerr redirect |
| `scripts/godaddy-ddns.sh` | DDNS records |
| `status-dashboard/backend/config.py` | Monitoring + DNS failover |
| `health-api/app.py` | Container health checks (update in Phase 2) |
