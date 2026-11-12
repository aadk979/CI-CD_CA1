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

deploy_image() {
  export APP_IMAGE="$1"
  echo "▶ Deploying $APP_IMAGE"
  $COMPOSE pull app worker
  echo "▶ Applying database migrations"
  $COMPOSE run --rm --no-deps app npx prisma migrate deploy
  $COMPOSE up -d --remove-orphans
}

smoke_test() {
  local expected="$1"
  echo "▶ Smoke test: waiting for version $expected"
  for _ in $(seq 1 30); do
    body=$(curl -fsS http://localhost/api/health 2>/dev/null || true)
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
