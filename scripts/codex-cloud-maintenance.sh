#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

setup_started_at=${SECONDS}
profile="base"
install_system_dependencies=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --profile)
      if [[ "$#" -lt 2 ]]; then
        echo "Missing value for --profile." >&2
        exit 2
      fi
      profile="$2"
      shift 2
      ;;
    --install-system-dependencies)
      install_system_dependencies=true
      shift
      ;;
    *)
      echo "Usage: bash scripts/codex-cloud-maintenance.sh [--profile base|postgres] [--install-system-dependencies]" >&2
      exit 2
      ;;
  esac
done

if [[ "${profile}" != "base" && "${profile}" != "postgres" ]]; then
  echo "Unknown profile: ${profile}. Expected base or postgres." >&2
  exit 2
fi

if [[ "${install_system_dependencies}" == "true" && "${profile}" != "postgres" ]]; then
  echo "--install-system-dependencies is valid only with --profile postgres." >&2
  exit 2
fi

run_step() {
  local description="$1"
  shift
  local started_at=${SECONDS}

  echo "==> ${description}"
  "$@"
  echo "<== ${description} completed in $((SECONDS - started_at))s"
}

expected_pnpm="$(node --input-type=module --eval "import packageJson from './package.json' with { type: 'json' }; process.stdout.write(packageJson.packageManager.split('@').at(-1));")"

activate_exact_pnpm() {
  if command -v pnpm >/dev/null 2>&1 && [[ "$(pnpm --version)" == "${expected_pnpm}" ]]; then
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    if corepack enable && corepack prepare "pnpm@${expected_pnpm}" --activate; then
      return
    fi
  fi

  npm install --global "pnpm@${expected_pnpm}"
}

dependency_fingerprint() {
  local -a manifests
  mapfile -t manifests < <(
    git ls-files -- package.json pnpm-lock.yaml pnpm-workspace.yaml ':(glob)**/package.json' |
      LC_ALL=C sort --unique
  )

  if [[ "${#manifests[@]}" -eq 0 ]]; then
    echo "No dependency manifests were found in the repository." >&2
    return 1
  fi

  {
    printf 'node=%s\npnpm=%s\n' "$(node --version)" "${expected_pnpm}"
    sha256sum "${manifests[@]}"
  } | sha256sum | awk '{print $1}'
}

synchronize_dependencies() {
  local marker="node_modules/.codex-dependency-fingerprint"
  local current_fingerprint
  current_fingerprint="$(dependency_fingerprint)"

  if [[ -f "${marker}" ]] && [[ "$(<"${marker}")" == "${current_fingerprint}" ]]; then
    echo "Dependency manifests are unchanged; reusing cached node_modules."
    return
  fi

  pnpm install --frozen-lockfile --prefer-offline
  printf '%s\n' "${current_fingerprint}" >"${marker}"
}

run_step "Activate pnpm ${expected_pnpm}" activate_exact_pnpm

if [[ "$(pnpm --version)" != "${expected_pnpm}" ]]; then
  echo "Unable to activate pnpm ${expected_pnpm}. Reset the Codex environment cache." >&2
  exit 1
fi

run_step "Synchronize workspace dependencies" synchronize_dependencies

if [[ "${profile}" == "postgres" ]]; then
  if [[ "${install_system_dependencies}" == "true" ]]; then
    run_step "Install and provision local PostgreSQL" bash scripts/codex-cloud-postgres.sh --install
  else
    run_step "Restore local PostgreSQL" bash scripts/codex-cloud-postgres.sh --start
  fi
fi

run_step "Verify the ${profile} Codex environment" node scripts/agent-doctor.mjs --profile "${profile}"

echo "Codex environment preparation completed in $((SECONDS - setup_started_at))s."
