#!/usr/bin/env bash
# Disposable image/HTTP proof; no Railway account or production configuration.
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v docker >/dev/null; then
  echo 'Docker is required for image packaging verification.' >&2
  exit 1
fi
if ! docker info >/dev/null; then
  echo 'A working Docker daemon is required for image packaging verification.' >&2
  exit 1
fi

suffix="railway-packaging-$$"
network="$suffix"
postgres="$suffix-postgres"
api="$suffix-api"
web="$suffix-web"
api_image="prisma-prim-api:$suffix"
web_image="prisma-prim-web:$suffix"
evidence="$(mktemp -d)"
cleanup() {
  docker rm --force "$web" "$api" "$postgres" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$web_image" "$api_image" >/dev/null 2>&1 || true
  rm -rf "$evidence"
}
trap cleanup EXIT

# Only synthetic public settings enter the web build. This key names an
# example.test FAPI host and cannot authenticate with a live Clerk instance.
publishable_key='pk_live_Y2xlcmsuZXhhbXBsZS50ZXN0JA=='
docker build --file deploy/railway/api.Dockerfile --tag "$api_image" .
docker build --file deploy/railway/web.Dockerfile --tag "$web_image" \
  --build-arg VITE_API_URL=https://api.example.test/api \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY="$publishable_key" .

if docker run --rm "$api_image" >"$evidence/missing-config" 2>&1; then
  echo 'API started without production identity settings.' >&2
  exit 1
fi
grep -F 'CLERK_PUBLISHABLE_KEY is required' "$evidence/missing-config"

docker network create "$network" >/dev/null
docker run --detach --name "$postgres" --network "$network" \
  --network-alias postgres \
  --env POSTGRES_DB=packaging --env POSTGRES_USER=packaging \
  --env POSTGRES_PASSWORD=packaging postgres:17-alpine >/dev/null
for attempt in {1..60}; do
  if docker exec "$postgres" pg_isready -U packaging -d packaging >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    docker logs "$postgres"
    exit 1
  fi
  sleep 1
done
database_url='postgresql://packaging:packaging@postgres:5432/packaging'
# Apply the committed migrations and prove the existing command is repeatable.
for attempt in 1 2; do
  docker run --rm --network "$network" --env DATABASE_URL="$database_url" \
    "$api_image" node scripts/railway-api.mjs migrate
done

docker run --detach --name "$api" --network "$network" \
  --publish 127.0.0.1::4317 --env PORT=4317 --env API_PORT=9999 \
  --env DATABASE_URL="$database_url" --env WEB_ORIGIN=https://web.example.test \
  --env CLERK_PUBLISHABLE_KEY="$publishable_key" \
  --env CLERK_SECRET_KEY=sk_live_packaging_fixture \
  --env ACCESS_IDENTITY_MODE=clerk "$api_image" >/dev/null
docker run --detach --name "$web" --publish 127.0.0.1::4318 \
  --env PORT=4318 "$web_image" >/dev/null
api_address="$(docker port "$api" 4317/tcp)"
web_address="$(docker port "$web" 4318/tcp)"
for service in "$api" "$web"; do
  if [ "$service" = "$api" ]; then
    url="http://$api_address/api/health"
  else
    url="http://$web_address/health"
  fi
  for attempt in {1..60}; do
    if curl --fail --silent "$url" >"$evidence/$service-health"; then
      break
    fi
    if [ "$attempt" -eq 60 ]; then
      docker logs "$service"
      exit 1
    fi
    sleep 1
  done
done
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  import assert from "node:assert/strict";
  assert.deepEqual(JSON.parse(readFileSync(process.argv[1], "utf8")), {
    service: "prisma-prim-api", status: "ok"
  });
' "$evidence/$api-health"
curl --fail --silent "http://$web_address/" >"$evidence/root"
curl --fail --silent "http://$web_address/accept-invitation" >"$evidence/spa"
cmp "$evidence/root" "$evidence/spa"
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "http://$web_address/assets/missing.js")" = 404
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "http://$web_address/.env")" = 404
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "http://$api_address/api/access/current-actor" \
  --header 'x-test-external-provider: clerk' \
  --header 'x-test-external-subject: packaging-fixture')" = 401
echo 'PASS image startup, hosting ports, health, direct SPA navigation, production identity rejection and repeatable migrations.'
