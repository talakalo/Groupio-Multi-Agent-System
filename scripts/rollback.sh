#!/usr/bin/env bash
# Groupio — Emergency rollback script
#
# Usage:
#   ./scripts/rollback.sh <docker-image-tag>
#
# Example:
#   ./scripts/rollback.sh sha-abc1234
#   ./scripts/rollback.sh 2026-02-26
#
# Required environment variables:
#   VPS_HOST           — IP or hostname of the production server
#
# Optional environment variables:
#   VPS_USER           — SSH user (default: deploy)
#   DOCKER_REGISTRY    — Docker registry host (default: ghcr.io/groupio)
#   HEALTH_URL         — Backend health endpoint to verify after rollback
#                        (default: http://localhost:8000/api/v1/health/live)
#   SSH_KEY_PATH       — Path to SSH private key (default: ~/.ssh/id_rsa)

set -euo pipefail

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

IMAGE_TAG="${1:?Usage: $0 <docker-image-tag>}"
VPS_HOST="${VPS_HOST:?Set VPS_HOST env var (e.g. export VPS_HOST=1.2.3.4)}"
VPS_USER="${VPS_USER:-deploy}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-ghcr.io/groupio}"
HEALTH_URL="${HEALTH_URL:-http://localhost:8000/api/v1/health/live}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_rsa}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/groupio}"

echo "============================================================"
echo "  Groupio — Emergency Rollback"
echo "============================================================"
echo "  Target image tag : ${IMAGE_TAG}"
echo "  Server           : ${VPS_USER}@${VPS_HOST}"
echo "  Docker registry  : ${DOCKER_REGISTRY}"
echo "  Deploy directory : ${DEPLOY_DIR}"
echo "============================================================"
echo ""

# Confirm before proceeding
read -r -p "Proceed with rollback to '${IMAGE_TAG}'? [y/N] " confirm
if [[ "${confirm,,}" != "y" ]]; then
  echo "Rollback cancelled."
  exit 0
fi

# ---------------------------------------------------------------------------
# SSH helper
# ---------------------------------------------------------------------------

ssh_exec() {
  ssh -i "${SSH_KEY_PATH}" \
      -o StrictHostKeyChecking=no \
      -o ConnectTimeout=10 \
      "${VPS_USER}@${VPS_HOST}" "$@"
}

# ---------------------------------------------------------------------------
# Pre-flight check — make sure the image exists in the registry
# ---------------------------------------------------------------------------

echo ""
echo "[1/4] Verifying image exists..."
FULL_IMAGE="${DOCKER_REGISTRY}/api:${IMAGE_TAG}"

if ! ssh_exec "docker manifest inspect ${FULL_IMAGE} > /dev/null 2>&1 || docker pull ${FULL_IMAGE} > /dev/null 2>&1"; then
  echo "ERROR: Image '${FULL_IMAGE}' not found in registry."
  echo "       Run 'docker images' on the server to list available local images."
  exit 1
fi

echo "  ✅ Image verified: ${FULL_IMAGE}"

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------

echo ""
echo "[2/4] Deploying rollback image on ${VPS_HOST}..."

ssh_exec bash << REMOTE
  set -euo pipefail
  cd "${DEPLOY_DIR}"

  echo "  → Pulling image ${FULL_IMAGE}..."
  docker pull "${FULL_IMAGE}"

  echo "  → Tagging as current..."
  docker tag "${FULL_IMAGE}" "${DOCKER_REGISTRY}/api:current"

  echo "  → Stopping running backend..."
  docker compose stop backend || true

  echo "  → Starting backend with rollback image..."
  IMAGE_TAG="${IMAGE_TAG}" docker compose up -d backend

  echo "  → Waiting for container to initialise (10s)..."
  sleep 10
REMOTE

echo "  ✅ Container started"

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

echo ""
echo "[3/4] Running health check..."

ATTEMPTS=5
for i in $(seq 1 ${ATTEMPTS}); do
  echo "  Attempt ${i}/${ATTEMPTS}..."
  if ssh_exec "curl -sf --max-time 10 '${HEALTH_URL}'" > /dev/null 2>&1; then
    echo "  ✅ Health check passed"
    break
  fi
  if [[ ${i} -eq ${ATTEMPTS} ]]; then
    echo ""
    echo "ERROR: Health check failed after ${ATTEMPTS} attempts."
    echo "       The rollback image may itself be unhealthy."
    echo "       Run:  ssh ${VPS_USER}@${VPS_HOST} docker logs groupio-backend"
    exit 1
  fi
  sleep 5
done

# ---------------------------------------------------------------------------
# Cleanup & summary
# ---------------------------------------------------------------------------

echo ""
echo "[4/4] Cleaning up old images..."
ssh_exec "docker image prune -f --filter 'until=24h'" || true

echo ""
echo "============================================================"
echo "  ✅ Rollback complete!"
echo "     Image : ${FULL_IMAGE}"
echo "     Server: ${VPS_HOST}"
echo "============================================================"
echo ""
echo "NEXT STEPS:"
echo "  1. Monitor error rates in Grafana / Prometheus alerts"
echo "  2. File an incident report identifying the root cause"
echo "  3. Fix the issue on a feature branch before re-deploying"
echo ""
