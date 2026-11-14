import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalPath,
  hash,
  PreparationError,
  preparationInputs,
  privateModules,
  samePath,
  watchPreparationInputs,
  within,
} from './worktree-inputs.mjs';
import { acquirePreparationLock } from './worktree-preparation-lock.mjs';
import { readPrivateJson } from './private-evidence.mjs';

const usage =
  'Usage: node scripts/prepare-worktree.mjs --path DIR --branch NAME [--base REF] [--store DIR] [--offline] [--refresh] [--wait-ms N]';
function git(cwd, args, optional = false) {
  const result = spawnSync('git', ['--no-optional-locks', '-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    if (optional && !result.error && result.status === 1) return null;
    throw new PreparationError(
      'Git refused the repository, branch or worktree operation. No replacement was attempted.',
    );
  }
  return result.stdout.replace(/\r?\n$/u, '');
}
function argumentsFor(argv) {
  const result = {
    base: 'origin/main',
    offline: false,
    refresh: false,
    wait: 120_000,
  };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (seen.has(flag)) throw new PreparationError(usage);
    seen.add(flag);
    if (flag === '--offline' || flag === '--refresh')
      result[flag.slice(2)] = true;
    else {
      const names = {
        '--path': 'path',
        '--branch': 'branch',
        '--base': 'base',
        '--store': 'store',
        '--wait-ms': 'wait',
      };
      if (!names[flag] || !argv[index + 1] || argv[index + 1].startsWith('-'))
        throw new PreparationError(usage);
      result[names[flag]] = argv[++index];
    }
  }
  if (
    !result.path ||
    !result.branch ||
    !/^\d+$/u.test(String(result.wait)) ||
    Number(result.wait) > 600_000
  )
    throw new PreparationError(usage);
  result.wait = Number(result.wait);
  return result;
}
function ownedDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const entry = lstatSync(path, { bigint: true });
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    (process.platform !== 'win32' &&
      (entry.uid !== BigInt(process.getuid()) ||
        (entry.mode & 0o777n) !== 0o700n))
  )
    throw new PreparationError(
      'Preparation state must be an owned private directory.',
    );
  return path;
}
function save(path, value) {
  const pending = `${path}.${randomUUID()}.pending`;
  writeFileSync(pending, `${JSON.stringify(value)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  renameSync(pending, path);
}
async function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log(
      `${usage}\nExamples:\n  node scripts/prepare-worktree.mjs --path ../suite-123 --branch feat/123 --base origin/main --offline\n  node scripts/prepare-worktree.mjs --path ../suite-123 --branch feat/123 --refresh\nAn unchanged qualification skips installation. --refresh authorizes changed/unknown inputs. No files are replaced to make an unsafe target fit.`,
    );
    return;
  }
  const options = argumentsFor(argv);
  const caller = canonicalPath(
    git(process.cwd(), ['rev-parse', '--show-toplevel']),
  );
  const common = canonicalPath(
    git(caller, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
  );
  let target = canonicalPath(resolve(options.path));
  const worktrees = git(caller, ['worktree', 'list', '--porcelain', '-z'])
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => canonicalPath(field.slice(9)));
  if (
    samePath(target, worktrees[0]) ||
    worktrees.some((path) => !samePath(path, target) && within(target, path))
  )
    throw new PreparationError(
      'The primary checkout and worktree ancestors are refused.',
    );
  for (const path of worktrees.filter((path) => !samePath(path, target))) {
    if (
      within(path, target) &&
      git(path, ['check-ignore', '--quiet', target], true) === null
    )
      throw new PreparationError(
        'Nested worktrees require an explicitly ignored target.',
      );
  }
  if (
    options.store &&
    worktrees.some((path) => within(path, canonicalPath(options.store)))
  )
    throw new PreparationError(
      'The shared package store must be outside every worktree.',
    );
  git(caller, ['check-ref-format', '--branch', options.branch]);
  const identity = hash(
    process.platform === 'win32' ? target.toLowerCase() : target,
  );
  const state = ownedDirectory(
    join(ownedDirectory(join(common, 'agent-preparation')), identity),
  );
  const lock = await acquirePreparationLock({
    directory: state,
    waitMilliseconds: options.wait,
  });
  let observation;
  try {
    const run = (root, args, environment, capture = false) =>
      lock.run('bash', ['scripts/agent-pnpm.sh', ...args], {
        cwd: root,
        environment,
        capture,
        stage: {
          '--version': 'pnpm-version',
          config: 'pnpm-config',
          store: 'pnpm-store',
          install: 'pnpm-install',
        }[args[0]],
      });
    const created = !existsSync(target);
    if (created)
      await lock.run(
        'git',
        [
          '-C',
          caller,
          'worktree',
          'add',
          '-b',
          options.branch,
          target,
          options.base,
        ],
        { cwd: caller, environment: process.env, stage: 'worktree' },
      );
    else if (
      !git(caller, ['worktree', 'list', '--porcelain', '-z'])
        .split('\0')
        .filter((field) => field.startsWith('worktree '))
        .map((field) => canonicalPath(field.slice(9)))
        .some((path) => samePath(path, target))
    )
      throw new PreparationError(
        'An existing target must be a registered worktree of this repository.',
      );
    target = canonicalPath(target);
    if (
      !samePath(
        canonicalPath(
          git(target, [
            'rev-parse',
            '--path-format=absolute',
            '--git-common-dir',
          ]),
        ),
        common,
      ) ||
      git(target, ['symbolic-ref', '--quiet', '--short', 'HEAD']) !==
        options.branch
    )
      throw new PreparationError(
        'The target repository or branch does not match.',
      );
    const modules = privateModules(target);
    if (
      git(target, [
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
      ]) !== ''
    )
      throw new PreparationError(
        'The target must be clean; user changes are preserved.',
      );
    const runtime = ownedDirectory(join(state, 'runtime'));
    const environment = {
      ...process.env,
      PNPM_HOME: ownedDirectory(join(runtime, 'pnpm')),
      PRISMA_PRIM_PNPM_HOME: ownedDirectory(join(runtime, 'launcher')),
      npm_config_cache: ownedDirectory(join(runtime, 'npm-cache')),
      pnpm_config_cache_dir: ownedDirectory(join(runtime, 'cache')),
      pnpm_config_state_dir: ownedDirectory(join(runtime, 'state')),
    };
    for (const key of Object.keys(environment))
      if (
        /^(?:npm|pnpm)_config_(?:verify_deps_before_run|modules_dir|virtual_store_dir|lockfile_dir|node_linker|enable_global_virtual_store|package_import_method|global|dir|workspace_dir)$/iu.test(
          key,
        ) ||
        (options.store && /^(?:npm|pnpm)_config_store_dir$/iu.test(key))
      )
        delete environment[key];
    Object.assign(environment, {
      pnpm_config_modules_dir: 'node_modules',
      pnpm_config_virtual_store_dir: join(target, 'node_modules/.pnpm'),
      pnpm_config_lockfile_dir: target,
      pnpm_config_node_linker: 'isolated',
      pnpm_config_enable_global_virtual_store: 'false',
      pnpm_config_package_import_method: 'copy',
      pnpm_config_global: 'false',
      pnpm_config_dir: target,
      pnpm_config_workspace_dir: target,
    });
    if (options.store)
      environment.pnpm_config_store_dir = canonicalPath(options.store);
    const version = (
      await run(target, ['--version'], environment, true)
    ).trim();
    const expected = JSON.parse(
      readFileSync(join(target, 'package.json'), 'utf8'),
    ).packageManager;
    if (
      `pnpm@${version}` !== expected ||
      !/^11\.\d+\.\d+$/u.test(version) ||
      !process.version.startsWith('v24.')
    )
      throw new PreparationError(
        'Use the repository-supported Node24 and exact pinned pnpm runtime.',
      );
    const configuration = await run(
      target,
      ['config', 'list', '--json'],
      environment,
      true,
    );
    const store = canonicalPath(
      (
        await run(target, ['store', 'path', '--silent'], environment, true)
      ).trim(),
    );
    if (worktrees.some((path) => within(path, store)) || within(target, store))
      throw new PreparationError(
        'The package store must be outside every worktree.',
      );
    const before = preparationInputs(
      target,
      environment,
      configuration,
      version,
    );
    const readyPath = join(state, 'qualification.json');
    let previous;
    if (existsSync(readyPath)) {
      try {
        previous = readPrivateJson(readyPath);
      } catch {
        throw new PreparationError(
          'Malformed private qualification; preserve it for diagnosis.',
        );
      }
      if (
        previous.schema !== 1 ||
        !['ready', 'incomplete'].includes(previous.status) ||
        !/^[a-f\d]{64}$/u.test(previous.inputs) ||
        Object.keys(previous).length !==
          (previous.status === 'ready' ? 4 : 3) ||
        (previous.status === 'ready' &&
          !/^[a-f\d]{64}$/u.test(previous.installation))
      )
        throw new PreparationError(
          'Unknown private qualification fields; no prior result was reused.',
        );
    }
    if (
      before.reusable &&
      previous?.schema === 1 &&
      previous.status === 'ready' &&
      previous.inputs === before.digest &&
      previous.installation === modules.digest &&
      modules.present
    ) {
      console.log(
        JSON.stringify({ status: 'ready', target, installed: false }),
      );
      return;
    }
    if (!created && !options.refresh)
      throw new PreparationError(
        'Inputs or installation are changed/unknown. Stop consumers, then rerun with --refresh for a private frozen installation.',
      );
    save(readyPath, { schema: 1, status: 'incomplete', inputs: before.digest });
    observation = watchPreparationInputs(target, before.paths);
    const install = [
      'install',
      '--frozen-lockfile',
      '--package-import-method=copy',
      '--modules-dir=node_modules',
      `--virtual-store-dir=${join(target, 'node_modules/.pnpm')}`,
      `--lockfile-dir=${target}`,
      '--config.node-linker=isolated',
      '--config.enable-global-virtual-store=false',
    ];
    if (options.offline) install.push('--offline');
    if (options.store)
      install.push(`--store-dir=${canonicalPath(options.store)}`);
    await run(target, install, environment);
    let installed = privateModules(target);
    if (!installed.present)
      throw new PreparationError(
        'A private module installation was not produced.',
      );
    const doctorSource = `import { spawnSync } from 'node:child_process';
import { collectEnvironmentSnapshot } from './scripts/agent-doctor-system-adapter.mjs';
import { evaluateEnvironment } from './scripts/agent-doctor.mjs';
const runner = (command, args, options) => ['pnpm', 'pnpm.cmd'].includes(command)
  ? spawnSync('bash', ['scripts/agent-pnpm.sh', ...args], options)
  : spawnSync(command, args, options);
const result = evaluateEnvironment(collectEnvironmentSnapshot({}, runner));
if (result.checks.some(check => check.status === 'FAIL')) process.exitCode = 1;`;
    await lock.run(
      process.execPath,
      ['--input-type=module', '--eval', doctorSource],
      { cwd: target, environment, timeout: 30_000, stage: 'doctor' },
    );
    const after = preparationInputs(
      target,
      environment,
      await run(target, ['config', 'list', '--json'], environment, true),
      version,
    );
    if (
      after.digest !== before.digest ||
      after.observation !== before.observation ||
      git(target, [
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
      ]) !== ''
    )
      throw new PreparationError(
        'Inputs changed during preparation; qualification remains incomplete.',
      );
    installed = privateModules(target);
    if (!installed.present)
      throw new PreparationError(
        'The final private installation is incomplete.',
      );
    await new Promise(setImmediate);
    observation.assertUnchanged();
    save(readyPath, {
      schema: 1,
      status: 'ready',
      inputs: after.digest,
      installation: installed.digest,
    });
    console.log(
      JSON.stringify({ status: 'prepared', target, installed: true }),
    );
  } finally {
    observation?.close();
    lock.release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof PreparationError
        ? error.message
        : 'Worktree preparation could not complete safely. Existing files were preserved.',
    );
    process.exitCode = 2;
  }
}
