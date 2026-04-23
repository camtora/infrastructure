# VPN Setup — gluetun + PIA WireGuard

_Last updated: 2026-04-23_

---

## Architecture

Transmission runs inside gluetun's network namespace — it cannot reach the internet except
through the VPN tunnel. If the VPN drops, traffic stops rather than leaking the home IP.

```
Transmission container
  └── network_mode: service:gluetun-<active>
        └── WireGuard tunnel → PIA server → internet
```

Three gluetun containers run in parallel as VPN options:

| Container | Region | Port | Config server |
|---|---|---|---|
| gluetun-toronto | CA Toronto | 9091 | toronto403 (66.56.80.228) |
| gluetun-montreal | CA Montreal | 9092 | montreal433 (37.120.205.10) |
| gluetun-vancouver | CA Vancouver | 9093 | vancouver439 (149.22.95.59) |

Only one is active at a time (Transmission uses one via `network_mode`). Switching is handled
by the health-api VPN switch endpoint or the status dashboard.

---

## Why custom WireGuard (not gluetun's built-in PIA provider)

PIA WireGuard has **never been supported** as a native gluetun provider and there is no plan
to add it in the near future. This is not a version limitation — it is an architectural one.

gluetun's security model requires that no traffic leave the container before the VPN tunnel
is established. Setting up PIA WireGuard requires calling PIA's API to fetch credentials
*before* the tunnel exists — these two requirements are fundamentally incompatible. A PR to
add support has been open since 2023 (qdm12/gluetun#1836) and remains blocked. The gluetun
wiki explicitly states: "native WireGuard support for Private Internet Access is not yet available."

The custom provider approach is the **official recommended workaround**. All three gluetun
containers use `VPN_SERVICE_PROVIDER=custom` with manually generated WireGuard configs.
The downside: **when PIA decommissions a server, the container breaks permanently** until a
new config is manually generated for a live server (see regeneration steps below).

---

## Key expiry

PIA WireGuard keys and port forwarding leases expire. From gluetun logs:
- Port forwarding data: **expires every ~30 days** (gluetun renews automatically while running)
- WireGuard key registration: tied to the server — if the server is decommissioned, the key
  is worthless regardless of expiry

gluetun renews port forwarding automatically as long as the container stays running. The
forwarded port **can change between renewals** — this is what caused the Transmission 0-traffic
issue on 2026-04-22 (montreal's forwarded port changed; Transmission's peer-port didn't update).

---

## Symptoms of a dead gluetun container

```
ERROR [vpn] restarting VPN because it failed to pass the healthcheck:
  startup check: all check tries failed:
  parallel attempt 1/2 failed: dialing: dial tcp4: lookup github.com: i/o timeout
```

This means the WireGuard tunnel connected but no traffic flows — the server endpoint is dead.

---

## How to check available PIA servers

```bash
wget -qO- "https://serverlist.piaservers.net/vpninfo/servers/v6" | python3 -c "
import json, sys
raw = sys.stdin.read().split('\n')[0]
data = json.loads(raw)
for r in data.get('regions', []):
    name = r.get('name','').lower()
    if any(x in name for x in ['toronto', 'montreal', 'vancouver']):
        wg = r.get('servers', {}).get('wg', [])
        print(r.get('name'), '|', r.get('id'))
        for s in wg:
            print(' ', s.get('ip'), s.get('cn'))
"
```

---

## How to regenerate a WireGuard config for a dead container

Run this when a gluetun container is stuck in a restart loop (dead PIA server). Takes ~2 minutes.

### Step 1 — Identify a live server IP for the region

Run the server check above, pick an IP from the relevant region.

### Step 2 — Get a PIA auth token

```bash
PIA_TOKEN=$(curl -s -u "<PIA_USER>:<PIA_PASS>" \
  "https://privateinternetaccess.com/gtoken/generateToken" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token: ${PIA_TOKEN:0:20}..."
```

Credentials are in `/home/camerontora/docker-services/.env` as `PIA_USER` and `PIA_PASS`.

### Step 3 — Generate a new WireGuard keypair

```bash
PRIVATE_KEY=$(docker run --rm alpine sh -c \
  "apk add --quiet wireguard-tools 2>/dev/null && wg genkey")
PUBLIC_KEY=$(echo "$PRIVATE_KEY" | docker run --rm -i alpine sh -c \
  "apk add --quiet wireguard-tools 2>/dev/null && wg pubkey")
echo "Private: $PRIVATE_KEY"
echo "Public:  $PUBLIC_KEY"
```

### Step 4 — Register the key with PIA

Replace `<SERVER_IP>` with the server IP from Step 1, and `<PUBLIC_KEY>` from Step 3:

```bash
curl -s -G \
  --data-urlencode "pt=$PIA_TOKEN" \
  --data-urlencode "pubkey=<PUBLIC_KEY>" \
  "https://<SERVER_IP>:1337/addKey" \
  --insecure | python3 -m json.tool
```

You'll get back:
```json
{
  "status": "OK",
  "server_key": "<SERVER_PUBLIC_KEY>",
  "server_port": 1337,
  "server_ip": "<SERVER_IP>",
  "peer_ip": "<YOUR_ASSIGNED_IP>",
  ...
}
```

### Step 5 — Update docker-compose.yaml

In `/home/camerontora/docker-services/docker-compose.yaml`, update the relevant gluetun service:

```yaml
- WIREGUARD_PRIVATE_KEY=<PRIVATE_KEY from Step 3>
- WIREGUARD_PUBLIC_KEY=<server_key from Step 4 response>
- WIREGUARD_ADDRESSES=<peer_ip from Step 4 response>/32
- WIREGUARD_ENDPOINT_IP=<server_ip from Step 4 response>
- WIREGUARD_ENDPOINT_PORT=1337
- SERVER_NAMES=<server cn from PIA server list>
```

**Important:** `WIREGUARD_PUBLIC_KEY` is the **server's** key (from the API response), not yours.
`WIREGUARD_PRIVATE_KEY` is **your** generated private key.

### Step 6 — Recreate the container

```bash
cd /home/camerontora/docker-services
docker-compose up -d --force-recreate gluetun-<region>
docker logs gluetun-<region> --tail 20
```

Look for:
```
INFO [ip getter] Public IP address is <IP> (Canada, <City>)
INFO [port forwarding] port forwarded is <PORT>
```

---

## Transmission peer port vs gluetun forwarded port

Two different ports, different purposes:

- **Proxy port (9091/9092/9093):** The port nginx uses to reach Transmission's web UI. Each
  gluetun exposes a different host port so they can all run in parallel without conflicts.
  Used by nginx, Sonarr, and Radarr to route traffic to the active Transmission instance.

- **Peer port (e.g. 42643):** The BitTorrent listening port. This is what external peers use
  to connect *to you* over the internet. PIA punches a hole through their VPN for one specific
  port per session. If Transmission isn't listening on that exact port, peers can't reach you
  and downloads stall at 0 despite showing connected peers.

**These must match.** If they drift, Transmission uploads fine but downloads nothing.

To check both:
```bash
# gluetun's current forwarded port
docker logs gluetun-<active> --tail 30 | grep "port forwarded is"

# Transmission's configured port
docker exec transmission cat /config/settings.json | python3 -m json.tool | grep peer-port
```

If they don't match manually, update Transmission's port in its web UI (Settings → Network →
Peer port), then restart Transmission:
```bash
docker restart transmission
```

---

## Switching the active VPN

Transmission can only use one gluetun at a time. Switching is handled by the health-api
(`/api/admin/vpn/switch` from the status dashboard, or `/api/health/vpn/switch` for
auto-failover from gcp-monitor). Source: `health-api/app.py` — `_do_vpn_switch()`.

The switch performs these steps in order:

1. **Update docker-compose.yaml** — changes `network_mode` and `depends_on` to point
   Transmission at the new gluetun container
2. **Stop and remove Transmission** — `docker stop transmission && docker rm transmission`
3. **Verify target gluetun is running** — aborts if the target VPN container isn't healthy
4. **Sync peer port** _(added 2026-04-23, commit `fd8ab5c`)_ — reads the forwarded port from
   `/tmp/gluetun/forwarded_port` inside the target gluetun container via `docker exec`, then
   writes it directly to `transmission/config/settings.json` while Transmission is stopped.
   This ensures Transmission starts with the correct peer port for the new VPN automatically.
5. **Recreate Transmission** — `docker compose up -d transmission` from `/docker-services`
6. **Wait for Transmission to be ready** — polls RPC endpoint up to 30 seconds
7. **Update Sonarr/Radarr download client port** — updates the proxy port (9091/9092/9093)
   so they route to the correct Transmission instance
8. **Update nginx config and reload** — routes `transmission.camerontora.ca` to the new port
9. **Update speedtest.json** — marks the new VPN as active

The response includes a `steps_completed` list. After a successful switch, step 4 appears as:
```
"Synced Transmission peer-port to 42643 (gluetun forwarded port)"
```

**Do not manually switch by editing docker-compose** — use the API or status dashboard UI.
The switch script handles nginx, Sonarr, Radarr, and peer port sync atomically.
