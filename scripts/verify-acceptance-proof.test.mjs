import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  closedIssueNumbers,
  githubSource,
  isWebUiSource,
  readTestResults,
  runAcceptanceProof,
  verifyAcceptanceProof,
} from './verify-acceptance-proof.mjs';

// Every input is a committed fixture or an inline string: no network access.
const fixtures = new URL('./fixtures/acceptance-proof/', import.meta.url);
const fixturePath = (relative) => fileURLToPath(new URL(relative, fixtures));
const workspace = '/home/runner/work/PRISMA-PRIM-Suite/PRISMA-PRIM-Suite';
const repository = 'Prisma-Prim/PRISMA-PRIM-Suite';
const approver = 'owner-login';
const results = await readTestResults({
  directory: fixturePath('run/ci-test-results'),
  evidenceDirectory: fixturePath('run/browser-evidence'),
  workspace,
});
const issueBody = async (number) =>
  (await readFile(fixturePath(`issues/${number}.md`), 'utf8')).replaceAll(
    '\r\n',
    '\n',
  );
const issue501 = { number: 501, body: await issueBody(501) };

const registered =
  '`apps/web/e2e/client-registration.acceptance.spec.ts :: Client registration > registers a Client and shows it in the directory`';
const duplicateApi =
  '`apps/api/src/client/client-registration.rest.test.ts :: Client registration > rejects a duplicate legal identifier`';
const archiveApi =
  '`apps/api/src/client/client-archive.service.test.ts :: archives a Client`';
const formError =
  '`apps/web/src/client/client-registration-form.test.tsx :: shows the duplicate legal identifier error`';
const header = [
  '| Criterion | Kind | Functional proof | Visual proof |',
  '| --------- | ---- | ---------------- | ------------ |',
];

function pullRequestBody(rows, { closes = 'Closes #501', extra = [] } = {}) {
  return [
    '## Outcome',
    '',
    'Registers Clients.',
    '',
    closes,
    '',
    '## Acceptance proof',
    '',
    '<!-- One row per acceptance criterion. -->',
    '',
    ...header,
    ...rows,
    '',
    ...extra,
    '',
    '## Risks and merge danger',
    '',
    'Door: two-way.',
  ].join('\n');
}

const completeRows = [
  `| 1 | UI | ${registered} | ${registered} |`,
  `| 2 | behaviour | ${archiveApi} | — |`,
  `| 3 | UI | ${formError} | ${registered} |`,
];

function verify(overrides = {}) {
  return verifyAcceptanceProof({
    repository,
    pullRequest: { number: 900, body: pullRequestBody(completeRows) },
    issues: [issue501],
    changedFiles: ['apps/web/src/client/client-registration-form.tsx'],
    results,
    comments: [],
    approvers: [approver],
    readSource: () => null,
    ...overrides,
  });
}

function failuresMatching(verdict, pattern) {
  return verdict.failures.filter((failure) => pattern.test(failure));
}

test('a complete section with passing tests and both screenshots passes', () => {
  const verdict = verify();
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.passed, true);
  assert.equal(verdict.exception, null);
});

test('criterion 1: a body without the section fails and names every criterion without a row', () => {
  const verdict = verify({
    pullRequest: { number: 900, body: '## Outcome\n\nCloses #501\n' },
  });
  assert.equal(verdict.passed, false);
  assert.equal(
    failuresMatching(verdict, /no "## Acceptance proof" section/u).length,
    1,
  );
  for (const criterion of [1, 2, 3])
    assert.equal(
      failuresMatching(
        verdict,
        new RegExp(`^Criterion ${criterion} of #501 has no row`, 'u'),
      ).length,
      1,
      `criterion ${criterion} must be named`,
    );
  assert.match(
    verdict.failures.join('\n'),
    /Criterion 2 of #501 has no row: "The API rejects a duplicate legal identifier/u,
  );
});

test('criterion 1: a section that skips one criterion names only that criterion', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([completeRows[0], completeRows[2]]),
    },
  });
  assert.deepEqual(verdict.failures, [
    'Criterion 2 of #501 has no row: "The API rejects a duplicate legal identifier in the same Company."',
  ]);
});

