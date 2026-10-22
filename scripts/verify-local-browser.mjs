import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProcessGroupController } from './process-group.mjs';

const schema = 'prisma-prim-local-browser/v1';
const self = fileURLToPath(import.meta.url);
const publicIdentity = Object.freeze({
  VITE_ACCESS_IDENTITY_MODE: 'local-demo',
  VITE_DEMO_EXTERNAL_PROVIDER: 'local-demo',
  VITE_DEMO_EXTERNAL_SUBJECT: 'local-demonstration-user',
  VITE_DEMO_DISPLAY_NAME: 'Ada Ionescu',
  VITE_DEMO_EMAIL: 'ada@example.test',
});
const now = () => new Date().toISOString();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// A closed local startup protocol, not a configurable command runner.
function plan(root, output, family) {
  assert(
    ['browser', 'acceptance'].includes(family),
    'Expected browser or acceptance.',
  );
  const web = join(root, 'apps/web');
  const directory = join(output, 'local-browser', family);
  const config = join(directory, 'preview.config.cjs');
  const environment = {
    ...publicIdentity,
    ...(family === 'acceptance'
      ? { ACCEPTANCE_API_URL: 'http://127.0.0.1:4174' }
      : {}),
  };
  return {
    family,
    directory,
    config,
    environment,
    canonicalConfig: join(
      web,
      family === 'browser'
        ? 'playwright.config.ts'
        : 'playwright.acceptance.config.ts',
    ),
    cleanDirectories: [
      ...(family === 'acceptance' ? ['apps/api/dist'] : []),
      'apps/web/dist',
    ],
    cleanFiles: [
      ...(family === 'acceptance'
        ? ['apps/api/tsconfig.build.tsbuildinfo']
        : []),
      'apps/web/tsconfig.app.tsbuildinfo',
      'apps/web/tsconfig.node.tsbuildinfo',
    ],
    builds: [
      ...(family === 'acceptance'
        ? [
            {
              command: 'pnpm',
              args: ['--filter', '@prisma-prim/api', 'build'],
              cwd: root,
            },
          ]
        : []),
      { command: 'pnpm', args: ['build', '--mode', 'local-demo'], cwd: web },
    ],
    test: {
      command: 'pnpm',
      args: [
        'exec',
        'playwright',
        'test',
        '--config',
        config,
        ...(family === 'browser' ? ['--workers=2'] : []),
      ],
      cwd: web,
    },
    preview: {
      command: 'pnpm',
      args: ['preview', '--host', '127.0.0.1', '--port', '4173'],
      cwd: web,
    },
    startupMilliseconds: 180_000,
    buildCleanupGraceMilliseconds: 1000,
    playwrightCleanupGraceMilliseconds: 3000,
  };
}

