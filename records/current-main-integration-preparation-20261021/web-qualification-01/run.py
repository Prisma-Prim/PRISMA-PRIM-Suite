import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path('/workspace/worktrees/complaints-runtime737')
OUT = Path('/workspace/work/complaints-runtime737/current-main-integration-preparation-20261021/web-qualification-01')

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True,
                          capture_output=True).stdout

def freeze(validate=True):
    paths = git('ls-files', '-z').decode().split('\0')
    files = {}
    for name in paths:
        if name:
            path = ROOT / name
            files[name] = {
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'executable': bool(path.stat().st_mode & 0o111),
                'mode': oct(path.stat().st_mode & 0o777),
            }
    if len(files) != 1331:
        raise RuntimeError('Unexpected tracked source count')
    untracked = git('ls-files', '--others', '--exclude-standard', '-z').decode().split('\0')
    expected = json.loads((OUT / 'expected-source.json').read_text())
    if git('rev-parse', 'HEAD').decode().strip() != expected['head']:
        raise RuntimeError('Unexpected HEAD')
    dependencies = {'node_modules', 'apps/api/node_modules', 'apps/web/node_modules'}
    additional = sorted(name for name in untracked if name and name not in dependencies)
    if additional != sorted(expected['untrackedSources']):
        raise RuntimeError('Unexpected untracked source inventory')
    for name in additional:
        path = ROOT / name
        files[name] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                       'executable': bool(path.stat().st_mode & 0o111),
                       'mode': oct(path.stat().st_mode & 0o777)}
    raw_status = git('status', '--porcelain', '--untracked-files=all').decode()
    if raw_status != expected['rawStatus']:
        raise RuntimeError('Unexpected raw Git status')
    for name, facts in files.items():
        if validate and (facts['sha256'] != expected['files'][name]['sha256'] or facts['mode'] != expected['files'][name]['mode']):
            raise RuntimeError('Source differs from frozen cycle proposal: ' + name)
    preparation = json.loads((OUT / 'inputs.json').read_text())
    execution_inputs = {}
    for name, expected_hash in preparation['inputs'].items():
        actual_hash = hashlib.sha256(Path(name).read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise RuntimeError('Execution input changed: ' + name)
        execution_inputs[name] = actual_hash
    links = {name: str((ROOT / name).readlink()) for name in dependencies}
    if links != preparation['dependencyLinks']:
        raise RuntimeError('Dependency links changed')
    return {'head': git('rev-parse', 'HEAD').decode().strip(), 'executionInputs': execution_inputs, 'dependencyLinks': links,
            'status': raw_status, 'files': files,
            'untrackedSources': additional}


def processes():
    result = {}
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            value = (path / 'stat').read_text()
            fields = value[value.rfind(')') + 2:].split()
            result[int(path.name)] = {'ppid': int(fields[1]),
                                     'state': fields[0], 'startTicks': fields[19]}
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            pass
    return result

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')

argv = ['/usr/local/bin/docker-init', '-s', '--', 'python3', '/workspace/work/complaints-runtime737/current-main-integration-preparation-20261021/web-qualification-01/child.py']
def managed_inventory():
    base = ['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY','-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock']
    result={}
    for key,args in [('containers',['ps','-aq']),('networks',['network','ls','-q']),('volumes',['volume','ls','-q'])]:
        result[key]=subprocess.check_output(base+args+['--filter','label=com.prisma-prim.managed-postgres=true'],text=True).splitlines()
    result['temporaryDirectories']=[str(p) for p in Path('/tmp').glob('prisma-prim-managed-postgres-*')]
    return result
managed_before=managed_inventory()
save('managed-before.json',managed_before)
if any(managed_before.values()):raise RuntimeError('Managed inventory is not empty before run')
before = freeze()
save('source-before.json', before)
invocation = {'schema': '753-current-main-web-qualification-01/v1', 'startedAt': now(),
              'cwd': str(ROOT), 'argv': argv,
              'commands': 'commands.json',
              'runnerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'childSha256': hashlib.sha256((OUT / 'child.py').read_bytes()).hexdigest(),
              'selectionSha256': hashlib.sha256((OUT / 'commands.json').read_bytes()).hexdigest(),
              'tiniSha256': hashlib.sha256(Path(argv[0]).read_bytes()).hexdigest(),
              'sourceFreeze': 'source-before.json', 'full16Qualified': False, 'profile': 'Matching web doctor; exact8web paths format/lint; web+registered Ideas/Complaints and canonical Client-union E2E strict;9 whole affected message/Client-union/Ideas/Complaints public web owners/canonical15000ms/worker1/bail1/no-skip; no PostgreSQL/browser/build/full16; API unchanged-source historical evidence remains separate'}
save('invocation.json', invocation)
owned = {}
started = time.monotonic()
with (OUT / 'supervisor.log').open('wb') as log:
    child = subprocess.Popen(argv, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                             start_new_session=True)
    invocation['tiniPid'] = child.pid
    save('invocation.json', invocation)
    while True:
        table = processes()
        if child.pid in table:
            owned.setdefault(child.pid, table[child.pid]['startTicks'])
        found = True
        while found:
            found = False
            for pid, info in table.items():
                if pid not in owned and info['ppid'] in owned:
                    parent = table.get(info['ppid'])
                    if parent and parent['startTicks'] == owned[info['ppid']]:
                        owned[pid] = info['startTicks']
                        found = True
        code = child.poll()
        if code is not None:
            break
        time.sleep(0.25)

child.wait()
after = freeze()
save('source-after.json', after)
managed_after=managed_inventory()
save('managed-after.json',managed_after)
table = processes()
remaining = {str(pid): info for pid, info in table.items()
             if pid in owned and info['startTicks'] == owned[pid]}
result = {**invocation, 'finishedAt': now(),
          'durationSeconds': time.monotonic() - started,
          'tiniExitCode': code,
          'trackedSourceCount': 1331, 'explicitAdditionalSourceCount': len(before['untrackedSources']), 'sourceCount': len(before['files']),
          'sourceUnchanged': before == after, 'managedInventoriesEmpty': not any(managed_before.values()) and not any(managed_after.values()), 'managedRuntimeLaunched': False,
          'cleanup': {'observedOwned': {str(k): v for k, v in owned.items()},
                      'remaining': remaining, 'strictIncludingZombies': True,
                      'signalsSent': False, 'PID1OrUnrelatedProcessesTouched': False},
          'logSha256': hashlib.sha256((OUT / 'supervisor.log').read_bytes()).hexdigest()}
result['status'] = 'passed' if code == 0 and before == after and not remaining and not any(managed_after.values()) else 'failed'
save('result.json', result)
print(json.dumps({k: v for k, v in result.items() if k != 'cleanup'}), flush=True)
print(json.dumps({'ownedCount': len(owned), 'remaining': remaining}), flush=True)
raise SystemExit(0 if result['status'] == 'passed' else 1)
