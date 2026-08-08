#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

install_system_dependencies=false
if [[ "${1:-}" == "--install-system-dependencies" ]]; then
  install_system_dependencies=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: bash scripts/codex-cloud-maintenance.sh [--install-system-dependencies]" >&2
  exit 2
fi

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

activate_exact_pnpm

if [[ "$(pnpm --version)" != "${expected_pnpm}" ]]; then
  echo "Unable to activate pnpm ${expected_pnpm}. Reset the Codex environment cache." >&2
  exit 1
fi

pnpm install --frozen-lockfile

if [[ "${install_system_dependencies}" == "true" ]]; then
  pnpm --filter @prisma-prim/web exec playwright install --with-deps chromium
  bash scripts/codex-cloud-postgres.sh --install
else
  pnpm --filter @prisma-prim/web exec playwright install chromium
  bash scripts/codex-cloud-postgres.sh --start
fi

node scripts/agent-doctor.mjs --profile web-postgres
