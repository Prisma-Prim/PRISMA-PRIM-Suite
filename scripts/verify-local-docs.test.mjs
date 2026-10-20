import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('./verify-local.mjs', import.meta.url));
const assertPassed = (child) => assert.equal(child.status, 0, child.stderr);

// Synthetic repositories and executable system-boundary doubles only. These
// reports prove CLI orchestration, never execution of the application suites.
async function fixture(t, changes = [['docs/guide.md', '# Updated guide\n']]) {
  const parent = await mkdtemp(join(tmpdir(), 'local-docs-cli-contract-'));
  const root = join(parent, 'repository');
  const bin = join(parent, 'bin');
  await mkdir(root);
  await mkdir(bin);
  t.after(() => rm(parent, { recursive: true, force: true }));
  function git(...args) {
    const child = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    return child.stdout.trim();
  }
  async function file(path, contents) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  git('init', '-b', 'main');
  git('config', 'user.name', 'Synthetic CLI contract');
  git('config', 'user.email', 'contract@example.test');
  await file('AGENTS.md', '# Fixture instructions\n');
  await file('docs/guide.md', '# Original guide\n');
  await file('application.js', 'export const fixture = true;\n');
  await file('settings.json', '{}\n');
  await file(
    'scripts/agent-doctor.mjs',
    'console.log(JSON.stringify(process.argv.slice(2)));\n',
  );
  git('add', '.');
  git('commit', '-m', 'synthetic baseline');
  const base = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', base);
  git('checkout', '-b', 'source');
  for (const [path, contents] of changes) {
    if (contents === null) await rm(join(root, path));
    else await file(path, contents);
  }
  git('add', '-A');
  git('commit', '-m', 'synthetic proposed change');
  const stubCalls = join(parent, 'pnpm-calls.jsonl');
  await writeFile(
    join(bin, 'pnpm'),
    `#!${process.execPath}\nconst args = process.argv.slice(2);\nrequire('node:fs').appendFileSync(${JSON.stringify(stubCalls)}, JSON.stringify({ executable: process.argv[1], args, utc: new Date().toISOString() })+'\\n');\nif (args[0] === '--version') console.log('11.20.0');\nelse if (['format:check','lint','typecheck','test:scripts'].includes(args[0]) || JSON.stringify(args) === JSON.stringify(['--filter','@prisma-prim/api','exec','vitest','run','src/demonstration'])) console.log(JSON.stringify(args));\nelse process.exit(97);\n`,
  );
  await chmod(join(bin, 'pnpm'), 0o755);
  const output = join(parent, 'evidence');
  function command(action = 'run', directory = output) {
    const started = Date.now();
    const child = spawnSync(
      process.execPath,
      [
        cli,
        action,
        '--output',
        directory,
        ...(action === 'run' ? ['--source', 'source'] : []),
      ],
      {
        cwd: root,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        encoding: 'utf8',
        timeout: 90_000,
      },
    );
    if (child.status !== 0) {
      try {
        const partial = JSON.parse(
          readFileSync(join(directory, 'manifest.json'), 'utf8'),
        );
        child.stderr += `\nSynthetic fixture diagnostics: ${JSON.stringify({
          error: { code: child.error?.code, message: child.error?.message },
          durationMilliseconds: Date.now() - started,
          pnpmCalls: (() => {
            try {
              return readFileSync(stubCalls, 'utf8')
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line));
            } catch {
              return [];
            }
          })(),
          scope: partial.scope,
          refusal: partial.refusal,
          results: partial.families.map(({ id, status, exitCode }) => ({
            id,
            status,
            exitCode,
          })),
        })}\n`;
      } catch {
        child.stderr += `\nSynthetic fixture process error: ${child.error?.message ?? 'no manifest'}\n`;
      }
    }
    return child;
  }
  const report = async () =>
    JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  return { root, output, git, file, command, report };
}

test('CLI derives the approved documentation-only gate from the real integration diff', async (t) => {
  const { output, command, report } = await fixture(t);
  const child = command();
  assert.equal(child.status, 0, child.stderr);
  const manifest = await report();
  assert.equal(manifest.scope.kind, 'docs_only');
  assert.deepEqual(
    manifest.families.slice(0, 6).map(({ id, status }) => [id, status]),
    [
      ['doctor', 'passed'],
      ['format', 'passed'],
      ['lint', 'passed'],
      ['types', 'passed'],
      ['scripts', 'passed'],
      ['documentation', 'passed'],
    ],
  );
  assert.deepEqual(manifest.families[0].args, ['scripts/agent-doctor.mjs']);
  assert.equal(
    (await readFile(join(output, 'logs/doctor.log'), 'utf8')).trim(),
    '[]',
  );
  assert.ok(
    manifest.families
      .slice(6)
      .every(
        (family) =>
          family.status === 'not_required' &&
          family.reason === manifest.scope.reason &&
          family.exitCode === null &&
          family.startedAt === null,
      ),
  );
  assert.equal(manifest.prerequisites.railway.status, 'not_required');
  assert.equal(command('validate').status, 0);
});

