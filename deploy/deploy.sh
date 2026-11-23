#!/usr/bin/env bash
# Zero-surprise deploy, run ON the Lightsail instance by the CD pipeline:
#   ./deploy.sh ghcr.io/<owner>/<repo>:<git-sha>
#
# 1. pull the exact image CI tested   2. run DB migrations against RDS
# 3. restart app + worker              4. smoke-test /api/health for the new version
# 5. on failure, roll back to the last image that passed
set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image:tag>}"
EXPECTED_VERSION="${IMAGE##*:}"
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml"
STATE_FILE=.last_successful_image

# Amazon RDS CA bundle, mounted into app + worker so Node can verify the database's
# TLS certificate. Fetched once; delete the file to refresh it after a CA rotation.
RDS_CA=rds-ca.pem
if [[ ! -s "$RDS_CA" ]]; then
  echo "▶ Downloading Amazon RDS CA bundle"
  curl -fsSL -o "$RDS_CA.tmp" https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
  mv "$RDS_CA.tmp" "$RDS_CA"
fi

deploy_image() {
  export APP_IMAGE="$1"
  echo "▶ Deploying $APP_IMAGE"
  $COMPOSE pull app worker
  echo "▶ Applying database migrations"
  $COMPOSE run --rm --no-deps app npx prisma migrate deploy
  $COMPOSE up -d --remove-orphans
}

# Caddy redirects http → https when SITE_ADDRESS is a domain, so probe the same way a
# browser would: https, with the site name resolved to this machine. -k because the
# certificate may still be being issued on the very first deploy; the pipeline's external
# smoke test checks the real, verified URL afterwards.
SITE=$(grep -E '^SITE_ADDRESS=' .env | head -1 | cut -d= -f2- | tr -d "\"'" || true)
if [[ -z "$SITE" || "$SITE" == :* ]]; then
  HEALTH_ARGS=(http://localhost/api/health)
else
  HEALTH_ARGS=(-k --resolve "$SITE:443:127.0.0.1" "https://$SITE/api/health")
fi

smoke_test() {
  local expected="$1"
  echo "▶ Smoke test: waiting for version $expected"
  for _ in $(seq 1 30); do
    body=$(curl -fsS "${HEALTH_ARGS[@]}" 2>/dev/null || true)
    if [[ "$body" == *"\"version\":\"$expected\""* && "$body" != *'"status":"down"'* ]]; then
      echo "✔ Healthy: $body"
      return 0
    fi
    sleep 2
  done
  echo "✘ Health check failed. Last response: ${body:-<none>}"
  return 1
}

if deploy_image "$IMAGE" && smoke_test "$EXPECTED_VERSION"; then
  echo "$IMAGE" > "$STATE_FILE"
  docker image prune -f > /dev/null
  echo "✔ Deployed $IMAGE"
  exit 0
fi

if [[ -f "$STATE_FILE" ]]; then
  PREVIOUS=$(cat "$STATE_FILE")
  echo "↩ Rolling back to $PREVIOUS"
  export APP_IMAGE="$PREVIOUS"
  $COMPOSE up -d --remove-orphans
  smoke_test "${PREVIOUS##*:}" || echo "✘ Rollback is unhealthy too — manual intervention needed"
else
  echo "✘ No previous successful image recorded; nothing to roll back to"
fi
exit 1