test('criterion 1: a row naming a criterion the issue does not have fails', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        ...completeRows,
        `| 4 | behaviour | ${archiveApi} | — |`,
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    'Row "4" names no acceptance criterion of #501 (it has 1 to 3).',
  ]);
});

test('criterion 1: checkbox criteria count, and commented-out items do not', async () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody(
        ['| 1 | docs | `node scripts/validate-repository-docs.mjs` | — |'],
        { closes: 'Fixes #503' },
      ),
    },
    issues: [{ number: 503, body: await issueBody(503) }],
    changedFiles: ['docs/agents/issue-execution.md'],
  });
  assert.deepEqual(verdict.failures, [
    'Criterion 2 of #503 has no row: "The example tool reports every changed file."',
  ]);
});

test('criterion 2: a row citing a test absent from the suite fails with the row named', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        '| 2 | behaviour | `apps/api/src/client/client-registration.rest.test.ts :: rejects an invented case` | — |',
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    'Row "2": `apps/api/src/client/client-registration.rest.test.ts :: rejects an invented case` did not run in this CI run (the api results have no test with that title in this file).',
  ]);
});

test('criterion 2: a row citing a file CI never ran fails', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        '| 2 | behaviour | `apps/api/src/client/missing.rest.test.ts :: rejects it` | — |',
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    'Row "2": `apps/api/src/client/missing.rest.test.ts :: rejects it` did not run in this CI run (the api results have no test from this file).',
  ]);
});

test('criterion 2: a row citing a failed test fails with the row named', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        `| 2 | behaviour | ${duplicateApi} | — |`,
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    `Row "2": ${duplicateApi} failed in this run.`,
  ]);
});

test('criterion 2: a row citing a skipped test fails with the row named', () => {
  const skipped =
    '`scripts/example-tool.test.mjs :: options > reads a configuration file`';
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        `| 2 | tooling | ${skipped} | — |`,
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    `Row "2": ${skipped} was skipped in this run.`,
  ]);
});

test('criterion 2: a cited test outside every CI test family fails', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        '| 2 | behaviour | `tools/other.test.mjs :: works` | — |',
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    'Row "2": `tools/other.test.mjs :: works` is not in a test family that CI runs (scripts, api, web_unit, browser or acceptance).',
  ]);
});

test('criterion 2: a family that did not run in this CI run cannot prove a row', async () => {
  const onlyScripts = await readTestResults({
    directory: fixturePath('run/ci-test-results'),
    evidenceDirectory: fixturePath('run/browser-evidence'),
    workspace,
    families: ['scripts'],
  });
  const verdict = verify({ results: onlyScripts, changedFiles: [] });
  assert.deepEqual(
    verdict.failures.filter((failure) => failure.startsWith('Row "2"')),
    [
      `Row "2": ${archiveApi} did not run in this CI run (there are no api results).`,
    ],
  );
});

test('criterion 2: reused API proof is accepted only for a test present in the source', async () => {
  const withoutApi = await readTestResults({
    directory: fixturePath('run/ci-test-results'),
    evidenceDirectory: fixturePath('run/browser-evidence'),
    workspace,
    families: ['scripts', 'web_unit', 'browser', 'acceptance'],
  });
  const source = new Map([
    [
      'apps/api/src/client/client-archive.service.test.ts',
      "it('archives a Client', () => {});",
    ],
  ]);
  const verdict = verify({
    results: withoutApi,
    reusedFamilies: { api: 123456 },
    readSource: (file) => source.get(file) ?? null,
  });
  assert.deepEqual(verdict.failures, []);
  assert.match(verdict.notes.join('\n'), /reused from CI run 123456/u);

  const missing = verify({
    results: withoutApi,
    reusedFamilies: { api: 123456 },
    readSource: () => null,
  });
  assert.deepEqual(missing.failures, [
    `Row "2": ${archiveApi} is absent from the suite (the api results were reused from CI run 123456, so only its presence in the source can be checked).`,
  ]);
});

