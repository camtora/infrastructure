# DNS Failover

When the home server goes down, visitors to public-facing camerontora.ca services are automatically redirected to the GCP-hosted status dashboard instead of getting SSL errors or timeouts.

**Implemented:** 2026-02-20
**Status:** Complete (pending end-to-end test)

---

## How It Works

### Normal State

All public DNS A records point to the home server's dynamic IP (updated every 10 min by the DDNS cron job):

| Domain | A Record |
|--------|----------|
| `camerontora.ca` | 142.198.177.140 (dynamic, home IP) |
| `plex.camerontora.ca` | 142.198.177.140 |
| `ombi.camerontora.ca` | 142.198.177.140 |
| `overseerr.camerontora.ca` | 142.198.177.140 |

### Failover State

When triggered (manually via the status dashboard admin panel), all 4 A records are flipped to GCP's anycast IPs. Visitors hit the `status-dashboard` Cloud Run service, which shows a "services are currently offline" banner.

| Domain | A Record |
|--------|----------|
| `camerontora.ca` | 216.239.32.21 (GCP anycast) |
| `plex.camerontora.ca` | 216.239.32.21 |
| `ombi.camerontora.ca` | 216.239.32.21 |
| `overseerr.camerontora.ca` | 216.239.32.21 |

> **Why these domains?** These are the services people might try to visit when the home server is down. Protected services (Radarr, Sonarr, etc.) are already behind OAuth — if the home server is down, they're just inaccessible, which is fine.

> **Why not whosup.camerontora.ca?** It's a public API endpoint for a mobile app, not a human-visited page. Failing it over to a status page would break app clients.

### Failback

Triggered manually via the status dashboard. Flips all 4 A records back to the current home IP.

The DDNS cron job (`/etc/cron.d/godaddy-ddns`) resumes normal operation automatically once the `@` record is no longer pointing to a GCP IP.

---

## GCP Infrastructure

### Cloud Run Service

**Service:** `status-dashboard`
**Region:** `us-central1`
**Project:** `cameron-tora`
**Public URL:** https://status.camerontora.ca

### Domain Mappings

Four Cloud Run domain mappings were created so Google manages SSL certs for each domain:

```bash
gcloud beta run domain-mappings create --service=status-dashboard --domain=camerontora.ca --project=cameron-tora --region=us-central1
gcloud beta run domain-mappings create --service=status-dashboard --domain=plex.camerontora.ca --project=cameron-tora --region=us-central1
gcloud beta run domain-mappings create --service=status-dashboard --domain=ombi.camerontora.ca --project=cameron-tora --region=us-central1
gcloud beta run domain-mappings create --service=status-dashboard --domain=overseerr.camerontora.ca --project=cameron-tora --region=us-central1
```

All four map to the same stable anycast IPs:
- `216.239.32.21`
- `216.239.34.21`
- `216.239.36.21`
- `216.239.38.21`

### GCP Secret Manager

| Secret | Value | Purpose |
|--------|-------|---------|
| `gcp-static-ip` | `216.239.32.21` | IP written into DNS A records during failover |

> **Note:** The `gcp-static-ip` secret was updated from placeholder `192.178.192.121` to `216.239.32.21` when the domain mapping was created.

---

## Implementation Details

### 1. Status Dashboard — DNS Records Config

**File:** `status-dashboard/backend/config.py`

```python
DNS_RECORDS = ["@", "plex", "ombi", "overseerr"]
```

The `failover_dns()` function in `dns_manager.py` iterates this list to build the GoDaddy batch PUT payload. Adding or removing domains from failover is done by editing this list.

### 2. DDNS Sentinel Check

**File:** `scripts/godaddy-ddns.sh`

Without this fix, the DDNS cron would run every 10 minutes and silently undo any active failover (resetting all A records back to the home IP).

The fix: after fetching current DNS records, check if the `@` record already points to a known GCP IP. If so, exit immediately — don't touch DNS.

```bash
GCP_IPS=("216.239.32.21" "216.239.34.21" "216.239.36.21" "216.239.38.21")
CURRENT_AT_IP="$(echo "$CURRENT_RECORDS" | jq -r '.[] | select(.name == "@") | .data // empty' | head -1)"
for gcp_ip in "${GCP_IPS[@]}"; do
  if [[ "$CURRENT_AT_IP" == "$gcp_ip" ]]; then
    log "↻ DNS failover active (@→${CURRENT_AT_IP}), skipping DDNS update"
    exit 0
  fi
done
```

