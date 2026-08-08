#!/usr/bin/env bash
set -euo pipefail

echo "Compatibility wrapper: configure Codex Cloud with scripts/codex-cloud-maintenance.sh." >&2
exec bash scripts/codex-cloud-maintenance.sh
