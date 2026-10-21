#!/usr/bin/env bash
set -euo pipefail
cd /workspace/worktrees/complaints-runtime737
export pnpm_config_verify_deps_before_run=false
source /workspace/work/environment/runtime.sh
exec python3 /workspace/work/complaints-runtime737/current-main-integration-preparation-20261021/web-continuation-02/run.py
