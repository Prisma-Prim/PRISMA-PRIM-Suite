import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseReuse } from './ci-proof-reuse.mjs';

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const head = 'c'.repeat(40);
const now = Date.parse('2026-10-17T10:00:00Z');
const names = [
  'checks',
  'scope',
  'postgres_image',
  'api (1/3)',
  'api (2/3)',
  'api (3/3)',
  'api (serial)',
  'web_unit',
  'browser (1)',
  'browser (2)',
  'browser (3)',
  'acceptance (1)',
  'acceptance (2)',
  'build',
  'packaging',
  'quality',
];
function fixture() {
  const run = {
    id: 12,
    repository: { full_name: 'owner/repo' },
    head_repository: { full_name: 'owner/repo' },
    path: '.github/workflows/ci.yml',
    status: 'completed',
    conclusion: 'success',
    event: 'pull_request',
    head_sha: head,
    created_at: '2026-10-17T09:00:00Z',
  };
  const jobs = names.map((name, i) => ({
    id: i + 1,
    name,
    conclusion: 'success',
    runner_name: 'hosted',
    steps: [{ conclusion: 'success' }],
  }));
  const data = {
    'actions/workflows/ci.yml/runs?status=success&per_page=30': {
      workflow_runs: [run],
    },
    'actions/runs/12/jobs?filter=latest&per_page=100': {
      total_count: 16,
      jobs,
    },
    'actions/jobs/2/logs': `2026-10-17T09:00:01Z CI_CHECKOUT=${sha}\n2026-10-17T09:00:02Z CI_ENVIRONMENT=ubuntu24/20261010/node24\n`,
    [`git/commits/${sha}`]: {
      sha,
      tree: { sha: tree },
      parents: [{ sha: 'd'.repeat(40) }, { sha: head }],
    },
    [`git/trees/${tree}`]: {
      tree: [
        { path: '.github', mode: '040000', type: 'tree', sha: '1'.repeat(40) },
        { path: 'apps', mode: '040000', type: 'tree', sha: '2'.repeat(40) },
      ],
      truncated: false,
    },
    [`git/trees/${'2'.repeat(40)}`]: {
      tree: [
        { path: 'api', mode: '040000', type: 'tree', sha: '3'.repeat(40) },
        { path: 'web', mode: '040000', type: 'tree', sha: '4'.repeat(40) },
      ],
      truncated: false,
    },
  };
  data[`git/trees/${'4'.repeat(40)}`] = {
    tree: [
      {
        path: 'package.json',
        mode: '100644',
        type: 'blob',
        sha: '5'.repeat(40),
      },
    ],
    truncated: false,
  };
  return {
    data,
    run,
    jobs,
    api: async (path) => {
      if (!(path in data)) throw new Error('Unavailable API');
      return data[path];
    },
  };
}
const current = {
  environment: 'ubuntu24/20261010/node24',
  tree,
  inputs: [
    '040000 tree ' + '1'.repeat(40) + ' .github',
    '040000 tree ' + '3'.repeat(40) + ' apps/api',
    '100644 blob ' + '5'.repeat(40) + ' apps/web/package.json',
  ],
};
const options = {
  repository: 'owner/repo',
  event: 'push',
  ref: 'refs/heads/main',
  runId: 99,
  current,
  now,
};

test('main reuses a completed full run only for the exact tested tree', async () => {
  const f = fixture();
  assert.deepEqual(await chooseReuse({ ...options, api: f.api }), {
    all: true,
    api: true,
    source: 12,
    testedSha: sha,
  });
});

test('a PR reuses API for identical non-web inputs but still runs frontend suites', async () => {
  const f = fixture();
  assert.deepEqual(
    await chooseReuse({
      ...options,
      event: 'pull_request',
      current: { ...current, tree: 'e'.repeat(40) },
      api: f.api,
    }),
    { all: false, api: true, source: 12, testedSha: sha },
  );
});

