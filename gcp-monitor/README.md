# GCP Home Monitor

External monitoring service that runs on Google Cloud Run and monitors the home server.

## Purpose

When the home internet goes down, local monitoring (Uptime Kuma, Netdata) can't send alerts. This service runs externally in GCP and detects when the home server becomes unreachable.

## Deployment

### Prerequisites

1. Google Cloud project with billing enabled
2. `gcloud` CLI installed and authenticated
3. APIs enabled:
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable cloudscheduler.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   ```

### Create Secrets

```bash
# Discord webhook
echo -n "https://discord.com/api/webhooks/..." | \
  gcloud secrets create discord-webhook-url --data-file=-

# Health API key (generate a random key)
openssl rand -base64 32 | \
  gcloud secrets create health-api-key --data-file=-

# Plex token
echo -n "your-plex-token" | \
  gcloud secrets create plex-token --data-file=-
```

### Deploy to Cloud Run

```bash
cd /home/camerontora/infrastructure/gcp-monitor

gcloud run deploy home-monitor \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets=DISCORD_WEBHOOK_URL=discord-webhook-url:latest,HEALTH_API_KEY=health-api-key:latest,PLEX_TOKEN=plex-token:latest \
  --set-env-vars=HEALTH_API_URL=https://health.camerontora.ca/api/health,PLEX_URL=https://plex.camerontora.ca
```

### Create Cloud Scheduler Job

```bash
# Get the Cloud Run service URL
SERVICE_URL=$(gcloud run services describe home-monitor --region us-central1 --format='value(status.url)')

# Create scheduler job (every 5 minutes)
gcloud scheduler jobs create http home-health-check \
  --location=us-central1 \
  --schedule="*/5 * * * *" \
  --uri="${SERVICE_URL}/check" \
  --http-method=POST \
  --attempt-deadline=60s
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_WEBHOOK_URL` | Discord webhook for alerts | (required) |
| `HEALTH_API_URL` | Home health API endpoint | https://health.camerontora.ca/api/health |
| `HEALTH_API_KEY` | API key for health endpoint | (required) |
| `PLEX_URL` | Plex server URL | https://plex.camerontora.ca |
| `PLEX_TOKEN` | Plex authentication token | (required) |
| `THRESHOLD_CPU` | CPU usage alert threshold % | 90 |
| `THRESHOLD_RAM` | RAM usage alert threshold % | 95 |
| `THRESHOLD_DISK_HOMENAS` | /HOMENAS usage threshold % | 95 |
| `THRESHOLD_DISK_CAMRAID` | /CAMRAID usage threshold % | 95 |
| `THRESHOLD_DISK_VAR` | /var usage threshold % | 90 |
| `THRESHOLD_UPLOAD_MBPS` | Min upload speed Mbps | 5 |
| `THRESHOLD_SPEEDTEST_STALE_HOURS` | Max speed test age | 2 |

## Endpoints

- `GET /` - Service info
- `POST /check` - Run health check (triggered by Cloud Scheduler)

## Alerts

Alerts are sent to Discord with deduplication:
- Only alerts on state change (down → up or up → down)
- Recovery notifications when services come back online
- Includes timestamp and error details

## Testing

```bash
# Trigger a manual check
curl -X POST "${SERVICE_URL}/check"

# View logs
gcloud run services logs read home-monitor --region us-central1
```
