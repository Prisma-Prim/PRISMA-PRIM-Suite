#!/usr/bin/env bash
set -euo pipefail
cd /workspace/worktrees/complaints737-on-ideas751
export pnpm_config_verify_deps_before_run=false
source /workspace/work/environment/runtime.sh
exec python3 /workspace/work/complaints-runtime737/ideas751-integration-preparation/cumulative-phase-checks/run-phase.py "$@"