test('criterion 2: a whole test file is proof only when it passed without failures', () => {
  const passing = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        '| 2 | refactor | `apps/api/src/client/client-archive.service.test.ts` | — |',
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(passing.failures, []);

  const failing = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        '| 2 | refactor | `apps/api/src/client/client-registration.rest.test.ts` | — |',
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(failing.failures, [
    'Row "2": `apps/api/src/client/client-registration.rest.test.ts` failed in this run.',
  ]);
});

test('criterion 3: a UI change fails without a visual-proof row', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        `| 1 | behaviour | ${registered} | — |`,
        `| 2 | behaviour | ${archiveApi} | — |`,
        `| 3 | behaviour | ${formError} | — |`,
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    'This pull request changes web UI source (apps/web/src/client/client-registration-form.tsx), so at least one row needs visual proof from an acceptance journey test that produced desktop and narrow screenshots in this run.',
  ]);
});

test('criterion 3: a UI row needs visual proof, and "not applicable" does not count', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        completeRows[1],
        `| 3 | UI | ${formError} | Not applicable: covered by unit tests |`,
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    'Row "3": a UI criterion needs visual proof from an acceptance journey test (apps/web/e2e/*.acceptance.spec.ts) that produced desktop and narrow screenshots in this run.',
  ]);
});

test('criterion 3: visual proof needs a passing narrow screenshot as well as a desktop one', () => {
  const duplicateJourney =
    '`apps/web/e2e/client-registration.acceptance.spec.ts :: warns about a duplicate legal identifier`';
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        `| 1 | UI | ${duplicateJourney} | ${duplicateJourney} |`,
        completeRows[1],
        `| 3 | UI | ${formError} | ${duplicateJourney} |`,
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    `Row "1": ${duplicateJourney} has no passing narrow result with a screenshot in this run's browser evidence.`,
    `Row "3": ${duplicateJourney} has no passing narrow result with a screenshot in this run's browser evidence.`,
    'This pull request changes web UI source (apps/web/src/client/client-registration-form.tsx), so at least one row needs visual proof from an acceptance journey test that produced desktop and narrow screenshots in this run.',
  ]);
});

test('criterion 3: a failing journey width and a mocked browser test are not visual proof', () => {
  const failingDesktop =
    '`apps/web/e2e/client-directory.acceptance.spec.ts :: filters Clients by status`';
  const mocked =
    '`apps/web/e2e/client-registration-localization.spec.ts :: renders the registration form in French`';
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        `| 1 | UI | ${registered} | ${failingDesktop} |`,
        completeRows[1],
        `| 3 | UI | ${mocked} | ${mocked} |`,
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    `Row "1": ${failingDesktop} has no passing desktop result with a screenshot in this run's browser evidence.`,
    `Row "3": ${mocked} is not an acceptance journey test; visual proof must cite apps/web/e2e/*.acceptance.spec.ts.`,
    'This pull request changes web UI source (apps/web/src/client/client-registration-form.tsx), so at least one row needs visual proof from an acceptance journey test that produced desktop and narrow screenshots in this run.',
  ]);
});

test('criterion 3: only rendered web UI source requires visual proof', () => {
  for (const file of [
    'apps/web/src/client/client-registration-form.tsx',
    'apps/web/src/styles/prisme.css',
    'apps/web/index.html',
    'apps/web/public/favicon.svg',
  ])
    assert.equal(isWebUiSource(file), true, file);
  for (const file of [
    'apps/web/src/client/client-registration-form.test.tsx',
    'apps/web/src/access/current-actor.test-fixture.ts',
    'apps/web/src/access/company-assignment-localization.test-fixtures.ts',
    'apps/web/src/mission-plan/current-work-app.test-support.tsx',
    'apps/web/src/contract/model-contract.fixture.ts',
    'apps/web/src/test/setup.ts',
    'apps/web/src/production-shell/prisme/README.md',
    'apps/web/e2e/client-registration.acceptance.spec.ts',
    'apps/web/playwright.acceptance.config.ts',
    'apps/api/src/client/client.service.ts',
    'docs/agents/issue-execution.md',
  ])
    assert.equal(isWebUiSource(file), false, file);

  const apiOnly = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        `| 1 | behaviour | ${registered} | — |`,
        completeRows[1],
        `| 3 | behaviour | ${formError} | — |`,
      ]),
    },
    changedFiles: [
      'apps/api/src/client/client.service.ts',
      'apps/web/src/client/client-registration-form.test.tsx',
    ],
  });
  assert.deepEqual(apiOnly.failures, []);
});

