"""Four canonical Ideas/Complaint acceptance cases only after fresh seal review + lane transfer.

Reuse the existing owned disposable PostgreSQL and canonical global setup/teardown.
No build, schema generation/promotion, assertion/config-budget change or Git action.
"""
from pathlib import Path
from urllib.parse import quote
import datetime
import hashlib
import json
import os
import runpy
import signal
import socket
import subprocess
import sys
import time

ROOT = Path('/workspace/worktrees/complaints737-on-ideas751')
SCRATCH = Path(__file__).resolve().parent
DOCKER = ['docker','--host','unix:///var/run/docker.sock']
CONTAINER = 'complaints737-postgres'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save(path, value):
    path.write_text(json.dumps(value,indent=2)+'\n')


def ports_free():
    result = {}
    for port in [4173,4174]:
        with socket.socket() as connection:
            connection.settimeout(0.1)
            result[str(port)] = connection.connect_ex(('127.0.0.1',port)) != 0
    return result


def processes():
    result = {}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fields = (entry/'stat').read_text().rsplit(')',1)[1].split()
            result[int(entry.name)] = {'parent':int(fields[1]),'start_ticks':fields[19],'state':fields[0]}
        except (FileNotFoundError,ProcessLookupError,PermissionError):
            continue
    return result


def observe(known):
    current = processes()
    owned = {pid for pid,start in known.items() if pid in current and current[pid]['start_ticks'] == start}
    changed = True
    while changed:
        changed = False
        for pid,details in current.items():
            if details['parent'] in owned and pid not in owned:
                owned.add(pid)
                known[pid] = details['start_ticks']
                changed = True


