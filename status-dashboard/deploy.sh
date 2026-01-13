#!/bin/bash
# Deploy status-dashboard to GCP Cloud Run
set -e

PROJECT_ID="cameron-tora"
REGION="us-central1"
SERVICE_NAME="status-dashboard"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Building and deploying status-dashboard ===${NC}"

# Check for required secrets
echo "Checking required secrets..."
REQUIRED_SECRETS=(
    "health-api-key"
    "discord-webhook-url"
    "godaddy-api-key"
    "godaddy-api-secret"
    "admin-api-key"
    "gcp-static-ip"
)

MISSING_SECRETS=()
for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! gcloud secrets describe "$secret" --project="${PROJECT_ID}" &>/dev/null; then
        MISSING_SECRETS+=("$secret")
    fi
done

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Missing secrets:${NC}"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo "  - $secret"
    done
    echo ""
    echo "Create missing secrets with:"
    echo "  gcloud secrets create SECRET_NAME --project=${PROJECT_ID}"
    echo "  echo 'secret_value' | gcloud secrets versions add SECRET_NAME --data-file=- --project=${PROJECT_ID}"
    echo ""
    echo "For GoDaddy secrets, get values from: /etc/godaddy-ddns.env"
    echo "For admin-api-key, generate a random key: openssl rand -hex 32"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build and push image
echo -e "${GREEN}Building Docker image...${NC}"
gcloud builds submit --tag "${IMAGE}" --project "${PROJECT_ID}"

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 60 \
  --set-secrets "HEALTH_API_KEY=health-api-key:latest,DISCORD_WEBHOOK_URL=discord-webhook-url:latest,GODADDY_API_KEY=godaddy-api-key:latest,GODADDY_API_SECRET=godaddy-api-secret:latest,ADMIN_API_KEY=admin-api-key:latest,GCP_IP=gcp-static-ip:latest"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format "value(status.url)")

echo ""
echo -e "${GREEN}=== Deployment complete ===${NC}"
echo "Service URL: ${SERVICE_URL}"

# Create or update Cloud Scheduler job
echo ""
echo "Setting up Cloud Scheduler..."
SCHEDULER_JOB="status-check"

if gcloud scheduler jobs describe "${SCHEDULER_JOB}" --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "Updating existing scheduler job..."
    gcloud scheduler jobs update http "${SCHEDULER_JOB}" \
      --location="${REGION}" \
      --project="${PROJECT_ID}" \
      --schedule="*/5 * * * *" \
      --uri="${SERVICE_URL}/api/check" \
      --http-method=POST \
      --attempt-deadline=60s
else
    echo "Creating new scheduler job..."
    gcloud scheduler jobs create http "${SCHEDULER_JOB}" \
      --location="${REGION}" \
      --project="${PROJECT_ID}" \
      --schedule="*/5 * * * *" \
      --uri="${SERVICE_URL}/api/check" \
      --http-method=POST \
      --attempt-deadline=60s
fi

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Dashboard: ${SERVICE_URL}"
echo ""
echo -e "${YELLOW}Manual steps required:${NC}"
echo "1. Add DNS record in GoDaddy: status.camerontora.ca -> CNAME to ghs.googlehosted.com"
echo "2. Store admin key securely for failover access"
echo ""
echo "To test locally:"
echo "  curl ${SERVICE_URL}/api/status | jq ."
echo "  curl ${SERVICE_URL}/api/health"