test('CLI keeps code, config and out-of-allowlist paths on the full gate without Railway prerequisites', async (t) => {
  for (const change of [
    ['application.js', 'export const fixture = false;\n'],
    ['settings.json', '{"changed":true}\n'],
    ['README.md', '# Readme\n'],
    ['nested/AGENTS.md', '# Nested\n'],
  ]) {
    const { command, report } = await fixture(t, [
      ['docs/guide.md', '# Updated guide\n'],
      change,
    ]);
    const child = command();
    assert.equal(child.status, 1);
    const manifest = await report();
    assert.equal(manifest.scope.kind, 'complete');
    assert.equal(manifest.families.length, 16);
    assert.ok(
      manifest.families.every(
        (family) => family.required && family.status === 'unexecuted',
      ),
    );
    assert.deepEqual(manifest.families[0].args, [
      'scripts/agent-doctor.mjs',
      '--profile',
      'web-postgres',
    ]);
    assert.match(
      manifest.refusal,
      /pnpm --dir \.railway install --frozen-lockfile/,
    );
  }
});

test('CLI preserves deletion and rename classification using both no-renames paths', async (t) => {
  for (const changes of [
    [['docs/guide.md', null]],
    [
      ['docs/guide.md', null],
      ['docs/renamed.md', '# Original guide\n'],
    ],
    [['AGENTS.md', '# Updated root instructions\n']],
  ]) {
    const { command, report } = await fixture(t, changes);
    assertPassed(command());
    assert.equal((await report()).scope.kind, 'docs_only');
  }
  for (const changes of [
    [
      ['application.js', null],
      ['docs/disguised.md', 'export const fixture = true;\n'],
    ],
    [
      ['docs/guide.md', null],
      ['README.md', '# Original guide\n'],
    ],
  ]) {
    const { command, report } = await fixture(t, changes);
    assert.equal(command().status, 1);
    assert.equal((await report()).scope.kind, 'complete');
  }
});

test('CLI refuses documentation evidence after the source or base advances', async (t) => {
  for (const advance of ['source', 'base']) {
    const { command, git, file, report } = await fixture(t);
    assertPassed(command());
    if (advance === 'base')
      git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'source'));
    else {
      await file('docs/guide.md', '# Later source\n');
      git('add', '.');
      git('commit', '-m', 'later synthetic source');
    }
    const rejected = command('validate');
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Stale|integration/);
    assert.equal((await report()).scope.kind, 'docs_only');
  }
});

test('CLI recomputes the real mixed scope instead of trusting a relabelled documentation report', async (t) => {
  const { command, report, output, root, file, git } = await fixture(t);
  assertPassed(command());
  const forged = await report();
  await file('settings.json', '{"mixed":true}\n');
  git('add', '.');
  git('commit', '-m', 'mixed synthetic source');
  const mixedOutput = join(dirname(output), 'mixed-evidence');
  assert.equal(command('run', mixedOutput).status, 1);
  const mixed = JSON.parse(
    await readFile(join(mixedOutput, 'manifest.json'), 'utf8'),
  );
  assert.equal(mixed.scope.kind, 'complete');
  forged.provenance = mixed.provenance;
  await writeFile(join(output, 'manifest.json'), JSON.stringify(forged));
  const rejected = command('validate');
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /source-derived scope differs/);
  assert.equal(git('rev-parse', '--show-toplevel'), root);
});

test('CLI refuses arbitrary not_required reasons and demotion of a required cheap family', async (t) => {
  for (const alteration of ['reason', 'required']) {
    const { command, report, output } = await fixture(t);
    assertPassed(command());
    const forged = await report();
    if (alteration === 'reason')
      forged.families[6].reason = 'User requested a skip';
    else
      Object.assign(forged.families[1], {
        required: false,
        status: 'not_required',
        reason: forged.scope.reason,
        exitCode: null,
        startedAt: null,
        finishedAt: null,
      });
    await writeFile(join(output, 'manifest.json'), JSON.stringify(forged));
    const rejected = command('validate');
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /altered required verification families/);
  }
});

test('CLI records finite aggregate process ceilings and refuses altered deadline metadata', async (t) => {
  const { command, report, output } = await fixture(t);
  assertPassed(command());
  const manifest = await report();
  const minutes = Object.fromEntries(
    manifest.families.map((family) => [
      family.id,
      family.timeoutMilliseconds / 60_000,
    ]),
  );
  assert.equal(minutes['api-parallel'], 270);
  assert.equal(minutes.browser, 270);
  assert.equal(minutes.acceptance, 180);
  assert.equal(minutes['api-serial'], 45);
  assert.equal(minutes.documentation, 45);
  assert.match(
    manifest.families.find((family) => family.id === 'acceptance').timeoutBasis,
    /2.*2.*45/,
  );
  assert.match(
    await readFile(join(output, 'report.md'), 'utf8'),
    /process safety caps.*scenario.*unchanged/is,
  );
  manifest.families.find(
    (family) => family.id === 'browser',
  ).timeoutMilliseconds = 45 * 60_000;
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest));
  const rejected = command('validate');
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /altered required verification families/);
});
