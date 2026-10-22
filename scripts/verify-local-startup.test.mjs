import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { runLocalVerification, verificationFamilies } from './verify-local.mjs';
import { createProcessGroupController } from './process-group.mjs';

// System-boundary doubles in disposable repositories. These tests never attest
// application builds, browser journeys, databases, or the full merge gate.
async function repository(t) {
  const parent = await mkdtemp(join(tmpdir(), 'local-startup-contract-'));
  const root = join(parent, 'repository');
  const output = join(parent, 'evidence');
  await mkdir(root);
  await mkdir(output);
  t.after(() => rm(parent, { recursive: true, force: true }));
  const file = async (name, contents) => {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), contents);
  };
  const git = (...args) => {
    const child = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    return child.stdout.trim();
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'Synthetic local startup contract');
  git('config', 'user.email', 'contract@example.test');
  await file('source.txt', 'unchanged\n');
  const commit = () => {
    git('add', '.');
    git('commit', '-m', 'synthetic fixture');
    return git('rev-parse', 'HEAD');
  };
  return { parent, root, output, file, git, commit };
}

test('an acceptance process deadline still runs the independent evidence probe', async (t) => {
  const f = await repository(t);
  const source = f.commit();
  const report = await runLocalVerification({
    root: f.root,
    output: f.output,
    source,
    base: 'main',
    mode: 'contract-test',
    families: [
      {
        id: 'acceptance',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        timeoutMilliseconds: 50,
      },
      {
        id: 'acceptance-evidence',
        command: process.execPath,
        args: ['-e', 'console.log("independent evidence executed")'],
      },
      {
        id: 'build',
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
      },
    ],
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.families[0].status, 'timed_out');
  assert.equal(report.families[1].status, 'passed');
  assert.match(
    await readFile(join(f.output, 'logs/acceptance-evidence.log'), 'utf8'),
    /independent evidence executed/u,
  );
  assert.equal(report.families[2].status, 'unexecuted');
});

test('the public full plan selects two closed prebuild helpers and preserves the independent probe', () => {
  assert.equal(verificationFamilies.length, 16);
  for (const family of ['browser', 'acceptance']) {
    const entry = verificationFamilies.find((entry) => entry.id === family);
    assert.equal(entry.command, 'node');
    assert.deepEqual(entry.args, ['scripts/verify-local-browser.mjs', family]);
    assert.equal(
      entry.timeoutMilliseconds,
      (family === 'browser' ? 270 : 180) * 60_000,
    );
  }
  assert.deepEqual(
    verificationFamilies.find((entry) => entry.id === 'acceptance-evidence')
      .args,
    ['scripts/verify-acceptance-evidence.mjs'],
  );
});

const identity = {
  VITE_ACCESS_IDENTITY_MODE: 'local-demo',
  VITE_DEMO_EXTERNAL_PROVIDER: 'local-demo',
  VITE_DEMO_EXTERNAL_SUBJECT: 'local-demonstration-user',
  VITE_DEMO_DISPLAY_NAME: 'Ada Ionescu',
  VITE_DEMO_EMAIL: 'ada@example.test',
};
async function browserFixture(t, family = 'acceptance', behavior = 'pass') {
  const f = await repository(t);
  const bin = join(f.parent, 'bin');
  const calls = join(f.parent, 'calls.jsonl');
  await mkdir(bin);
  const fixtureHelper = join(f.root, 'scripts/verify-local-browser.mjs');
  await mkdir(dirname(fixtureHelper), { recursive: true });
  for (const name of ['verify-local-browser.mjs', 'process-group.mjs'])
    await copyFile(
      fileURLToPath(new URL(name, import.meta.url)),
      join(f.root, 'scripts', name),
    );
  await f.file('.gitignore', 'node_modules\ndist\n*.tsbuildinfo\n');
  await f.file('apps/api/package.json', '{"name":"@prisma-prim/api"}\n');
  await f.file('apps/web/package.json', '{"name":"@prisma-prim/web"}\n');
  const env = {
    ...identity,
    ...(family === 'acceptance'
      ? { ACCEPTANCE_API_URL: 'http://127.0.0.1:4174' }
      : {}),
  };
  const canonical = {
    testDir: './e2e',
    testMatch: 'all-registered-tests',
    outputDir: `./test-results/${family}`,
    ...(family === 'acceptance'
      ? { globalSetup: './e2e/operational-foundation.global-setup.mjs' }
      : {}),
    projects: [
      { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
      { name: 'narrow', use: { viewport: { width: 390, height: 844 } } },
    ],
    workers: family === 'acceptance' ? 1 : undefined,
    fullyParallel: family !== 'acceptance',
    use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
    expect: { toHaveScreenshot: { maxDiffPixels: 0 } },
    webServer: {
      command: `${family === 'acceptance' ? 'pnpm --filter @prisma-prim/api build && ' : ''}pnpm build --mode local-demo && pnpm preview --host 127.0.0.1 --port 4173`,
      env,
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
    },
  };
  await f.file(
    `apps/web/${family === 'browser' ? 'playwright.config.ts' : 'playwright.acceptance.config.ts'}`,
    `module.exports = ${JSON.stringify(canonical)};\n`,
  );
  await f.file(
    'apps/web/e2e/operational-foundation.global-setup.mjs',
    'export default () => {};\n',
  );
  await f.file(
    'apps/web/e2e/registered.test.ts',
    '// All registered fixture tests remain selected.\n',
  );
  const browserRoot = join(f.parent, 'browsers');
  const chrome = join(browserRoot, 'chromium-1/chrome-linux/chrome');
  const headless = join(
    browserRoot,
    'chromium_headless_shell-1/chrome-linux/headless_shell',
  );
  for (const path of [chrome, headless]) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'synthetic browser identity, never executed\n');
  }
  const packages = {
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
      'playwright',
      'playwright-core',
    ],
  };
  for (const [directory, names] of Object.entries(packages))
    for (const name of names) {
      await f.file(
        `${directory}/node_modules/${name}/package.json`,
        JSON.stringify({ name, version: '0.0.0-contract', main: 'index.cjs' }),
      );
      await f.file(
        `${directory}/node_modules/${name}/index.cjs`,
        name === '@playwright/test'
          ? `exports.chromium={executablePath:()=>${JSON.stringify(chrome)}};\n`
          : 'module.exports={};\n',
      );
    }
  await f.file(
    'apps/web/node_modules/playwright-core/browsers.json',
    '{"browsers":[{"name":"chromium-headless-shell","revision":"1"}]}',
  );
  await mkdir(join(f.root, 'node_modules'));
  const stub = `#!${process.execPath}
const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process');
const root=${JSON.stringify(f.root)}, calls=${JSON.stringify(calls)}, behavior=${JSON.stringify(behavior)}, family=${JSON.stringify(family)};
const args=process.argv.slice(2);
fs.appendFileSync(calls,JSON.stringify({args,cwd:process.cwd(),environment:Object.fromEntries(Object.keys(${JSON.stringify(env)}).map(k=>[k,process.env[k]])),utc:new Date().toISOString()})+'\\n');
function file(name,contents){const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,contents);}
if(args.includes('build')) {
 if(behavior==='build-failure') process.exit(7);
 if(behavior==='hang-build') {
  fs.writeFileSync(${JSON.stringify(join(f.parent, 'build-pid'))},String(process.pid));
  cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  setInterval(()=>{},1000);
  return;
 }
 if(args.includes('@prisma-prim/api')) {
  file('apps/api/dist/database/isolated-postgres-test-database.js','fresh fixture api');
  file('apps/api/dist/database/postgres-rest-test-harness.js','fresh fixture api');
 } else {
  file('apps/web/dist/index.html','fresh fixture web');file('apps/web/dist/assets/application.js','fresh fixture JS');
  if(behavior==='input-change')file('source.txt','changed during build');
 }
} else if(args[0]==='exec') {
 const configPath=args[args.indexOf('--config')+1], config=require(configPath);
 fs.writeFileSync(${JSON.stringify(join(f.parent, 'loaded-config.json'))},JSON.stringify(config));
 if(behavior==='output-change')file('apps/web/dist/assets/application.js','changed after fresh build');
 if(behavior==='wrapper-change')fs.appendFileSync(configPath,'// altered\\n');
 if(behavior==='log-change')fs.appendFileSync(path.join(path.dirname(configPath),'build-0.log'),'altered\\n');
 if(behavior==='public-env-change')config.webServer.env.VITE_DEMO_EMAIL='changed@example.test';
 const guarded=cp.spawnSync(config.webServer.command,{cwd:config.webServer.cwd,env:{...process.env,...config.webServer.env},shell:true,stdio:'inherit'});
 if(guarded.status!==0)process.exit(guarded.status||1);
 if(behavior==='test-failure')process.exit(9);
} else if(args[0]!=='preview') process.exit(97);
`;
  await writeFile(join(bin, 'pnpm'), stub);
  await chmod(join(bin, 'pnpm'), 0o755);
  f.commit();
  const childEnvironment = () => {
    const childEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    for (const key of Object.keys(childEnv))
      if (
        key.startsWith('VITE_') ||
        key === 'NODE_ENV' ||
        key === 'ACCEPTANCE_API_URL'
      )
        delete childEnv[key];
    return childEnv;
  };
  const argv = [fixtureHelper, family, '--output', f.output];
  const run = (extra = []) =>
    spawnSync(process.execPath, [...argv, ...extra], {
      cwd: f.root,
      env: childEnvironment(),
      encoding: 'utf8',
      timeout: 90_000,
    });
  const report = async () =>
    JSON.parse(
      await readFile(
        join(f.output, 'local-browser', family, 'manifest.json'),
        'utf8',
      ),
    );
  // Validation must use the same executable selector as the recorded CLI lot.
  // A parent-process import would select the real pnpm instead of this stub.
  const validate = () =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `const { validateLocalBrowserEvidence } = await import(${JSON.stringify(pathToFileURL(fixtureHelper).href)}); await validateLocalBrowserEvidence(${JSON.stringify({ root: f.root, output: f.output, family })});`,
      ],
      {
        cwd: f.root,
        env: childEnvironment(),
        encoding: 'utf8',
        timeout: 90_000,
      },
    );
  return {
    ...f,
    family,
    fixtureHelper,
    canonical,
    env,
    calls,
    argv,
    childEnvironment,
    run,
    report,
    validate,
  };
}

