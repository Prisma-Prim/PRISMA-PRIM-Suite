#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly postgres_version='17.11'
readonly postgres_version_number=170011
readonly postgres_source_commit='083ac033419f690758508e08c1736089384bbee8'
readonly postgres_source_sha256='d2b729db7d1f57a34b7d5906f4b4635cca6c9a04ddbd19333ef2ae35a4b25ac2'
readonly postgres_source_url="https://github.com/postgres/postgres/archive/${postgres_source_commit}.tar.gz"
readonly database_user='prisma_prim'
readonly database_password='prisma_prim'
readonly development_database='prisma_prim_dev'
readonly test_database='prisma_prim_test'
readonly cache_marker_text="prisma-prim-postgres-cache-v1
version=${postgres_version}
commit=${postgres_source_commit}
sha256=${postgres_source_sha256}"
readonly install_marker_text="prisma-prim-postgres-install-v1
version=${postgres_version}
commit=${postgres_source_commit}
sha256=${postgres_source_sha256}"
readonly runtime_marker_name='.prisma-prim-runtime-v1'
readonly cache_marker_name='.prisma-prim-cache-v1'
readonly install_marker_name='.prisma-prim-install-v1'
readonly install_manifest_name='.prisma-prim-install-manifest-v1'
readonly socket_marker_name='.prisma-prim-socket-v1'
readonly socket_intent_name='.prisma-prim-socket-intent-v1'
readonly data_marker_name='.prisma-prim-data-v1'
readonly data_intent_name='.prisma-prim-data-intent-v1'
readonly build_marker_name='.prisma-prim-build-v1'
readonly -a required_postgres_binaries=(
  postgres
  pg_ctl
  initdb
  pg_isready
  psql
  createdb
  createuser
)
readonly -a required_postgres_share_files=(
  postgres.bki
  postgresql.conf.sample
)

usage() {
  echo 'Usage: bash scripts/codex-cloud-postgres.sh [--start|--install]' >&2
  exit 2
}

fail() {
  echo "PostgreSQL setup failed: $*" >&2
  exit 1
}

