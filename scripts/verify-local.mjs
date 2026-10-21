import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, watch } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { availableParallelism, release } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createProcessGroupController } from './process-group.mjs';
import { changedFiles, isDocumentationOnly } from './ci-change-scope.mjs';
import { validateLocalBrowserEvidence } from './verify-local-browser.mjs';

const schema = 'prisma-prim-local-verification/v1';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const pnpm = (id, ...args) => ({ id, command: 'pnpm', args });
const defaultProcessTimeout = 45 * 60_000;
const aggregateProcessBudgets = Object.freeze({
  'api-parallel': {
    minutes: 270,
    basis:
      '2 x 3 x 45 min: conservative process cap for all API parallel shards combined',
  },
  browser: {
    minutes: 270,
    basis:
      '2 x 3 x 45 min: conservative process cap for all browser shards combined',
  },
  acceptance: {
    minutes: 180,
    basis:
      '2 x 2 x 45 min: conservative process cap for both acceptance shards combined',
  },
});
// Commands stay owned by the existing packages/scripts. Only the canonical
// documentation-only policy may make heavy families unnecessary; no API reuse.
export const verificationFamilies = Object.freeze(
  [
    {
      id: 'doctor',
      command: 'node',
      args: ['scripts/agent-doctor.mjs', '--profile', 'web-postgres'],
    },
    pnpm('format', 'format:check'),
    pnpm('lint', 'lint'),
    pnpm('types', 'typecheck'),
    pnpm('scripts', 'test:scripts'),
    pnpm(
      'documentation',
      '--filter',
      '@prisma-prim/api',
      'exec',
      'vitest',
      'run',
      'src/demonstration',
    ),
    pnpm(
      'api-parallel',
      '--filter',
      '@prisma-prim/api',
      'test:parallel',
      '--maxWorkers=1',
    ),
    pnpm('api-serial', '--filter', '@prisma-prim/api', 'test:postgres:serial'),
    pnpm(
      'web-unit',
      '--filter',
      '@prisma-prim/web',
      'exec',
      'vitest',
      'run',
      '--maxWorkers=2',
    ),
    {
      id: 'browser',
      command: 'node',
      args: ['scripts/verify-local-browser.mjs', 'browser'],
    },
    {
      id: 'acceptance',
      command: 'node',
      args: ['scripts/verify-local-browser.mjs', 'acceptance'],
    },
    {
      id: 'acceptance-evidence',
      command: 'node',
      args: ['scripts/verify-acceptance-evidence.mjs'],
    },
    pnpm('build', 'build'),
    pnpm('railway-types', '--dir', '.railway', 'typecheck'),
    pnpm('railway-tests', '--dir', '.railway', 'test'),
    {
      id: 'packaging',
      command: 'bash',
      args: ['scripts/railway-packaging-smoke.sh'],
    },
  ].map((family) =>
    Object.freeze({
      ...family,
      args: Object.freeze(family.args),
      timeoutMilliseconds:
        (aggregateProcessBudgets[family.id]?.minutes ?? 45) * 60_000,
      timeoutBasis:
        aggregateProcessBudgets[family.id]?.basis ??
        '45 min process safety cap for an unchanged single workflow family',
    }),
  ),
);

const effectiveOverrides = Object.freeze({
  CI: 'true',
  REQUIRE_ACCESS_POSTGRES: 'true',
  REQUIRE_COMPANY_POSTGRES: 'true',
  REQUIRE_CLIENT_POSTGRES: 'true',
});
const inheritedSettings = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'DATABASE_URL',
  'TEST_DATABASE_URL',
  'POSTGRES_ADMIN_URL',
  // Preserve configured selectors without reading or publishing their contents.
  'DOCKER_CONFIG',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
];
const optionalSettings = [
  'PNPM_HOME',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PACKAGING_IMAGE_DIRECTORY',
  'POSTGRES_IMAGE_ARCHIVE',
  'pnpm_config_verify_deps_before_run',
];