function exceptionComment(overrides = {}) {
  return {
    id: 777,
    author: approver,
    body: 'Acceptance proof exception: the narrow journey needs the new seed, tracked in #502.',
    url: `https://github.com/${repository}/pull/900#issuecomment-777`,
    ...overrides,
  };
}

const exceptionLine = `Exception: https://github.com/${repository}/pull/900#issuecomment-777`;

test('criterion 4: an authorized approver exception passes and records the exception and its link', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([completeRows[0]], { extra: [exceptionLine] }),
    },
    comments: [exceptionComment()],
  });
  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.exception, {
    author: approver,
    reason: 'the narrow journey needs the new seed, tracked in #502.',
    url: `https://github.com/${repository}/pull/900#issuecomment-777`,
  });
  // The waived findings stay visible in the output.
  assert.equal(failuresMatching(verdict, /Criterion 2 of #501/u).length, 1);
});

test('criterion 4: an approver login matches without case or a leading @', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([completeRows[0]], { extra: [exceptionLine] }),
    },
    comments: [exceptionComment({ author: 'Owner-Login' })],
    approvers: ['@OWNER-login'],
  });
  assert.equal(verdict.passed, true);
});

test('criterion 4: the same exception comment by anyone else still fails', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([completeRows[0]], { extra: [exceptionLine] }),
    },
    comments: [exceptionComment({ author: 'another-contributor' })],
  });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.exception, null);
  assert.match(
    verdict.failures.join('\n'),
    /The exception comment .*#issuecomment-777 was posted by another-contributor, who is not an authorized approver\./u,
  );
});

test('criterion 4: without configured approvers an exception fails closed', () => {
  for (const approvers of [null, []]) {
    const verdict = verify({
      pullRequest: {
        number: 900,
        body: pullRequestBody([completeRows[0]], { extra: [exceptionLine] }),
      },
      comments: [exceptionComment()],
      approvers,
    });
    assert.equal(verdict.passed, false);
    assert.match(
      verdict.failures.join('\n'),
      /no authorized approver is configured \(the repository variable PROOF_EXCEPTION_APPROVERS is empty or unset\)/u,
    );
  }
});

test('criterion 4: an exception must link a comment on this pull request that states a reason', () => {
  const otherPullRequest = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([completeRows[0]], {
        extra: [
          `Exception: https://github.com/${repository}/pull/899#issuecomment-777`,
        ],
      }),
    },
    comments: [exceptionComment()],
  });
  assert.equal(otherPullRequest.passed, false);
  assert.match(
    otherPullRequest.failures.join('\n'),
    /must link a comment on this pull request \(#900\)/u,
  );

  const unknownComment = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([completeRows[0]], { extra: [exceptionLine] }),
    },
    comments: [],
  });
  assert.equal(unknownComment.passed, false);
  assert.match(
    unknownComment.failures.join('\n'),
    /#issuecomment-777 is not a comment on this pull request/u,
  );

  const noReason = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([completeRows[0]], { extra: [exceptionLine] }),
    },
    comments: [exceptionComment({ body: 'Fine by me.' })],
  });
  assert.equal(noReason.passed, false);
  assert.match(
    noReason.failures.join('\n'),
    /does not state "Acceptance proof exception: <reason>"/u,
  );
});

