#!/usr/bin/env bash
# Starts the pinned PostgreSQL 17 test server for one CI job on 127.0.0.1:5432.
#
# Sharded jobs each need PostgreSQL. Pulling the image in every shard hits the
# anonymous public-registry limits ("toomanyrequests"), so the image is read
# from the workflow cache when present and otherwise pulled with bounded,
# rate-throttle-only retries and saved for later runs.
set -euo pipefail

postgres_image='public.ecr.aws/docker/library/postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
archive="${POSTGRES_IMAGE_ARCHIVE:?POSTGRES_IMAGE_ARCHIVE must name the cached image archive}"

if [ -s "$archive" ]; then
  echo 'Loading the pinned PostgreSQL image from the workflow cache.'
  docker load --input "$archive" >/dev/null
else
  for attempt in 1 2 3 4 5; do
    echo "Acquiring pinned PostgreSQL image (attempt $attempt/5, limit 90s)."
    if timeout --signal=KILL 90s docker pull "$postgres_image" >"$RUNNER_TEMP/postgres-pull" 2>&1; then
      break
    else
      pull_status=$?
    fi
    cat "$RUNNER_TEMP/postgres-pull" >&2
    # Same rule as the packaging smoke (#554): only the short-lived request
    # throttle is retried; other quotas, such as a data limit, do not recover
    # in seconds and fail at once.
    if ! grep -Fq 'toomanyrequests: Rate exceeded' "$RUNNER_TEMP/postgres-pull"; then
      exit "$pull_status"
    fi
    if [ "$attempt" -eq 5 ]; then
      echo 'PostgreSQL image acquisition exhausted five throttled attempts.' >&2
      exit "$pull_status"
    fi
    delay=$(( (10 << (attempt - 1)) + RANDOM % 5 ))
    echo "Registry throttled the pull; retrying in ${delay}s." >&2
    sleep "$delay"
  done
  mkdir -p "$(dirname "$archive")"
  docker save --output "$archive" "$postgres_image"
  echo 'saved=true' >>"$GITHUB_OUTPUT"
fi

docker run --pull=never --detach --name ci-postgres \
  --publish 127.0.0.1:5432:5432 \
  --env POSTGRES_DB=prisma_prim_dev \
  --env POSTGRES_USER=prisma_prim \
  --env POSTGRES_PASSWORD=prisma_prim \
  "$postgres_image" >/dev/null

for attempt in {1..60}; do
  # The image restarts after initialization; only the final server is PID 1.
  if docker exec ci-postgres sh -c 'test "$(cat /proc/1/comm)" = postgres && pg_isready --username prisma_prim --dbname prisma_prim_dev' >/dev/null 2>&1; then
    echo 'PostgreSQL is ready.'
    exit 0
  fi
  if [ "$attempt" -eq 60 ]; then
    docker logs ci-postgres >&2 || true
    echo 'PostgreSQL did not become ready within 60s.' >&2
    exit 1
  fi
  sleep 1
done