const documentationOnlyReason =
  'Documentation-only change proven by scripts/ci-change-scope.mjs (#730): only root AGENTS.md and docs/**/*.md differ from the current base integration.';

function verificationScope(root, provenance) {
  let files;
  try {
    files = changedFiles(
      provenance.baseHead,
      provenance.checkoutHead,
      (command, args, options) =>
        spawnSync(command, args, { ...options, cwd: root }),
      { requireAncestor: true },
    );
  } catch {
    files = undefined;
  }
  return isDocumentationOnly({ event: 'pull_request', files })
    ? { kind: 'docs_only', reason: documentationOnlyReason }
    : {
        kind: 'complete',
        reason:
          'Complete verification required: documentation-only eligibility was not proven by scripts/ci-change-scope.mjs (#730).',
      };
}

function requiredFamilies(scope, output) {
  return verificationFamilies.map((family, index) => ({
    ...family,
    args:
      scope.kind === 'docs_only' && family.id === 'doctor'
        ? ['scripts/agent-doctor.mjs']
        : ['browser', 'acceptance'].includes(family.id)
          ? [...family.args, '--output', output]
          : family.args,
    required: scope.kind !== 'docs_only' || index < 6,
  }));
}

function pendingFamilies(plan, scope) {
  return plan.map((family) => ({
    ...family,
    required: family.required !== false,
    status: family.required === false ? 'not_required' : 'unexecuted',
    reason: family.required === false ? scope.reason : null,
    exitCode: null,
    signal: null,
    startedAt: null,
    finishedAt: null,
  }));
}

function git(root, ...args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `Git ${args[0]} failed; required revision/integration is unavailable.`,
    );
  return result.stdout.trimEnd();
}

async function snapshot(root, sourceRef, baseRef) {
  if (git(root, 'status', '--porcelain', '--untracked-files=all'))
    throw new Error(
      'Tracked inputs must be clean, with no untracked source files.',
    );
  const sourceHead = git(
    root,
    'rev-parse',
    '--verify',
    `${sourceRef}^{commit}`,
  );
  const baseHead = git(root, 'rev-parse', '--verify', `${baseRef}^{commit}`);
  const checkoutHead = git(root, 'rev-parse', 'HEAD');
  const integrationTree = git(
    root,
    'merge-tree',
    '--write-tree',
    baseHead,
    sourceHead,
  ).split('\n')[0];
  if (git(root, 'rev-parse', 'HEAD^{tree}') !== integrationTree)
    throw new Error('Checkout is not the exact source/base integration tree.');
  const inputs = {};
  for (const entry of git(root, 'ls-files', '--stage', '-z')
    .split('\0')
    .filter(Boolean)) {
    const match = /^(\d+) ([a-f0-9]+) 0\t(.+)$/su.exec(entry);
    if (!match || match[1] === '120000' || match[1] === '160000')
      throw new Error('Unsupported tracked input mode.');
    const [, mode, object, path] = match;
    const info = await lstat(join(root, path));
    if (!info.isFile() || ((info.mode & 0o111) !== 0) !== (mode === '100755'))
      throw new Error('Tracked input file mode differs from Git.');
    const contents = await readFile(join(root, path));
    // Compare real bytes to Git, even with assume-unchanged/skip-worktree flags.
    const actual = createHash('sha1')
      .update(`blob ${contents.length}\0`)
      .update(contents)
      .digest('hex');
    if (object !== actual)
      throw new Error('Tracked input bytes differ from the clean Git tree.');
    inputs[path] = { mode, sha256: hash(contents) };
  }
  return {
    sourceRef,
    sourceHead,
    baseRef,
    baseHead,
    checkoutHead,
    integrationTree,
    inputs,
  };
}