The `@` record is used as the sentinel: if it's on GCP, failover is active. When failback runs, `@` returns to home IP and DDNS resumes normally on its next cron cycle.

---

## SSL Cert Provisioning

Google-managed certs for the four domain mappings require each domain to briefly resolve to a GCP IP (HTTP-01 or Google's equivalent challenge). Provisioning takes ~15-30 minutes per domain.

### One-time Setup (Already Done)

All four A records were temporarily pointed to `216.239.32.21` on 2026-02-20 to allow cert provisioning. The DDNS sentinel check was committed first to prevent the cron job from undoing this.

### Checking Cert Status

```bash
gcloud beta run domain-mappings describe --domain=camerontora.ca --project=cameron-tora --region=us-central1
gcloud beta run domain-mappings describe --domain=plex.camerontora.ca --project=cameron-tora --region=us-central1
gcloud beta run domain-mappings describe --domain=ombi.camerontora.ca --project=cameron-tora --region=us-central1
gcloud beta run domain-mappings describe --domain=overseerr.camerontora.ca --project=cameron-tora --region=us-central1
```

Look for `CertificateProvisioned: True` in the output.

### After Certs Provision

Run the DDNS script to revert all records back to the home IP:

```bash
sudo /home/camerontora/infrastructure/scripts/godaddy-ddns.sh
```

The sentinel check will be inactive (since `@` will be on a GCP IP only during cert provisioning, then we're reverting). After the script runs, all records point back to home IP and normal operation resumes.

---

## Triggering Failover / Failback

Via the status dashboard admin panel at https://status.camerontora.ca:

1. Log in (Google SSO, admin account)
2. Go to DNS Controls panel
3. Click **Failover to GCP** or **Failback to Home**

The dashboard calls `POST /api/dns/failover` with `{"target": "gcp"}` or `{"target": "home"}`.

### Manual via API

```bash
# Failover to GCP
curl -X POST https://status.camerontora.ca/api/dns/failover \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"target": "gcp"}'

# Failback to home
curl -X POST https://status.camerontora.ca/api/dns/failover \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"target": "home"}'

# Dry run (no DNS changes)
curl -X POST https://status.camerontora.ca/api/dns/failover \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"target": "gcp", "dry_run": true}'
```

---

## End-to-End Test Checklist

- [x] Cert provisioning complete on all 4 domains
- [x] Revert all 4 domains to home IP via DDNS script
- [x] Confirm DDNS script runs clean (no failover false-positive)
- [x] Trigger failover via status dashboard
- [x] Confirm `camerontora.ca` → GCP status page (HTTPS, no cert error)
- [x] Confirm `plex.camerontora.ca` → GCP status page (HTTPS, no cert error)
- [x] Confirm `ombi.camerontora.ca` → GCP status page (HTTPS, no cert error)
- [x] Confirm `overseerr.camerontora.ca` → GCP status page (HTTPS, no cert error)
- [x] Wait 10+ minutes — confirm DDNS sentinel prevents undo (log shows "DNS failover active, skipping")
- [x] Trigger failback via status dashboard
- [x] Confirm all 4 domains return to home server

---

## Troubleshooting

### DDNS script undoes failover

Check that the sentinel check is in place:

```bash
grep -A5 "GCP_IPS" /home/camerontora/infrastructure/scripts/godaddy-ddns.sh
```

Check the log:

```bash
tail -20 /var/log/godaddy-ddns.log
```

### Domain not serving status page after failover

Check current DNS resolution:

```bash
dig +short camerontora.ca
dig +short plex.camerontora.ca
```

If still pointing to home IP, the GoDaddy failover API call may have failed — check status dashboard logs.

### Cert still provisioning

Certs can take up to 30 minutes. The domain must resolve to a GCP IP for the challenge to succeed. If the DDNS script flipped it back prematurely, re-point to `216.239.32.21` manually (temporarily).

### Adding a new domain to failover

1. Create a Cloud Run domain mapping: `gcloud beta run domain-mappings create --service=status-dashboard --domain=NEW.camerontora.ca --project=cameron-tora --region=us-central1`
2. Add `"NEW"` to `DNS_RECORDS` in `status-dashboard/backend/config.py`
3. Temporarily point the subdomain to `216.239.32.21` for cert provisioning
4. After cert provisions, run DDNS script to revert
5. Push and deploy