test('closed CLI runs fresh fixed builds before full Playwright and guards both startup plans', async (t) => {
  for (const family of ['browser', 'acceptance']) {
    const f = await browserFixture(t, family);
    const child = f.run();
    assert.equal(child.status, 0, child.stderr);
    const report = await f.report();
    const calls = (await readFile(f.calls, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      calls.map((call) => call.args),
      [
        ...(family === 'acceptance'
          ? [['--filter', '@prisma-prim/api', 'build']]
          : []),
        ['build', '--mode', 'local-demo'],
        [
          'exec',
          'playwright',
          'test',
          '--config',
          report.plan.config,
          ...(family === 'browser' ? ['--workers=2'] : []),
        ],
        ['preview', '--host', '127.0.0.1', '--port', '4173'],
      ],
    );
    assert.ok(
      calls.every(
        (call) => JSON.stringify(call.environment) === JSON.stringify(f.env),
      ),
    );
    const config = JSON.parse(
      await readFile(join(f.parent, 'loaded-config.json'), 'utf8'),
    );
    for (const name of [
      'testMatch',
      'projects',
      'workers',
      'fullyParallel',
      'use',
      'expect',
    ])
      assert.deepEqual(config[name], f.canonical[name]);
    assert.equal(config.testDir, join(f.root, 'apps/web/e2e'));
    assert.equal(
      config.outputDir,
      join(f.root, 'apps/web/test-results', family),
    );
    if (family === 'acceptance')
      assert.equal(
        config.globalSetup,
        join(f.root, 'apps/web/e2e/operational-foundation.global-setup.mjs'),
      );
    assert.equal(config.webServer.timeout, 180_000);
    assert.equal(config.webServer.reuseExistingServer, false);
    assert.doesNotMatch(config.webServer.command, /pnpm.*build/u);
    assert.equal(report.previewGuard.status, 'passed');
    assert.equal(report.afterGuard.status, 'passed');
    const validated = f.validate();
    assert.equal(validated.status, 0, validated.stderr);
    assert.equal(f.run().status, 1, 'an existing lot must never be reused');
  }
});

test('CLI refuses failed builds or any input/output/environment/wrapper/log drift before preview', async (t) => {
  for (const behavior of [
    'build-failure',
    'input-change',
    'output-change',
    'public-env-change',
    'wrapper-change',
    'log-change',
  ]) {
    const f = await browserFixture(t, 'acceptance', behavior);
    const child = f.run();
    assert.equal(child.status, 1, behavior);
    const report = await f.report();
    assert.equal(report.status, 'failed', behavior);
    const calls = (await readFile(f.calls, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.ok(
      calls.every((call) => call.args[0] !== 'preview'),
      behavior,
    );
    const rejected = f.validate();
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.match(
      rejected.stderr,
      /Incomplete or altered local browser startup evidence/u,
    );
  }
});

test('a real helper child failure stays failed with its fresh-build proof and private logs', async (t) => {
  const f = await browserFixture(t, 'acceptance', 'test-failure');
  assert.equal(f.run().status, 1);
  const report = await f.report();
  assert.equal(report.status, 'failed');
  assert.ok(report.builds.every((step) => step.status === 'passed'));
  assert.equal(report.test.exitCode, 9);
  assert.equal(report.previewGuard.status, 'passed');
  assert.equal(report.afterGuard.status, 'passed');
});

test('validator refuses altered prebuild argv, guard metadata and a fabricated successful old report', async (t) => {
  const f = await browserFixture(t);
  assert.equal(f.run().status, 0);
  const original = await f.report();
  const path = join(f.output, 'local-browser/acceptance/manifest.json');
  const validated = f.validate();
  assert.equal(validated.status, 0, validated.stderr);
  for (const [alter, reason] of [
    [
      (report) => {
        report.builds[0].args = ['true'];
      },
      /Altered real build argv/u,
    ],
    [
      (report) => {
        report.previewGuard.outputDigest = '0'.repeat(64);
      },
      /Altered recorded preview guard/u,
    ],
    [
      (report) => {
        report.outputs = {};
      },
      /Required fresh compiled entry missing/u,
    ],
    [
      (report) => {
        report.plan.startupMilliseconds = 600_000;
      },
      /Incomplete or altered local browser startup evidence/u,
    ],
  ]) {
    const forged = structuredClone(original);
    alter(forged);
    await writeFile(path, JSON.stringify(forged));
    const rejected = f.validate();
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.match(rejected.stderr, reason);
  }
  await writeFile(path, JSON.stringify(original));
  await f.file('source.txt', 'later source drift');
  const stale = f.validate();
  assert.equal(stale.status, 1, stale.stderr);
  assert.match(
    stale.stderr,
    /Stale browser integration\/dependency\/tool inputs/u,
  );
});

test('interruption preserves a partial helper manifest and removes every owned build descendant', async (t) => {
  const f = await browserFixture(t, 'acceptance', 'hang-build');
  const child = spawn(process.execPath, f.argv, {
    cwd: f.root,
    env: f.childEnvironment(),
    detached: true,
    stdio: 'ignore',
  });
  const closed = new Promise((resolveClose) =>
    child.once('close', (code, signal) => resolveClose({ code, signal })),
  );
  let buildPid;
  const failures = [];
  try {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        buildPid = Number(await readFile(join(f.parent, 'build-pid'), 'utf8'));
        break;
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
      }
    }
    assert.ok(buildPid, 'the owned real subprocess must have started');
    child.kill('SIGTERM');
    let deadline;
    const result = await Promise.race([
      closed,
      new Promise((_, reject) => {
        deadline = setTimeout(
          () =>
            reject(new Error('Helper failed bounded interruption cleanup.')),
          10_000,
        );
      }),
    ]).finally(() => clearTimeout(deadline));
    assert.equal(result.code, 1);
    assert.equal(result.signal, null);
    const report = await f.report();
    assert.equal(report.status, 'interrupted');
    assert.equal(report.builds[0].status, 'interrupted');
    assert.equal(report.test, null);
    assert.equal(await createProcessGroupController().isLive(buildPid), false);
  } catch (error) {
    failures.push(error);
  } finally {
    let childKillRefused = false;
    for (const group of [buildPid, child.pid])
      if (group) {
        try {
          process.kill(-group, 'SIGKILL');
        } catch (error) {
          // ESRCH alone means already exited; every real kill refusal still fails.
          if (error.code !== 'ESRCH') {
            failures.push(error);
            if (group === child.pid) childKillRefused = true;
          }
        }
      }
    if (!childKillRefused) {
      try {
        await closed;
      } catch (error) {
        failures.push(error);
      }
    }
  }
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      'Interruption assertion or cleanup failed.',
    );
  if (failures.length === 1) throw failures[0];
});

