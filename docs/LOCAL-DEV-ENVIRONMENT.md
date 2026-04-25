# Local Dev Environment — Status Dashboard

How to run the status dashboard frontend locally against the live Cloud Run backend, including why the nginx proxy endpoints exist and how to clean up when done.

---

## Why a local dev environment?

The status dashboard frontend is a Preact/Vite SPA deployed to GCP Cloud Run. For UI iteration it's much faster to run `npm run dev` locally than to deploy on every change. The challenge is that the frontend needs to talk to two things:

1. **The Cloud Run backend** (`/api/*`) — service health, metrics, VPN status, speedtest data
2. **Netdata** (`port 19999` on the home server) — real-time CPU, RAM, network throughput, disk I/O

Fetching Netdata directly from a browser doesn't work: port 19999 sits behind nginx/OAuth2-proxy, so the browser either gets an OAuth redirect or a CORS block. The fix is to proxy the Netdata endpoints through nginx so they're reachable under `health.camerontora.ca/api/metrics/*` without triggering auth.

---

## What was set up

### 1. nginx proxy endpoints (`nginx/conf.d/10-protected-services.conf`)

Four locations were added to the `health.camerontora.ca` server block:

```nginx
location = /api/metrics/net {
    proxy_pass http://host.docker.internal:19999/api/v1/data?chart=net.eno1&after=-10&points=1&format=json;
    add_header Cache-Control "no-store" always;
}

location ~ ^/api/metrics/disk/(sda|sdb|md1|sdk)$ {
    proxy_pass http://host.docker.internal:19999/api/v1/data?chart=disk_util.$1&after=-10&points=1&format=json;
    add_header Cache-Control "no-store" always;
}
```

`Cache-Control: no-store` is required — without it nginx (or an upstream proxy) caches the response and the dashboard shows stale "Using cached data" values.

The existing `/api/metrics/cpu` and `/api/metrics/ram` endpoints also had `Cache-Control: no-store` added for the same reason.

These endpoints **do not require auth** — they are intentionally public (Netdata metric values are low-sensitivity) and sit inside the `health.camerontora.ca` server block which is otherwise protected.

### 2. Vite dev server config (`status-dashboard/frontend/vite.config.js`)

```js
server: {
  host: true,          // bind to 0.0.0.0 so the server is reachable on the LAN (192.168.2.34:5173)
  proxy: {
    '/api': {
      target: 'https://status-dashboard-jkdghbnxoq-uc.a.run.app',
      changeOrigin: true,
    },
  },
},
```

- `host: true` — by default Vite binds only to `localhost`. Setting this to `true` makes the dev server reachable from other devices on the LAN (e.g. a phone or another machine) at `192.168.2.34:5173`.
- The `/api` proxy forwards all API requests to the live Cloud Run backend, so local dev uses real data with no mocking needed.

### 3. Firewall rule (open before dev, close when done)

The home server runs `ufw`. Port 5173 must be opened before the dev server is reachable on the LAN:

```bash
sudo ufw allow 5173/tcp
```

**Close it when done:**

```bash
sudo ufw delete allow 5173/tcp
```

Verify it's removed:

```bash
sudo ufw status
```

---

## Running the dev server

```bash
cd /home/camerontora/infrastructure/status-dashboard/frontend
npm run dev
```

Server starts at `http://192.168.2.34:5173` (LAN) or `http://localhost:5173` (local).

The Vite proxy handles all `/api/*` calls — the browser never talks directly to Cloud Run or Netdata. The nginx endpoints at `health.camerontora.ca` serve the real-time metric data.

---

## Stopping the dev server

`Ctrl+C` in the terminal running `npm run dev`. Nothing else to clean up — no firewall rules were created, no services were started.

---

## Deploying changes to production

**Frontend:** The built `dist/` is served by the Cloud Run container. Use the deploy script:

```bash
cd /home/camerontora/infrastructure/status-dashboard
./deploy.sh
```

> Never run `gcloud run deploy` directly — secrets (including `ANTHROPIC_API_KEY`) are not passed and will be silently dropped. Always use `deploy.sh`.

**nginx changes:** Reload nginx on the home server after editing `10-protected-services.conf`:

```bash
docker compose exec nginx nginx -s reload
```

---

## Hardening / cleanup notes

- The `/api/metrics/*` nginx endpoints expose live Netdata data (CPU %, RAM %, network throughput, disk I/O) without authentication. This is intentional — values are non-sensitive operational metrics. If this changes, add an `auth_request` directive pointing at the OAuth2-proxy `/oauth2/auth` endpoint, matching the pattern used by the other protected locations in that server block.
- `host: true` in Vite only applies when the dev server is running. It is not a persistent change to the machine's network config.
- Always close the ufw rule (`sudo ufw delete allow 5173/tcp`) when done developing — leaving it open exposes the dev server to the LAN indefinitely.

---

## Netdata charts used

| Endpoint | Netdata chart | What it measures |
|---|---|---|
| `/api/metrics/cpu` | `system.cpu` | CPU utilisation % |
| `/api/metrics/ram` | `system.ram` | RAM used/cached/free |
| `/api/metrics/net` | `net.eno1` | Network throughput (Kbps — divide by 1000 for Mbps) |
| `/api/metrics/disk/sda` | `disk_util.sda` | OS SSD % busy |
| `/api/metrics/disk/sdb` | `disk_util.sdb` | GAMES HDD % busy |
| `/api/metrics/disk/md1` | `disk_util.md1` | HOMENAS software RAID % busy |
| `/api/metrics/disk/sdk` | `disk_util.sdk` | CAMRAID hardware RAID % busy |

Note: Netdata returns network values in **Kbps**, not bytes/sec. The frontend divides by 1000 to get Mbps (`/ 1000`).
