# VPN Setup — gluetun + PIA WireGuard

_Last updated: 2026-04-22_

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

This gluetun version (commit 760fefd, built 2026-03-10) **does not support PIA as a WireGuard
provider**. The built-in provider list for WireGuard excludes PIA:
```
must be one of: airvpn, custom, fastestvpn, ivpn, mullvad, nordvpn, protonvpn, surfshark, windscribe
```

All three gluetun containers therefore use `VPN_SERVICE_PROVIDER=custom` with manually generated
WireGuard configs. This works but has one important implication: **when PIA decommissions a
server, the container breaks permanently** until a new config is manually generated for a live
server.

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

**These must match.** If they drift, Transmission uploads fine but downloads nothing.

- gluetun writes its forwarded port to `/tmp/gluetun/forwarded_port` inside the container
- Transmission's peer port is in `/config/settings.json` (also visible/editable in its UI)

To check both:
```bash
# gluetun's current forwarded port
docker logs gluetun-<active> --tail 30 | grep "port forwarded is"

# Transmission's configured port
docker exec transmission cat /config/settings.json | python3 -m json.tool | grep peer-port
```

If they don't match, update Transmission's port in its web UI (Settings → Network → Peer port),
then restart Transmission:
```bash
docker restart transmission
```

**Known gap:** There is no automation keeping these in sync. If gluetun renews its forwarded port
and gets a different one, Transmission silently goes dead. A fix (a script watching
`/tmp/gluetun/forwarded_port` and calling the Transmission RPC) is tracked in `BACKLOG.md`.

---

## Switching the active VPN

Transmission can only use one gluetun at a time. Switching is a multi-step process handled by
the health-api (`/api/admin/vpn/switch` or `/api/health/vpn/switch`). It:
1. Updates `network_mode` in docker-compose.yaml
2. Stops and recreates the Transmission container
3. Updates Sonarr/Radarr download client port
4. Updates nginx config and reloads

Do not manually switch by editing docker-compose — use the API or status dashboard UI.