test('input-integrity failure during acceptance keeps a refusal and still executes the diagnostic probe', async (t) => {
  const f = await repository(t);
  const source = f.commit();
  const report = await runLocalVerification({
    root: f.root,
    output: f.output,
    source,
    base: 'main',
    mode: 'contract-test',
    families: [
      {
        id: 'acceptance',
        command: process.execPath,
        args: [
          '-e',
          'require("node:fs").writeFileSync("source.txt", "changed");process.exit(7)',
        ],
      },
      {
        id: 'acceptance-evidence',
        command: process.execPath,
        args: ['-e', 'console.log("diagnostic probe after drift")'],
      },
      {
        id: 'build',
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
      },
    ],
  });
  assert.equal(report.status, 'failed');
  assert.match(report.refusal, /changed|clean/u);
  assert.equal(report.families[0].exitCode, 7);
  assert.equal(report.families[1].status, 'passed');
  assert.equal(report.families[2].status, 'unexecuted');
});

test('CLI rejects unknown startup families and arbitrary flags before running a child', async (t) => {
  const f = await browserFixture(t, 'browser');
  assert.equal(f.run(['--skip-build']).status, 1);
  const child = spawnSync(
    process.execPath,
    [f.fixtureHelper, 'unknown', '--output', f.output],
    {
      cwd: f.root,
      env: f.childEnvironment(),
      encoding: 'utf8',
      timeout: 90_000,
    },
  );
  assert.equal(child.status, 1);
  await assert.rejects(readFile(f.calls), { code: 'ENOENT' });
});
