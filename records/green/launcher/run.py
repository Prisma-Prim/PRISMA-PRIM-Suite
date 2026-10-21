import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path('/workspace/worktrees/synthetic-recovery736')
OUT = Path('/workspace/work/synthetic-recovery736/delivery-resume-20261021/managed-green-preparation-01/launcher')

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True,
                          capture_output=True).stdout

def freeze():
    paths = git('ls-files', '-z').decode().split('\0')
    files = {}
    for name in paths:
        if name:
            path = ROOT / name
            files[name] = {
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'executable': bool(path.stat().st_mode & 0o111),
            }
    return {'head': git('rev-parse', 'HEAD').decode().strip(),
            'status': git('status', '--porcelain', '--untracked-files=all').decode(),
            'files': files}

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

argv = ['/usr/local/bin/docker-init', '-s', '--', 'bash', '/workspace/work/synthetic-recovery736/delivery-resume-20261021/managed-green-preparation-01/supervisor.sh']
before = freeze()
save('source-before.json', before)
invocation = {'schema': 'managed-recovery-whole27-correction/v1', 'startedAt': now(),
              'cwd': str(ROOT), 'argv': argv,
              'expectedQualification': 'Strict API types then unchanged complete27 recovery tests',
              'tiniSha256': hashlib.sha256(Path(argv[0]).read_bytes()).hexdigest(),
              'sourceFreeze': 'source-before.json', 'full16Qualified': False}
save('invocation.json', invocation)
owned = {}
started = time.monotonic()
with (OUT / 'lifecycle.log').open('wb') as log:
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
table = processes()
remaining = {str(pid): info for pid, info in table.items()
             if pid in owned and info['startTicks'] == owned[pid]}
result = {**invocation, 'finishedAt': now(),
          'durationSeconds': time.monotonic() - started,
          'tiniExitCode': code,
          'sourceCount': len(before['files']),
          'sourceUnchanged': before == after,
          'cleanup': {'observedOwned': {str(k): v for k, v in owned.items()},
                      'remaining': remaining, 'strictIncludingZombies': True,
                      'signalsSent': False, 'PID1OrUnrelatedProcessesTouched': False},
          'logSha256': hashlib.sha256((OUT / 'lifecycle.log').read_bytes()).hexdigest()}
result['status'] = 'passed' if code == 0 and before == after and not remaining else 'failed'
save('result.json', result)
print(json.dumps({k: v for k, v in result.items() if k != 'cleanup'}), flush=True)
print(json.dumps({'ownedCount': len(owned), 'remaining': remaining}), flush=True)
raise SystemExit(0 if result['status'] == 'passed' else 1)
