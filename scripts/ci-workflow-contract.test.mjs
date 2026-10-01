import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);

test('CI runs once per pull request head and cancels superseded runs', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const concurrencyStart = workflow.indexOf('\nconcurrency:\n');
  const jobsStart = workflow.indexOf('\njobs:\n');

  assert.notEqual(concurrencyStart, -1);
  assert.ok(jobsStart > concurrencyStart);

  const concurrency = workflow
    .slice(concurrencyStart, jobsStart)
    .replaceAll(/\s+/g, ' ');
  assert.match(
    concurrency,
    /group: ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}/,
  );
  assert.match(concurrency, /cancel-in-progress: true/);
  assert.doesNotMatch(workflow, /workflow_call|checkout_ref|preflight/);
});

test('CI preserves every verification seam in order and fails formatting first', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const requiredSteps = [
    'Check out repository',
    'Set up repository verification',
    'Verify supported agent environment',
    'Check formatting',
    'Lint',
    'Type-check',
    'Test',
    'Upload browser evidence',
    'Build',
  ];
  const positions = requiredSteps.map((step) =>
    workflow.indexOf(`- name: ${step}`),
  );

  for (const [index, step] of requiredSteps.entries()) {
    assert.notEqual(positions[index], -1, `missing step ${step}`);
  }
  assert.deepEqual(
    [...positions].sort((left, right) => left - right),
    positions,
    'verification steps must keep their documented order',
  );

  const stepBody = (step) => {
    const start = workflow.indexOf(`- name: ${step}`);
    const next = workflow.indexOf('\n      - name:', start);
    return workflow.slice(start, next === -1 ? undefined : next);
  };
  assert.match(
    stepBody('Verify supported agent environment'),
    /run: pnpm agent:doctor:web-postgres/,
  );
  assert.match(stepBody('Check formatting'), /run: pnpm format:check/);
  assert.match(stepBody('Lint'), /run: pnpm lint/);
  assert.match(stepBody('Type-check'), /run: pnpm typecheck/);
  assert.match(stepBody('Test'), /run: pnpm test\n/);
  assert.match(
    workflow.slice(workflow.indexOf('- name: Build')),
    /run: pnpm build/,
  );
  for (const step of ['Check formatting', 'Lint', 'Type-check', 'Test'])
    assert.doesNotMatch(
      stepBody(step),
      /\bif:/,
      `${step} must be unconditional`,
    );
});