const noReuse = { all: false, api: false, source: null, testedSha: null };
for (const [label, alter] of [
  [
    'failed run',
    (f) => {
      f.run.conclusion = 'failure';
    },
  ],
  [
    'unfinished run',
    (f) => {
      f.run.status = 'in_progress';
    },
  ],
  [
    'foreign repository',
    (f) => {
      f.run.repository.full_name = 'attacker/repo';
    },
  ],
  [
    'fork',
    (f) => {
      f.run.head_repository.full_name = 'attacker/repo';
    },
  ],
  [
    'different workflow',
    (f) => {
      f.run.path = '.github/workflows/other.yml';
    },
  ],
  [
    'old proof',
    (f) => {
      f.run.created_at = '2026-10-15T09:00:00Z';
    },
  ],
  [
    'future proof',
    (f) => {
      f.run.created_at = '2026-10-18T09:00:00Z';
    },
  ],
  [
    'missing job',
    (f) => {
      f.jobs.pop();
    },
  ],
  [
    'skipped API',
    (f) => {
      f.jobs[3].conclusion = 'skipped';
    },
  ],
  [
    'failed browser',
    (f) => {
      f.jobs[8].conclusion = 'failure';
    },
  ],
  [
    'cancelled acceptance',
    (f) => {
      f.jobs[12].conclusion = 'cancelled';
    },
  ],
  [
    'unallocated job',
    (f) => {
      f.jobs[3].runner_name = '';
    },
  ],
  [
    'no executed steps',
    (f) => {
      f.jobs[3].steps = [];
    },
  ],
  [
    'unavailable logs',
    (f) => {
      delete f.data['actions/jobs/2/logs'];
    },
  ],
  [
    'ambiguous logs',
    (f) => {
      f.data['actions/jobs/2/logs'] += f.data['actions/jobs/2/logs'];
    },
  ],
  [
    'wrong tested head',
    (f) => {
      f.data[`git/commits/${sha}`].parents[1].sha = 'e'.repeat(40);
    },
  ],
  [
    'invalid tree',
    (f) => {
      f.data[`git/commits/${sha}`].tree.sha = 'broken';
    },
  ],
]) {
  test(`full verification when ${label}`, async () => {
    const f = fixture();
    alter(f);
    assert.deepEqual(await chooseReuse({ ...options, api: f.api }), noReuse);
  });
}

test('main runs everything when merge integration changes the tested tree', async () => {
  const f = fixture();
  assert.deepEqual(
    await chooseReuse({
      ...options,
      current: { ...current, tree: 'e'.repeat(40) },
      api: f.api,
    }),
    noReuse,
  );
});
for (const input of [
  'apps/api',
  '.github',
  'pnpm-lock.yaml',
  'scripts',
  'packages',
]) {
  test(`changed ${input} prevents API reuse`, async () => {
    const f = fixture();
    assert.deepEqual(
      await chooseReuse({
        ...options,
        event: 'pull_request',
        current: {
          ...current,
          inputs: [...current.inputs, `100644 blob ${'e'.repeat(40)} ${input}`],
        },
        api: f.api,
      }),
      noReuse,
    );
  });
}
test('an incomplete tree prevents API reuse', async () => {
  const f = fixture();
  f.data[`git/trees/${tree}`].truncated = true;
  assert.deepEqual(
    await chooseReuse({ ...options, event: 'pull_request', api: f.api }),
    noReuse,
  );
});
test('API failure defaults to complete verification', async () => {
  assert.deepEqual(
    await chooseReuse({
      ...options,
      api: async () => {
        throw new Error('403');
      },
    }),
    noReuse,
  );
});
test('unsupported event and main sibling branches cannot reuse proof', async () => {
  const f = fixture();
  for (const override of [
    { event: 'workflow_dispatch' },
    { ref: 'refs/heads/other' },
    { runId: 12 },
  ])
    assert.deepEqual(
      await chooseReuse({ ...options, ...override, api: f.api }),
      noReuse,
    );
});

