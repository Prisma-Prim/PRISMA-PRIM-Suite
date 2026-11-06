#!/usr/bin/env bash
# Start the PostgreSQL service prepared by
# `bash scripts/codex-cloud-setup.sh --profile web-postgres` and prove the
# task's readiness. It needs no network access. Run it as the Codex Cloud Start
# skill, or as the first command of a task whose environment has no Start skill.
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

runtime_directory="${HOME}/.config/prisma-prim"
if [[ ! -f "${runtime_directory}/node-runtime.sh" ]]; then
  echo "The environment is not prepared; run bash scripts/codex-cloud-setup.sh --profile web-postgres first." >&2
  exit 1
fi

# Non-interactive shells skip ~/.bashrc, where setup activates Node.
# shellcheck source=/dev/null
source "${runtime_directory}/node-runtime.sh"

bash scripts/codex-cloud-postgres.sh --start
# shellcheck source=/dev/null
source "${runtime_directory}/postgres-runtime.sh"

bash scripts/agent-pnpm.sh exec node scripts/agent-doctor.mjs --profile web-postgres --readiness-profile cloud
