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

**Status: OPEN**

`nginx/conf.d/02-haymaker.conf:66` bypasses OAuth for the Apple Health webhook entirely:

```nginx
location /api/webhooks/apple-health {
    proxy_pass http://host.docker.internal:8000/webhooks/apple-health;
    # No auth_request here — straight through to backend
}
```

The backend at port 8000 validates an `X-API-Key` header, but that key is not rotated, has no rate limiting at the nginx layer, and is pure application-layer trust. An attacker can:

- Fuzz the endpoint to determine key format
- Replay a captured webhook request to inject false health data (steps, weight, sleep, etc.)
- Flood the endpoint with no rate limiting to exhaust the backend

**Exposure: MEDIUM — data integrity risk and unauthenticated rate-unlimited endpoint.**

### Fix

Add a rate limit zone for the Apple Health webhook in nginx, consistent with the pattern used on `whosup`:

```nginx
limit_req_zone $binary_remote_addr zone=haymaker_webhook:10m rate=10r/m;

location /api/webhooks/apple-health {
    limit_req zone=haymaker_webhook burst=5 nodelay;
    proxy_pass http://host.docker.internal:8000/webhooks/apple-health;
    ...
}
```

---

## Summary

| # | Vulnerability | Impact | Ease | Status |
|---|--------------|--------|------|--------|
| 1 | Direct Flask port + header spoofing → server reboot | **Server reboot** | Easy if port open | **Remediated 2026-04-22** |
| 2 | API key fail-open | Infra leak + VPN switch | Trivial once triggered | **Remediated 2026-04-22** |
| 3 | Apple Health webhook — no rate limit | Data injection, DoS | Medium | **Open** |

## Verification Steps

```bash
# Confirm port 5000 is now localhost-only
ss -tlnp | grep 5000
# Expected: 127.0.0.1:5000

# Confirm health-api rejects missing API key (should fail to start without HEALTH_API_KEY set)
docker logs health-api | tail -20

# Confirm HEALTH_API_KEY is set
grep HEALTH_API_KEY /home/camerontora/infrastructure/.env
```
