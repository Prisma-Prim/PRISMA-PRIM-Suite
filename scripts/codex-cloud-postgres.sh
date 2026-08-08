#!/usr/bin/env bash
set -euo pipefail

mode="${1:---start}"
if [[ "${mode}" != "--start" && "${mode}" != "--install" ]]; then
  echo "Usage: bash scripts/codex-cloud-postgres.sh [--start|--install]" >&2
  exit 2
fi

readonly database_user="prisma_prim"
readonly database_password="prisma_prim"
readonly development_database="prisma_prim_dev"
readonly test_database="prisma_prim_test"
readonly expected_database_url="postgresql://${database_user}:${database_password}@127.0.0.1:5432/${development_database}"
readonly expected_test_database_url="postgresql://${database_user}:${database_password}@127.0.0.1:5432/${test_database}"

export DATABASE_URL="${DATABASE_URL:-${expected_database_url}}"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-${expected_test_database_url}}"

if [[ "${DATABASE_URL}" != "${expected_database_url}" ]]; then
  echo "DATABASE_URL must target the isolated local ${development_database} database." >&2
  exit 1
fi

if [[ "${TEST_DATABASE_URL}" != "${expected_test_database_url}" ]]; then
  echo "TEST_DATABASE_URL must target the isolated local ${test_database} database." >&2
  exit 1
fi

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "PostgreSQL setup needs root or passwordless sudo in this isolated container." >&2
    exit 1
  fi
}

run_as_postgres() {
  if [[ "$(id -u)" -eq 0 ]]; then
    runuser -u postgres -- "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u postgres "$@"
  else
    echo "PostgreSQL setup cannot switch to the local postgres operating-system user." >&2
    exit 1
  fi
}

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_ctlcluster >/dev/null 2>&1; then
  if [[ "${mode}" != "--install" ]]; then
    echo "PostgreSQL is missing from the cached container. Reset the Codex environment cache." >&2
    exit 1
  fi

  run_as_root apt-get update
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql postgresql-client
fi

cluster_found=false
while read -r version cluster _port status _owner _data_directory _log_file; do
  [[ -n "${version}" ]] || continue
  cluster_found=true
  if [[ "${status}" != "online" ]]; then
    run_as_root pg_ctlcluster "${version}" "${cluster}" start
  fi
done < <(pg_lsclusters --no-header)

if [[ "${cluster_found}" != "true" ]]; then
  echo "No local PostgreSQL cluster is available. Reset the Codex environment cache." >&2
  exit 1
fi

if [[ "$(run_as_postgres psql --dbname postgres --tuples-only --no-align --command "SELECT 1 FROM pg_roles WHERE rolname = '${database_user}'")" != "1" ]]; then
  run_as_postgres createuser --login "${database_user}"
fi
run_as_postgres psql --dbname postgres --set ON_ERROR_STOP=1 --command "ALTER ROLE ${database_user} WITH PASSWORD '${database_password}'" >/dev/null

for database_name in "${development_database}" "${test_database}"; do
  if [[ "$(run_as_postgres psql --dbname postgres --tuples-only --no-align --command "SELECT 1 FROM pg_database WHERE datname = '${database_name}'")" != "1" ]]; then
    run_as_postgres createdb --owner "${database_user}" "${database_name}"
  fi
done

psql "${DATABASE_URL}" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT 1" >/dev/null
psql "${TEST_DATABASE_URL}" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT 1" >/dev/null

echo "Local PostgreSQL is ready with ${development_database} and ${test_database}."