def main():
    if sys.argv[1:] != ['--lane-transferred','--seal-reviewed']:
        raise SystemExit('Not started: explicit coordinator lane transfer and real build-seal review required.')
    attempt = SCRATCH/'browser-attempt'
    attempt.mkdir(exist_ok=False)
    record = {'started_utc':now(),'status':'PREFLIGHT','commands':[],'browser_started':False,'owned_container_started':False,'builds_started':False,'runner_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    known = {}
    started = False
    code = 2
    environment = dict(os.environ)

    def command(argv,label,cwd=ROOT/'apps/web',monitor=False):
        item = {'argv':argv,'cwd':str(cwd),'started_utc':now(),'log':str(attempt/(label+'.log'))}
        record['commands'].append(item)
        save(attempt/'result.json',record)
        with (attempt/(label+'.log')).open('xb') as log:
            child = subprocess.Popen(argv,cwd=cwd,env=environment,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            item['pid'] = child.pid
            if monitor:
                row = processes().get(child.pid)
                if row:
                    known[child.pid] = row['start_ticks']
                while child.poll() is None:
                    observe(known)
                    time.sleep(0.25)
            value = child.wait()
        item.update(exit_code=value,finished_utc=now())
        (attempt/(label+'.exit-code')).write_text(str(value)+'\n')
        save(attempt/'result.json',record)
        return value

    def database_names(user):
        output = subprocess.check_output(DOCKER+['exec',CONTAINER,'psql','-U',user,'-d','postgres','-At','-c',"SELECT datname FROM pg_database WHERE datname ~ '^operational_acceptance_[0-9a-f]{32}_test$' ORDER BY datname"],text=True)
        return output.splitlines()

    try:
        assert Path.cwd() == ROOT, 'Run from owned real checkout'
        assert environment.get('pnpm_config_verify_deps_before_run') == 'false'
        plan = json.loads((SCRATCH/'plan.json').read_text())
        for name in list(environment):
            if name.startswith('VITE_'):
                del environment[name]
        environment.pop('NODE_ENV',None)
        environment.update(plan['pinned_public_env'])
        record['seal_sha256'] = hashlib.sha256((SCRATCH/'browser-current-build-manifest.json').read_bytes()).hexdigest()
        code = command(['python3',str(SCRATCH/'verify-browser-builds.py')],'sealed-build-guard-before')
        if code:
            raise RuntimeError('Fresh build seal no longer matches; browser not started')
        record['ports_before'] = ports_free()
        assert all(record['ports_before'].values()), 'Owned preview/API ports already occupied; do not touch other services'
        details = json.loads(subprocess.check_output(DOCKER+['inspect',CONTAINER],text=True))[0]
        assert not details['State']['Running'], 'Owned PostgreSQL already active; refuse duplicate lane'
        assert details['Config']['Image'] == 'postgres:17-alpine'
        code = command(DOCKER+['start',CONTAINER],'container-start')
        if code:
            raise RuntimeError('Owned container start failed')
        started = True
        record['owned_container_started'] = True
        details = json.loads(subprocess.check_output(DOCKER+['inspect',CONTAINER],text=True))[0]
        ports = details['NetworkSettings']['Ports']['5432/tcp']
        assert len(ports) == 1 and ports[0]['HostIp'] == '127.0.0.1'
        port = int(ports[0]['HostPort'])
        fixture = dict(item.split('=',1) for item in details['Config']['Env'] if '=' in item)
        user = fixture.get('POSTGRES_USER','postgres')
        password = fixture.get('POSTGRES_PASSWORD')
        assert password is not None or fixture.get('POSTGRES_HOST_AUTH_METHOD') == 'trust'
        credentials = quote(user,safe='')+((':'+quote(password,safe='')) if password is not None else '')
        base = 'postgresql://'+credentials+'@127.0.0.1:'+str(port)+'/'
        environment.update(DATABASE_URL=base+'prisma_complaints737',TEST_DATABASE_URL=base+'prisma_complaints737_test')
        record['target'] = {'host':'127.0.0.1','port':port,'development':'prisma_complaints737','test':'prisma_complaints737_test'}
        readiness = []
        with (attempt/'readiness.log').open('x') as log:
            for _ in range(40):
                ready = subprocess.run(DOCKER+['exec',CONTAINER,'pg_isready','-U',user,'-d','prisma_complaints737'],stdout=log,stderr=subprocess.STDOUT)
                readiness.append(ready.returncode)
                if ready.returncode == 0:
                    break
                time.sleep(0.25)
        record['readiness_exit_codes'] = readiness
        assert ready.returncode == 0, 'Current PostgreSQL readiness failed; browser not started'
        probe = """import pg from 'pg';
import { probePostgresTargets } from '../../scripts/agent-doctor-system-adapter.mjs';
import { databaseTargetsAreSafe } from './test-support/postgres-database-target.mjs';
if (!databaseTargetsAreSafe(process.env.DATABASE_URL,process.env.TEST_DATABASE_URL)) throw new Error('Unsafe synthetic PostgreSQL targets.');
const targets=await probePostgresTargets({databaseUrl:process.env.DATABASE_URL,testDatabaseUrl:process.env.TEST_DATABASE_URL,Client:pg.Client});
console.log(JSON.stringify({at:new Date().toISOString(),node:process.version,targets}));
if (Object.values(targets).some(t=>t.state!=='available'||t.serverVersionNumber<170000||t.serverVersionNumber>=180000||!t.canCreateDatabase)) process.exitCode=1;
"""
        code = command(['node','--input-type=module','--eval',probe],'pg-current-probe',ROOT/'apps/api')
        if code:
            raise RuntimeError('Real PostgreSQL transport probe failed; browser not started')
        record['acceptance_databases_before'] = database_names(user)
        record['browser_started'] = True
        code = command(['pnpm','exec','playwright','test','--config','.complaints-acceptance-preview.config.ts','e2e/ideas.acceptance.spec.ts','e2e/complaints.acceptance.spec.ts'],'playwright-four-cases',monitor=True)
        record['playwright_exit_code'] = code
        if code == 0:
            code = command(['python3',str(SCRATCH/'verify-browser-builds.py')],'sealed-build-guard-after')
        record['status'] = 'PASS' if code == 0 else 'FAIL: NO RETRY OR LATER FAMILY STARTED'
    except BaseException as error:
        record['status'] = 'FAIL: PRECONDITION OR EXECUTION'
        record['error'] = type(error).__name__+': '+str(error)
        code = code if code else 2
    finally:
        # Only observed descendants with the same kernel start-time fingerprint
        # may be signalled. No process-name/port-wide kill, no PID reuse assumption.
        cleanup = []
        for pid,start in reversed(list(known.items())):
            row = processes().get(pid)
            if row and row['start_ticks'] == start and row['state'] != 'Z':
                try:
                    os.kill(pid,signal.SIGTERM)
                except ProcessLookupError:
                    pass
                cleanup.append(pid)
        for _ in range(20):
            remaining = {pid:row for pid,row in processes().items() if pid in known and row['start_ticks'] == known[pid]}
            if not remaining:
                break
            time.sleep(0.1)
        record['process_cleanup'] = {'observed_owned':known,'rescue_signalled':cleanup,'remaining':remaining if known else {}}
        if known and (remaining or cleanup):
            code = 2
            record['status'] = 'FAIL: BROWSER OWNED PROCESS CLEANUP REQUIRED OR INCOMPLETE'
        record['ports_after'] = ports_free()
        if record['browser_started'] and not all(record['ports_after'].values()):
            code = 2
            record['status'] = 'FAIL: PREVIEW/API PORT STILL OCCUPIED; NO UNKNOWN PROCESS TOUCHED'
        if started:
            try:
                after = database_names(user)
                record['acceptance_databases_after'] = after
                baseline = record.get('acceptance_databases_before',after)
                leaked = sorted(set(after)-set(baseline))
                record['new_isolated_database_leaks'] = leaked
                # Canonical global teardown owns normal database deletion. Do
                # not hide its failure by dropping a database from this wrapper.
                if leaked:
                    code = 2
                    record['status'] = 'FAIL: CANONICAL ISOLATED DATABASE TEARDOWN'
            except BaseException as error:
                code = 2
                record['database_cleanup_error'] = type(error).__name__+': '+str(error)
            try:
                stopped = command(DOCKER+['stop',CONTAINER],'container-stop')
                state = json.loads(subprocess.check_output(DOCKER+['inspect',CONTAINER],text=True))[0]['State']
                record['container_cleanup'] = {'stop_exit_code':stopped,'running':state['Running'],'status':state['Status']}
                if stopped or state['Running']:
                    code = 2
                    record['status'] = 'FAIL: OWNED CONTAINER CLEANUP'
            except BaseException as error:
                code = 2
                record['status'] = 'FAIL: OWNED CONTAINER CLEANUP'
                record['container_cleanup_error'] = type(error).__name__+': '+str(error)
        artifacts = ROOT/'apps/web/test-results/acceptance'
        record['artifacts_sha256'] = {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(artifacts.rglob('*')) if p.is_file()}
        record.update(finished_utc=now(),exit_code=code)
        save(attempt/'result.json',record)
        (attempt/'exit-code').write_text(str(code)+'\n')
        print(json.dumps({key:record.get(key) for key in ['status','exit_code','playwright_exit_code','container_cleanup','ports_after','finished_utc']}))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