function sanitize(text, environment) {
  let safe = String(text)
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '[redacted PostgreSQL URL]')
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^@\s/]+@/giu, '$1[redacted]@')
    .replace(/\bBearer\s+[^\s]+/giu, 'Bearer [redacted]')
    .replace(
      /\b(password|token|secret|authorization|cookie)\s*[:=]\s*[^\s,;]+/giu,
      '$1=[redacted]',
    );
  for (const [key, value] of Object.entries(environment)) {
    if (
      /secret|token|password|credential|private.key/iu.test(key) &&
      value?.length > 5
    )
      safe = safe.replaceAll(value, '[redacted]');
  }
  return safe;
}

async function execute(
  { command, args, timeoutMilliseconds = defaultProcessTimeout },
  root,
  environment,
  log,
  signal,
) {
  if (!Number.isInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0)
    throw new Error('Process safety cap must be a finite positive integer.');
  await writeFile(log, '');
  if (signal?.aborted)
    return { exitCode: null, signal: null, status: 'interrupted' };
  const groups = createProcessGroupController();
  const child = spawn(command, args, {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    detached: true,
  });
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) =>
      appendFileSync(log, `${sanitize(line, environment)}\n`),
    );
  }
  const closed = new Promise((resolveChild) => {
    child.once('error', () =>
      resolveChild({ exitCode: null, signal: null, status: 'failed' }),
    );
    child.once('close', (exitCode, childSignal) =>
      resolveChild({
        exitCode,
        signal: childSignal,
        status: exitCode === 0 && childSignal === null ? 'passed' : 'failed',
      }),
    );
  });
  let resolveInterruption;
  const interrupted = new Promise((resolveInterrupt) => {
    resolveInterruption = resolveInterrupt;
  });
  const interrupt = () => resolveInterruption('interrupted');
  const timeout = setTimeout(
    () => resolveInterruption('timed_out'),
    timeoutMilliseconds,
  );
  signal?.addEventListener('abort', interrupt, { once: true });
  try {
    const result = await Promise.race([closed, interrupted]);
    const wasInterrupted = typeof result === 'string';
    if (child.pid && (wasInterrupted || (await groups.isLive(child.pid))))
      await groups.terminate(
        child,
        closed,
        args[0] === 'scripts/verify-local-browser.mjs' ? 10_000 : 1_000,
      );
    return wasInterrupted ? { ...(await closed), status: result } : result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', interrupt);
  }
}

function version(command, args, root) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.status !== 0)
    throw new Error(`Required ${command} version probe failed.`);
  const value = result.stdout.trim();
  if (!value || value.length > 200 || /[\r\n]/u.test(value))
    throw new Error('Invalid version probe response.');
  return value;
}

async function railwayDependencyVersions(root) {
  try {
    const manifest = JSON.parse(
      await readFile(join(root, '.railway/package.json'), 'utf8'),
    );
    const installed = {};
    for (const name of ['railway', 'typescript']) {
      const expected =
        manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
      const actual = JSON.parse(
        await readFile(
          join(root, '.railway/node_modules', name, 'package.json'),
          'utf8',
        ),
      ).version;
      if (typeof expected !== 'string' || actual !== expected)
        throw new Error('Missing or mismatched dependency.');
      installed[name] = actual;
    }
    return installed;
  } catch {
    throw new Error(
      'Railway dependencies require the separate preparation: pnpm --dir .railway install --frozen-lockfile. No installation was performed by the verifier.',
    );
  }
}

