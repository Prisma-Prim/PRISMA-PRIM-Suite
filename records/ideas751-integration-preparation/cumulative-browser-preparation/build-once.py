"""One fresh normal API build and one local-demo web build after explicit transfer.

No PostgreSQL/server/browser/Git action. Seal only own fresh build provenance.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import runpy
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path('/workspace/worktrees/complaints737-on-ideas751')
SCRATCH = Path(__file__).resolve().parent
CHECKS = SCRATCH.parent/'cumulative-continuation-01'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save(path, value):
    path.write_text(json.dumps(value, indent=2)+'\n')


def group_members(group):
    found = []
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fields = (entry/'stat').read_text().rsplit(')',1)[1].split()
            if int(fields[2]) == group:
                found.append({'pid':int(entry.name),'state':fields[0]})
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
    return found


def main():
    if sys.argv[1:] != ['--lane-transferred']:
        raise SystemExit('Not started: explicit coordinator transfer required.')
    attempt = SCRATCH/'build-attempt'
    attempt.mkdir(exist_ok=False)
    record = {'started_utc':now(),'status':'PREFLIGHT','cwd':str(ROOT),'commands':[],'process_groups':[],'database_started':False,'server_started':False,'browser_started':False}
    code = 2
    try:
        assert Path.cwd() == ROOT, 'Run from owned real checkout'
        assert os.environ.get('pnpm_config_verify_deps_before_run') == 'false', 'Source canonical runtime and pnpm guard first'
        statics_qualification = json.loads((CHECKS/'statics-qualification.json').read_text())
        freeze = json.loads(Path(statics_qualification['freeze']).read_text())
        qualification = {'statics':statics_qualification}
        composite_path = CHECKS/'postgres-qualification.json'
        composite = json.loads(composite_path.read_text())
        assert composite['status'] == 'COMPOSITE_PASS'
        assert composite['source_sha256'] == freeze['source_sha256']
        assert composite['distinct_covered_cases'] == 205
        assert [entry['credited_passed'] for entry in composite['slices']] == [154,51]
        for entry in composite['slices']:
            result_path = Path(entry['result'])
            assert hashlib.sha256(result_path.read_bytes()).hexdigest() == entry['sha256']
            actual = json.loads(result_path.read_text())
            if entry['credited_passed'] == 154:
                assert actual['exit_code'] == 1 and actual['status'].startswith('FAIL'), 'Original failed205 run must remain failed'
            else:
                assert actual['status'] == 'PASS' and actual['exit_code'] == 0
                assert actual['final_source_sha256'] == freeze['source_sha256']
        qualification['postgres_composite'] = {'result':str(composite_path),'sha256':hashlib.sha256(composite_path.read_bytes()).hexdigest(),'claim':composite['claim']}
        result_path = CHECKS/'frontend/result.json'
        proof = json.loads(result_path.read_text())
        assert proof['status'] == 'PASS' and proof['exit_code'] == 0, 'Current combined frontend not qualified'
        assert proof['final_source_sha256'] == freeze['source_sha256']
        qualification['frontend'] = {'result':str(result_path),'sha256':hashlib.sha256(result_path.read_bytes()).hexdigest()}
        owned = freeze['source_sha256']
        assert len(owned) == freeze['source_count'] == 79
        for name, expected in owned.items():
            assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest() == expected, 'Owned source drift: '+name
        plan = json.loads((SCRATCH/'plan.json').read_text())
        for name in list(os.environ):
            if name.startswith('VITE_'):
                del os.environ[name]
        os.environ.pop('NODE_ENV',None)
        os.environ.update(plan['pinned_public_env'])
        guard = runpy.run_path(str(SCRATCH/'verify-browser-builds.py'))
        digest = guard['digest']
        preview = guard['PREVIEW_CONFIG']
        proposed = SCRATCH/'complaints-acceptance-preview.config.ts'
        if preview.exists():
            assert digest(preview) == digest(proposed), 'Refuse overwriting another local config'
        else:
            shutil.copyfile(proposed,preview)
        # Install the sole local config before both captures. Exclusion is uniform
        # in the mature guard's inputs(); its own bytes are hashed separately.
        before = guard['inputs']()
        record.update(source_sha256=owned,source_count=79,frontend_qualification=qualification,public_environment={name:os.environ.get(name) for name in guard['PUBLIC_ENV']},vite_names=sorted(name for name in os.environ if name.startswith('VITE_')),preview_config=digest(preview),launcher=digest(Path(__file__)))
        save(attempt/'before-inputs.json',before)
        save(attempt/'build-result.json',record)
        commands = [
            ('api-build',['pnpm','--filter','@prisma-prim/api','build'],ROOT),
            ('web-build',['pnpm','build','--mode','local-demo'],ROOT/'apps/web'),
        ]
        for label, argv, cwd in commands:
            entry = {'argv':argv,'cwd':str(cwd),'started_utc':now(),'log':str(attempt/(label+'.log'))}
            record['commands'].append(entry)
            with (attempt/(label+'.log')).open('xb') as log:
                process = subprocess.Popen(argv,cwd=cwd,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
                record['process_groups'].append(process.pid)
                entry['pid'] = process.pid
                save(attempt/'build-result.json',record)
                code = process.wait()
            entry.update(exit_code=code,finished_utc=now())
            (attempt/(label+'.exit-code')).write_text(str(code)+'\n')
            save(attempt/'build-result.json',record)
            if code != 0:
                raise RuntimeError('Build failed; later build/browser not started: '+label)
            actual = guard['inputs']()
            assert actual == before, 'Source/config tree changed during build'
        outputs = guard['outputs']()
        for name in guard['REQUIRED_OUTPUTS']:
            assert name in outputs and outputs[name]['bytes'] > 0, 'Required compiled output missing: '+name
        assert any(name.startswith('apps/web/dist/assets/') and name.endswith('.js') for name in outputs), 'No built web JavaScript'
        save(attempt/'after-inputs.json',actual)
        save(attempt/'outputs.json',outputs)
        record['status'] = 'PASS: FRESH OWN API AND WEB BUILDS; BROWSER NOT STARTED'
        code = 0
    except BaseException as error:
        record['status'] = 'FAIL: STOPPED BEFORE LATER COMMAND'
        record['error'] = type(error).__name__+': '+str(error)
        code = code if code else 2
    finally:
        cleanup = []
        for group in record['process_groups']:
            members = group_members(group)
            active = [member for member in members if member['state'] != 'Z']
            if active:
                try:
                    os.killpg(group,signal.SIGTERM)
                except ProcessLookupError:
                    pass
                for _ in range(20):
                    if not [member for member in group_members(group) if member['state'] != 'Z']:
                        break
                    time.sleep(0.1)
            remaining = group_members(group)
            cleanup.append({'process_group':group,'remaining':remaining})
            if remaining:
                record['status'] = 'FAIL: OWNED BUILD PROCESS CLEANUP'
                code = 2
        record.update(cleanup=cleanup,finished_utc=now(),exit_code=code)
        save(attempt/'build-result.json',record)
        (attempt/'exit-code').write_text(str(code)+'\n')
    if code == 0:
        try:
            evidence = ['api-build.log','api-build.exit-code','web-build.log','web-build.exit-code','build-result.json','before-inputs.json','after-inputs.json','outputs.json']
            seal = {
                'claim':'Own fresh normal API and local-demo web builds only; no other branch output reused; no browser executed.',
                'captured_utc':now(),'verifier':digest(SCRATCH/'verify-browser-builds.py'),'preview_config':digest(preview),
                'environment':record['public_environment'],'vite_names':record['vite_names'],
                'inputs':before,'outputs':outputs,'modules':guard['modules'](),'links':guard['links'](),'tools':guard['tools'](),
                'local_configurations':{'apps/web/.complaints-acceptance-preview.config.ts':digest(preview),'apps/web/playwright.acceptance.config.ts':digest(ROOT/'apps/web/playwright.acceptance.config.ts')},
                'sources_and_helpers':{name:digest(ROOT/name) for name in owned},
                'build_evidence':{'build-attempt/'+name:digest(attempt/name) for name in evidence},
            }
            target = SCRATCH/'browser-current-build-manifest.json'
            with target.open('x') as stream:
                stream.write(json.dumps(seal,indent=2)+'\n')
            save(attempt/'seal-result.json',{'manifest':str(target),'digest':digest(target),'status':'SEALED FOR ROOT REVIEW; NO BROWSER STARTED','time_utc':now()})
        except BaseException as error:
            code = 2
            save(attempt/'seal-result.json',{'status':'FAIL: BUILDS PASSED BUT PROVENANCE SEAL FAILED; NO BROWSER','error':type(error).__name__+': '+str(error),'time_utc':now()})
            (attempt/'exit-code').write_text(str(code)+'\n')
    print(json.dumps({'build_status':record.get('status'),'launcher_exit_code':code,'cleanup':record.get('cleanup'),'finished_utc':now()}))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
