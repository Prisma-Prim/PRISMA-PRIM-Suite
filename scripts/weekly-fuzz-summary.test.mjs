import assert from 'node:assert/strict';
import test from 'node:test';

import { weeklyFuzzSummary } from './weekly-fuzz-summary.mjs';

const range = '2026-11-14T00:00:00Z..2026-11-21T00:00:00Z';
const repo = 'https://github.com/Prisma-Prim/PRISMA-PRIM-Suite';

function job(id, name, conclusion, minutes) {
  return {
    id,
    name,
    conclusion,
    started_at: '2026-11-20T00:00:00Z',
    completed_at: minutes === null ? null : '2026-11-20T00:' + minutes + ':00Z',
  };
}

const inspection = { number: 1132, body: '' };
const ownerComment = (body) => ({ author_association: 'OWNER', body });
const botReport = (run) => ({
  user: { login: 'github-actions[bot]' },
  body: [
    '**Fuzzed file:** ' +
      '\x60src/project-mission-review/review.fuzz.rest.test.ts\x60',
    '**Broken invariant:** ' + '\x60replay-receipt\x60',
    '**Seed:** ' + '\x601234\x60',
    "FUZZ_SEED=1234 FUZZ_PATH='2:3:4' pnpm run test",
    'Run: ' + repo + '/actions/runs/' + run,
    '<!-- nightly-fuzz: failed -->',
  ].join('\n'),
});

function fromGitHub({
  apiJobs = {},
  uiJobs = {},
  issues = [],
  comments = {},
} = {}) {
  return async (path) => {
    const request = new URL(path, repo + '/');
    const endpoint = request.pathname.slice(new URL(repo).pathname.length + 1);
    assert.equal(request.searchParams.get('page'), '1');
    if (endpoint.startsWith('actions/workflows/')) {
      assert.equal(request.searchParams.get('created'), range);
      assert.equal(request.searchParams.get('branch'), 'main');
      const jobs = endpoint.includes('nightly-fuzz.yml') ? apiJobs : uiJobs;
      if (jobs === null) throw new Error('GitHub unavailable');
      return { workflow_runs: Object.keys(jobs).map((id) => ({ id })) };
    }
    if (endpoint.startsWith('actions/runs/')) {
      assert.equal(request.searchParams.get('filter'), 'all');
      const id = endpoint.split('/')[2];
      return { jobs: apiJobs?.[id] ?? uiJobs[id] };
    }
    if (endpoint === 'issues') {
      return request.searchParams.get('labels') === 'fuzz-found'
        ? issues
        : [inspection];
    }
    assert.match(endpoint, /^issues\/\d+\/comments$/u);
    return comments[endpoint.split('/')[1]] ?? [];
  };
}

test('weekly signal deduplicates evidence, leaves unknowns and charges each actual rerun once', async () => {
  const source = fromGitHub({
    apiJobs: {
      10: [
        job(1, 'fuzz (project)', 'failure', '03'),
        job(1, 'fuzz (project)', 'failure', '03'),
        job(2, 'fuzz (project)', 'success', '04'),
        job(3, 'fuzz (offer)', 'failure', '05'),
        job(4, 'report', 'success', '01'),
      ],
      11: [job(5, 'fuzz (project)', 'failure', '03')],
    },
    uiJobs: {
      12: [
        job(6, 'chaos (certification-journey)', 'failure', '02'),
        job(7, 'chaos (multi-company-home)', null, null),
      ],
    },
    comments: {
      1132: [
        ownerComment(
          '<!-- fuzz-triage: nightly-fuzz 10 project product-defect #20 -->',
        ),
        ownerComment(
          '<!-- fuzz-triage: nightly-fuzz 11 project product-defect #20 -->',
        ),
        {
          author_association: 'NONE',
          body: '<!-- fuzz-triage: nightly-fuzz 10 offer false-alert -->',
        },
        ownerComment(
          '<!-- triage-ui-chaos-12-certification-journey -->\n\nThis is a test false alarm.',
        ),
      ],
    },
  });
  const report = (await weeklyFuzzSummary(source, range, repo)).join('\n');
  assert.match(report, /nightly-fuzz\.yml\) \| 1 \| 0 \| 1 \| 15\.0 \|/u);
  assert.match(
    report,
    /nightly-ui-chaos\.yml\) \| 0 \| 1 \| 0 \| 2\.0 measured \(1 unavailable\) \|/u,
  );
});

test('an established API test-oracle triage classifies its existing tracking issue once', async () => {
  const source = fromGitHub({
    apiJobs: {
      10: [job(1, 'fuzz (project-mission-review)', 'failure', '03')],
      11: [job(2, 'fuzz (project-mission-review)', 'failure', '03')],
    },
    issues: [{ ...botReport(10), number: 1336 }],
    comments: {
      1336: [
        botReport(11),
        ownerComment(
          'Triage: the API correctly returns HTTP 409. The fuzz command incorrectly requires an old message.',
        ),
      ],
    },
  });
  const report = (await weeklyFuzzSummary(source, range, repo)).join('\n');
  assert.match(report, /nightly-fuzz\.yml\) \| 0 \| 1 \| 0 \| 6\.0 \|/u);
});

test('an unavailable source never appears as zero and does not suppress available job minutes', async () => {
  const source = fromGitHub({
    apiJobs: null,
    uiJobs: { 20: [job(1, 'chaos (certification-journey)', 'failure', '03')] },
  });
  const incomplete = async (path) => {
    if (path.startsWith('issues/1132/comments'))
      throw new Error('GitHub unavailable');
    return source(path);
  };
  const report = (await weeklyFuzzSummary(incomplete, range, repo)).join('\n');
  assert.match(
    report,
    /nightly-fuzz\.yml\) \| unavailable \| unavailable \| unavailable \| unavailable \|/u,
  );
  assert.match(
    report,
    /nightly-ui-chaos\.yml\) \| unavailable \| unavailable \| unavailable \| 3\.0 \|/u,
  );
});

test('the same counterexample in distinct runs is counted once even before triage', async () => {
  const run = (comments) =>
    weeklyFuzzSummary(
      fromGitHub({
        apiJobs: {
          10: [job(1, 'fuzz (project-mission-review)', 'failure', '03')],
          11: [job(2, 'fuzz (project-mission-review)', 'failure', '03')],
        },
        issues: [{ ...botReport(10), number: 1336 }],
        comments: { 1336: [botReport(11), ...comments] },
      }),
      range,
      repo,
    );
  assert.match(
    (await run([])).join('\n'),
    /nightly-fuzz\.yml\) \| 0 \| 0 \| 1 \| 6\.0 \|/u,
  );
  const confirmed = await run([
    ownerComment(
      '<!-- fuzz-triage: nightly-fuzz 11 project-mission-review false-alert #1415 -->',
    ),
  ]);
  assert.match(
    confirmed.join('\n'),
    /nightly-fuzz\.yml\) \| 0 \| 1 \| 0 \| 6\.0 \|/u,
  );
});