test('criterion 4: an empty or "none" exception line claims nothing', () => {
  for (const line of [
    'Exception:',
    'Exception: none',
    'Exception: none.',
    'Exception: N/A.',
    '**Exception:** —',
  ]) {
    const verdict = verify({
      pullRequest: {
        number: 900,
        body: pullRequestBody(completeRows, { extra: [line] }),
      },
    });
    assert.deepEqual(verdict.failures, [], line);
    assert.equal(verdict.exception, null, line);
  }
});

test('criterion 1: a pull request closing several issues names the issue of each row', async () => {
  const issue503 = { number: 503, body: await issueBody(503) };
  const rows = [
    `| #501.1 | UI | ${registered} | ${registered} |`,
    `| #501.2 | behaviour | ${archiveApi} | — |`,
    `| #501.3 | UI | ${formError} | ${registered} |`,
    '| #503.1 | docs | `node scripts/validate-repository-docs.mjs` | — |',
    '| 2 | tooling | `scripts/example-tool.test.mjs :: the tool reports every changed file` | — |',
  ];
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody(rows, { closes: 'Closes #501\nCloses #503' }),
    },
    issues: [issue501, issue503],
  });
  assert.deepEqual(verdict.failures, [
    'Criterion 2 of #503 has no row: "The example tool reports every changed file."',
    'Row "2" must name its issue, for example "#501.1", because this pull request closes several issues.',
  ]);
});

test('criterion 5: a documentation or tooling row may cite a command', async () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody(
        [
          '| 1 | docs | `node scripts/validate-repository-docs.mjs` | — |',
          '| 2 | tooling | `scripts/example-tool.test.mjs :: the tool reports every changed file` | — |',
        ],
        { closes: 'Closes #503' },
      ),
    },
    issues: [{ number: 503, body: await issueBody(503) }],
    changedFiles: [
      'docs/agents/issue-execution.md',
      'scripts/example-tool.mjs',
    ],
  });
  assert.deepEqual(verdict.failures, []);
});

test('criterion 5: a test defined in a helper module is cited by the module CI reports', async () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody(
        [
          '| 1 | docs | `node scripts/validate-repository-docs.mjs` | — |',
          '| 2 | tooling | `scripts/example-tool-tests/paths.mjs :: normalizes Windows separators` | — |',
        ],
        { closes: 'Closes #503' },
      ),
    },
    issues: [{ number: 503, body: await issueBody(503) }],
    changedFiles: ['scripts/example-tool.mjs'],
  });
  assert.deepEqual(verdict.failures, []);
});

test('criterion 5: a behaviour row cannot rest on a command alone', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        '| 2 | behaviour | `pnpm --filter @prisma-prim/api test` | — |',
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    'Row "2": a behaviour criterion needs functional proof that cites a test (`<file> :: <test title>`); a command proves only documentation or tooling criteria.',
  ]);
});

test('criterion 5: "not applicable" is accepted only with a reason', async () => {
  const issue503 = { number: 503, body: await issueBody(503) };
  const body = (cell) =>
    pullRequestBody(
      [
        `| 1 | docs | ${cell} | — |`,
        '| 2 | tooling | `node scripts/example-tool.mjs --help` | Not applicable |',
      ],
      { closes: 'Closes #503' },
    );
  const bare = verify({
    pullRequest: { number: 900, body: body('Not applicable') },
    issues: [issue503],
    changedFiles: [],
  });
  assert.deepEqual(bare.failures, [
    'Row "1": "Not applicable" needs a reason, for example "Not applicable: the criterion is an owner setting".',
    'Row "2": "Not applicable" needs a reason, for example "Not applicable: the criterion is an owner setting".',
  ]);

  const reasoned = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody(
        [
          '| 1 | docs | Not applicable: the owner applies the ruleset | — |',
          '| 2 | tooling | `node scripts/example-tool.mjs --help` | N/A: no screen changes |',
        ],
        { closes: 'Closes #503' },
      ),
    },
    issues: [issue503],
    changedFiles: [],
  });
  assert.deepEqual(reasoned.failures, []);

  const behaviour = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        '| 2 | behaviour | Not applicable: hard to test | — |',
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(behaviour.failures, [
    'Row "2": a behaviour criterion needs functional proof that cites a test (`<file> :: <test title>`); a command proves only documentation or tooling criteria.',
  ]);
});

