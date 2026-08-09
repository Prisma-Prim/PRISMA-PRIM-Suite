#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

profile="base"
if [[ "$#" -gt 0 ]]; then
  if [[ "$#" -eq 2 && "$1" == "--profile" && ("$2" == "base" || "$2" == "postgres") ]]; then
    profile="$2"
  else
    echo "Usage: bash scripts/codex-cloud-setup.sh [--profile base|postgres]" >&2
    exit 2
  fi
fi

maintenance_arguments=()
if [[ "${profile}" == "postgres" ]]; then
  maintenance_arguments+=(--profile postgres --install-system-dependencies)
fi

bash scripts/codex-cloud-maintenance.sh "${maintenance_arguments[@]}"
