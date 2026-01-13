#!/bin/bash
# Run this script in Google Cloud Shell to set up GitHub Actions deployment
# Usage: ./setup-gcp-auth.sh

set -e

PROJECT_ID="cameron-tora"
GITHUB_REPO="camtora/infrastructure"
SA_NAME="github-actions"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Setting up GitHub Actions for GCP deployment ==="
echo "Project: $PROJECT_ID"
echo "GitHub Repo: $GITHUB_REPO"
echo ""

# Create service account
echo "Creating service account..."
gcloud iam service-accounts create $SA_NAME \
  --display-name="GitHub Actions" \
  --project=$PROJECT_ID 2>/dev/null || echo "  (already exists)"

# Grant roles
echo "Granting IAM roles..."
for role in roles/run.admin roles/storage.admin roles/iam.serviceAccountUser roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --quiet > /dev/null
  echo "  Granted $role"
done

# Create Workload Identity Pool
echo "Creating Workload Identity Pool..."
gcloud iam workload-identity-pools create "github-pool" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project=$PROJECT_ID 2>/dev/null || echo "  (already exists)"

# Create OIDC provider
echo "Creating OIDC provider..."
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project=$PROJECT_ID 2>/dev/null || echo "  (already exists)"

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Allow GitHub to impersonate service account
echo "Allowing GitHub repo to impersonate service account..."
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GITHUB_REPO}" \
  --project=$PROJECT_ID \
  --quiet > /dev/null

echo ""
echo "=== SETUP COMPLETE ==="
echo ""
echo "Add these as GitHub Secrets at:"
echo "https://github.com/${GITHUB_REPO}/settings/secrets/actions"
echo ""
echo "Secret 1 - GCP_SERVICE_ACCOUNT:"
echo "$SA_EMAIL"
echo ""
echo "Secret 2 - GCP_WORKLOAD_IDENTITY_PROVIDER:"
echo "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
echo ""
