#!/usr/bin/env bash
set -euo pipefail
set -o noclobber
cd /workspace/worktrees/synthetic-recovery736
proof=/workspace/work/synthetic-recovery736/delivery-resume-20261021/managed-green-preparation-01
[[ "${CI:-}" == true ]]
[[ ! -v RECOVERY_TEST_CONTAINER ]]
date -u +%Y-%m-%dT%H:%M:%SZ > "$proof/doctor-started-utc.txt"
set +e
node scripts/agent-doctor.mjs --profile web-postgres > "$proof/doctor.log" 2>&1
phase_status=$?
set -e
printf '%s\n' "$phase_status" > "$proof/doctor.exit-code.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$proof/doctor-finished-utc.txt"
[[ "$phase_status" == 0 ]] || exit "$phase_status"
date -u +%Y-%m-%dT%H:%M:%SZ > "$proof/test-started-utc.txt"
set +e
pnpm --filter @prisma-prim/api exec vitest run src/recovery/synthetic-recovery.rest.test.ts --no-file-parallelism --maxWorkers=1 > "$proof/test.log" 2>&1
phase_status=$?
set -e
printf '%s\n' "$phase_status" > "$proof/test.exit-code.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$proof/test-finished-utc.txt"
exit "$phase_status"