async function versions(root, environment, documentationOnly) {
  const tools = {
    node: process.version,
    pnpm: version('pnpm', ['--version'], root),
    platform: process.platform,
    architecture: process.arch,
    kernel: release(),
    availableParallelism: availableParallelism(),
  };
  if (documentationOnly) return tools;
  const requireWeb = createRequire(join(root, 'apps/web/package.json'));
  const requireApi = createRequire(join(root, 'apps/api/package.json'));
  const { chromium } = requireWeb('@playwright/test');
  const { Client } = requireApi('pg');
  const client = new Client({
    connectionString: environment.TEST_DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  let postgres;
  try {
    await client.connect();
    postgres = (await client.query('SHOW server_version')).rows[0]
      .server_version;
  } finally {
    await client.end();
  }
  if (
    typeof postgres !== 'string' ||
    !/^[\d.]+(?: \([^\n]+\))?$/u.test(postgres)
  )
    throw new Error('Invalid PostgreSQL server version.');
  return {
    ...tools,
    docker: version(
      'docker',
      ['version', '--format', '{{.Server.Version}}'],
      root,
    ),
    chromium: version(chromium.executablePath(), ['--version'], root),
    playwright: requireWeb('@playwright/test/package.json').version,
    postgres,
  };
}

async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink())
      throw new Error('Evidence symlinks are not allowed.');
    if (entry.isDirectory())
      files.push(...(await inventory(join(directory, entry.name), path)));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function render(report) {
  return `Local verification: **${report.status}** (${report.mode}).\nScope: ${report.scope?.kind ?? 'unproven'} — ${report.scope?.reason ?? 'classification unavailable'}\n\nSelf-reported local execution; no GitHub runner attestation.\n\nSource: \`${report.provenance?.sourceHead ?? 'unavailable'}\`\nBase: \`${report.provenance?.baseHead ?? 'unavailable'}\`\nTested integration tree: \`${report.provenance?.integrationTree ?? 'unavailable'}\`\nUTC: ${report.startedAt} — ${report.finishedAt}\n\n| Family | Result | Exit | Process cap (min) | Exact argv |\n| --- | --- | --- | --- | --- |\n${report.families.map((family) => `| ${family.id} | ${family.status} | ${family.exitCode ?? '—'} | ${(family.timeoutMilliseconds ?? defaultProcessTimeout) / 60_000} | \`${JSON.stringify([family.command, ...family.args])}\` |`).join('\n')}\n\nBrowser/acceptance use fresh local prebuilds before Playwright. Browser build argv: [pnpm, build, --mode, local-demo] in apps/web; acceptance first adds [pnpm, --filter, @prisma-prim/api, build] at the root. Preview argv: [pnpm, preview, --host, 127.0.0.1, --port, 4173] in apps/web. Exact build/test/preview argv, public environment, guarded input/output inventories and startup180s (guard+preview only) are recorded under local-browser/<family>/manifest.json. Child logs require operator selection before publication. The independent evidence probe remains mandatory after acceptance failure, without making the failed family pass.\n\nThese are process safety caps; scenario and assertion deadlines remain unchanged. API parallel/browser: 270 min = 2 x 3 x 45 min; acceptance: 180 min = 2 x 2 x 45 min; other families: 45 min. These conservative aggregate ceilings are not runtime benchmarks or business-test deadlines.\n\nConfiguration, exact argv, input hashes and artifact inventory: manifest.json.\nArtifact publication: **not published by this command**. Attach the validated manifest and reviewed synthetic evidence archive to the PR's evidence release, then record actual asset URLs and digests in the PR.\n${report.refusal ? `\nRefusal: ${report.refusal}\n` : ''}`;
}

