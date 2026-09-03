#!/usr/bin/env bash
# Provision or restart the isolated PostgreSQL 17 used by the Codex Cloud
# `postgres` environment. Installs the PGDG apt package once (--install) and
# starts the Debian cluster on every cached resume (--start). Idempotent.
set -euo pipefail

readonly postgres_major='17'
readonly cluster_name='main'
readonly database_user='prisma_prim'
readonly database_password='prisma_prim'
readonly development_database='prisma_prim_dev'
readonly test_database='prisma_prim_test'
readonly listen_address='127.0.0.1'
readonly port='5432'

usage() {
  echo 'Usage: bash scripts/codex-cloud-postgres.sh [--start|--install]' >&2
  exit 2
}

fail() {
  echo "PostgreSQL setup failed: $*" >&2
  exit 1
}

(($# <= 1)) || usage
mode="${1:---start}"
[[ "${mode}" == '--start' || "${mode}" == '--install' ]] || usage

as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo -n -- "$@"
  fi
}

as_postgres_sql() {
  as_root runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d postgres "$@"
}

cluster_installed() {
  [[ -x "/usr/lib/postgresql/${postgres_major}/bin/postgres" ]] &&
    as_root pg_lsclusters --no-header 2>/dev/null |
    awk -v major="${postgres_major}" -v name="${cluster_name}" \
      '$1 == major && $2 == name { found = 1 } END { exit found ? 0 : 1 }'
}

install_packages() {
  local codename keyring source_list
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  [[ -n "${codename}" ]] || fail 'could not read the Debian or Ubuntu codename.'
  keyring='/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc'
  source_list='/etc/apt/sources.list.d/pgdg.list'

  export DEBIAN_FRONTEND=noninteractive
  as_root apt-get update -qq
  as_root apt-get install -y -qq --no-install-recommends curl ca-certificates
  as_root install -d /usr/share/postgresql-common/pgdg
  if ! as_root test -s "${keyring}"; then
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc |
      as_root tee "${keyring}" >/dev/null
  fi
  printf 'deb [signed-by=%s] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' \
    "${keyring}" "${codename}" | as_root tee "${source_list}" >/dev/null
  as_root apt-get update -qq
  as_root apt-get install -y -qq --no-install-recommends \
    "postgresql-${postgres_major}" "postgresql-client-${postgres_major}"
}

start_cluster() {
  local status
  status="$(as_root pg_lsclusters --no-header |
    awk -v major="${postgres_major}" -v name="${cluster_name}" '$1 == major && $2 == name { print $4 }')"
  if [[ "${status}" != online ]]; then
    as_root pg_ctlcluster "${postgres_major}" "${cluster_name}" start
  fi
  local attempt
  for attempt in $(seq 1 30); do
    if pg_isready -q -h "${listen_address}" -p "${port}"; then
      return 0
    fi
    sleep 1
  done
  fail "PostgreSQL ${postgres_major} did not accept connections on ${listen_address}:${port}."
}

ensure_application_identities() {
  local role_exists database
  role_exists="$(as_postgres_sql -tA -c "SELECT 1 FROM pg_roles WHERE rolname = '${database_user}'")"
  if [[ "${role_exists}" != '1' ]]; then
    as_postgres_sql -c "CREATE ROLE ${database_user} WITH LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${database_password}'"
  fi
  for database in "${development_database}" "${test_database}"; do
    if [[ "$(as_postgres_sql -tA -c "SELECT 1 FROM pg_database WHERE datname = '${database}'")" != '1' ]]; then
      as_postgres_sql -c "CREATE DATABASE ${database} OWNER ${database_user} TEMPLATE template0"
    fi
  done
}

verify_application_connection() {
  local version
  version="$(PGPASSWORD="${database_password}" psql -X -tA \
    -h "${listen_address}" -p "${port}" -U "${database_user}" -d "${test_database}" \
    -c "SELECT current_setting('server_version_num')")" ||
    fail "the application role cannot connect to ${test_database} over TCP."
  [[ "${version}" =~ ^${postgres_major}[0-9]{4}$ ]] ||
    fail "expected a PostgreSQL ${postgres_major}.x server, detected server_version_num ${version}."
  echo "PostgreSQL ${postgres_major} (server_version_num ${version}) is ready on ${listen_address}:${port} with ${development_database} and ${test_database}."
}

if ! cluster_installed; then
  [[ "${mode}" == '--install' ]] ||
    fail "PostgreSQL ${postgres_major} is not installed; rerun with --install."
  install_packages
  cluster_installed || fail "the postgresql-${postgres_major} package did not create the ${cluster_name} cluster."
fi

start_cluster
ensure_application_identities
verify_application_connection
