import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { verifyAcceptanceProof } from './verify-acceptance-proof.mjs';

const readTemplate = async () =>
  (
    await readFile(
      new URL('../.github/pull_request_template.md', import.meta.url),
      'utf8',
    )
  ).replaceAll('\r\n', '\n');

// The owner asked every pull request to say how to undo it, next to the door
// and blast-radius guidance, so a bad merge can be rolled back quickly.
test('the pull request template asks how to revert inside the risk section', async () => {
  const riskSection = (await readTemplate())
    .split(/^## /m)
    .find((section) => section.startsWith('Risks and merge danger'));

  assert.ok(
    riskSection,
    'the template keeps a "Risks and merge danger" section',
  );
  assert.match(riskSection, /^How to revert:/m);
});

// The template's Acceptance proof section is exactly the format the CI check
// parses (#1276): an unfilled copy fails only for the missing rows, and a
// filled copy passes.
test('the pull request template carries the Acceptance proof section the check reads', async () => {
  const template = await readTemplate();
  const input = (body) => ({
    repository: 'Prisma-Prim/PRISMA-PRIM-Suite',
    pullRequest: { number: 900, body },
    issues: [
      {
        number: 501,
        body: '## Acceptance criteria\n\n1. The guide describes the rule.\n',
      },
    ],
    changedFiles: ['docs/agents/issue-execution.md'],
    results: { families: [], records: [] },
    comments: [],
    approvers: null,
  });
  const unfilled = verifyAcceptanceProof(
    input(template.replace('Closes #', 'Closes #501')),
  );
  assert.deepEqual(unfilled.failures, [
    'Criterion 1 of #501 has no row: "The guide describes the rule."',
  ]);

  const filled = verifyAcceptanceProof(
    input(
      template
        .replace('Closes #', 'Closes #501')
        .replace(
          /(\| -+ \| -+ \| -+ \| -+ \|\n)/u,
          '$1| 1 | docs | `node scripts/validate-repository-docs.mjs` | — |\n',
        ),
    ),
  );
  assert.deepEqual(filled.failures, []);
});

const readDocument = async (path) =>
  (await readFile(new URL(`../${path}`, import.meta.url), 'utf8')).replaceAll(
    '\r\n',
    '\n',
  );

test('issue execution states the proof rule and points at its format, exception and rerun paths', async () => {
  const rule = (await readDocument('docs/agents/issue-execution.md'))
    .split(/^## /m)
    .find((section) => section.startsWith('Acceptance proof\n'));
  assert.ok(rule, 'issue execution keeps an "Acceptance proof" section');
  for (const required of [
    'each acceptance criterion',
    'when no issue closes',
    'passed in the same CI run',
    'desktop and narrow acceptance screenshots',
    '`quality` blocks the merge',
    "approver's comment",
    'rerun the failed job',
    'No workflow, comment or label may start Claude',
    '(acceptance-proof.md)',
  ])
    assert.ok(rule.includes(required), required);

  const template = await readTemplate();
  assert.ok(template.includes('docs/agents/acceptance-proof.md'));
});

test('the acceptance proof guide describes the rule, the row format, the exception path and the rerun path', async () => {
  const guide = await readDocument('docs/agents/acceptance-proof.md');
  for (const required of [
    'scripts/verify-acceptance-proof.mjs',
    'closes no issue',
    '`#<issue>.<number>`',
    '`<file> :: <test title>`',
    '| UI ',
    '| behaviour ',
    '| bug fix ',
    '| refactor ',
    '| docs, tooling ',
    '`Red-green:`',
    '"Not applicable" is accepted only with its reason',
    '`apps/web/src/**`',
    '`Acceptance proof exception: <reason>`',
    '`PROOF_EXCEPTION_APPROVERS`',
    'gh run rerun <run-id> --failed',
    'merge group',
    'may start Claude',
  ])
    assert.ok(guide.includes(required), required);
});
