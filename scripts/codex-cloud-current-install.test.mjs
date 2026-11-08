import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The current Codex Cloud environment's Install script (#1164). The Codex
// settings run this file; these invariants are the ones its 2026-11-07 proof
// in #216 depends on.
const scriptPath = fileURLToPath(
  new URL('./codex-cloud-current-install.sh', import.meta.url),
);
const readScript = async () =>
  (await readFile(scriptPath, 'utf8')).replaceAll('\r\n', '\n');
const readStartSkill = async () =>
  (
    await readFile(
      new URL(
        '../docs/agents/codex-cloud-current-start-skill.txt',
        import.meta.url,
      ),
      'utf8',
    )
  ).replaceAll('\r\n', '\n');

test('the current Cloud Start skill activates what the Install script writes, at the same pins', async () => {
  const script = await readScript();
  const skill = await readStartSkill();
  assert.match(
    skill,
    /^source \/workspace\/prisma-cloud-tools\/activate-prisma-cloud\.sh$/m,
  );
  assert.match(
    script,
    /\/workspace\/prisma-cloud-tools\/activate-prisma-cloud\.sh/,
  );
  for (const pin of ['pnpm 11.20.0', 'GitHub CLI 2.102.0']) {
    assert.ok(skill.includes(pin), `the Start skill expects ${pin}`);
  }
  assert.match(script, /pnpm@11\.20\.0/);
  assert.match(script, /github-cli\/2\.102\.0/);
});

test('the current Cloud Start skill runs the doctor with Cloud readiness budgets', async () => {
  // Standard budgets can misreport a slow Cloud probe as a missing tool
  // (#611); the commands proven on 2026-11-07 pass --readiness-profile cloud.
  const doctorRuns =
    (await readStartSkill()).match(/agent-doctor\.mjs --profile [^\n']*/g) ??
    [];
  assert.ok(doctorRuns.length > 0, 'the Start skill runs the doctor');
  for (const run of doctorRuns) {
    assert.match(run, /--readiness-profile cloud\b/, run);
  }
});

test('the current Cloud Install script is valid strict bash', async () => {
  const script = await readScript();
  assert.match(script, /^#!\/usr\/bin\/env bash\nset -euo pipefail\n/);
  const syntax = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test('the current Cloud Install script never needs root', async () => {
  // The current environment runs without root (#604); apt-get or sudo there
  // fails, which is why PostgreSQL comes from a pinned Docker image instead.
  const commands = (await readScript())
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(commands, /\b(?:sudo|apt-get|apt|pg_ctlcluster)\b/);
});

test('the current Cloud Install script pins the repository pnpm and a PostgreSQL digest', async () => {
  const script = await readScript();
  const { packageManager } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const pnpmVersion = packageManager.replace(/^pnpm@/, '');
  const pins = [...script.matchAll(/pnpm@(\d+\.\d+\.\d+)/g)].map(
    (match) => match[1],
  );
  assert.ok(pins.length > 0, 'the script installs a pinned pnpm');
  assert.deepEqual(new Set(pins), new Set([pnpmVersion]));
  assert.match(script, /docker pull postgres@sha256:[0-9a-f]{64}\n/);
});
