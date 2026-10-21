from pathlib import Path
import hashlib, json, os, shutil, sys

ROOT = Path('/workspace/worktrees/complaints737-on-ideas751')
SCRATCH = Path('/workspace/work/complaints-runtime737/ideas751-integration-preparation/cumulative-browser-preparation')
MANIFEST = SCRATCH / 'browser-current-build-manifest.json'
PREVIEW_CONFIG = ROOT / 'apps/web/.complaints-acceptance-preview.config.ts'
TEMP_CONFIGS = {PREVIEW_CONFIG}
PUBLIC_ENV = ['VITE_ACCESS_IDENTITY_MODE', 'VITE_DEMO_EXTERNAL_PROVIDER', 'VITE_DEMO_EXTERNAL_SUBJECT', 'VITE_DEMO_DISPLAY_NAME', 'VITE_DEMO_EMAIL', 'ACCEPTANCE_API_URL', 'VITE_API_URL', 'NODE_ENV']
REQUIRED_OUTPUTS = ['apps/api/dist/database/isolated-postgres-test-database.js', 'apps/api/dist/database/postgres-rest-test-harness.js', 'apps/api/dist/complaints/complaints.module.js', 'apps/api/dist/complaints/complaints.service.js', 'apps/api/dist/complaints/complaints-journal.command.js', 'apps/api/dist/complaints/complaints-history.read.js', 'apps/api/dist/database/schema/complaints.js', 'apps/api/dist/ideas/ideas.module.js', 'apps/api/dist/ideas/ideas.service.js', 'apps/api/dist/database/schema/ideas.js', 'apps/web/dist/index.html']

def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            value.update(chunk)
    return {'bytes': path.stat().st_size, 'sha256': value.hexdigest()}

def inputs():
    paths = set(ROOT.glob('.env*'))
    for name in ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.node-version', 'AGENTS.md', 'CONTEXT.md']:
        path = ROOT / name
        if path.is_file(): paths.add(path)
    for app in ['api', 'web']:
        directory = ROOT / 'apps' / app
        for pattern in ['package.json', 'tsconfig*.json', 'nest-cli.json', 'vite.config.ts', 'index.html', '.env*', '*acceptance*.config.ts']:
            paths.update(path for path in directory.glob(pattern) if path.is_file())
        for folder in (['src', 'drizzle'] if app == 'api' else ['src', 'public', 'e2e']):
            paths.update(path for path in (directory / folder).rglob('*') if path.is_file())
    paths.difference_update(TEMP_CONFIGS)
    return {str(path.relative_to(ROOT)): digest(path) for path in sorted(paths)}

def outputs():
    paths = set()
    for app in ['api', 'web']:
        directory = ROOT / 'apps' / app
        paths.update(path for path in (directory / 'dist').rglob('*') if path.is_file())
        paths.update(path for path in directory.glob('*.tsbuildinfo') if path.is_file())
    return {str(path.relative_to(ROOT)): digest(path) for path in sorted(paths)}

def modules():
    logical = [ROOT / 'apps/web/node_modules' / name for name in ['@playwright/test', 'vite', 'react', 'react-dom']]
    logical += [ROOT / 'apps/api/node_modules' / name for name in ['@nestjs/core', '@nestjs/common', 'drizzle-orm', 'pg']]
    playwright = (logical[0].resolve(strict=True).parents[1] / 'playwright').resolve(strict=True)
    logical += [playwright, (playwright.parent / 'playwright-core').resolve(strict=True)]
    roots, files = {}, {}
    for path in logical:
        actual = path.resolve(strict=True)
        if not (actual / 'package.json').is_file(): raise RuntimeError('Missing required module manifest: ' + str(path))
        roots[str(path)] = str(actual)
        for entry in sorted(actual.rglob('*')):
            if entry.is_file(): files[str(entry)] = digest(entry)
    return {'roots': roots, 'files': files}

def links():
    return {name: {'target': os.readlink(ROOT / name), 'resolved': str((ROOT / name).resolve(strict=True))} for name in ['node_modules', 'apps/api/node_modules', 'apps/web/node_modules']}

def tools():
    paths = [Path('/workspace/work/environment/runtime.sh'), Path('/workspace/playwright-browsers/chromium-1181/chrome-linux/chrome'), Path('/workspace/playwright-browsers/chromium_headless_shell-1181/chrome-linux/headless_shell')]
    for name in ['node', 'pnpm']:
        path = shutil.which(name)
        if not path: raise RuntimeError('Required executable missing: ' + name)
        paths.append(Path(path).resolve(strict=True))
    return {str(path): digest(path) for path in paths}

def api_inputs(values):
    return {name: value for name, value in values.items() if not name.startswith('apps/web/') or name == 'apps/web/package.json'}

def api_outputs(values):
    return {name: value for name, value in values.items() if name.startswith('apps/api/')}

def verify():
    record = json.loads(MANIFEST.read_text())
    if Path.cwd() != ROOT / 'apps/web': raise RuntimeError('Guard must run in the owned web checkout')
    if digest(Path(__file__)) != record['verifier']: raise RuntimeError('Verifier changed')
    if digest(PREVIEW_CONFIG) != record['preview_config']: raise RuntimeError('Preview configuration changed')
    if {name: os.environ.get(name) for name in PUBLIC_ENV} != record['environment']: raise RuntimeError('Public build environment changed')
    if sorted(name for name in os.environ if name.startswith('VITE_')) != record['vite_names']: raise RuntimeError('Unexpected public VITE environment')
    actuals = {'inputs': inputs(), 'outputs': outputs(), 'modules': modules(), 'links': links(), 'tools': tools()}
    for name, actual in actuals.items():
        if actual != record[name]: raise RuntimeError(name + ' tree/hash/path changed or missing')
    # Both builds are fresh in this owned checkout; no other branch/output or earlier API attribution is reused.
    for name, value in record['local_configurations'].items():
        if digest(ROOT / name) != value: raise RuntimeError('Local startup configuration changed')
    for name in REQUIRED_OUTPUTS:
        if name not in record['outputs'] or record['outputs'][name]['bytes'] == 0: raise RuntimeError('Required compiled module/output missing: ' + name)
    if not any(name.startswith('apps/web/dist/assets/') and name.endswith('.js') for name in record['outputs']): raise RuntimeError('Missing built web JavaScript')
    for name, value in record['sources_and_helpers'].items():
        if digest(ROOT / name) != value: raise RuntimeError('Frozen source/helper changed: ' + name)
    for name, value in record['build_evidence'].items():
        if digest(SCRATCH / name) != value: raise RuntimeError('Successful build evidence changed: ' + name)
    print('PASS: current fresh API/web builds, all input/output/module trees, environment, tools, source guards and temporary configuration match.')

if __name__ == '__main__':
    try: verify()
    except Exception as error:
        print('FAIL: build reuse guard: ' + str(error), file=sys.stderr)
        sys.exit(1)