test('a row needs a known kind', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody([
        completeRows[0],
        `| 2 | feature | ${archiveApi} | — |`,
        completeRows[2],
      ]),
    },
  });
  assert.deepEqual(verdict.failures, [
    'Row "2": unknown kind "feature"; use UI, behaviour, bug fix, refactor, docs or tooling.',
  ]);
});

test('a bug fix row cites its regression test and the section states red to green', () => {
  const rows = [
    completeRows[0],
    `| 2 | bug fix | ${archiveApi} | — |`,
    completeRows[2],
  ];
  const withoutEvidence = verify({
    pullRequest: { number: 900, body: pullRequestBody(rows) },
  });
  assert.deepEqual(withoutEvidence.failures, [
    'A bug fix row needs a "Red-green:" line in the section stating that its regression test failed before the fix and passes after it.',
  ]);
  const withEvidence = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody(rows, {
        extra: [
          'Red-green: `archives a Client` failed on 1a2b3c4 (archive row kept) and passes after the fix.',
        ],
      }),
    },
  });
  assert.deepEqual(withEvidence.failures, []);
});

test('a behaviour-preserving refactor cites the passing suites in one "behaviour unchanged" row', async () => {
  const body = pullRequestBody(
    [
      '| Behaviour unchanged | refactor | `apps/api/src/client/client-archive.service.test.ts`, `scripts/example-tool.test.mjs` | — |',
    ],
    { closes: 'Closes #502' },
  );
  const verdict = verify({
    pullRequest: { number: 900, body },
    issues: [{ number: 502, body: await issueBody(502) }],
    changedFiles: ['apps/api/src/client/client-archive.service.ts'],
  });
  assert.deepEqual(verdict.failures, []);
  assert.match(verdict.notes.join('\n'), /#502 has no acceptance criteria/u);
});

test('a pull request that closes no issue lists its own claims, at least one row', () => {
  const body = (rows) =>
    pullRequestBody(rows, { closes: 'Bumps the Playwright patch version.' });
  const claimed = verify({
    pullRequest: {
      number: 900,
      body: body([
        '| The browser suites still pass | tooling | `apps/web/e2e/client-registration-localization.spec.ts` | — |',
      ]),
    },
    issues: [],
    changedFiles: ['apps/web/package.json'],
  });
  assert.deepEqual(claimed.failures, []);
  assert.match(claimed.notes.join('\n'), /closes no issue/u);

  const empty = verify({
    pullRequest: { number: 900, body: body([]) },
    issues: [],
    changedFiles: ['apps/web/package.json'],
  });
  assert.deepEqual(empty.failures, [
    'This pull request closes no issue with acceptance criteria, so its Acceptance proof table must list its own claims as criteria, at least one row.',
  ]);

  const missing = verify({
    pullRequest: { number: 900, body: 'Bumps a dependency.' },
    issues: [],
    changedFiles: ['apps/web/package.json'],
  });
  assert.deepEqual(missing.failures, [
    'The pull request body has no "## Acceptance proof" section; add it from .github/pull_request_template.md.',
    'This pull request closes no issue with acceptance criteria, so its Acceptance proof table must list its own claims as criteria, at least one row.',
  ]);
});

test('an unreadable closed issue fails closed', () => {
  const verdict = verify({ issues: [{ number: 501, body: null }] });
  assert.deepEqual(verdict.failures, [
    'Issue #501, closed by this pull request, could not be read, so its acceptance criteria are unknown.',
  ]);
});

test('a closing keyword that names a pull request brings no criteria', () => {
  const verdict = verify({
    pullRequest: {
      number: 900,
      body: pullRequestBody(
        [
          '| The browser suites still pass | tooling | `apps/web/e2e/client-registration-localization.spec.ts` | — |',
        ],
        { closes: 'Closes #899' },
      ),
    },
    issues: [{ number: 899, body: null, pullRequest: true }],
    changedFiles: [],
  });
  assert.deepEqual(verdict.failures, []);
  assert.match(verdict.notes.join('\n'), /#899 is a pull request/u);
  assert.match(verdict.notes.join('\n'), /closes no issue/u);
});

test('closing keywords name the closed issues of this repository only', () => {
  assert.deepEqual(
    closedIssueNumbers(
      [
        'Closes #501, fixes #502 and Resolves: #503.',
        `closed ${repository}#504; Fixes https://github.com/${repository}/issues/505`,
        'Closes other/repository#506. Refs #507. Closes #',
        '<!-- Closes #508 -->',
        // Quoted output is not a closing reference, as on GitHub.
        '```text',
        'Acceptance proof: passed (3 rows; closes #509).',
        '```',
        'The demonstration prints `closes #510`.',
      ].join('\n'),
      repository,
    ),
    [501, 502, 503, 504, 505],
  );
});

test('the GitHub source reads the current body, every changed file, closed issues and comments', async () => {
  const requests = [];
  const pages = {
    '/repos/Prisma-Prim/PRISMA-PRIM-Suite/pulls/900': {
      number: 900,
      body: 'Closes #501\n',
    },
    '/repos/Prisma-Prim/PRISMA-PRIM-Suite/pulls/900/files?per_page=100&page=1':
      [
        ...Array.from({ length: 99 }, (_, index) => ({
          filename: `docs/file-${index}.md`,
        })),
        {
          filename: 'apps/web/src/new-name.tsx',
          previous_filename: 'apps/web/src/old-name.tsx',
        },
      ],
    '/repos/Prisma-Prim/PRISMA-PRIM-Suite/pulls/900/files?per_page=100&page=2':
      [{ filename: 'apps/web/index.html' }],
    '/repos/Prisma-Prim/PRISMA-PRIM-Suite/issues/501': {
      number: 501,
      body: 'issue body',
    },
    '/repos/Prisma-Prim/PRISMA-PRIM-Suite/issues/899': {
      number: 899,
      body: 'a pull request body',
      pull_request: { url: 'https://api.github.test/pulls/899' },
    },
    '/repos/Prisma-Prim/PRISMA-PRIM-Suite/issues/900/comments?per_page=100&page=1':
      [
        {
          id: 777,
          body: 'Acceptance proof exception: reason',
          html_url: 'https://github.com/x/y/pull/900#issuecomment-777',
          user: { login: approver },
        },
      ],
  };
  const fetch = async (url, options) => {
    const { pathname, search } = new URL(url);
    requests.push({ path: pathname + search, options });
    const page = pages[pathname + search];
    return page === undefined
      ? { ok: false, status: 404, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => page };
  };
  const source = githubSource({
    fetch,
    token: 'test-token',
    repository,
    apiUrl: 'https://api.github.test',
  });
  assert.deepEqual(await source.pullRequest(900), {
    number: 900,
    body: 'Closes #501\n',
  });
  const files = await source.changedFiles(900);
  assert.equal(files.length, 102);
  assert.ok(files.includes('apps/web/src/old-name.tsx'));
  assert.ok(files.includes('apps/web/index.html'));
  assert.deepEqual(await source.issue(501), {
    number: 501,
    body: 'issue body',
  });
  assert.deepEqual(await source.issue(404), { number: 404, body: null });
  assert.deepEqual(await source.issue(899), {
    number: 899,
    body: null,
    pullRequest: true,
  });
  assert.deepEqual(await source.comments(900), [
    {
      id: 777,
      author: approver,
      body: 'Acceptance proof exception: reason',
      url: 'https://github.com/x/y/pull/900#issuecomment-777',
    },
  ]);
  assert.ok(
    requests.every(
      ({ options }) =>
        options.headers.authorization === 'Bearer test-token' &&
        options.headers.accept === 'application/vnd.github+json',
    ),
  );
});

test('a merge group passes and says the proof is enforced on the pull request', async () => {
  const lines = [];
  const status = await runAcceptanceProof({
    event: 'merge_group',
    log: (line) => lines.push(line),
  });
  assert.equal(status, 0);
  assert.match(lines.join('\n'), /enforced on the pull request/u);
});

test('a run that is not a pull request passes with an explicit message', async () => {
  const lines = [];
  const status = await runAcceptanceProof({
    event: 'schedule',
    log: (line) => lines.push(line),
  });
  assert.equal(status, 0);
  assert.match(lines.join('\n'), /applies to pull requests/u);
});

const script = fileURLToPath(
  new URL('./verify-acceptance-proof.mjs', import.meta.url),
);

function runFixture(name) {
  return spawnSync(
    process.execPath,
    [script, '--fixture', fixturePath(`cases/${name}`)],
    { encoding: 'utf8', env: { PATH: process.env.PATH } },
  );
}

test('demonstration: a fixture run with a missing row is rejected', () => {
  const run = runFixture('missing-row');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /Acceptance proof: failed for pull request #900/u);
  assert.match(run.stdout, /Criterion 2 of #501 has no row/u);
  assert.match(run.stdout, /gh run rerun <run-id> --failed/u);
});

test('demonstration: a complete fixture run is accepted', () => {
  const run = runFixture('complete');
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(
    run.stdout,
    /Acceptance proof: passed for pull request #900 \(3 rows; closes #501\)\./u,
  );
});

test('the script test reporter records the results the check reads, and nothing without a file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'node-test-results-'));
  try {
    await mkdir(path.join(directory, 'scripts'));
    await writeFile(
      path.join(directory, 'scripts', 'sample.test.mjs'),
      [
        "import test, { describe, it } from 'node:test';",
        "describe('outer', () => {",
        "  it('passes', () => {});",
        "  it('is skipped', { skip: true }, () => {});",
        '});',
        "test('fails', () => { throw new Error('expected'); });",
        '',
      ].join('\n'),
    );
    const reporter = pathToFileURL(
      fileURLToPath(
        new URL('./node-test-results-reporter.mjs', import.meta.url),
      ),
    ).href;
    const run = (environment) =>
      spawnSync(
        process.execPath,
        [
          '--test',
          '--test-reporter=spec',
          '--test-reporter-destination=stdout',
          `--test-reporter=${reporter}`,
          '--test-reporter-destination=stdout',
          'scripts/sample.test.mjs',
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          env: { PATH: process.env.PATH, ...environment },
        },
      );
    const resultsDirectory = path.join(directory, 'results');
    assert.equal(run({}).status, 1);
    await assert.rejects(readFile(path.join(resultsDirectory, 'scripts.json')));

    const reported = run({
      CI_TEST_RESULTS_FILE: path.join(resultsDirectory, 'scripts.json'),
    });
    assert.equal(reported.status, 1, 'the failing sample test still fails');
    assert.match(reported.stdout, /outer/u, 'the spec reporter keeps the log');
    const loaded = await readTestResults({
      directory: resultsDirectory,
      evidenceDirectory: directory,
      workspace: directory,
    });
    assert.deepEqual(loaded.families, ['scripts']);
    assert.deepEqual(
      loaded.records.map(({ file, titlePath, status }) => ({
        file,
        titlePath,
        status,
      })),
      [
        {
          file: 'scripts/sample.test.mjs',
          titlePath: ['outer', 'passes'],
          status: 'passed',
        },
        {
          file: 'scripts/sample.test.mjs',
          titlePath: ['outer', 'is skipped'],
          status: 'skipped',
        },
        {
          file: 'scripts/sample.test.mjs',
          titlePath: ['fails'],
          status: 'failed',
        },
      ],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the job summary records the verdict when GitHub provides one', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'acceptance-proof-'));
  try {
    const summary = path.join(directory, 'summary.md');
    await writeFile(summary, '');
    const run = spawnSync(
      process.execPath,
      [script, '--fixture', fixturePath('cases/missing-row')],
      {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, GITHUB_STEP_SUMMARY: summary },
      },
    );
    assert.equal(run.status, 1);
    assert.match(
      await readFile(summary, 'utf8'),
      /### Acceptance proof: failed[\s\S]*Criterion 2 of #501 has no row/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