function shellWord(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function configuration(root, output, family) {
  const p = plan(root, output, family);
  const guard = [process.execPath, self, 'guard', family, '--output', output]
    .map(shellWord)
    .join(' ');
  const originalCommand = `${family === 'acceptance' ? 'pnpm --filter @prisma-prim/api build && ' : ''}pnpm build --mode local-demo && pnpm preview --host 127.0.0.1 --port 4173`;
  // Paths authored relative to apps/web retain exactly that anchor even though
  // this operational wrapper lives outside the clean integration checkout.
  return `const path = require('node:path');\nconst loaded = require(${JSON.stringify(p.canonicalConfig)});\nconst original = loaded.default || loaded;\nconst web = ${JSON.stringify(join(root, 'apps/web'))};\nif (!original.webServer || Array.isArray(original.webServer) || original.webServer.command !== ${JSON.stringify(originalCommand)} || JSON.stringify(original.webServer.env) !== JSON.stringify(${JSON.stringify(p.environment)}) || original.webServer.reuseExistingServer !== false || original.webServer.url !== 'http://127.0.0.1:4173') throw new Error('Registered local startup contract changed.');\nconst anchor = value => value === undefined ? value : Array.isArray(value) ? value.map(anchor) : path.resolve(web, value);\nmodule.exports = { ...original, testDir: anchor(original.testDir), outputDir: anchor(original.outputDir), ...(original.snapshotDir === undefined ? {} : { snapshotDir: anchor(original.snapshotDir) }), ...(original.globalSetup === undefined ? {} : { globalSetup: anchor(original.globalSetup) }), ...(original.globalTeardown === undefined ? {} : { globalTeardown: anchor(original.globalTeardown) }), webServer: { ...original.webServer, cwd: path.resolve(web, original.webServer.cwd || '.'), timeout: ${p.startupMilliseconds}, command: ${JSON.stringify(`${guard} && pnpm preview --host 127.0.0.1 --port 4173`)} } };\n`;
}

async function digest(path) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest('hex') };
}
async function files(directory, prefix = '') {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const result = [];
  for (const entry of entries) {
    assert(
      !entry.isSymbolicLink(),
      'Unexpected symlink inside a guarded tree.',
    );
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      result.push(...(await files(join(directory, entry.name), path)));
    else {
      assert(entry.isFile(), 'Unexpected file type in guarded tree.');
      result.push(path);
    }
  }
  return result.sort();
}
async function records(root, paths, signal) {
  const result = {};
  for (const path of [...new Set(paths)].sort()) {
    signal?.throwIfAborted();
    assert(
      (await lstat(join(root, path))).isFile(),
      'Guarded input is not a regular file.',
    );
    result[path] = await digest(join(root, path));
  }
  return result;
}
function tracked(root) {
  const child = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert(child.status === 0, 'Cannot enumerate proven integration inputs.');
  return child.stdout.toString().split('\0').filter(Boolean);
}
async function executable(name) {
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    try {
      const path = await realpath(join(directory, name));
      if ((await lstat(path)).isFile()) return path;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
  throw new Error('Required runtime executable missing.');
}
async function inputs(root, signal) {
  const names = tracked(root);
  for (const directory of ['', 'apps/api', 'apps/web'])
    for (const name of await readdir(join(root, directory)))
      if (name === '.env' || name.startsWith('.env.'))
        names.push(join(directory, name));
  const modules = {};
  const roots = {};
  const links = {};
  const packageLists = {
    'apps/api': [
      '@nestjs/core',
      '@nestjs/common',
      '@nestjs/cli',
      'typescript',
      'drizzle-orm',
      'pg',
    ],
    'apps/web': [
      '@playwright/test',
      'vite',
      '@vitejs/plugin-react',
      'typescript',
      'react',
      'react-dom',
    ],
  };
  for (const [directory, packages] of Object.entries(packageLists)) {
    const requireApp = createRequire(join(root, directory, 'package.json'));
    for (const name of packages) {
      const logical = join(root, directory, 'node_modules', name);
      const actual = await realpath(logical);
      assert(
        (await lstat(join(actual, 'package.json'))).isFile(),
        'Required module missing.',
      );
      roots[`${directory}/node_modules/${name}`] = actual;
      modules[`${directory}/node_modules/${name}`] = await records(
        actual,
        await files(actual),
        signal,
      );
    }
    if (directory === 'apps/web') {
      const requireTest = createRequire(
        join(roots['apps/web/node_modules/@playwright/test'], 'package.json'),
      );
      const playwright = dirname(
        requireTest.resolve('playwright/package.json'),
      );
      const requirePlaywright = createRequire(join(playwright, 'package.json'));
      const core = dirname(
        requirePlaywright.resolve('playwright-core/package.json'),
      );
      for (const [name, actual] of [
        ['playwright', playwright],
        ['playwright-core', core],
      ]) {
        roots[name] = actual;
        modules[name] = await records(actual, await files(actual), signal);
      }
      const browser = requireApp('@playwright/test').chromium.executablePath();
      roots.chromium = await realpath(browser);
      modules.chromium = await digest(browser);
      const registry = JSON.parse(
        await readFile(join(core, 'browsers.json'), 'utf8'),
      );
      const headless = registry.browsers.find(
        (entry) => entry.name === 'chromium-headless-shell',
      );
      assert(
        headless && process.platform === 'linux' && process.arch === 'x64',
        'This local browser guard requires the registered Linux x64 Chromium distribution.',
      );
      const headlessPath = join(
        dirname(dirname(dirname(browser))),
        `chromium_headless_shell-${headless.revision}`,
        'chrome-linux',
        'headless_shell',
      );
      roots.chromiumHeadless = await realpath(headlessPath);
      modules.chromiumHeadless = await digest(headlessPath);
    }
  }
  for (const name of [
    'node_modules',
    'apps/api/node_modules',
    'apps/web/node_modules',
  ]) {
    const path = join(root, name);
    links[name] = {
      target: (await lstat(path)).isSymbolicLink()
        ? await readlink(path)
        : null,
      resolved: await realpath(path),
    };
  }
  const tools = {};
  for (const path of [
    await realpath(process.execPath),
    await executable('pnpm'),
  ])
    tools[path] = await digest(path);
  return {
    source: await records(root, names, signal),
    roots,
    modules,
    links,
    tools,
  };
}
function requiredOutputs(result, family) {
  const required = [
    'apps/web/dist/index.html',
    ...(family === 'acceptance'
      ? [
          'apps/api/dist/database/isolated-postgres-test-database.js',
          'apps/api/dist/database/postgres-rest-test-harness.js',
        ]
      : []),
  ];
  assert(
    required.every((path) => result[path]?.bytes > 0),
    'Required fresh compiled entry missing.',
  );
  assert(
    Object.keys(result).some(
      (path) =>
        /^apps\/web\/dist\/assets\/.+\.js$/u.test(path) &&
        result[path].bytes > 0,
    ),
    'Fresh web JavaScript missing.',
  );
}
async function outputs(root, family, signal) {
  const paths = [];
  for (const directory of plan(root, '', family).cleanDirectories) {
    const entries = await files(join(root, directory));
    assert(entries.length > 0, 'Fresh build emitted no output.');
    paths.push(...entries.map((path) => `${directory}/${path}`));
  }
  for (const path of plan(root, '', family).cleanFiles) {
    try {
      if ((await lstat(join(root, path))).isFile()) paths.push(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const result = await records(root, paths, signal);
  requiredOutputs(result, family);
  return result;
}
function environment(p) {
  assert(
    !Object.keys(process.env).some(
      (key) => key.startsWith('VITE_') && !(key in p.environment),
    ),
    'Unexpected public VITE environment.',
  );
  assert(
    process.env.VITE_API_URL === undefined &&
      process.env.NODE_ENV === undefined,
    'Unexpected build-mode environment.',
  );
  assert(
    process.env.ACCEPTANCE_API_URL === undefined ||
      process.env.ACCEPTANCE_API_URL === p.environment.ACCEPTANCE_API_URL,
    'Unexpected API preview environment.',
  );
  return { ...process.env, ...p.environment };
}
async function save(directory, report) {
  await writeFile(
    join(directory, 'manifest.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

async function guard(root, output, family) {
  const p = plan(root, output, family);
  assert(
    (await realpath(process.cwd())) === join(root, 'apps/web'),
    'Guard must run from the registered web cwd.',
  );
  const report = JSON.parse(
    await readFile(join(p.directory, 'manifest.json'), 'utf8'),
  );
  assert(
    report.schema === schema &&
      same(report.plan, p) &&
      report.status === 'ready',
    'No fresh successful prebuild for this exact plan.',
  );
  assert(
    same(
      report.builds.map(({ command, args, cwd }) => ({ command, args, cwd })),
      p.builds,
    ),
    'Changed successful-build argv.',
  );
  assert(
    same(
      report.builds.map((step) => step.log),
      p.builds.map((_, index) => `build-${index}.log`),
    ),
    'Changed successful-build log paths.',
  );
  assert(
    report.builds.length === p.builds.length &&
      report.builds.every(
        (step) =>
          step.status === 'passed' &&
          step.exitCode === 0 &&
          step.signal === null &&
          step.startedAt &&
          step.finishedAt,
      ),
    'Incomplete prebuild.',
  );
  assert(
    same(
      Object.fromEntries(
        Object.keys(p.environment).map((key) => [key, process.env[key]]),
      ),
      p.environment,
    ),
    'Preview environment differs from its build.',
  );
  environment(p);
  assert(
    (await readFile(p.config, 'utf8')) === configuration(root, output, family),
    'Generated preview configuration changed.',
  );
  assert(
    same(await inputs(root), report.inputs),
    'Current source/dependency/runtime/build inputs changed.',
  );
  assert(
    same(await outputs(root, family), report.outputs),
    'Fresh output paths/bytes changed.',
  );
  for (const step of report.builds)
    assert(
      same(await digest(join(p.directory, step.log)), step.logDigest),
      'Successful build log changed.',
    );
  await writeFile(
    join(p.directory, 'preview-guard.json'),
    `${JSON.stringify({ status: 'passed', verifiedAt: now(), inputDigest: createHash('sha256').update(JSON.stringify(report.inputs)).digest('hex'), outputDigest: createHash('sha256').update(JSON.stringify(report.outputs)).digest('hex'), configuration: await digest(p.config) }, null, 2)}\n`,
  );
  console.log('Fresh local prebuild guard passed.');
}

async function runChild(
  step,
  env,
  directory,
  index,
  signal,
  graceMilliseconds,
) {
  const log = `${index}.log`;
  const record = {
    ...step,
    log,
    startedAt: now(),
    finishedAt: null,
    exitCode: null,
    signal: null,
    status: 'incomplete',
  };
  const { open } = await import('node:fs/promises');
  const stream = await open(join(directory, log), 'wx');
  const groups = createProcessGroupController();
  let child;
  let closed;
  const failures = [];
  let interrupted = false;
  let resolveStopped;
  const stopped = new Promise((resolveStop) => {
    resolveStopped = resolveStop;
  });
  const interrupt = () => {
    interrupted = true;
    resolveStopped();
  };
  signal.addEventListener('abort', interrupt, { once: true });
  try {
    signal.throwIfAborted();
    child = spawn(step.command, step.args, {
      cwd: step.cwd,
      env,
      shell: false,
      detached: true,
      stdio: ['ignore', stream.fd, stream.fd],
    });
    closed = new Promise((resolveChild) => {
      child.once('error', () => resolveChild({ exitCode: null, signal: null }));
      child.once('close', (exitCode, childSignal) =>
        resolveChild({ exitCode, signal: childSignal }),
      );
    });
    await Promise.race([closed, stopped]);
    if (child.pid && (signal.aborted || (await groups.isLive(child.pid))))
      await groups.terminate(child, closed, graceMilliseconds);
    Object.assign(record, await closed);
    record.status = interrupted
      ? 'interrupted'
      : record.exitCode === 0 && record.signal === null
        ? 'passed'
        : 'failed';
  } catch (error) {
    failures.push(error);
  } finally {
    signal.removeEventListener('abort', interrupt);
    if (child?.pid) {
      try {
        if (await groups.isLive(child.pid))
          await groups.terminate(child, closed, graceMilliseconds);
      } catch (error) {
        // Preserve inspection/termination failure as well as a kill refusal.
        failures.push(error);
        let killRefused = false;
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (killError) {
          if (killError.code !== 'ESRCH') {
            failures.push(killError);
            killRefused = true;
          }
        }
        // A refused kill must fail promptly, not await a still-live child forever.
        if (!killRefused) {
          try {
            await closed;
          } catch (closeError) {
            failures.push(closeError);
          }
        }
      }
    }
    // Attempt both descriptor close and log capture even if either one fails.
    try {
      await stream.close();
    } catch (error) {
      failures.push(error);
    }
    record.finishedAt = now();
    try {
      record.logDigest = await digest(join(directory, log));
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      'Local child execution or cleanup failed.',
    );
  if (failures.length === 1) throw failures[0];
  return record;
}

async function run(root, output, family, signal) {
  const p = plan(root, output, family);
  const relation = relative(root, output);
  assert(
    relation === '..' || relation.startsWith('../') || isAbsolute(relation),
    'Browser evidence must be outside the checkout.',
  );
  await mkdir(p.directory, { recursive: true });
  assert(
    (await realpath(p.directory)) === p.directory,
    'Browser evidence path must not traverse symlinks.',
  );
  assert(
    (await readdir(p.directory)).length === 0,
    'A previous browser lot cannot be reused.',
  );
  const report = {
    schema,
    plan: p,
    status: 'incomplete',
    startedAt: now(),
    finishedAt: null,
    evidenceScope:
      'Browser startup substeps only; never standalone merge qualification.',
    inputs: null,
    outputs: null,
    currentStep: null,
    builds: [],
    test: null,
    previewGuard: null,
    afterGuard: null,
    refusal: null,
    logPolicy:
      'Child logs are private execution evidence pending operator selection/redaction before any publication.',
  };
  await save(p.directory, report);
  try {
    const env = environment(p);
    report.inputs = await inputs(root, signal);
    // Only these closed generated-output paths are removed, never a source or dependency.
    for (const path of [...p.cleanDirectories, ...p.cleanFiles])
      await rm(join(root, path), { recursive: true, force: true });
    await save(p.directory, report);
    for (const [index, step] of p.builds.entries()) {
      report.currentStep = { ...step, startedAt: now(), status: 'incomplete' };
      await save(p.directory, report);
      const result = await runChild(
        step,
        env,
        p.directory,
        `build-${index}`,
        signal,
        p.buildCleanupGraceMilliseconds,
      );
      report.builds.push(result);
      report.currentStep = null;
      await save(p.directory, report);
      assert(
        result.status === 'passed',
        'Real browser prebuild failed or was interrupted.',
      );
    }
    assert(
      same(await inputs(root, signal), report.inputs),
      'Inputs changed during real prebuild.',
    );
    report.outputs = await outputs(root, family, signal);
    await writeFile(p.config, configuration(root, output, family), {
      flag: 'wx',
    });
    report.status = 'ready';
    await save(p.directory, report);
    report.currentStep = { ...p.test, startedAt: now(), status: 'incomplete' };
    await save(p.directory, report);
    report.test = await runChild(
      p.test,
      env,
      p.directory,
      'playwright',
      signal,
      p.playwrightCleanupGraceMilliseconds,
    );
    report.currentStep = null;
    // A failed Playwright run remains failed; successful evidence capture never changes it.
    report.previewGuard = JSON.parse(
      await readFile(join(p.directory, 'preview-guard.json'), 'utf8'),
    );
    assert(
      report.previewGuard.status === 'passed',
      'No successful guard immediately before preview.',
    );
    assert(
      same(await inputs(root, signal), report.inputs),
      'Inputs changed during browser tests.',
    );
    assert(
      same(await outputs(root, family, signal), report.outputs),
      'Compiled output changed during browser tests.',
    );
    report.afterGuard = { status: 'passed', verifiedAt: now() };
    report.status = report.test.status;
  } catch (error) {
    report.status = signal.aborted ? 'interrupted' : 'failed';
    // Deliberately bounded diagnostic, without raw child output or environment values.
    report.refusal =
      error.name === 'AbortError'
        ? 'Local browser orchestration interrupted.'
        : error.message.startsWith('ENOENT:')
          ? 'Required local browser file is absent.'
          : error.message.slice(0, 200);
  } finally {
    report.finishedAt = now();
    await save(p.directory, report);
  }
  return report;
}

// Used by the owning merge-evidence validator, not exported merely for tests.
export async function validateLocalBrowserEvidence({ root, output, family }) {
  const p = plan(root, output, family);
  const report = JSON.parse(
    await readFile(join(p.directory, 'manifest.json'), 'utf8'),
  );
  assert(
    report.schema === schema &&
      report.status === 'passed' &&
      !report.refusal &&
      same(report.plan, p),
    'Incomplete or altered local browser startup evidence.',
  );
  assert(
    report.startedAt &&
      report.finishedAt &&
      report.afterGuard?.status === 'passed' &&
      report.previewGuard?.status === 'passed',
    'Missing browser guard result.',
  );
  assert(
    same(await inputs(root), report.inputs),
    'Stale browser integration/dependency/tool inputs.',
  );
  assert(
    (await readFile(p.config, 'utf8')) === configuration(root, output, family),
    'Local browser wrapper changed.',
  );
  assert(
    same(
      report.builds.map(({ command, args, cwd }) => ({ command, args, cwd })),
      p.builds,
    ),
    'Altered real build argv.',
  );
  assert(
    same(
      report.builds.map((step) => step.log),
      p.builds.map((_, index) => `build-${index}.log`),
    ) && report.test?.log === 'playwright.log',
    'Altered execution-log paths.',
  );
  const executed = [...report.builds, report.test];
  assert(
    report.test &&
      same(
        {
          command: report.test.command,
          args: report.test.args,
          cwd: report.test.cwd,
        },
        p.test,
      ),
    'Altered Playwright argv.',
  );
  let previousEnd = report.startedAt;
  for (const step of executed) {
    assert(
      step.status === 'passed' &&
        step.exitCode === 0 &&
        step.signal === null &&
        step.startedAt &&
        step.finishedAt &&
        step.startedAt >= previousEnd &&
        step.finishedAt >= step.startedAt &&
        step.finishedAt <= report.finishedAt,
      'Incomplete successful browser step.',
    );
    assert(
      same(await digest(join(p.directory, step.log)), step.logDigest),
      'Altered browser execution log.',
    );
    previousEnd = step.finishedAt;
  }
  requiredOutputs(report.outputs, family);
  const guardFile = JSON.parse(
    await readFile(join(p.directory, 'preview-guard.json'), 'utf8'),
  );
  assert(
    same(guardFile, report.previewGuard),
    'Altered recorded preview guard.',
  );
  const {
    inputDigest,
    outputDigest,
    configuration: configDigest,
  } = report.previewGuard;
  assert(
    report.previewGuard.verifiedAt >= report.test.startedAt &&
      report.previewGuard.verifiedAt <= report.test.finishedAt &&
      report.afterGuard.verifiedAt >= report.test.finishedAt &&
      report.afterGuard.verifiedAt <= report.finishedAt,
    'Invalid guard chronology.',
  );
  assert(
    inputDigest ===
      createHash('sha256')
        .update(JSON.stringify(report.inputs))
        .digest('hex') &&
      outputDigest ===
        createHash('sha256')
          .update(JSON.stringify(report.outputs))
          .digest('hex') &&
      same(configDigest, await digest(p.config)),
    'Unbound preview guard.',
  );
  return report;
}

if (process.argv[1] === self) {
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGTERM', interrupt);
  process.once('SIGINT', interrupt);
  try {
    const [action, ...args] = process.argv.slice(2);
    const isGuard = action === 'guard';
    const family = isGuard ? args.shift() : action;
    assert(
      args.length === 2 && args[0] === '--output',
      'Expected browser|acceptance --output EXTERNAL_DIRECTORY.',
    );
    const output = await realpath(args[1]);
    // guard runs from apps/web; the tracked helper fixes the checkout root.
    const root = isGuard
      ? resolve(dirname(self), '..')
      : await realpath(process.cwd());
    if (isGuard) await guard(root, output, family);
    else {
      const report = await run(root, output, family, abort.signal);
      if (report.status !== 'passed') process.exitCode = 1;
    }
  } catch {
    console.error(
      'Local browser startup refused; inspect the owned partial manifest/logs.',
    );
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGTERM', interrupt);
    process.removeListener('SIGINT', interrupt);
  }
}
