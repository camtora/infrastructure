# Security Threat Model — External Attacker Against `*.camerontora.ca`

_Generated: 2026-04-22_

---

## Vulnerability 1 — CRITICAL: Header Injection to Reboot Server

**Status: REMEDIATED 2026-04-22**

**How:** The `require_admin` decorator in `health-api/app.py:613` trusts `X-Forwarded-Email` verbatim:

```python
email = request.headers.get("X-Forwarded-Email", "")
if email not in ADMIN_EMAILS:
    return 403  # only check
```

This is safe *only if* traffic flows through nginx. But `docker-compose.yaml:115` previously bound the Flask app directly to all interfaces:

```yaml
ports:
  - "5000:5000"   # binds 0.0.0.0 — Docker bypasses ufw by default
```

Docker's iptables rules punch through `ufw`. If the firewall isn't explicitly blocking 5000, any external actor can do:

```bash
curl -X POST http://<server-ip>:5000/api/admin/server/reboot \
  -H "X-Forwarded-Email: cameron.tora@gmail.com" \
  -H "Content-Type: application/json"
```

The container is `privileged: true` + `pid: host`, and `_do_server_reboot` at line 1080 runs:

```python
cmd = ["nsenter", "-t", "1", "-m", "-u", "-i", "-n", "--", "reboot"]
```

**That is a hard reboot of the physical host in 2 seconds, no auth required if the port is reachable.**

**Exposure: CRITICAL — full server reboot from the internet with zero credentials.**

### Fix Applied

Changed the port binding in `docker-compose.yaml` so Flask is only reachable via localhost:

```yaml
# Before
ports:
  - "5000:5000"

# After
ports:
  - "127.0.0.1:5000:5000"
```

Nginx proxies it over `host.docker.internal` anyway — external binding is unnecessary. Port 5000 is now unreachable from outside the host.

---

## Vulnerability 2 — HIGH: API Key Fail-Open Fallback

**Status: REMEDIATED 2026-04-22**

`health-api/app.py:89` previously had:

```python
if not API_KEY:
    return f(*args, **kwargs)  # allow access for "initial setup"
```

If `HEALTH_API_KEY` is ever blank (`.env` missing, variable typo, deploy mistake), every "API key protected" endpoint becomes fully public, including:

- `/api/health/vpn/switch` — switches VPN location, disrupts Transmission
- `/api/health` — leaks CPU, memory, disk, Plex status, storage detail
- `/api/health/services` — leaks every internal container name and port

This fails silently — everything still works, it's just open. An attacker scanning `health.camerontora.ca/` also gets the full endpoint map handed to them from the unauthenticated root handler at `app.py:591`.

**Exposure: HIGH — silent fail-open that leaks infra detail and enables VPN disruption.**

### Fix Applied

Replaced the fail-open with a hard startup failure — the container will refuse to start if `HEALTH_API_KEY` is missing:

```python
# In app.py startup
API_KEY = os.environ.get("HEALTH_API_KEY", "")
if not API_KEY:
    raise RuntimeError("HEALTH_API_KEY must be set — refusing to start without it")
```

The fail-open branch in `require_api_key` was also removed entirely. Additionally, removed the `:-` default from `docker-compose.yaml` so Docker Compose itself will error if the variable is unset in `.env`.

---

## Vulnerability 3 — MEDIUM: Unauthenticated Haymaker Data Injection

**Status: REMEDIATED 2026-04-22**

`nginx/conf.d/02-haymaker.conf` bypasses OAuth for the Apple Health webhook and Withings OAuth callback entirely — both are intentionally public, but had no rate limiting at the nginx layer. The backend validates an `X-API-Key` header on the webhook, but with no throttle an attacker could:

- Fuzz the endpoint to determine key format
- Replay a captured webhook request to inject false health data (steps, weight, sleep, etc.)
- Flood the endpoint to exhaust the backend

**Exposure: MEDIUM — data integrity risk and unauthenticated rate-unlimited endpoint.**

### Fix Applied

Added rate limiting to both unauthenticated public endpoints in `nginx/conf.d/02-haymaker.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=haymaker_webhook:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=haymaker_withings:10m rate=5r/m;
limit_req_status 429;

location /api/webhooks/apple-health {
    limit_req zone=haymaker_webhook burst=5 nodelay;
    ...
}

location /api/oauth/withings/callback {
    limit_req zone=haymaker_withings burst=3 nodelay;
    ...
}
```

Returns `429 Too Many Requests` when exceeded. Single legitimate requests from Apple Health or Withings always get through.

---

## Summary

| # | Vulnerability | Impact | Ease | Status |
|---|--------------|--------|------|--------|
| 1 | Direct Flask port + header spoofing → server reboot | **Server reboot** | Easy if port open | **Remediated 2026-04-22** |
| 2 | API key fail-open | Infra leak + VPN switch | Trivial once triggered | **Remediated 2026-04-22** |
| 3 | Apple Health webhook + Withings callback — no rate limit | Data injection, DoS | Medium | **Remediated 2026-04-22** |

---

## What Was Implemented

### Vulnerability 1 — CRITICAL (commit `f4669dc`)

Removed the `ports:` binding from health-api in `docker-compose.yaml` entirely. Previously bound to `0.0.0.0:5000`, allowing Docker's iptables rules to bypass UFW. Now health-api has no published port — nginx reaches it by container name (`http://health-api:5000`) over the shared `infrastructure_default` Docker network. Port 5000 does not appear on the host at all.

Updated `nginx/conf.d/25-health.conf` to use `http://health-api:5000` instead of `http://host.docker.internal:5000`.

### Vulnerability 2 — HIGH (commit `f270abc`)

Two changes to `health-api/app.py`:

1. Added a hard startup failure immediately after reading the env var:
```python
API_KEY = os.environ.get("HEALTH_API_KEY", "")
if not API_KEY:
    raise RuntimeError("HEALTH_API_KEY must be set — refusing to start without it")
```

2. Removed the fail-open branch from the `require_api_key` decorator entirely — it now always validates the key.

Also removed the `:-` default from `docker-compose.yaml` (`HEALTH_API_KEY=${HEALTH_API_KEY}` instead of `${HEALTH_API_KEY:-}`) so Docker Compose itself errors if the variable is unset.

### Vulnerability 3 — MEDIUM (commit `c2bea11`)

Added two rate limit zones to `nginx/conf.d/02-haymaker.conf` and applied them to the Apple Health webhook (`10r/m, burst 5`) and Withings OAuth callback (`5r/m, burst 3`). Set `limit_req_status 429` so throttled requests return the correct HTTP status. Applied with a live nginx reload — no container restart required. Verified: single requests pass through, rapid bursts receive 429.

---

## Verification Steps

```bash
# Vuln 1: Confirm port 5000 is not published on the host
ss -tlnp | grep 5000
# Expected: no output

# Vuln 1: Confirm nginx can still reach health-api
curl -s https://health.camerontora.ca/api/health/ping
# Expected: {"status":"ok",...}

# Vuln 2: Confirm health-api refuses to start without API key
docker logs health-api | grep -i "refusing\|error"

# Vuln 3: Confirm rate limiting returns 429 on rapid requests
for i in {1..10}; do curl -s -o /dev/null -w "%{http_code} " -X POST https://haymaker.camerontora.ca/api/webhooks/apple-health; done
# Expected: first few 401s, then 429s
```
