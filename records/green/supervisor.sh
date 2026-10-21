#!/usr/bin/env bash
set -euo pipefail
set -o noclobber
cd /workspace/worktrees/synthetic-recovery736
proof=/workspace/work/synthetic-recovery736/delivery-resume-20261021/managed-green-preparation-01
export pnpm_config_verify_deps_before_run=false
source /workspace/work/environment/runtime.sh
unset RECOVERY_TEST_CONTAINER
export CI=true
date -u +%Y-%m-%dT%H:%M:%SZ > "$proof/started-utc.txt"
python3 - <<'BEFORE_GUARD'
from pathlib import Path
import hashlib,json,subprocess
root=Path('/workspace/worktrees/synthetic-recovery736');p=Path('/workspace/work/synthetic-recovery736/delivery-resume-20261021/managed-green-preparation-01')
b=json.loads((p/'frozen-source.json').read_text())
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==b['head']
for f,h in {**b['sourceSha256'],**b['configurationAndOwnerSha256']}.items():assert hashlib.sha256((root/f).read_bytes()).hexdigest()==h,f
(p/'guard-before.json').write_text(json.dumps({'sourcesEightUnchanged':True,'configurationAndOwnersUnchanged':True,'headUnchanged':True},indent=2)+'\n')
BEFORE_GUARD
docker --host=unix:///var/run/docker.sock ps -a --filter label=com.prisma-prim.managed-postgres=true --format '{{.ID}} {{.Names}}' > "$proof/containers-before.txt"
docker --host=unix:///var/run/docker.sock network ls --filter label=com.prisma-prim.managed-postgres=true --format '{{.ID}} {{.Name}}' > "$proof/networks-before.txt"
docker --host=unix:///var/run/docker.sock volume ls --filter label=com.prisma-prim.managed-postgres=true --format '{{.Name}}' > "$proof/volumes-before.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$proof/types-started-utc.txt"
set +e
pnpm --filter @prisma-prim/api typecheck > "$proof/types.log" 2>&1
phase_status=$?
set -e
printf '%s\n' "$phase_status" > "$proof/types.exit-code.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$proof/types-finished-utc.txt"
if [[ "$phase_status" == 0 ]]; then
  # Refuse a missing local prerequisite before docker run could pull an image.
  set +e
  docker --host=unix:///var/run/docker.sock image inspect postgres:17-alpine --format '{{.Id}}' > "$proof/cached-image.txt" 2>&1
  phase_status=$?
  set -e
  printf '%s\n' "$phase_status" > "$proof/cached-image.exit-code.txt"
  if [[ "$phase_status" == 0 ]]; then
    set +e
    node scripts/managed-postgres.mjs -- bash "$proof/child.sh" > "$proof/managed.log" 2>&1
    phase_status=$?
    set -e
    printf '%s\n' "$phase_status" > "$proof/managed.exit-code.txt"
  fi
fi
docker --host=unix:///var/run/docker.sock ps -a --filter label=com.prisma-prim.managed-postgres=true --format '{{.ID}} {{.Names}}' > "$proof/containers-after.txt"
docker --host=unix:///var/run/docker.sock network ls --filter label=com.prisma-prim.managed-postgres=true --format '{{.ID}} {{.Name}}' > "$proof/networks-after.txt"
docker --host=unix:///var/run/docker.sock volume ls --filter label=com.prisma-prim.managed-postgres=true --format '{{.Name}}' > "$proof/volumes-after.txt"
python3 - <<'GUARD'
from pathlib import Path
import hashlib,json,subprocess
root=Path('/workspace/worktrees/synthetic-recovery736');p=Path('/workspace/work/synthetic-recovery736/delivery-resume-20261021/managed-green-preparation-01')
b=json.loads((p/'frozen-source.json').read_text())
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==b['head']
for f,h in {**b['sourceSha256'],**b['configurationAndOwnerSha256']}.items():assert hashlib.sha256((root/f).read_bytes()).hexdigest()==h,f
for kind in ['containers','networks','volumes']:
 assert (p/(kind+'-before.txt')).read_bytes()==(p/(kind+'-after.txt')).read_bytes(),kind
(p/'guard-after.json').write_text(json.dumps({'sourcesEightUnchanged':True,'configurationAndOwnersUnchanged':True,'headUnchanged':True,'managedResourcesBeforeAfterIdentical':True},indent=2)+'\n')
GUARD
date -u +%Y-%m-%dT%H:%M:%SZ > "$proof/finished-utc.txt"
exit "$phase_status"