export async function runLocalVerification({
  root = process.cwd(),
  output,
  source,
  base = 'origin/main',
  mode = 'complete',
  families,
  signal,
} = {}) {
  root = await realpath(root);
  if (!output || !source)
    throw new Error('Explicit --source and external --output are required.');
  output = resolve(output);
  await mkdir(output, { recursive: true });
  output = await realpath(output);
  const relation = relative(root, output);
  if (
    relation === '' ||
    (relation !== '..' && !relation.startsWith('../') && !isAbsolute(relation))
  )
    throw new Error('Evidence output must be outside the source checkout.');
  if ((await readdir(output)).length)
    throw new Error(
      'Evidence output must be empty; preserve previous runs separately.',
    );
  if (
    !['complete', 'contract-test'].includes(mode) ||
    (families && mode !== 'contract-test')
  )
    throw new Error('Only contract-test mode permits synthetic families.');
  if (mode === 'complete' && base !== 'origin/main')
    throw new Error('Complete evidence requires the current origin/main base.');
  const plan = families ?? verificationFamilies;
  if (plan.some((family) => !/^[a-z][a-z0-9-]*$/u.test(family.id)))
    throw new Error('Invalid verification family identifier.');
  if (
    !plan.length ||
    new Set(plan.map((family) => family.id)).size !== plan.length
  )
    throw new Error('Required families must be nonempty and unique.');
  const environment = {
    ...Object.fromEntries(
      [...inheritedSettings, ...optionalSettings]
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    ),
    ...effectiveOverrides,
  };
  const report = {
    schema: mode === 'contract-test' ? `${schema}/contract-test` : schema,
    mode,
    status: 'incomplete',
    startedAt: now(),
    finishedAt: null,
    provenance: null,
    versions: null,
    prerequisites: { railway: { status: 'unexecuted' } },
    configuration: {
      inheritedNames: [...inheritedSettings, ...optionalSettings].filter(
        (key) => environment[key] !== undefined,
      ),
      overrides: effectiveOverrides,
      settings: Object.fromEntries(
        optionalSettings
          .filter((key) => environment[key] !== undefined)
          .map((key) => [key, environment[key]]),
      ),
      database:
        'Database URLs/credentials omitted; required database checks, if any, are recorded in the selected doctor log.',
    },
    scope: null,
    families: pendingFamilies(plan, null),
    artifacts: [],
  };
  await mkdir(join(output, 'logs'));
  const watchers = [];
  let sourceChanged = false;
  let browserEvidenceFresh = false;
  let acceptanceIntegrityFailure = null;
  try {
    report.provenance = await snapshot(root, source, base);
    report.scope = verificationScope(root, report.provenance);
    if (mode === 'complete')
      report.families = pendingFamilies(
        requiredFamilies(report.scope, output),
        report.scope,
      );
    for (const path of Object.keys(report.provenance.inputs)) {
      const watcher = watch(join(root, path), () => {
        sourceChanged = true;
      });
      watcher.on('error', () => {
        sourceChanged = true;
      });
      watchers.push(watcher);
    }
    if (mode === 'complete' && report.scope.kind === 'docs_only')
      report.prerequisites.railway = {
        status: 'not_required',
        reason: report.scope.reason,
      };
    if (mode === 'complete' && report.scope.kind !== 'docs_only') {
      report.prerequisites.railway = { status: 'failed' };
      const installed = await railwayDependencyVersions(root);
      report.prerequisites.railway = {
        status: 'passed',
        check:
          'installed direct package versions match the tracked manifest; setup remains external',
        installed,
      };
      // Do not mix old screenshots/traces with this execution.
      const { rm } = await import('node:fs/promises');
      await rm(join(root, 'apps/web/test-results'), {
        recursive: true,
        force: true,
      });
      browserEvidenceFresh = true;
    }
    await writeFile(
      join(output, 'manifest.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    for (const family of report.families) {
      if (!family.required) continue;
      const failureProbe =
        family.id === 'acceptance-evidence' &&
        !signal?.aborted &&
        (acceptanceIntegrityFailure ||
          report.families.some(
            (result) =>
              result.id === 'acceptance' &&
              result.startedAt &&
              result.status !== 'passed',
          ));
      // A failed acceptance must still exercise the independent diagnostic probe.
      // Source drift remains a fatal refusal; it cannot make a probe a merge gate.
      if (
        !failureProbe &&
        (sourceChanged ||
          JSON.stringify(await snapshot(root, source, base)) !==
            JSON.stringify(report.provenance))
      )
        throw new Error('Source/base/inputs changed during verification.');
      family.startedAt = now();
      await writeFile(
        join(output, 'manifest.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      Object.assign(
        family,
        await execute(
          family,
          root,
          environment,
          join(output, 'logs', `${family.id}.log`),
          signal,
        ),
      );
      family.finishedAt = now();
      try {
        if (
          sourceChanged ||
          JSON.stringify(await snapshot(root, source, base)) !==
            JSON.stringify(report.provenance)
        )
          throw new Error('Source/base/inputs changed during verification.');
      } catch (error) {
        if (family.id !== 'acceptance' || signal?.aborted) throw error;
        acceptanceIntegrityFailure = error;
        report.refusal =
          'Source/base/inputs changed; acceptance evidence probe is diagnostic only.';
      }
      if (
        family.status !== 'passed' &&
        !(family.id === 'acceptance' && !signal?.aborted)
      )
        break;
      if (
        family.id === 'acceptance-evidence' &&
        (acceptanceIntegrityFailure ||
          report.families.some(
            (result) =>
              result.id === 'acceptance' && result.status !== 'passed',
          ))
      )
        break;
      if (mode === 'complete' && family.id === 'doctor')
        report.versions = await versions(
          root,
          environment,
          report.scope.kind === 'docs_only',
        );
    }
    report.status = report.families.every(
      (family) =>
        family.status === 'passed' ||
        (!family.required &&
          family.status === 'not_required' &&
          family.reason === report.scope.reason),
    )
      ? 'passed'
      : 'failed';
  } catch (error) {
    report.status = 'failed';
    report.refusal = sanitize(error.message, environment).slice(0, 500);
  } finally {
    for (const watcher of watchers) watcher.close();
  }
  report.finishedAt = now();
  // Preserve all suite outputs, including the deliberately failed probe, separately from source.
  const browserRoot = join(root, 'apps/web/test-results');
  if (mode === 'complete' && browserEvidenceFresh) {
    try {
      const { cp } = await import('node:fs/promises');
      if ((await lstat(browserRoot)).isDirectory())
        await cp(browserRoot, join(output, 'browser-evidence'), {
          recursive: true,
          dereference: false,
        });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        report.status = 'failed';
        report.refusal = 'Could not preserve browser evidence.';
      }
    }
  }
  for (const path of (await inventory(output)).filter(
    (path) => path !== 'manifest.json',
  ))
    report.artifacts.push({
      path,
      sha256: hash(await readFile(join(output, path))),
    });
  if (
    mode === 'complete' &&
    report.scope?.kind !== 'docs_only' &&
    report.status === 'passed'
  ) {
    const paths = report.artifacts.map((artifact) => artifact.path);
    if (
      !['browser', 'acceptance', 'acceptance-evidence-probe'].every((family) =>
        paths.some((path) => path.startsWith(`browser-evidence/${family}/`)),
      ) ||
      !paths.some((path) => /desktop.*\.png$/u.test(path)) ||
      !paths.some((path) => /narrow.*\.png$/u.test(path))
    ) {
      report.status = 'failed';
      report.refusal = 'Missing complete desktop/narrow browser evidence.';
    }
  }
  await writeFile(
    join(output, 'manifest.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(join(output, 'report.md'), render(report));
  return report;
}

export async function validateLocalEvidence({
  root = process.cwd(),
  output,
} = {}) {
  root = await realpath(root);
  const report = JSON.parse(
    await readFile(join(output, 'manifest.json'), 'utf8'),
  );
  if (
    report.schema !== schema ||
    report.mode !== 'complete' ||
    report.status !== 'passed'
  )
    throw new Error(
      'Expected complete passed evidence; contract-test reports never qualify.',
    );
  if (
    !report.versions ||
    !report.startedAt ||
    !report.finishedAt ||
    report.refusal
  )
    throw new Error('Incomplete report.');

  if (report.provenance?.baseRef !== 'origin/main')
    throw new Error('Evidence requires the current origin/main base.');
  const current = await snapshot(
    root,
    report.provenance.sourceRef,
    report.provenance.baseRef,
  );
  if (JSON.stringify(current) !== JSON.stringify(report.provenance))
    throw new Error('Stale source/base/integration inputs.');
  const scope = verificationScope(root, current);
  if (JSON.stringify(scope) !== JSON.stringify(report.scope))
    throw new Error(
      'Incomplete or altered required verification families: source-derived scope differs.',
    );
  const expected = requiredFamilies(scope, resolve(output));
  const plan = report.families.map(
    ({ id, command, args, timeoutMilliseconds, timeoutBasis, required }) => ({
      id,
      command,
      args,
      timeoutMilliseconds,
      timeoutBasis,
      required,
    }),
  );
  if (
    JSON.stringify(plan) !== JSON.stringify(expected) ||
    report.families.some((family) => {
      if (family.required)
        return (
          family.status !== 'passed' ||
          family.exitCode !== 0 ||
          family.signal !== null ||
          !family.startedAt ||
          !family.finishedAt ||
          family.reason !== null
        );
      return (
        family.status !== 'not_required' ||
        family.reason !== scope.reason ||
        family.exitCode !== null ||
        family.signal !== null ||
        family.startedAt !== null ||
        family.finishedAt !== null
      );
    })
  )
    throw new Error('Incomplete or altered required verification families.');
  if (scope.kind === 'docs_only') {
    if (
      JSON.stringify(report.prerequisites?.railway) !==
      JSON.stringify({ status: 'not_required', reason: scope.reason })
    )
      throw new Error('Unproven not_required Railway prerequisite.');
  } else if (
    report.prerequisites?.railway?.status !== 'passed' ||
    JSON.stringify(await railwayDependencyVersions(root)) !==
      JSON.stringify(report.prerequisites.railway.installed)
  )
    throw new Error(
      'Railway dependency prerequisite changed or is incomplete.',
    );
  if (scope.kind !== 'docs_only')
    for (const family of ['browser', 'acceptance'])
      await validateLocalBrowserEvidence({
        root,
        output: resolve(output),
        family,
      });
  if (
    JSON.stringify(report.configuration.overrides) !==
    JSON.stringify(effectiveOverrides)
  )
    throw new Error('Required configuration changed.');
  const actualPaths = (await inventory(output)).filter(
    (path) => !['manifest.json', 'report.md'].includes(path),
  );
  if (
    JSON.stringify(actualPaths) !==
    JSON.stringify(report.artifacts.map((artifact) => artifact.path))
  )
    throw new Error('Incomplete artifact inventory.');
  for (const artifact of report.artifacts) {
    if (hash(await readFile(join(output, artifact.path))) !== artifact.sha256)
      throw new Error('Artifact integrity mismatch.');
  }
  if ((await readFile(join(output, 'report.md'), 'utf8')) !== render(report))
    throw new Error('Compact report differs from its manifest.');
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...args] = process.argv.slice(2);
    const options = {};
    while (args.length) {
      const key = args.shift();
      if (!['--source', '--base', '--output'].includes(key) || !args.length)
        throw new Error(
          'Usage: node scripts/verify-local.mjs run --source REF --base origin/main --output EXTERNAL_DIRECTORY | validate --output DIRECTORY',
        );
      options[key.slice(2)] = args.shift();
    }
    const interruption = new AbortController();
    const interrupt = () => interruption.abort();
    process.once('SIGTERM', interrupt);
    process.once('SIGINT', interrupt);
    const report =
      action === 'run'
        ? await runLocalVerification({
            ...options,
            signal: interruption.signal,
          })
        : action === 'validate'
          ? await validateLocalEvidence(options)
          : null;
    process.removeListener('SIGTERM', interrupt);
    process.removeListener('SIGINT', interrupt);
    if (!report) throw new Error('Expected run or validate.');
    console.log(
      `Local verification ${report.status}; evidence: ${options.output}`,
    );
    if (report.status !== 'passed') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
