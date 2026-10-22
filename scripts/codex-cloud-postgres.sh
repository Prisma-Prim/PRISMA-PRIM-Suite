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
readonly runtime_directory="${HOME}/.config/prisma-prim"
readonly runtime_file="${runtime_directory}/postgres-runtime.sh"

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

apt_get() {
  # sudo -n resets the environment, so the unattended frontend must travel
  # inside the escalated command rather than as an exported variable.
  as_root env DEBIAN_FRONTEND=noninteractive apt-get "$@"
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

refresh_package_index() {
  # The container image bakes third-party apt sources that a hardened harness
  # network can block: apt.llvm.org answers 403 through the Codex Cloud proxy.
  # A partial refresh is therefore expected. The PGDG source is refreshed
  # separately with strict error handling before installing PostgreSQL.
  apt_get update -qq ||
    echo 'Some apt sources could not be refreshed; continuing with the sources that succeeded.' >&2
}

pgdg_candidate_is_available() {
  # No pipeline: under `set -o pipefail` a reader that exits early makes
  # apt-cache receive SIGPIPE and the whole pipeline report failure.
  local policy
  policy="$(apt-cache policy "postgresql-${postgres_major}" 2>/dev/null || true)"
  [[ "${policy}" == *apt.postgresql.org* ]]
}

publish_signing_key() (
  local temporary_key
  temporary_key="$(mktemp)"
  trap 'rm -f -- "${temporary_key}"' EXIT
  curl -fsSL -o "${temporary_key}" https://www.postgresql.org/media/keys/ACCC4CF8.asc ||
    fail 'could not download the complete PostgreSQL repository signing key.'
  [[ -s "${temporary_key}" ]] || fail 'the PostgreSQL repository signing key is empty.'
  as_root install -m 644 "${temporary_key}" "$1"
)

install_packages() {
  local codename keyring source_list
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  [[ -n "${codename}" ]] || fail 'could not read the Debian or Ubuntu codename.'
  keyring='/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc'
  source_list='/etc/apt/sources.list.d/pgdg.list'

  refresh_package_index
  if ! command -v curl >/dev/null ||
    [[ "$(dpkg-query -W -f='${Status}' ca-certificates 2>/dev/null || true)" != 'install ok installed' ]]; then
    apt_get install -y -qq --no-install-recommends curl ca-certificates ||
      fail 'curl and CA certificates are required to fetch the PostgreSQL repository signing key.'
  fi
  as_root install -d /usr/share/postgresql-common/pgdg
  if ! as_root test -s "${keyring}"; then
    publish_signing_key "${keyring}"
  fi
  printf 'deb [signed-by=%s] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' \
    "${keyring}" "${codename}" | as_root tee "${source_list}" >/dev/null
  apt_get update -qq \
    -o "Dir::Etc::sourcelist=${source_list}" \
    -o 'Dir::Etc::sourceparts=-' \
    -o 'APT::Update::Error-Mode=any' ||
    fail 'the PGDG index could not be refreshed from apt.postgresql.org.'
  pgdg_candidate_is_available ||
    fail "postgresql-${postgres_major} is not available from apt.postgresql.org; the PGDG index could not be refreshed."
  apt_get install -y -qq --no-install-recommends \
    "postgresql-${postgres_major}" "postgresql-client-${postgres_major}"
}

start_cluster() {
  local clusters major name cluster_port cluster_status remainder status='' target_port=''
  clusters="$(as_root pg_lsclusters --no-header)"
  while read -r major name cluster_port cluster_status remainder; do
    if [[ "${major}" == "${postgres_major}" && "${name}" == "${cluster_name}" ]]; then
      target_port="${cluster_port}"
      status="${cluster_status}"
    elif [[ "${cluster_port}" == "${port}" ]]; then
      fail "port ${port} belongs to conflicting cluster ${major}/${name}; expected ${postgres_major}/${cluster_name}."
    fi
  done <<<"${clusters}"
  [[ -n "${status}" ]] || fail "cluster ${postgres_major}/${cluster_name} was not found."
  [[ "${target_port}" == "${port}" ]] ||
    fail "cluster ${postgres_major}/${cluster_name} uses port ${target_port}; expected ${port}."
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
  local role_exists role_compliant database database_exists database_owner
  role_exists="$(as_postgres_sql -tA -c "SELECT 1 FROM pg_roles WHERE rolname = '${database_user}'")"
  if [[ "${role_exists}" != '1' ]]; then
    as_postgres_sql -c "CREATE ROLE ${database_user} WITH LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${database_password}'"
  else
    role_compliant="$(as_postgres_sql -tA -c "SELECT rolcanlogin AND rolcreatedb AND NOT rolsuper AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname = '${database_user}'")"
    if [[ "${role_compliant}" != 't' ]]; then
      as_postgres_sql -c "ALTER ROLE ${database_user} WITH LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${database_password}'"
    fi
  fi
  for database in "${development_database}" "${test_database}"; do
    database_exists="$(as_postgres_sql -tA -c "SELECT 1 FROM pg_database WHERE datname = '${database}'")"
    if [[ "${database_exists}" != '1' ]]; then
      as_postgres_sql -c "CREATE DATABASE ${database} OWNER ${database_user} TEMPLATE template0"
    else
      database_owner="$(as_postgres_sql -tA -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '${database}'")"
      if [[ "${database_owner}" != "${database_user}" ]]; then
        as_postgres_sql -c "ALTER DATABASE ${database} OWNER TO ${database_user}"
      fi
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

persist_application_targets() {
  # The postgres profile provides the
  # two isolated local targets itself instead of relying on Codex environment
  # variables, which prevented the container from starting when tested.
  local bashrc_source_line='source "${HOME}/.config/prisma-prim/postgres-runtime.sh"'
  mkdir -p "${runtime_directory}"
  {
    printf '%s\n' '# Generated by PRISMA-PRIM Codex environment setup (postgres profile).'
    printf 'export DATABASE_URL=%q\n' \
      "postgresql://${database_user}:${database_password}@${listen_address}:${port}/${development_database}"
    printf 'export TEST_DATABASE_URL=%q\n' \
      "postgresql://${database_user}:${database_password}@${listen_address}:${port}/${test_database}"
  } >"${runtime_file}"
  # ~/.bashrc returns early in non-interactive shells, and the agent runs
  # commands through non-interactive login shells that read ~/.profile.
  local shell_file
  for shell_file in "${HOME}/.bashrc" "${HOME}/.profile"; do
    touch "${shell_file}"
    if ! grep -Fqx "${bashrc_source_line}" "${shell_file}"; then
      printf '\n%s\n' "${bashrc_source_line}" >>"${shell_file}"
    fi
  done
  echo "Exported DATABASE_URL and TEST_DATABASE_URL for agent shells in ${runtime_file}."
}

main() {
  if ! cluster_installed; then
    [[ "${mode}" == '--install' ]] ||
      fail "PostgreSQL ${postgres_major} is not installed; rerun with --install."
    install_packages
    cluster_installed || fail "the postgresql-${postgres_major} package did not create the ${cluster_name} cluster."
  fi

  start_cluster
  ensure_application_identities
  verify_application_connection
  persist_application_targets
}

# Sourcing exposes the installer entry point without provisioning the host.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main
fi
