"""Scheduled local proof only; explicit heavy-lane transfer required.

Phases run once each and stop at first failed command. Statics formats only the
no files: checks supported union inputs, then freezes all79. PostgreSQL is exact owned
synthetic container plus real isolated migration/REST harness, always cleaned.
No generation, promotion, build, browser, Git, or external publication occurs.
"""
from pathlib import Path
from urllib.parse import quote
import datetime
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
WORKTREE = Path('/workspace/worktrees/complaints737-on-ideas751')
PLAN = ROOT/'plan.json'
DOCKER = ['docker', '--host', 'unix:///var/run/docker.sock']
CONTAINER = 'complaints737-postgres'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, data):
    path.write_text(json.dumps(data, indent=2)+'\n')


def hashes(paths):
    return {name: sha(WORKTREE/name) for name in paths}


def main():
    if len(sys.argv) != 4 or sys.argv[1] != '--lane-transferred' or sys.argv[2] != '--phase' or sys.argv[3] not in ['statics','postgres','frontend']:
        raise SystemExit('Use --lane-transferred --phase statics|postgres|frontend only after explicit coordinator transfer.')
    phase = sys.argv[3]
    run = ROOT/phase
    run.mkdir(exist_ok=False)
    plan = json.loads(PLAN.read_text())
    meta = {'phase':phase,'started_utc':now(),'cwd':str(WORKTREE),'plan_sha256':sha(PLAN),'launcher_sha256':sha(Path(__file__)),'commands':[],'status':'PREFLIGHT','source_count':None,'owned_container_started':False}
    exit_code = 2
    started = False
    child_groups = []
    environment = dict(os.environ)

    def command(argv, label, cwd=WORKTREE):
        item = {'argv':argv,'cwd':str(cwd),'started_utc':now(),'log':str(run/(label+'.log'))}
        meta['commands'].append(item)
        save(run/'result.json',meta)
        with (run/(label+'.log')).open('xb') as log:
            child = subprocess.Popen(argv,cwd=cwd,env=environment,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            child_groups.append(child.pid)
            item['pid'] = child.pid
            save(run/'result.json',meta)
            code = child.wait()
        item.update(exit_code=code,finished_utc=now())
        (run/(label+'.exit-code')).write_text(str(code)+'\n')
        save(run/'result.json',meta)
        return code

    try:
        expected = plan['source_sha256']
        expected_count = plan['source_count']
        if phase != 'statics':
            qualification = json.loads((ROOT/'statics-qualification.json').read_text())
            statics_path = Path(qualification['result'])
            freeze_path = Path(qualification['freeze'])
            assert statics_path.resolve().parent.parent == ROOT, 'Qualification must name a local preserved attempt'
            assert freeze_path.resolve().parent == statics_path.resolve().parent
            statics = json.loads(statics_path.read_text())
            assert statics['status'] == 'PASS' and statics['exit_code'] == 0, 'Real current statics must pass before subsequent phases'
            freeze = json.loads(freeze_path.read_text())
            expected = freeze['source_sha256']
            expected_count = freeze['source_count']
            meta['statics_qualification'] = {
                'path':str(statics_path),'sha256':sha(statics_path),
                'freeze':str(freeze_path),'freeze_sha256':sha(freeze_path),
                'reused_successful_global_format_and_lint':qualification.get('reused_successful_global_format_and_lint'),
            }
        assert len(expected) == expected_count
        assert expected_count == 79
        for link in plan['node_modules_links']:
            path = WORKTREE/link['relative_path']
            assert path.is_symlink() and str(path.resolve()) == link['resolved_target'], 'Dependency link drift'
        meta['source_count'] = expected_count
        assert hashes(expected) == expected, 'Frozen source drift'
        inputs = plan['dependency_and_read_test_inputs_sha256']
        # Some of the bound inputs are owned sources and can be formatted. Their
        # post-format binding is carried by the complete source freeze.
        guarded_inputs = {p:h for p,h in inputs.items() if p not in expected}
        assert hashes(guarded_inputs) == guarded_inputs, 'Dependency/config/read-test input drift'
        meta['source_sha256'] = expected
        meta['dependency_config_inputs_unchanged'] = True
        assert environment.get('pnpm_config_verify_deps_before_run') == 'false', 'Source canonical runtime with explicit pnpm guard first'
        if phase == 'postgres':
            details = json.loads(subprocess.check_output(DOCKER+['inspect',CONTAINER],text=True))[0]
            assert not details['State']['Running'], 'Owned container already running; refuse duplicate lane'
            assert details['Config']['Image'] == 'postgres:17-alpine', 'Unexpected owned image'
            exit_code = command(DOCKER+['start',CONTAINER],'container-start')
            if exit_code != 0:
                raise RuntimeError('Owned container start failed')
            started = True
            meta['owned_container_started'] = True
            details = json.loads(subprocess.check_output(DOCKER+['inspect',CONTAINER],text=True))[0]
            ports = details['NetworkSettings']['Ports']['5432/tcp']
            assert len(ports) == 1 and ports[0]['HostIp'] == '127.0.0.1', 'Synthetic target must be numeric loopback only'
            port = int(ports[0]['HostPort'])
            fixture = dict(item.split('=',1) for item in details['Config']['Env'] if '=' in item)
            user = fixture.get('POSTGRES_USER','postgres')
            password = fixture.get('POSTGRES_PASSWORD')
            assert password is not None or fixture.get('POSTGRES_HOST_AUTH_METHOD') == 'trust', 'Unknown fixture authentication'
            credentials = quote(user,safe='')+((':'+quote(password,safe='')) if password is not None else '')
            base = 'postgresql://'+credentials+'@127.0.0.1:'+str(port)+'/'
            environment.update(DATABASE_URL=base+'prisma_complaints737',TEST_DATABASE_URL=base+'prisma_complaints737_test')
            meta['target'] = {'host':'127.0.0.1','port':port,'development':'prisma_complaints737','test':'prisma_complaints737_test'}
            readiness = []
            with (run/'readiness.log').open('x') as log:
                for attempt in range(40):
                    ready = subprocess.run(DOCKER+['exec',CONTAINER,'pg_isready','-U',user,'-d','prisma_complaints737'],stdout=log,stderr=subprocess.STDOUT)
                    readiness.append(ready.returncode)
                    if ready.returncode == 0:
                        break
                    time.sleep(0.25)
            meta['readiness_exit_codes'] = readiness
            assert ready.returncode == 0, 'Current PostgreSQL readiness failed; tests not started'
            probe = """import pg from 'pg';
import { probePostgresTargets } from '../../scripts/agent-doctor-system-adapter.mjs';
import { databaseTargetsAreSafe } from './test-support/postgres-database-target.mjs';
if (!databaseTargetsAreSafe(process.env.DATABASE_URL,process.env.TEST_DATABASE_URL)) throw new Error('Unsafe synthetic PostgreSQL targets.');
const targets=await probePostgresTargets({databaseUrl:process.env.DATABASE_URL,testDatabaseUrl:process.env.TEST_DATABASE_URL,Client:pg.Client});
console.log(JSON.stringify({at:new Date().toISOString(),node:process.version,targets}));
if (Object.values(targets).some(t=>t.state!=='available'||t.serverVersionNumber<170000||t.serverVersionNumber>=180000||!t.canCreateDatabase)) process.exitCode=1;
"""
            exit_code = command(['node','--input-type=module','--eval',probe],'pg-current-probe',WORKTREE/'apps/api')
            if exit_code != 0:
                raise RuntimeError('Real current PostgreSQL transport probe failed; tests not started')
        else:
            # Unit tests never silently acquire database targets from a prior run.
            environment.pop('DATABASE_URL',None)
            environment.pop('TEST_DATABASE_URL',None)
        for index,argv in enumerate(plan['commands'][phase],1):
            exit_code = command(argv,f'{index:02d}-command')
            if exit_code != 0:
                meta['status'] = 'FAIL: FIRST FAILED COMMAND; NO LATER COMMAND STARTED'
                break
            assert hashes(expected) == expected, 'Source changed during checks'
        else:
            meta['status'] = 'PASS'
        meta['final_source_sha256'] = hashes(expected)
    except BaseException as error:
        meta['status'] = 'FAIL: PRECONDITION OR EXECUTION ERROR'
        meta['error'] = type(error).__name__+': '+str(error)
        if exit_code == 0:
            exit_code = 2
    finally:
        if started:
            try:
                stopped = command(DOCKER+['stop',CONTAINER],'container-stop')
                state = json.loads(subprocess.check_output(DOCKER+['inspect',CONTAINER],text=True))[0]['State']
                meta['cleanup'] = {'stop_exit_code':stopped,'running':state['Running'],'status':state['Status'],'finished_utc':now()}
                if stopped != 0 or state['Running']:
                    exit_code = 2
                    meta['status'] = 'FAIL: OWNED CLEANUP'
            except BaseException as error:
                exit_code = 2
                meta['status'] = 'FAIL: OWNED CLEANUP'
                meta['cleanup_error'] = type(error).__name__+': '+str(error)
        remaining = []
        for entry in Path('/proc').iterdir():
            if not entry.name.isdigit():
                continue
            try:
                raw = (entry/'stat').read_text()
                fields = raw[raw.rfind(')')+2:].split()
                if int(fields[2]) in child_groups:
                    remaining.append({'pid':int(entry.name),'parent':int(fields[1]),'group':int(fields[2]),'state':fields[0],'start_ticks':fields[19]})
            except (FileNotFoundError,ProcessLookupError,PermissionError):
                continue
        meta['owned_process_cleanup'] = {'groups':child_groups,'remaining':remaining,'no_signal_sent':True}
        if remaining:
            meta['functional_phase_status_before_cleanup'] = meta['status']
            meta['status'] = 'FAIL: OWNED PROCESS CLEANUP; ACTUAL COMMAND RESULTS RETAINED'
            exit_code = 2
        if phase == 'statics' and meta['status'] == 'PASS':
            save(run/'post-check-source-freeze.json', {'at':now(),'source_count':79,'source_sha256':hashes(expected),'claim':'Real current complete union statics PASS; behavioral proof pending.'})
            save(ROOT/'statics-qualification.json', {'result':str(run/'result.json'),'freeze':str(run/'post-check-source-freeze.json')})
        meta.update(finished_utc=now(),exit_code=exit_code)
        save(run/'result.json',meta)
        (run/'exit-code').write_text(str(exit_code)+'\n')
        print(json.dumps({k:meta.get(k) for k in ['phase','status','exit_code','cleanup','finished_utc']}))
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
