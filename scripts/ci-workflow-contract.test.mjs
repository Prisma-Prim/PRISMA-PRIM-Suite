import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);

test('CI cancels superseded work without colliding full and preflight runs', async () => {
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
    /group: >- ci-\$\{\{ inputs\.mode \|\| 'full' \}\}-\$\{\{ inputs\.checkout_ref \|\| github\.event\.pull_request\.number \|\| github\.sha \}\}/,
  );
  assert.match(concurrency, /cancel-in-progress: true/);
});

test('CI preserves every verification seam and fails formatting first', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const requiredSteps = [
    'Validate requested verification mode',
    'Check out exact requested head',
    'Verify exact requested head',
    'Set up repository verification',
    'Verify supported agent environment',
    'Verify preflight prerequisites',
    'Run canonical PostgreSQL smoke preflight',
    'Run canonical previous-schema migration preflight',
    'Run canonical desktop and narrow Playwright preflight',
    'Check formatting',
    'Lint',
    'Type-check',
    'Test',
    'Upload browser evidence',
    'Build',
  ];

  for (const step of requiredSteps) {
    assert.match(workflow, new RegExp(`- name: ${step}`));
  }

  const formatting = workflow.indexOf('- name: Check formatting');
  const lint = workflow.indexOf('- name: Lint');
  const formattingStep = workflow.slice(formatting, lint);
  assert.match(formattingStep, /if: \$\{\{ inputs\.mode != 'preflight' \}\}/);
  assert.match(formattingStep, /run: pnpm format:check/);

  for (const expensiveStep of ['Lint', 'Type-check', 'Test', 'Build']) {
    assert.ok(
      formatting < workflow.indexOf(`- name: ${expensiveStep}`),
      `formatting must run before ${expensiveStep}`,
    );
  }

  const setup = workflow.indexOf('- name: Set up repository verification');
  const strictDoctor = workflow.indexOf(
    '- name: Verify supported agent environment',
  );
  const preflight = workflow.indexOf('- name: Verify preflight prerequisites');
  const strictDoctorStep = workflow.slice(strictDoctor, preflight);

  assert.ok(setup < strictDoctor, 'setup must run before the strict Doctor');
  assert.ok(
    strictDoctor < preflight,
    'the strict Doctor must run before the delegable preflight check',
  );
  assert.match(strictDoctorStep, /run: pnpm agent:doctor:web-postgres/);
  assert.doesNotMatch(strictDoctorStep, /if:/);
});