if (( $# > 1 )); then
  usage
fi

mode="${1:---start}"
if [[ "${mode}" != '--start' && "${mode}" != '--install' ]]; then
  usage
fi

is_canonical_integer_in_range() {
  local value="$1"
  local minimum="$2"
  local maximum="$3"
  [[ "${value}" =~ ^[1-9][0-9]*$ ]] || return 1
  (( ${#value} <= ${#maximum} )) || return 1
  local numeric_value=$((10#${value}))
  (( numeric_value >= minimum && numeric_value <= maximum ))
}

canonical_integer() {
  local label="$1"
  local value="$2"
  local minimum="$3"
  local maximum="$4"
  if ! is_canonical_integer_in_range "${value}" "${minimum}" "${maximum}"; then
    fail "${label} must be a canonical integer from ${minimum} through ${maximum}."
  fi
}

canonical_identity() {
  local label="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^(0|[1-9][0-9]*)$ ]]; then
    fail "${label} must be a canonical non-negative integer."
  fi
}

canonical_boolean() {
  local label="$1"
  local value="$2"
  if [[ "${value}" != 'true' && "${value}" != 'false' ]]; then
    fail "${label} must be true or false."
  fi
}

readonly postgres_port="${PRISMA_PRIM_POSTGRES_PORT:-5432}"
readonly build_jobs="${PRISMA_PRIM_POSTGRES_BUILD_JOBS:-2}"
readonly readiness_attempts="${PRISMA_PRIM_POSTGRES_READY_ATTEMPTS:-60}"
readonly stop_conflicting_cluster="${PRISMA_PRIM_POSTGRES_STOP_CONFLICTING_CLUSTER:-true}"
readonly lifecycle_lock_seconds="${PRISMA_PRIM_POSTGRES_LOCK_SECONDS:-90}"

canonical_integer 'PRISMA_PRIM_POSTGRES_PORT' "${postgres_port}" 1 65535
canonical_integer 'PRISMA_PRIM_POSTGRES_BUILD_JOBS' "${build_jobs}" 1 8
canonical_integer 'PRISMA_PRIM_POSTGRES_READY_ATTEMPTS' "${readiness_attempts}" 1 120
canonical_integer 'PRISMA_PRIM_POSTGRES_LOCK_SECONDS' "${lifecycle_lock_seconds}" 1 300
canonical_boolean \
  'PRISMA_PRIM_POSTGRES_STOP_CONFLICTING_CLUSTER' \
  "${stop_conflicting_cluster}"

readonly expected_database_url="postgresql://${database_user}:${database_password}@127.0.0.1:${postgres_port}/${development_database}"
readonly expected_test_database_url="postgresql://${database_user}:${database_password}@127.0.0.1:${postgres_port}/${test_database}"

export DATABASE_URL="${DATABASE_URL:-${expected_database_url}}"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-${expected_test_database_url}}"

if [[ "${DATABASE_URL}" != "${expected_database_url}" ]]; then
  fail "DATABASE_URL must equal the isolated loopback ${development_database} target."
fi
if [[ "${TEST_DATABASE_URL}" != "${expected_test_database_url}" ]]; then
  fail "TEST_DATABASE_URL must equal the isolated loopback ${test_database} target."
fi

for required_command in id stat mkdir mv rm rmdir flock timeout sha256sum readlink dd; do
  command -v "${required_command}" >/dev/null 2>&1 ||
    fail "required command ${required_command} is unavailable."
done

caller_uid="$(timeout 5s id -u)" || fail 'id -u did not complete.'
caller_gid="$(timeout 5s id -g)" || fail 'id -g did not complete.'
caller_user="$(timeout 5s id -un)" || fail 'id -un did not complete.'
canonical_identity 'caller UID' "${caller_uid}"
canonical_identity 'caller GID' "${caller_gid}"
if [[ ! "${caller_user}" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]; then
  fail 'the caller account name is not canonical.'
fi
readonly caller_uid caller_gid caller_user

if [[ "${caller_uid}" != '0' && "${caller_user}" == "${database_user}" ]]; then
  fail 'the non-root operating-system account must differ from the application database role.'
fi

cache_mode=700
install_mode=700
runtime_mode=700
if [[ "${caller_uid}" == '0' ]]; then
  cache_mode=711
  install_mode=711
  runtime_mode=711
fi
readonly cache_mode install_mode runtime_mode

default_cache_parent='/tmp'
if [[ -d /workspace/.cache && -w /workspace/.cache ]]; then
  default_cache_parent='/workspace/.cache'
fi
readonly cache_root="${PRISMA_PRIM_POSTGRES_CACHE_ROOT:-${default_cache_parent}/prisma-prim-postgres-cache-${caller_uid}}"
readonly runtime_root="${PRISMA_PRIM_POSTGRES_RUNTIME_ROOT:-/tmp/prisma-prim-postgres-runtime-${caller_uid}}"
readonly install_root="${cache_root}/install"
readonly data_root="${runtime_root}/data"
readonly socket_root="${runtime_root}/socket"
readonly data_stage_root="${runtime_root}/.data-incomplete"
readonly socket_stage_root="${runtime_root}/.socket-incomplete"
readonly data_owner_stage_root="${runtime_root}/.data-owner-incomplete"
readonly socket_owner_stage_root="${runtime_root}/.socket-owner-incomplete"
readonly runtime_lock="${runtime_root}/lifecycle.lock"
readonly build_lock="${cache_root}/build.lock"

validate_root_name() {
  local label="$1"
  local path="$2"
  if [[ ! "${path}" =~ ^/tmp/prisma-prim-[A-Za-z0-9][A-Za-z0-9._-]*$ ]] &&
    [[ ! "${path}" =~ ^/workspace/\.cache/prisma-prim-[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    fail "${label} must be one private prisma-prim-* directory directly below /tmp or /workspace/.cache."
  fi
}

validate_root_name 'cache root' "${cache_root}"
validate_root_name 'runtime root' "${runtime_root}"
if [[ "${cache_root}" == "${runtime_root}" ]]; then
  fail 'cache and runtime roots must be distinct.'
fi

path_exists() {
  [[ -e "$1" || -L "$1" ]]
}

rename_no_replace() {
  local source="$1"
  local destination="$2"
  path_exists "${source}" || return 1
  path_exists "${destination}" && return 1
  mv -T -n -- "${source}" "${destination}" || return 1
  ! path_exists "${source}" && path_exists "${destination}"
}

file_type() {
  stat -c '%F' -- "$1"
}

file_owner() {
  stat -c '%u' -- "$1"
}

file_group() {
  stat -c '%g' -- "$1"
}

file_mode() {
  stat -c '%a' -- "$1"
}

has_group_or_world_write() {
  local mode_value
  mode_value="$(file_mode "$1")"
  [[ "${mode_value}" =~ ^[0-7]{3,4}$ ]] || return 0
  (( (8#${mode_value} & 0022) != 0 ))
}

validate_safe_install_tree_directory() {
  local tree_root="$1"
  local directory="$2"
  local child metadata type uid gid mode_value target resolved target_metadata
  for child in \
    "${directory}"/* \
    "${directory}"/.[!.]* \
    "${directory}"/..?*; do
    path_exists "${child}" || continue
    metadata="$(stat -c '%F|%u|%g|%a' -- "${child}" 2>/dev/null)" || return 1
    IFS='|' read -r type uid gid mode_value <<<"${metadata}"
    [[ "${uid}" == "${caller_uid}" && "${gid}" == "${caller_gid}" ]] ||
      return 1
    case "${type}" in
      'directory')
        [[ ! -L "${child}" && "${mode_value}" =~ ^[0-7]{3,4}$ ]] || return 1
        (( (8#${mode_value} & 07022) == 0 )) || return 1
        validate_safe_install_tree_directory "${tree_root}" "${child}" || return 1
        ;;
      'regular file' | 'regular empty file')
        [[ ! -L "${child}" && "${mode_value}" =~ ^[0-7]{3,4}$ ]] || return 1
        (( (8#${mode_value} & 07022) == 0 )) || return 1
        ;;
      'symbolic link')
        target="$(readlink -- "${child}")" || return 1
        [[ -n "${target}" && "${target}" != /* ]] || return 1
        resolved="$(readlink -f -- "${child}")" || return 1
        [[ "${resolved}" == "${tree_root}/"* ]] || return 1
        target_metadata="$(stat -c '%F|%u|%g|%a' -- "${resolved}" 2>/dev/null)" ||
          return 1
        IFS='|' read -r type uid gid mode_value <<<"${target_metadata}"
        [[ "${type}" == 'regular file' || "${type}" == 'regular empty file' ]] ||
          return 1
        [[ "${uid}" == "${caller_uid}" && "${gid}" == "${caller_gid}" ]] ||
          return 1
        [[ "${mode_value}" =~ ^[0-7]{3,4}$ ]] || return 1
        (( (8#${mode_value} & 07022) == 0 )) || return 1
        ;;
      *) return 1 ;;
    esac
  done
}

validate_safe_install_tree() {
  local root="$1"
  validate_safe_install_tree_directory "${root}" "${root}"
}

validate_directory() {
  local path="$1"
  local expected_uid="$2"
  local expected_gid="$3"
  local expected_mode="$4"
  path_exists "${path}" || return 1
  [[ ! -L "${path}" ]] || return 1
  [[ "$(file_type "${path}")" == 'directory' ]] || return 1
  [[ "$(file_owner "${path}")" == "${expected_uid}" ]] || return 1
  [[ "$(file_group "${path}")" == "${expected_gid}" ]] || return 1
  [[ "$(file_mode "${path}")" == "${expected_mode}" ]]
}

validate_regular_file() {
  local path="$1"
  local expected_uid="$2"
  local expected_gid="$3"
  local expected_mode="$4"
  path_exists "${path}" || return 1
  [[ ! -L "${path}" ]] || return 1
  local type
  type="$(file_type "${path}")"
  [[ "${type}" == 'regular file' || "${type}" == 'regular empty file' ]] ||
    return 1
  [[ "$(file_owner "${path}")" == "${expected_uid}" ]] || return 1
  [[ "$(file_group "${path}")" == "${expected_gid}" ]] || return 1
  [[ "$(file_mode "${path}")" == "${expected_mode}" ]]
}

read_regular_file() {
  local path="$1"
  local expected_uid="$2"
  local expected_gid="$3"
  local expected_mode="$4"
  local before after type uid gid mode_value size contents

  before="$(stat -c '%F|%u|%g|%a|%d:%i|%s' -- "${path}" 2>/dev/null)" ||
    return 1
  IFS='|' read -r type uid gid mode_value _ size <<<"${before}"
  [[ ! -L "${path}" ]] || return 1
  [[ "${type}" == 'regular file' || "${type}" == 'regular empty file' ]] ||
    return 1
  [[ "${uid}" == "${expected_uid}" && "${gid}" == "${expected_gid}" ]] ||
    return 1
  [[ "${mode_value}" == "${expected_mode}" ]] || return 1
  [[ "${size}" =~ ^(0|[1-9][0-9]*)$ ]] || return 1
  (( size > 0 && size <= 8192 )) || return 1

  contents="$(
    timeout 5s dd \
      if="${path}" \
      iflag=nofollow,nonblock \
      bs=8193 \
      count=1 \
      status=none 2>/dev/null
  )" || return 1
  after="$(stat -c '%F|%u|%g|%a|%d:%i|%s' -- "${path}" 2>/dev/null)" ||
    return 1
  [[ ! -L "${path}" && "${after}" == "${before}" ]] || return 1
  # Every repository-owned state file has one final newline. This byte-count
  # check also rejects embedded NULs that Bash command substitution discards.
  (( size == ${#contents} + 1 )) || return 1
  printf '%s' "${contents}"
}

validate_safe_parent() {
  local path="$1"
  local current='/'
  local component
  local -a components
  IFS='/' read -r -a components <<<"${path#/}"
  for component in "${components[@]}"; do
    [[ -n "${component}" ]] || continue
    current="${current%/}/${component}"
    path_exists "${current}" || fail "parent ${current} is missing."
    [[ ! -L "${current}" ]] || fail "parent ${current} is a symbolic link."
    [[ "$(file_type "${current}")" == 'directory' ]] ||
      fail "parent ${current} is not a directory."
    if [[ "${current}" == '/tmp' ]]; then
      [[ "$(file_owner /tmp)" == '0' ]] || fail '/tmp must be root-owned.'
      [[ "$(file_mode /tmp)" == '1777' ]] || fail '/tmp must have mode 1777.'
    else
      local owner
      owner="$(file_owner "${current}")"
      if [[ "${owner}" != '0' && "${owner}" != "${caller_uid}" ]]; then
        fail "parent ${current} is not owned by root or the caller."
      fi
      if has_group_or_world_write "${current}"; then
        fail "parent ${current} must not be group/world writable."
      fi
    fi
  done
}

prepare_workspace_cache_parent() {
  [[ "${cache_root}" == /workspace/.cache/* ]] || return 0
  validate_safe_parent '/workspace'
  if ! path_exists /workspace/.cache; then
    mkdir -m 0755 -- /workspace/.cache ||
      fail 'could not create /workspace/.cache safely.'
  fi
  validate_safe_parent '/workspace/.cache'
}

create_regular_marker() {
  local path="$1"
  local contents="$2"
  if ! (set -o noclobber; printf '%s\n' "${contents}" >"${path}"); then
    fail "marker ${path} already exists or could not be created."
  fi
}

ensure_regular_marker() {
  local path="$1"
  local contents="$2"
  local uid="$3"
  local gid="$4"
  if ! path_exists "${path}"; then
    if ! (set -o noclobber; printf '%s\n' "${contents}" >"${path}") 2>/dev/null &&
      ! path_exists "${path}"; then
      fail "marker ${path} could not be created."
    fi
  fi
  validate_marker "${path}" "${uid}" "${gid}" "${contents}" ||
    fail "marker ${path} is foreign or incompatible."
}

validate_marker() {
  local path="$1"
  local uid="$2"
  local gid="$3"
  local contents="$4"
  local actual
  actual="$(read_regular_file "${path}" "${uid}" "${gid}" 600)" || return 1
  [[ "${actual}" == "${contents}" ]]
}

ensure_owned_root() {
  local path="$1"
  local mode_value="$2"
  local marker_name="$3"
  local marker_contents="$4"
  local parent staging
  parent="${path%/*}"
  validate_safe_parent "${parent}"

  if ! path_exists "${path}"; then
    staging="${path}.create-$$"
    path_exists "${staging}" && fail "root staging path ${staging} already exists."
    mkdir -m "${mode_value}" -- "${staging}" ||
      fail "could not create root staging path ${staging}."
    validate_directory "${staging}" "${caller_uid}" "${caller_gid}" "${mode_value}" ||
      fail "root staging path ${staging} changed during creation."
    create_regular_marker "${staging}/${marker_name}" "${marker_contents}"
    validate_marker \
      "${staging}/${marker_name}" \
      "${caller_uid}" \
      "${caller_gid}" \
      "${marker_contents}" || fail "root staging marker ${staging} is invalid."
    mv -T -n -- "${staging}" "${path}"
    if path_exists "${staging}"; then
      if ! validate_directory \
        "${staging}" "${caller_uid}" "${caller_gid}" "${mode_value}" ||
        ! validate_marker \
          "${staging}/${marker_name}" \
          "${caller_uid}" \
          "${caller_gid}" \
          "${marker_contents}"; then
        fail "root staging path ${staging} cannot be removed safely."
      fi
      rm -rf --one-file-system -- "${staging}"
    fi
  fi

  validate_directory "${path}" "${caller_uid}" "${caller_gid}" "${mode_value}" ||
    fail "${path} is not an exact caller-owned directory with mode ${mode_value}."

  local marker="${path}/${marker_name}"
  validate_marker "${marker}" "${caller_uid}" "${caller_gid}" "${marker_contents}" ||
    fail "${path} is unmarked or has incompatible provenance."
}

validate_open_lock_fd() {
  local fd_number="$1"
  local path="$2"
  local marker_text="$3"
  local fd_metadata path_metadata type uid gid mode_value

  fd_metadata="$(
    stat -Lc '%F|%u|%g|%a|%d:%i' -- "/proc/self/fd/${fd_number}" 2>/dev/null
  )" || return 1
  IFS='|' read -r type uid gid mode_value _ <<<"${fd_metadata}"
  [[ "${type}" == 'regular file' || "${type}" == 'regular empty file' ]] ||
    return 1
  [[ "${uid}" == "${caller_uid}" && "${gid}" == "${caller_gid}" ]] ||
    return 1
  [[ "${mode_value}" == '600' ]] || return 1
  [[ ! -L "${path}" ]] || return 1
  path_metadata="$(stat -c '%F|%u|%g|%a|%d:%i' -- "${path}" 2>/dev/null)" ||
    return 1
  [[ "${path_metadata}" == "${fd_metadata}" ]] || return 1
  validate_marker \
    "${path}" \
    "${caller_uid}" \
    "${caller_gid}" \
    "${marker_text}"
}

prepare_workspace_cache_parent
readonly runtime_marker_text="prisma-prim-postgres-runtime-v1
owner_uid=${caller_uid}
owner_gid=${caller_gid}"
readonly runtime_lock_text="prisma-prim-postgres-runtime-lock-v1
runtime=${runtime_root}
owner_uid=${caller_uid}
owner_gid=${caller_gid}"
readonly build_lock_text="prisma-prim-postgres-build-lock-v1
cache=${cache_root}
owner_uid=${caller_uid}
owner_gid=${caller_gid}"

ensure_owned_root \
  "${runtime_root}" \
  "${runtime_mode}" \
  "${runtime_marker_name}" \
  "${runtime_marker_text}"

ensure_regular_marker \
  "${runtime_lock}" \
  "${runtime_lock_text}" \
  "${caller_uid}" \
  "${caller_gid}"

runtime_root_identity="$(stat -c '%d:%i' -- "${runtime_root}")"
exec 8<>"${runtime_lock}"
validate_open_lock_fd 8 "${runtime_lock}" "${runtime_lock_text}" ||
  fail 'the lifecycle lock did not open as the exact regular marker file.'
lock_fd_identity="$(stat -Lc '%d:%i' -- /proc/self/fd/8)"
flock -w "${lifecycle_lock_seconds}" 8 ||
  fail 'another PostgreSQL lifecycle still owns the runtime lock.'
validate_safe_parent "${runtime_root%/*}"
validate_directory \
  "${runtime_root}" \
  "${caller_uid}" \
  "${caller_gid}" \
  "${runtime_mode}" || fail 'the runtime root changed while acquiring its lock.'
[[ "$(stat -c '%d:%i' -- "${runtime_root}")" == "${runtime_root_identity}" ]] ||
  fail 'the runtime root inode changed while acquiring its lock.'
validate_marker \
  "${runtime_root}/${runtime_marker_name}" \
  "${caller_uid}" \
  "${caller_gid}" \
  "${runtime_marker_text}" || fail 'the runtime marker changed while acquiring its lock.'
validate_marker \
  "${runtime_lock}" \
  "${caller_uid}" \
  "${caller_gid}" \
  "${runtime_lock_text}" || fail 'the lifecycle lock changed after acquisition.'
[[ "$(stat -c '%d:%i' -- "${runtime_lock}")" == "${lock_fd_identity}" ]] ||
  fail 'the lifecycle lock inode changed after acquisition.'

ensure_owned_root \
  "${cache_root}" \
  "${cache_mode}" \
  "${cache_marker_name}" \
  "${cache_marker_text}"

ensure_regular_marker \
  "${build_lock}" \
  "${build_lock_text}" \
  "${caller_uid}" \
  "${caller_gid}"
cache_root_identity="$(stat -c '%d:%i' -- "${cache_root}")"
exec 9<>"${build_lock}"
validate_open_lock_fd 9 "${build_lock}" "${build_lock_text}" ||
  fail 'the build lock did not open as the exact regular marker file.'
build_lock_fd_identity="$(stat -Lc '%d:%i' -- /proc/self/fd/9)"
flock -w "${lifecycle_lock_seconds}" 9 ||
  fail 'another PostgreSQL build still owns the cache lock.'
validate_safe_parent "${cache_root%/*}"
validate_directory \
  "${cache_root}" \
  "${caller_uid}" \
  "${caller_gid}" \
  "${cache_mode}" || fail 'the cache root changed while acquiring its lock.'
[[ "$(stat -c '%d:%i' -- "${cache_root}")" == "${cache_root_identity}" ]] ||
  fail 'the cache root inode changed while acquiring its lock.'
validate_marker \
  "${cache_root}/${cache_marker_name}" \
  "${caller_uid}" \
  "${caller_gid}" \
  "${cache_marker_text}" || fail 'the cache marker changed while acquiring its lock.'
validate_marker \
  "${build_lock}" \
  "${caller_uid}" \
  "${caller_gid}" \
  "${build_lock_text}" || fail 'the build lock changed after acquisition.'
[[ "$(stat -c '%d:%i' -- "${build_lock}")" == "${build_lock_fd_identity}" ]] ||
  fail 'the build lock inode changed after acquisition.'

postgres_version_is_supported() {
  local binary="$1"
  local output="$2"
  [[ "${output}" == "${binary} (PostgreSQL) ${postgres_version}" ]]
}

generate_install_manifest() {
  local root="$1"
  (
    cd "${root}"
    /usr/bin/find . -mindepth 1 \
      \( -type f -o -type l \) \
      ! -path "./${install_marker_name}" \
      ! -path "./${install_manifest_name}" \
      -print0 |
      LC_ALL=C /usr/bin/sort -z |
      /usr/bin/xargs -0 -r /usr/bin/sha256sum
  )
}

create_install_manifest() {
  local root="$1"
  local manifest="${root}/${install_manifest_name}"
  path_exists "${manifest}" &&
    fail 'the install manifest destination already exists.'
  if ! (
    set -o noclobber
    generate_install_manifest "${root}" >"${manifest}"
  ); then
    fail 'the install manifest could not be created.'
  fi
  chmod 600 -- "${manifest}"
  validate_regular_file \
    "${manifest}" "${caller_uid}" "${caller_gid}" 600 ||
    fail 'the install manifest changed during creation.'
}

validate_install_manifest() {
  local root="$1"
  local manifest="${root}/${install_manifest_name}"
  validate_regular_file \
    "${manifest}" "${caller_uid}" "${caller_gid}" 600 || return 1
  validate_directory "${root}/share" "${caller_uid}" "${caller_gid}" 755 ||
    return 1

  local share_file share_path before after
  for share_file in "${required_postgres_share_files[@]}"; do
    share_path="${root}/share/${share_file}"
    validate_regular_file \
      "${share_path}" "${caller_uid}" "${caller_gid}" 644 || return 1
  done

  before="$(stat -c '%F|%u|%g|%a|%d:%i|%s' -- "${manifest}" 2>/dev/null)" ||
    return 1
  /usr/bin/cmp --silent -- \
    "${manifest}" <(generate_install_manifest "${root}") || return 1
  after="$(stat -c '%F|%u|%g|%a|%d:%i|%s' -- "${manifest}" 2>/dev/null)" ||
    return 1
  [[ "${after}" == "${before}" ]]
}

validate_install_payload() {
  local root="$1"
  validate_directory "${root}" "${caller_uid}" "${caller_gid}" "${install_mode}" ||
    return 1
  validate_directory "${root}/bin" "${caller_uid}" "${caller_gid}" 755 || return 1
  validate_directory "${root}/lib" "${caller_uid}" "${caller_gid}" 755 || return 1
  validate_safe_install_tree "${root}" || return 1
  validate_install_manifest "${root}" || return 1

  local binary binary_path output mode_value
  for binary in "${required_postgres_binaries[@]}"; do
    binary_path="${root}/bin/${binary}"
    [[ -f "${binary_path}" && ! -L "${binary_path}" && -x "${binary_path}" ]] ||
      return 1
    [[ "$(file_owner "${binary_path}")" == "${caller_uid}" ]] || return 1
    [[ "$(file_group "${binary_path}")" == "${caller_gid}" ]] || return 1
    mode_value="$(file_mode "${binary_path}")"
    [[ "${mode_value}" =~ ^[0-7]{3,4}$ ]] || return 1
    (( (8#${mode_value} & 07022) == 0 )) || return 1
    if [[ "${caller_uid}" == '0' ]]; then
      (( (8#${mode_value} & 0055) == 0055 )) || return 1
    fi
  done

  for binary in "${required_postgres_binaries[@]}"; do
    binary_path="${root}/bin/${binary}"
    output="$(
      timeout 5s env LD_LIBRARY_PATH="${root}/lib" "${binary_path}" --version 2>/dev/null
    )" || return 1
    postgres_version_is_supported "${binary}" "${output}" || return 1
  done
}

validate_install() {
  local root="$1"
  validate_marker \
    "${root}/${install_marker_name}" \
    "${caller_uid}" \
    "${caller_gid}" \
    "${install_marker_text}" || return 1
  validate_install_payload "${root}"
}

build_root=''
new_install=''
backup_install=''
failed_install=''
prior_install_identity=''
replacement_install_identity=''
rollback_armed=false
stop_server_on_exit=false
success_ready_message=''

remove_owned_build() {
  [[ -n "${build_root}" ]] || return 0
  if validate_directory "${build_root}" "${caller_uid}" "${caller_gid}" 700 &&
    validate_marker \
      "${build_root}/${build_marker_name}" \
      "${caller_uid}" \
      "${caller_gid}" \
      'prisma-prim-postgres-build-v1'; then
    rm -rf --one-file-system -- "${build_root}" || return 1
  fi
  return 0
}

prior_install_is_at() {
  local path="$1"
  [[ -n "${prior_install_identity}" ]] || return 1
  validate_directory "${path}" "${caller_uid}" "${caller_gid}" "${install_mode}" ||
    return 1
  [[ "$(stat -c '%d:%i' -- "${path}")" == "${prior_install_identity}" ]] ||
    return 1
  validate_marker \
    "${path}/${install_marker_name}" \
    "${caller_uid}" \
    "${caller_gid}" \
    "${install_marker_text}" || return 1
  validate_safe_install_tree "${path}"
}

replacement_install_is_at() {
  local path="$1"
  [[ -n "${replacement_install_identity}" ]] || return 1
  [[ "$(stat -c '%d:%i' -- "${path}" 2>/dev/null)" == "${replacement_install_identity}" ]] ||
    return 1
  validate_install "${path}"
}

restore_install() {
  [[ "${rollback_armed}" == 'true' ]] || return 0
  if prior_install_is_at "${install_root}"; then
    rollback_armed=false
    return 0
  fi

  [[ -n "${backup_install}" && -n "${failed_install}" ]] || return 1
  prior_install_is_at "${backup_install}" || return 1
  if path_exists "${install_root}"; then
    replacement_install_is_at "${install_root}" || return 1
    rename_no_replace "${install_root}" "${failed_install}" || return 1
  fi
  rename_no_replace "${backup_install}" "${install_root}" || return 1
  prior_install_is_at "${install_root}" || return 1
  rollback_armed=false
}

cleanup() {
  local status=$?
  trap '' HUP INT TERM
  trap - EXIT
  if (( status == 0 )) && [[ -n "${success_ready_message}" ]]; then
    if remove_owned_build && printf '%s\n' "${success_ready_message}"; then
      rollback_armed=false
      stop_server_on_exit=false
      exec 9>&- || true
      exit 0
    fi
    status=1
  fi
  local safe_to_restore=true
  if [[ "${stop_server_on_exit}" == 'true' ]]; then
    safe_to_restore=false
    local stop_confirmed=false
    if [[ -n "${service_uid:-}" ]] &&
      validate_directory "${data_root}" "${service_uid}" "${service_gid}" 700; then
      if run_as_service \
        env LD_LIBRARY_PATH="${install_root}/lib" \
        "${install_root}/bin/pg_ctl" \
        -D "${data_root}" \
        -m immediate \
        -w \
        -t "${readiness_attempts}" \
        stop \
        8>&- >/dev/null 2>&1; then
        stop_confirmed=true
      fi
    fi
    if [[ "${stop_confirmed}" == 'true' ]] &&
      ! tcp_port_is_open && ! pg_ready_tcp && ! pg_ready_socket; then
      safe_to_restore=true
    else
      echo 'PostgreSQL cleanup failed: the replacement server is still live or could not be confirmed stopped; the replacement install and prior backup were retained.' >&2
    fi
  fi
  if [[ "${safe_to_restore}" == 'true' ]]; then
    restore_install ||
      echo 'PostgreSQL cleanup failed: rollback destinations changed; the verified installs were retained without overwriting existing paths.' >&2
  fi
  remove_owned_build || true
  exec 9>&- || true
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

trusted_root_command() {
  local command_name="$1"
  local path
  path="$(command -v "${command_name}" 2>/dev/null)" || return 1
  [[ "${path}" == /* && -f "${path}" && ! -L "${path}" ]] || return 1
  [[ "$(file_owner "${path}")" == '0' ]] || return 1
  has_group_or_world_write "${path}" && return 1
  printf '%s\n' "${path}"
}

run_as_root() {
  local timeout_path='/usr/bin/timeout'
  [[ -x "${timeout_path}" ]] &&
    [[ "$(trusted_root_command "${timeout_path}")" == "${timeout_path}" ]] ||
    fail 'root commands require trusted fixed /usr/bin/timeout.'
  if [[ "${caller_uid}" == '0' ]]; then
    "${timeout_path}" 300s "$@"
    return
  fi
  local sudo_path='/usr/bin/sudo'
  [[ -x "${sudo_path}" ]] &&
    [[ "$(trusted_root_command "${sudo_path}")" == "${sudo_path}" ]] ||
    fail 'root access requires trusted fixed /usr/bin/sudo.'
  "${timeout_path}" 300s "${sudo_path}" -n -- "$@"
}

build_prerequisites_are_ready() {
  local command_name
  for command_name in curl make flex bison cc tar gzip sha256sum; do
    command -v "${command_name}" >/dev/null 2>&1 || return 1
  done

  local probe_source="${build_root}/compiler-probe.c"
  local probe_binary="${build_root}/compiler-probe"
  path_exists "${probe_source}" && return 1
  path_exists "${probe_binary}" && return 1
  if ! (
    set -o noclobber
    printf '%s\n' \
      '#include <readline/readline.h>' \
      '#include <zlib.h>' \
      'int main(void) { return zlibVersion() == 0 || rl_readline_version < 0; }' \
      >"${probe_source}"
  ); then
    return 1
  fi
  validate_regular_file \
    "${probe_source}" "${caller_uid}" "${caller_gid}" 600 || return 1
  if ! timeout 30s cc "${probe_source}" -lreadline -lz -o "${probe_binary}"; then
    rm -f -- "${probe_source}" "${probe_binary}"
    return 1
  fi
  validate_regular_file \
    "${probe_binary}" "${caller_uid}" "${caller_gid}" 700 || return 1
  rm -f -- "${probe_source}" "${probe_binary}"
}

install_build_prerequisites() {
  [[ "${mode}" == '--install' ]] ||
    fail 'PostgreSQL build prerequisites are missing; rerun with --install.'
  local apt_get='/usr/bin/apt-get'
  [[ -x "${apt_get}" ]] &&
    [[ "$(trusted_root_command "${apt_get}")" == "${apt_get}" ]] ||
    fail 'trusted fixed /usr/bin/apt-get is required to install build prerequisites.'
  run_as_root "${apt_get}" update ||
    echo 'Warning: apt-get update reported an unavailable unrelated repository.' >&2
  run_as_root \
    /usr/bin/env DEBIAN_FRONTEND=noninteractive \
    "${apt_get}" install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    flex \
    bison \
    libreadline-dev \
    zlib1g-dev
  build_prerequisites_are_ready ||
    fail 'the compiler, readline, or zlib prerequisites remain unavailable.'
}

build_postgres() {
  [[ "${mode}" == '--install' ]] ||
    fail 'the verified PostgreSQL 17.11 cache is absent; rerun with --install.'
  build_root="${cache_root}/.build-$$"
  path_exists "${build_root}" && fail 'the bounded build root already exists.'
  mkdir -m 700 -- "${build_root}"
  validate_directory "${build_root}" "${caller_uid}" "${caller_gid}" 700 ||
    fail 'the bounded build root changed during creation.'
  create_regular_marker \
    "${build_root}/${build_marker_name}" \
    'prisma-prim-postgres-build-v1'
  validate_marker \
    "${build_root}/${build_marker_name}" \
    "${caller_uid}" \
    "${caller_gid}" \
    'prisma-prim-postgres-build-v1' || fail 'the build root marker is invalid.'

  build_prerequisites_are_ready || install_build_prerequisites

  local archive="${build_root}/postgres.tar.gz"
  local source_root="${build_root}/source"
  local stage_root="${build_root}/stage"
  mkdir -m 700 -- "${source_root}"
  validate_directory "${source_root}" "${caller_uid}" "${caller_gid}" 700 ||
    fail 'the source staging directory changed during creation.'
  mkdir -m 700 -- "${stage_root}"
  validate_directory "${stage_root}" "${caller_uid}" "${caller_gid}" 700 ||
    fail 'the install staging directory changed during creation.'

  timeout 180s curl \
    --fail \
    --location \
    --retry 3 \
    --connect-timeout 10 \
    --max-time 170 \
    --max-filesize 67108864 \
    --output "${archive}" \
    "${postgres_source_url}"
  printf '%s  %s\n' "${postgres_source_sha256}" "${archive}" |
    sha256sum --check --status - ||
    fail 'the PostgreSQL source checksum does not match the immutable pin.'

  timeout 120s tar \
    --extract \
    --gzip \
    --file "${archive}" \
    --directory "${source_root}" \
    --strip-components 1 \
    --no-same-owner \
    --no-same-permissions

  (
    cd "${source_root}"
    timeout 180s ./configure \
      --prefix="${install_root}" \
      --with-readline \
      --with-zlib
    timeout 900s make -j"${build_jobs}"
    timeout 300s make DESTDIR="${stage_root}" install
  )

  local staged_install="${stage_root}${install_root}"
  [[ -d "${staged_install}" && ! -L "${staged_install}" ]] ||
    fail 'the staged PostgreSQL install is missing.'
  chmod "${install_mode}" -- "${staged_install}"
  create_regular_marker \
    "${staged_install}/${install_marker_name}" \
    "${install_marker_text}"
  create_install_manifest "${staged_install}"
  validate_install "${staged_install}" ||
    fail 'the staged PostgreSQL install failed provenance or version checks.'

  new_install="${cache_root}/.install-new-$$"
  path_exists "${new_install}" && fail 'the new install destination already exists.'
  rename_no_replace "${staged_install}" "${new_install}" ||
    fail 'the new install destination appeared during atomic publication.'
  validate_install "${new_install}" || fail 'the moved staged install changed.'
  replacement_install_identity="$(stat -c '%d:%i' -- "${new_install}")"

  if path_exists "${install_root}"; then
    validate_directory \
      "${install_root}" \
      "${caller_uid}" \
      "${caller_gid}" \
      "${install_mode}" ||
      fail 'an invalid unowned install cannot be repaired.'
    validate_marker \
      "${install_root}/${install_marker_name}" \
      "${caller_uid}" \
      "${caller_gid}" \
      "${install_marker_text}" ||
      fail 'an unmarked install cannot be repaired.'
    validate_safe_install_tree "${install_root}" ||
      fail 'an unsafe install tree cannot be repaired.'
    backup_install="${cache_root}/.install-backup-$$"
    path_exists "${backup_install}" && fail 'the install backup already exists.'
    failed_install="${cache_root}/.install-failed-$$"
    path_exists "${failed_install}" && fail 'the failed-install rollback destination already exists.'
    prior_install_identity="$(stat -c '%d:%i' -- "${install_root}")"
    rollback_armed=true
    rename_no_replace "${install_root}" "${backup_install}" ||
      fail 'the install backup destination appeared during atomic publication.'
    prior_install_is_at "${backup_install}" ||
      fail 'the prior install changed while it was moved to backup.'
  fi

  rename_no_replace "${new_install}" "${install_root}" ||
    fail 'the final install destination appeared during atomic publication.'
  validate_install "${install_root}" ||
    fail 'the published PostgreSQL install failed final validation.'
  new_install=''
}

if ! validate_install "${install_root}"; then
  build_postgres
fi
validate_install "${install_root}" ||
  fail 'PostgreSQL 17.11 is not available from a trusted cache.'
if [[ "${rollback_armed}" == 'false' ]]; then
  exec 9>&-
fi

pg_command() {
  env LD_LIBRARY_PATH="${install_root}/lib" "$@"
}

tcp_port_is_open() {
  timeout 2s bash -c "exec 3<>/dev/tcp/127.0.0.1/${postgres_port}" \
    >/dev/null 2>&1
}

pg_ready_tcp() {
  pg_command \
    "${install_root}/bin/pg_isready" \
    --host 127.0.0.1 \
    --port "${postgres_port}" \
    --timeout 1 >/dev/null 2>&1
}

pg_ready_socket() {
  pg_command \
    "${install_root}/bin/pg_isready" \
    --host "${socket_root}" \
    --port "${postgres_port}" \
    --timeout 1 >/dev/null 2>&1
}

select_conflicting_debian_clusters() {
  local clusters_output="$1"
  local version cluster port status owner data_directory log_file extra
  local status_is_online
  while read -r version cluster port status owner data_directory log_file extra; do
    [[ -n "${version}" ]] || continue
    [[ -z "${extra:-}" ]] || fail 'pg_lsclusters returned an unsafe field count.'
    canonical_integer 'pg_lsclusters version' "${version}" 1 999
    [[ "${cluster}" =~ ^[A-Za-z0-9_-]+$ ]] ||
      fail 'pg_lsclusters returned an unsafe cluster name.'
    canonical_integer 'pg_lsclusters port' "${port}" 1 65535
    case "${status}" in
      online | online,recovery) status_is_online=true ;;
      down | down,recovery) status_is_online=false ;;
      *) fail 'pg_lsclusters returned an unsafe status.' ;;
    esac
    [[ "${owner}" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] ||
      fail 'pg_lsclusters returned an unsafe owner.'
    [[ "${data_directory}" == /* && "${log_file}" == /* ]] ||
      fail 'pg_lsclusters returned unsafe non-absolute paths.'
    if [[ "${status_is_online}" == 'true' && "${port}" == "${postgres_port}" ]]; then
      printf '%s|%s\n' "${version}" "${cluster}"
    fi
  done <<<"${clusters_output}"
}

listener_before_account=false
if tcp_port_is_open || pg_ready_tcp || pg_ready_socket; then
  listener_before_account=true
fi

stop_conflicting_debian_clusters() {
  [[ "${caller_uid}" == '0' ]] || return 0
  [[ "${stop_conflicting_cluster}" == 'true' ]] || return 0
  if [[ ! -e /usr/bin/pg_lsclusters && ! -e /usr/bin/pg_ctlcluster ]]; then
    return 0
  fi
  local tool
  for tool in /usr/bin/pg_lsclusters /usr/bin/pg_ctlcluster; do
    [[ -f "${tool}" && ! -L "${tool}" && -x "${tool}" ]] ||
      fail "${tool} is not a trusted regular executable."
    [[ "$(file_owner "${tool}")" == '0' ]] ||
      fail "${tool} is not root-owned."
    has_group_or_world_write "${tool}" &&
      fail "${tool} must not be group/world writable."
  done

  local timeout_path clusters_output
  timeout_path="$(trusted_root_command timeout)" ||
    fail 'Debian cluster inspection requires a trusted timeout executable.'
  clusters_output="$("${timeout_path}" 10s /usr/bin/pg_lsclusters --no-header)" ||
    fail 'pg_lsclusters inspection failed.'
  local selected_clusters version cluster extra
  selected_clusters="$(select_conflicting_debian_clusters "${clusters_output}")" ||
    fail 'pg_lsclusters output validation failed.'
  while IFS='|' read -r version cluster extra; do
    [[ -n "${version}" ]] || continue
    [[ -z "${extra:-}" ]] || fail 'the Debian cluster stop plan is malformed.'
    "${timeout_path}" 45s /usr/bin/pg_ctlcluster "${version}" "${cluster}" stop
  done <<<"${selected_clusters}"
}

prepare_service_identity() {
  service_user="${caller_user}"
  service_uid="${caller_uid}"
  service_gid="${caller_gid}"
  runuser_path=''

  if [[ "${caller_uid}" != '0' ]]; then
    readonly service_user service_uid service_gid runuser_path
    return
  fi

  if ! timeout 5s getent passwd postgres >/dev/null 2>&1; then
    [[ "${listener_before_account}" == 'false' ]] ||
      fail 'a foreign listener exists before the postgres service account is available.'
    [[ "${mode}" == '--install' ]] ||
      fail 'the dedicated postgres operating-system account is missing.'
    local useradd_path
    useradd_path="$(trusted_root_command useradd)" ||
      fail 'a trusted useradd executable is required in install mode.'
    timeout 30s "${useradd_path}" \
      --system \
      --user-group \
      --home-dir "${runtime_root}/service-home" \
      --no-create-home \
      --shell /usr/sbin/nologin \
      postgres
  fi

  service_user='postgres'
  service_uid="$(timeout 5s id -u postgres)" || fail 'could not read postgres UID.'
  service_gid="$(timeout 5s id -g postgres)" || fail 'could not read postgres GID.'
  service_groups="$(timeout 5s id -G postgres)" ||
    fail 'could not read postgres supplementary groups.'
  canonical_identity 'postgres UID' "${service_uid}"
  canonical_identity 'postgres primary GID' "${service_gid}"
  [[ "${service_uid}" != '0' ]] || fail 'the postgres UID must not be zero.'
  [[ "${service_gid}" != '0' ]] || fail 'the postgres primary GID must not be zero.'
  [[ "${service_groups}" =~ ^(0|[1-9][0-9]*)([[:space:]]+(0|[1-9][0-9]*))*$ ]] ||
    fail 'the postgres supplementary group list is not canonical.'
  local group_id
  for group_id in ${service_groups}; do
    canonical_identity 'postgres supplementary GID' "${group_id}"
    [[ "${group_id}" != '0' ]] ||
      fail 'the postgres account must not belong to supplementary GID zero.'
  done
  runuser_path="$(trusted_root_command runuser)" ||
    fail 'root execution requires a trusted runuser executable.'
  readonly service_user service_uid service_gid runuser_path
}

run_as_service() {
  if [[ "${caller_uid}" == '0' ]]; then
    "${runuser_path}" -u postgres -- "$@"
  else
    "$@"
  fi
}

prepare_service_identity

stop_conflicting_debian_clusters

service_create_directory() {
  local path="$1"
  local mode_value="$2"
  local owner_stage="$3"
  local owner_marker_text="$4"
  path_exists "${path}" && fail "service directory ${path} already exists."
  if [[ "${caller_uid}" == '0' ]]; then
    local install_path
    path_exists "${owner_stage}" &&
      fail "service ownership staging ${owner_stage} already exists."
    mkdir -m 700 -- "${owner_stage}"
    validate_directory "${owner_stage}" "${caller_uid}" "${caller_gid}" 700 ||
      fail "service ownership staging ${owner_stage} changed during creation."
    create_regular_marker \
      "${owner_stage}/.prisma-prim-service-owner-v1" \
      "${owner_marker_text}"
    validate_marker \
      "${owner_stage}/.prisma-prim-service-owner-v1" \
      "${caller_uid}" \
      "${caller_gid}" \
      "${owner_marker_text}" ||
      fail "service ownership staging ${owner_stage} is unmarked."
    install_path="$(trusted_root_command install)" ||
      fail 'root service-directory creation requires a trusted install executable.'
    "${install_path}" -d \
      -m "${mode_value}" \
      -o postgres \
      -g postgres \
      -- "${owner_stage}/directory"
    validate_service_directory "${owner_stage}/directory" "${mode_value}" ||
      fail "service-owned directory changed inside private staging."
    mv -T -n -- "${owner_stage}/directory" "${path}"
    path_exists "${owner_stage}/directory" &&
      fail "service directory ${path} appeared during atomic publication."
    rm -f -- "${owner_stage}/.prisma-prim-service-owner-v1" ||
      fail "service ownership staging ${owner_stage} marker could not be removed."
    rmdir -- "${owner_stage}" ||
      fail "service ownership staging ${owner_stage} could not be removed."
  else
    mkdir -m "${mode_value}" -- "${path}"
  fi
  validate_service_directory "${path}" "${mode_value}" ||
    fail "service directory ${path} changed during creation."
}

service_write_new_file() {
  local path="$1"
  local staging="${path}.create-$$"
  # The child service shell, not this process, must expand its positional $1.
  # shellcheck disable=SC2016
  local write_command='set -euo pipefail; set -o noclobber; /usr/bin/cat >"$1"'
  path_exists "${path}" && fail "service file ${path} already exists."
  path_exists "${staging}" && fail "service file staging ${staging} already exists."
  run_as_service \
    /bin/bash -c \
    "${write_command}" \
    prisma-prim-service-write \
    "${staging}"
  validate_regular_file "${staging}" "${service_uid}" "${service_gid}" 600 ||
    fail "service file staging ${staging} is not an exact mode-0600 regular file."
  if ! mv -T -n -- "${staging}" "${path}"; then
    if path_exists "${staging}" && path_exists "${path}"; then
      fail "service file ${path} appeared during atomic publication."
    fi
    fail "service file ${path} could not be published atomically."
  fi
  path_exists "${staging}" &&
    fail "service file ${path} appeared during atomic publication."
  validate_regular_file "${path}" "${service_uid}" "${service_gid}" 600 ||
    fail "service file ${path} was not created as an exact mode-0600 regular file."
}

validate_service_directory() {
  local path="$1"
  local mode_value="$2"
  validate_directory "${path}" "${service_uid}" "${service_gid}" "${mode_value}"
}

validate_service_marker() {
  local path="$1"
  local contents="$2"
  validate_marker "${path}" "${service_uid}" "${service_gid}" "${contents}"
}

remove_service_owner_stage() {
  local owner_stage="$1"
  local owner_marker_text="$2"
  path_exists "${owner_stage}" || return 0
  validate_directory "${owner_stage}" "${caller_uid}" "${caller_gid}" 700 ||
    return 1
  if ! path_exists "${owner_stage}/.prisma-prim-service-owner-v1"; then
    path_exists "${owner_stage}/directory" && return 1
    rmdir -- "${owner_stage}" || return 1
    return 0
  fi
  validate_marker \
    "${owner_stage}/.prisma-prim-service-owner-v1" \
    "${caller_uid}" \
    "${caller_gid}" \
    "${owner_marker_text}" || return 1
  if path_exists "${owner_stage}/directory"; then
    validate_service_directory "${owner_stage}/directory" 700 || return 1
    rm -rf --one-file-system -- "${owner_stage}/directory" || return 1
  fi
  rm -f -- "${owner_stage}/.prisma-prim-service-owner-v1" || return 1
  rmdir -- "${owner_stage}" || return 1
}

readonly socket_marker_text="prisma-prim-postgres-socket-v1
owner_uid=${service_uid}
owner_gid=${service_gid}"
readonly socket_owner_marker_text="prisma-prim-postgres-service-owner-v1
destination=${socket_stage_root}
owner_uid=${service_uid}
owner_gid=${service_gid}"
readonly socket_intent_text="prisma-prim-postgres-socket-intent-v1
socket=${socket_root}
staging=${socket_stage_root}
owner_staging=${socket_owner_stage_root}
owner_uid=${service_uid}
owner_gid=${service_gid}"

remove_interrupted_socket_state() {
  validate_marker \
    "${runtime_root}/${socket_intent_name}" \
    "${caller_uid}" \
    "${caller_gid}" \
    "${socket_intent_text}" || return 1
  remove_service_owner_stage \
    "${socket_owner_stage_root}" \
    "${socket_owner_marker_text}" || return 1
  if path_exists "${socket_root}"; then
    validate_service_marker \
      "${socket_root}/${socket_marker_name}" \
      "${socket_marker_text}" || return 1
  fi
  if path_exists "${socket_stage_root}"; then
    validate_service_directory "${socket_stage_root}" 700 || return 1
    [[ ! -L "${socket_stage_root}" ]] || return 1
    rm -rf --one-file-system -- "${socket_stage_root}" || return 1
  fi
  rm -f -- "${runtime_root}/${socket_intent_name}" || return 1
}

publish_service_directory() {
  local staging="$1"
  local destination="$2"
  path_exists "${destination}" && fail "service destination ${destination} already exists."
  mv -T -n -- "${staging}" "${destination}"
  path_exists "${staging}" &&
    fail "service destination ${destination} appeared during atomic publication."
  return 0
}

ensure_socket_root() {
  local allow_repair="$1"
  if validate_service_marker \
    "${socket_root}/${socket_marker_name}" \
    "${socket_marker_text}"; then
    validate_service_directory "${socket_root}" 700 ||
      fail 'the socket directory changed after marker validation.'
    if path_exists "${runtime_root}/${socket_intent_name}"; then
      [[ "${allow_repair}" == 'true' ]] ||
        fail 'an existing listener has a stale socket intent.'
      remove_interrupted_socket_state ||
        fail 'the completed socket directory has foreign interrupted state.'
    fi
    return 0
  fi

  path_exists "${socket_root}" &&
    fail 'the socket directory is foreign, unsafe, or unmarked.'
  [[ "${allow_repair}" == 'true' ]] ||
    fail 'an existing listener lacks an exact owned socket directory.'
  if path_exists "${runtime_root}/${socket_intent_name}" ||
    path_exists "${socket_stage_root}" ||
    path_exists "${socket_owner_stage_root}"; then
    remove_interrupted_socket_state ||
      fail 'the interrupted socket state is not exactly owned and repairable.'
  fi

  create_regular_marker \
    "${runtime_root}/${socket_intent_name}" \
    "${socket_intent_text}"
  service_create_directory \
    "${socket_stage_root}" \
    700 \
    "${socket_owner_stage_root}" \
    "${socket_owner_marker_text}"
  printf '%s\n' "${socket_marker_text}" |
    service_write_new_file "${socket_stage_root}/${socket_marker_name}"
  validate_service_marker \
    "${socket_stage_root}/${socket_marker_name}" \
    "${socket_marker_text}" || fail 'the staged socket marker is invalid.'
  publish_service_directory "${socket_stage_root}" "${socket_root}"
  validate_service_directory "${socket_root}" 700 ||
    fail 'the published socket directory is invalid.'
  validate_service_marker \
    "${socket_root}/${socket_marker_name}" \
    "${socket_marker_text}" || fail 'the published socket marker is invalid.'
  rm -f -- "${runtime_root}/${socket_intent_name}"
}

data_marker_text() {
  local config_sha="$1"
  local auto_sha="$2"
  local hba_sha="$3"
  local ident_sha="$4"
  printf '%s\n' \
    'prisma-prim-postgres-data-v1' \
    "version=${postgres_version}" \
    "port=${postgres_port}" \
    "owner_uid=${service_uid}" \
    "owner_gid=${service_gid}" \
    "config_sha256=${config_sha}" \
    "auto_config_sha256=${auto_sha}" \
    "hba_sha256=${hba_sha}" \
    "ident_sha256=${ident_sha}"
}

readonly data_intent_text="prisma-prim-postgres-data-intent-v1
data=${data_root}
staging=${data_stage_root}
owner_staging=${data_owner_stage_root}
version=${postgres_version}
owner_uid=${service_uid}
owner_gid=${service_gid}"
readonly data_owner_marker_text="prisma-prim-postgres-service-owner-v1
destination=${data_stage_root}
owner_uid=${service_uid}
owner_gid=${service_gid}"

readonly postgresql_conf_text="data_directory = '${data_root}'
hba_file = '${data_root}/pg_hba.conf'
ident_file = '${data_root}/pg_ident.conf'
port = ${postgres_port}
listen_addresses = '127.0.0.1'
unix_socket_directories = '${socket_root}'
password_encryption = 'scram-sha-256'
max_connections = 50
shared_buffers = '32MB'"
readonly postgresql_auto_conf_text='# prisma-prim private cluster'
readonly pg_hba_conf_text="local all all peer
host all all 127.0.0.1/32 scram-sha-256"
readonly pg_ident_conf_text='# prisma-prim private cluster'

sha256_text() {
  printf '%s\n' "$1" | sha256sum | awk '{print $1}'
}

validate_data_directory() {
  local root="$1"
  local pg_version config auto hba ident config_sha auto_sha hba_sha ident_sha expected
  validate_service_directory "${root}" 700 || return 1
  pg_version="$(read_regular_file \
    "${root}/PG_VERSION" "${service_uid}" "${service_gid}" 600)" || return 1
  [[ "${pg_version}" == '17' ]] || return 1
  config="$(read_regular_file \
    "${root}/postgresql.conf" "${service_uid}" "${service_gid}" 600)" || return 1
  auto="$(read_regular_file \
    "${root}/postgresql.auto.conf" "${service_uid}" "${service_gid}" 600)" || return 1
  hba="$(read_regular_file \
    "${root}/pg_hba.conf" "${service_uid}" "${service_gid}" 600)" || return 1
  ident="$(read_regular_file \
    "${root}/pg_ident.conf" "${service_uid}" "${service_gid}" 600)" || return 1
  validate_regular_file \
    "${root}/server.log" \
    "${service_uid}" \
    "${service_gid}" \
    600 || return 1
  [[ "${config}" == "${postgresql_conf_text}" ]] || return 1
  [[ "${auto}" == "${postgresql_auto_conf_text}" ]] || return 1
  [[ "${hba}" == "${pg_hba_conf_text}" ]] || return 1
  [[ "${ident}" == "${pg_ident_conf_text}" ]] || return 1
  config_sha="$(sha256_text "${config}")" || return 1
  auto_sha="$(sha256_text "${auto}")" || return 1
  hba_sha="$(sha256_text "${hba}")" || return 1
  ident_sha="$(sha256_text "${ident}")" || return 1
  expected="$(data_marker_text \
    "${config_sha}" "${auto_sha}" "${hba_sha}" "${ident_sha}")"
  validate_service_marker "${root}/${data_marker_name}" "${expected}"
}

validate_data_root() {
  validate_data_directory "${data_root}"
}

remove_interrupted_data_state() {
  validate_marker \
    "${runtime_root}/${data_intent_name}" \
    "${caller_uid}" \
    "${caller_gid}" \
    "${data_intent_text}" || return 1
  remove_service_owner_stage \
    "${data_owner_stage_root}" \
    "${data_owner_marker_text}" || return 1
  if path_exists "${data_stage_root}" && path_exists "${data_root}"; then
    validate_data_root || return 1
  fi
  if path_exists "${data_stage_root}"; then
    validate_service_directory "${data_stage_root}" 700 || return 1
    [[ ! -L "${data_stage_root}" ]] || return 1
    rm -rf --one-file-system -- "${data_stage_root}" || return 1
  fi
  if path_exists "${data_root}" && ! validate_data_root; then
    validate_service_directory "${data_root}" 700 || return 1
    [[ ! -L "${data_root}" ]] || return 1
    rm -rf --one-file-system -- "${data_root}" || return 1
  fi
  rm -f -- "${runtime_root}/${data_intent_name}" || return 1
}

initialize_data_root() {
  if validate_data_root; then
    if path_exists "${runtime_root}/${data_intent_name}"; then
      remove_interrupted_data_state ||
        fail 'the completed data directory has a foreign interrupted state.'
    fi
    return 0
  fi
  if path_exists "${data_root}" || path_exists "${data_stage_root}" ||
    path_exists "${data_owner_stage_root}" ||
    path_exists "${runtime_root}/${data_intent_name}"; then
    remove_interrupted_data_state ||
      fail 'the data directory is incomplete but lacks exact owned repair intent.'
  fi

  create_regular_marker \
    "${runtime_root}/${data_intent_name}" \
    "${data_intent_text}"
  service_create_directory \
    "${data_stage_root}" \
    700 \
    "${data_owner_stage_root}" \
    "${data_owner_marker_text}"
  validate_service_directory "${data_stage_root}" 700 ||
    fail 'the new data directory changed before initdb.'

  run_as_service \
    env LD_LIBRARY_PATH="${install_root}/lib" \
    "${install_root}/bin/initdb" \
    -D "${data_stage_root}" \
    --auth-local=peer \
    --auth-host=scram-sha-256 \
    --data-checksums \
    --encoding=UTF8 \
    --no-locale \
    --username="${service_user}"

  run_as_service rm -f -- \
    "${data_stage_root}/postgresql.conf" \
    "${data_stage_root}/postgresql.auto.conf" \
    "${data_stage_root}/pg_hba.conf" \
    "${data_stage_root}/pg_ident.conf"
  printf '%s\n' "${postgresql_conf_text}" |
    service_write_new_file "${data_stage_root}/postgresql.conf"
  printf '%s\n' "${postgresql_auto_conf_text}" |
    service_write_new_file "${data_stage_root}/postgresql.auto.conf"
  printf '%s\n' "${pg_hba_conf_text}" |
    service_write_new_file "${data_stage_root}/pg_hba.conf"
  printf '%s\n' "${pg_ident_conf_text}" |
    service_write_new_file "${data_stage_root}/pg_ident.conf"
  printf '' | service_write_new_file "${data_stage_root}/server.log"

  local config_sha auto_sha hba_sha ident_sha marker
  config_sha="$(sha256_text "${postgresql_conf_text}")"
  auto_sha="$(sha256_text "${postgresql_auto_conf_text}")"
  hba_sha="$(sha256_text "${pg_hba_conf_text}")"
  ident_sha="$(sha256_text "${pg_ident_conf_text}")"
  marker="$(data_marker_text \
    "${config_sha}" "${auto_sha}" "${hba_sha}" "${ident_sha}")"
  printf '%s\n' "${marker}" |
    service_write_new_file "${data_stage_root}/${data_marker_name}"
  validate_data_directory "${data_stage_root}" ||
    fail 'the staged data directory failed final validation.'
  publish_service_directory "${data_stage_root}" "${data_root}"
  validate_data_root || fail 'the published data directory failed final validation.'
  rm -f -- "${runtime_root}/${data_intent_name}"
}

service_pg_command() {
  run_as_service env LD_LIBRARY_PATH="${install_root}/lib" "$@"
}

ensure_server_log() {
  local server_log="${data_root}/server.log"
  validate_regular_file "${server_log}" "${service_uid}" "${service_gid}" 600 ||
    fail 'the PostgreSQL server log is not an exact owned mode-0600 regular file.'
}

admin_query() {
  local database="$1"
  local query="$2"
  service_pg_command \
    timeout 10s \
    "${install_root}/bin/psql" \
    --no-psqlrc \
    --set ON_ERROR_STOP=1 \
    --tuples-only \
    --no-align \
    --field-separator '|' \
    --host "${socket_root}" \
    --port "${postgres_port}" \
    --username "${service_user}" \
    --dbname "${database}" \
    --command "${query}"
}

base_identity_query="SELECT current_setting('data_directory'), current_setting('port'), current_setting('unix_socket_directories'), current_setting('listen_addresses'), current_setting('server_version_num'), current_database(), current_user, current_setting('data_checksums'), 'prisma-prim-ok'"

verify_base_identity() {
  local output data port socket listen version database user checksums sentinel extra
  output="$(admin_query postgres "${base_identity_query}")" || return 1
  IFS='|' read -r data port socket listen version database user checksums sentinel extra <<<"${output}"
  [[ -z "${extra:-}" ]] || return 1
  [[ "${data}" == "${data_root}" ]] || return 1
  [[ "${port}" == "${postgres_port}" ]] || return 1
  [[ "${socket}" == "${socket_root}" ]] || return 1
  [[ "${listen}" == '127.0.0.1' ]] || return 1
  is_canonical_integer_in_range \
    "${version}" "${postgres_version_number}" "${postgres_version_number}" || return 1
  [[ "${database}" == 'postgres' ]] || return 1
  [[ "${user}" == "${service_user}" ]] || return 1
  [[ "${checksums}" == 'on' ]] || return 1
  [[ "${sentinel}" == 'prisma-prim-ok' ]]
}

app_identity_query="SELECT current_setting('data_directory'), current_setting('port'), current_setting('unix_socket_directories'), current_setting('listen_addresses'), current_setting('server_version_num'), current_database(), current_user, current_setting('data_checksums'), r.rolcanlogin, r.rolcreatedb, r.rolsuper, r.rolcreaterole, r.rolreplication, r.rolbypassrls, pg_get_userbyid(d.datdba), (SELECT count(*) FROM pg_auth_members m WHERE m.member = r.oid), 'prisma-prim-ok' FROM pg_roles r JOIN pg_database d ON d.datname = current_database() WHERE r.rolname = '${database_user}'"

role_identity_query="SELECT current_setting('data_directory'), current_setting('port'), current_setting('unix_socket_directories'), current_setting('listen_addresses'), current_setting('server_version_num'), current_database(), current_user, current_setting('data_checksums'), r.rolcanlogin, r.rolcreatedb, r.rolsuper, r.rolcreaterole, r.rolreplication, r.rolbypassrls, (SELECT count(*) FROM pg_auth_members m WHERE m.member = r.oid), 'prisma-prim-ok' FROM pg_roles r WHERE r.rolname = '${database_user}'"

verify_role_identity() {
  local transport="$1"
  local output
  if [[ "${transport}" == 'socket' ]]; then
    output="$(admin_query postgres "${role_identity_query}")" || return 1
  else
    output="$(
      PGPASSWORD="${database_password}" \
        pg_command timeout 10s \
        "${install_root}/bin/psql" \
        --no-psqlrc \
        --set ON_ERROR_STOP=1 \
        --tuples-only \
        --no-align \
        --field-separator '|' \
        --host 127.0.0.1 \
        --port "${postgres_port}" \
        --username "${database_user}" \
        --dbname postgres \
        --command "${role_identity_query}"
    )" || return 1
  fi

  local data port socket listen version database user checksums
  local can_login can_create_db superuser create_role replication bypass_rls memberships sentinel extra
  IFS='|' read -r \
    data port socket listen version database user checksums \
    can_login can_create_db superuser create_role replication bypass_rls memberships sentinel extra \
    <<<"${output}"
  [[ -z "${extra:-}" ]] || return 1
  [[ "${data}" == "${data_root}" ]] || return 1
  [[ "${port}" == "${postgres_port}" ]] || return 1
  [[ "${socket}" == "${socket_root}" ]] || return 1
  [[ "${listen}" == '127.0.0.1' ]] || return 1
  is_canonical_integer_in_range \
    "${version}" "${postgres_version_number}" "${postgres_version_number}" || return 1
  [[ "${database}" == 'postgres' ]] || return 1
  if [[ "${transport}" == 'socket' ]]; then
    [[ "${user}" == "${service_user}" ]] || return 1
  else
    [[ "${user}" == "${database_user}" ]] || return 1
  fi
  [[ "${checksums}" == 'on' ]] || return 1
  [[ "${can_login}" == 't' && "${can_create_db}" == 't' ]] || return 1
  [[ "${superuser}" == 'f' && "${create_role}" == 'f' ]] || return 1
  [[ "${replication}" == 'f' && "${bypass_rls}" == 'f' ]] || return 1
  [[ "${memberships}" == '0' ]] || return 1
  [[ "${sentinel}" == 'prisma-prim-ok' ]]
}

verify_database_identity() {
  local database_name="$1"
  local transport="$2"
  local output
  if [[ "${transport}" == 'socket' ]]; then
    output="$(admin_query "${database_name}" "${app_identity_query}")" || return 1
  else
    output="$(
      PGPASSWORD="${database_password}" \
        pg_command timeout 10s \
        "${install_root}/bin/psql" \
        --no-psqlrc \
        --set ON_ERROR_STOP=1 \
        --tuples-only \
        --no-align \
        --field-separator '|' \
        --host 127.0.0.1 \
        --port "${postgres_port}" \
        --username "${database_user}" \
        --dbname "${database_name}" \
        --command "${app_identity_query}"
    )" || return 1
  fi

  local data port socket listen version database user checksums
  local can_login can_create_db superuser create_role replication bypass_rls owner memberships sentinel extra
  IFS='|' read -r \
    data port socket listen version database user checksums \
    can_login can_create_db superuser create_role replication bypass_rls owner memberships sentinel extra \
    <<<"${output}"
  [[ -z "${extra:-}" ]] || return 1
  [[ "${data}" == "${data_root}" ]] || return 1
  [[ "${port}" == "${postgres_port}" ]] || return 1
  [[ "${socket}" == "${socket_root}" ]] || return 1
  [[ "${listen}" == '127.0.0.1' ]] || return 1
  is_canonical_integer_in_range \
    "${version}" "${postgres_version_number}" "${postgres_version_number}" || return 1
  [[ "${database}" == "${database_name}" ]] || return 1
  if [[ "${transport}" == 'socket' ]]; then
    [[ "${user}" == "${service_user}" ]] || return 1
  else
    [[ "${user}" == "${database_user}" ]] || return 1
  fi
  [[ "${checksums}" == 'on' ]] || return 1
  [[ "${can_login}" == 't' && "${can_create_db}" == 't' ]] || return 1
  [[ "${superuser}" == 'f' && "${create_role}" == 'f' ]] || return 1
  [[ "${replication}" == 'f' && "${bypass_rls}" == 'f' ]] || return 1
  [[ "${owner}" == "${database_user}" ]] || return 1
  [[ "${memberships}" == '0' ]] || return 1
  [[ "${sentinel}" == 'prisma-prim-ok' ]]
}

listener_present=false
if tcp_port_is_open || pg_ready_tcp || pg_ready_socket; then
  listener_present=true
fi

if [[ "${listener_present}" == 'true' ]]; then
  validate_data_root ||
    fail 'a foreign listener is using the selected port or socket.'
  ensure_socket_root false
  if ! pg_ready_tcp || ! pg_ready_socket; then
    fail 'an existing listener does not expose both owned transports.'
  fi
  verify_base_identity ||
    fail 'an existing listener does not match the owned server identity.'
else
  ensure_socket_root true
  initialize_data_root
  validate_data_root || fail 'the data directory changed before startup.'
  ensure_server_log
  stop_server_on_exit=true
  service_pg_command \
    "${install_root}/bin/pg_ctl" \
    -D "${data_root}" \
    -l "${data_root}/server.log" \
    -w \
    -t "${readiness_attempts}" \
    start \
    8>&- 9>&-

  ready=false
  for ((attempt = 1; attempt <= readiness_attempts; attempt += 1)); do
    if pg_ready_socket && pg_ready_tcp; then
      ready=true
      break
    fi
    sleep 1
  done
  [[ "${ready}" == 'true' ]] ||
    fail 'the owned PostgreSQL server did not become ready on socket and TCP.'
  verify_base_identity || fail 'the started PostgreSQL server identity is invalid.'
fi

admin_psql() {
  service_pg_command \
    timeout 10s \
    "${install_root}/bin/psql" \
    --no-psqlrc \
    --set ON_ERROR_STOP=1 \
    --host "${socket_root}" \
    --port "${postgres_port}" \
    --username "${service_user}" \
    --dbname postgres \
    "$@"
}

catalog_state=''
read_catalog_presence() {
  local description="$1"
  local query="$2"
  local output
  if ! output="$(admin_query postgres "${query}")"; then
    fail "the ${description} catalog probe failed."
  fi
  case "${output}" in
    1) catalog_state='present' ;;
    '') catalog_state='absent' ;;
    *) fail "the ${description} catalog probe returned unexpected output." ;;
  esac
}

read_catalog_presence \
  'application role' \
  "SELECT 1 FROM pg_roles WHERE rolname = '${database_user}'"
role_catalog_state="${catalog_state}"
declare -A database_catalog_states=()
for database_name in "${development_database}" "${test_database}"; do
  read_catalog_presence \
    "${database_name} database" \
    "SELECT 1 FROM pg_database WHERE datname = '${database_name}'"
  database_catalog_states["${database_name}"]="${catalog_state}"
done

if [[ "${role_catalog_state}" == 'absent' ]]; then
  for database_name in "${development_database}" "${test_database}"; do
    [[ "${database_catalog_states[${database_name}]}" == 'absent' ]] ||
      fail "${database_name} exists without the required application role."
  done
else
  verify_role_identity socket ||
    fail 'existing socket role identity verification failed.'
  verify_role_identity tcp ||
    fail 'existing TCP role identity verification failed.'
  for database_name in "${development_database}" "${test_database}"; do
    if [[ "${database_catalog_states[${database_name}]}" == 'present' ]]; then
      verify_database_identity "${database_name}" socket ||
        fail "existing socket identity verification failed for ${database_name}."
      verify_database_identity "${database_name}" tcp ||
        fail "existing TCP identity verification failed for ${database_name}."
    fi
  done
fi

if [[ "${role_catalog_state}" == 'absent' ]]; then
  admin_psql --command \
    "CREATE ROLE ${database_user} WITH LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${database_password}'" \
    >/dev/null
fi

for database_name in "${development_database}" "${test_database}"; do
  if [[ "${database_catalog_states[${database_name}]}" == 'absent' ]]; then
    service_pg_command \
      timeout 10s \
      "${install_root}/bin/createdb" \
      --host "${socket_root}" \
      --port "${postgres_port}" \
      --username "${service_user}" \
      --owner "${database_user}" \
      "${database_name}"
  fi
done

for database_name in "${development_database}" "${test_database}"; do
  verify_database_identity "${database_name}" socket ||
    fail "socket identity verification failed for ${database_name}."
  verify_database_identity "${database_name}" tcp ||
    fail "TCP application identity verification failed for ${database_name}."
done

verify_base_identity || fail 'final server identity verification failed.'
server_version="$(admin_query postgres 'SHOW server_version')"
[[ "${server_version}" == "${postgres_version}" ]] ||
  fail 'the final server version is not exactly PostgreSQL 17.11.'
validate_marker \
  "${runtime_lock}" \
  "${caller_uid}" \
  "${caller_gid}" \
  "${runtime_lock_text}" || fail 'the lifecycle lock changed before final output.'
[[ "$(stat -c '%d:%i' -- "${runtime_lock}")" == "${lock_fd_identity}" ]] ||
  fail 'the lifecycle lock inode changed before final output.'
success_ready_message="Local PostgreSQL ${server_version} is ready with ${development_database} and ${test_database} on isolated port ${postgres_port}."