test('the CLI compares real Git inputs and emits its verified decision', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync, spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const dir = mkdtempSync(join(tmpdir(), 'ci-proof-cli-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'Synthetic test');
    git('config', 'user.email', 'test@example.invalid');
    mkdirSync(join(dir, 'apps/api'), { recursive: true });
    mkdirSync(join(dir, 'apps/web'), { recursive: true });
    writeFileSync(join(dir, 'apps/api/input.txt'), 'backend');
    writeFileSync(
      join(dir, 'apps/web/package.json'),
      '{"name":"synthetic-web","version":"0.1.0"}',
    );
    writeFileSync(join(dir, 'apps/web/input.txt'), 'before');
    git('add', '.');
    git('commit', '-qm', 'Synthetic base');
    const tested = git('rev-parse', 'HEAD');
    const testedTree = git('rev-parse', 'HEAD^{tree}');
    const appsTree = git('rev-parse', 'HEAD:apps');
    const apiBlob = git('rev-parse', 'HEAD:apps/api');
    const webBlob = git('rev-parse', 'HEAD:apps/web');
    const f = fixture();
    f.run.event = 'push';
    f.run.head_branch = 'main';
    f.run.head_sha = tested;
    f.data['actions/jobs/2/logs'] =
      `2026-10-17T09:00:01Z CI_CHECKOUT=${tested}\n2026-10-17T09:00:02Z CI_ENVIRONMENT=ubuntu24/test-image/${process.version}\n`;
    // Use today's timestamp so the production CLI's actual clock is exercised.
    f.run.created_at = new Date().toISOString();
    f.data[`git/commits/${tested}`] = {
      sha: tested,
      tree: { sha: testedTree },
    };
    f.data[`git/trees/${testedTree}`] = {
      truncated: false,
      tree: [{ path: 'apps', mode: '040000', type: 'tree', sha: appsTree }],
    };
    f.data[`git/trees/${appsTree}`] = {
      truncated: false,
      tree: [
        { path: 'api', mode: '040000', type: 'tree', sha: apiBlob },
        { path: 'web', mode: '040000', type: 'tree', sha: webBlob },
      ],
    };
    f.data[`git/trees/${webBlob}`] = {
      truncated: false,
      tree: [
        {
          path: 'package.json',
          mode: '100644',
          type: 'blob',
          sha: git('rev-parse', 'HEAD:apps/web/package.json'),
        },
      ],
    };
    writeFileSync(join(dir, 'apps/web/input.txt'), 'after');
    git('add', 'apps/web/input.txt');
    git('commit', '-qm', 'Synthetic frontend change');
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'gh'),
      `#!${process.execPath}\nif (process.env.PROOF_ERROR) { process.stderr.write(process.env.PROOF_ERROR); process.exit(1); } const data = JSON.parse(process.env.PROOF_FIXTURE); const key = process.argv[3].replace('repos/owner/repo/', ''); const value = data[key]; if (value === undefined) process.exit(1); if (process.env.PROOF_TERMINAL_GUARD && typeof value === 'string' && value.includes('\\x1b') && !process.argv.includes('--allow-escape-sequences')) { process.stderr.write('the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway'); process.exit(1); } process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));\n`,
      { mode: 0o700 },
    );
    const output = join(dir, 'output');
    const summary = join(dir, 'summary');
    const invokeCli = (extraEnv = {}) =>
      spawnSync(
        process.execPath,
        [fileURLToPath(new URL('./ci-proof-reuse.mjs', import.meta.url))],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GITHUB_REPOSITORY: 'owner/repo',
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_RUN_ID: '99',
            GITHUB_OUTPUT: output,
            GITHUB_STEP_SUMMARY: summary,
            ImageOS: 'ubuntu24',
            ImageVersion: 'test-image',
            PROOF_FIXTURE: JSON.stringify(f.data),
            ...extraEnv,
          },
        },
      );
    const child = invokeCli();
    assert.equal(child.status, 0, child.stderr);
    assert.equal(
      readFileSync(output, 'utf8'),
      'reuse_all=false\nreuse_api=true\nproof_run=12\n',
    );
    assert.match(readFileSync(summary, 'utf8'), /actions\/runs\/12/);
    f.data['actions/jobs/2/logs'] +=
      '2026-10-17T09:00:03Z \x1b[36;1mnode scripts/ci-proof-reuse.mjs\x1b[0m\n';
    writeFileSync(output, '');
    const guardedLogs = invokeCli({ PROOF_TERMINAL_GUARD: 'true' });
    assert.equal(guardedLogs.status, 0, guardedLogs.stderr);
    assert.equal(
      readFileSync(output, 'utf8'),
      'reuse_all=false\nreuse_api=true\nproof_run=12\n',
      'current gh must allow captured colored logs without changing the proof',
    );
    assert.match(
      guardedLogs.stdout,
      /CI_PROOF_API_RETRY operation=job-logs reason=terminal-escapes/,
    );
    assert.equal(
      (guardedLogs.stdout + guardedLogs.stderr).includes('\x1b'),
      false,
    );
    writeFileSync(output, '');
    const failure = invokeCli({
      PROOF_ERROR:
        'gh: Forbidden (HTTP 403) token=synthetic-sensitive https://logs.invalid/?signature=synthetic-private',
    });
    assert.equal(failure.status, 0, failure.stderr);
    assert.match(
      failure.stderr,
      /CI_PROOF_API_FAILURE operation=workflow-runs category=http status=403/,
    );
    assert.doesNotMatch(
      failure.stdout + failure.stderr + readFileSync(summary, 'utf8'),
      /synthetic-sensitive|synthetic-private|logs\.invalid/,
    );
    assert.equal(
      readFileSync(output, 'utf8'),
      'reuse_all=false\nreuse_api=false\nproof_run=\n',
    );
    writeFileSync(
      join(dir, 'apps/web/package.json'),
      '{"name":"synthetic-web","version":"0.2.0"}',
    );
    git('add', 'apps/web/package.json');
    git('commit', '-qm', 'Synthetic manifest change');
    writeFileSync(output, '');
    const changedManifest = invokeCli();
    assert.equal(changedManifest.status, 0, changedManifest.stderr);
    assert.equal(
      readFileSync(output, 'utf8'),
      'reuse_all=false\nreuse_api=false\nproof_run=\n',
    );
    git('rm', '-q', 'apps/web/package.json');
    git('commit', '-qm', 'Synthetic missing install input');
    writeFileSync(output, '');
    const unknownInput = invokeCli();
    assert.equal(unknownInput.status, 0, unknownInput.stderr);
    assert.equal(
      readFileSync(output, 'utf8'),
      'reuse_all=false\nreuse_api=false\nproof_run=\n',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function apiReuseFixture() {
  const f = fixture();
  const apiRun = structuredClone(f.run);
  apiRun.id = 11;
  apiRun.head_sha = 'f'.repeat(40);
  const apiJobs = structuredClone(f.jobs);
  // Actual GitHub response: the job condition skips the entire matrix before
  // expansion, so a single unassigned parent replaces all four API children.
  f.data['actions/runs/12/jobs?filter=latest&per_page=100'] = {
    total_count: 13,
    jobs: [
      ...f.jobs.filter((job) => !job.name.startsWith('api (')),
      {
        id: 17,
        name: 'api',
        status: 'completed',
        conclusion: 'skipped',
        runner_id: null,
        runner_name: null,
        steps: [],
      },
    ],
  };
  f.data['actions/jobs/2/logs'] +=
    '2026-10-17T09:00:03Z reuse_all=false\n2026-10-17T09:00:03Z reuse_api=true\n2026-10-17T09:00:03Z proof_run=11\n';
  f.data['actions/runs/11'] = apiRun;
  f.data['actions/runs/11/jobs?filter=latest&per_page=100'] = {
    total_count: 16,
    jobs: apiJobs.map((j) => ({ ...j, id: j.id + 100 })),
  };
  const apiSha = 'e'.repeat(40);
  f.data['actions/jobs/102/logs'] =
    `2026-10-17T09:00:01Z CI_CHECKOUT=${apiSha}\n2026-10-17T09:00:02Z CI_ENVIRONMENT=${current.environment}\n`;
  f.data[`git/commits/${apiSha}`] = {
    sha: apiSha,
    tree: { sha: tree },
    parents: [{ sha }, { sha: apiRun.head_sha }],
  };
  return { ...f, apiSha };
}

test('main combines a PR frontend run with its directly verified full API source', async () => {
  const f = apiReuseFixture();
  assert.deepEqual(await chooseReuse({ ...options, api: f.api }), {
    all: true,
    api: true,
    source: 12,
    testedSha: sha,
    apiSource: 11,
  });
  f.data['actions/runs/11/jobs?filter=latest&per_page=100'].jobs[3].conclusion =
    'skipped';
  assert.deepEqual(
    await chooseReuse({ ...options, api: f.api }),
    noReuse,
    'a second level of reused API proof is rejected',
  );
});

for (const [label, alter] of [
  [
    'assigned API parent',
    (r) => {
      r.jobs.at(-1).runner_id = 1;
    },
  ],
  [
    'named API runner',
    (r) => {
      r.jobs.at(-1).runner_name = 'hosted';
    },
  ],
  [
    'executed API parent',
    (r) => {
      r.jobs.at(-1).steps = [{ conclusion: 'success' }];
    },
  ],
  [
    'unfinished API parent',
    (r) => {
      r.jobs.at(-1).status = 'queued';
    },
  ],
  [
    'unknown API assignment',
    (r) => {
      delete r.jobs.at(-1).runner_id;
    },
  ],
  [
    'failed frontend',
    (r) => {
      r.jobs.find((j) => j.name === 'browser (1)').conclusion = 'failure';
    },
  ],
  [
    'cancelled frontend',
    (r) => {
      r.jobs.find((j) => j.name === 'browser (1)').conclusion = 'cancelled';
    },
  ],
  [
    'unassigned frontend',
    (r) => {
      r.jobs.find((j) => j.name === 'browser (1)').runner_name = null;
    },
  ],
  [
    'unexecuted frontend',
    (r) => {
      r.jobs.find((j) => j.name === 'browser (1)').steps = [];
    },
  ],
  [
    'missing frontend',
    (r) => {
      r.jobs.splice(
        r.jobs.findIndex((j) => j.name === 'browser (1)'),
        1,
      );
      r.total_count = 12;
    },
  ],
  [
    'duplicate frontend',
    (r) => {
      r.jobs.find((j) => j.name === 'browser (1)').name = 'checks';
    },
  ],
  [
    'extra unknown job',
    (r) => {
      r.jobs.push({
        name: 'unknown',
        conclusion: 'success',
        runner_name: 'hosted',
        steps: [{ conclusion: 'success' }],
      });
      r.total_count = 14;
    },
  ],
]) {
  test(`composed proof rejects ${label}`, async () => {
    const f = apiReuseFixture();
    alter(f.data['actions/runs/12/jobs?filter=latest&per_page=100']);
    assert.deepEqual(await chooseReuse({ ...options, api: f.api }), noReuse);
  });
}

test('composed proof rejects a direct API source with different backend inputs', async () => {
  const f = apiReuseFixture();
  const otherTree = '9'.repeat(40);
  f.data[`git/commits/${f.apiSha}`].tree.sha = otherTree;
  f.data[`git/trees/${otherTree}`] = structuredClone(
    f.data[`git/trees/${tree}`],
  );
  f.data[`git/trees/${otherTree}`].tree.push({
    path: 'README.md',
    mode: '100644',
    type: 'blob',
    sha: '8'.repeat(40),
  });
  assert.deepEqual(await chooseReuse({ ...options, api: f.api }), noReuse);
});

test('changed or unknown observed runner/toolchain always executes the suites', async () => {
  const f = fixture();
  for (const environment of [
    undefined,
    'ubuntu24/different-image/node24',
    'ubuntu24/20261010/different-node',
  ]) {
    assert.deepEqual(
      await chooseReuse({
        ...options,
        current: { ...current, environment },
        api: f.api,
      }),
      noReuse,
    );
  }
});
