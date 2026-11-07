import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);

test('browser setup reuses a versioned Chromium cache without installing system packages', async () => {
  const setup = await readFile(
    new URL(
      '../.github/actions/setup-verification/action.yml',
      import.meta.url,
    ),
    'utf8',
  );
  const browserSteps = setup.slice(
    setup.indexOf('    - name: Resolve Playwright version'),
  );
  assert.match(browserSteps, /id: playwright\n/);
  assert.match(browserSteps, /playwright --version/);
  assert.match(browserSteps, /GITHUB_OUTPUT/);
  assert.match(browserSteps, /uses: actions\/cache@v4/);
  assert.match(browserSteps, /path: ~\/.cache\/ms-playwright\n/);
  assert.match(
    browserSteps,
    /key: chromium-ubuntu-24\.04-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ steps\.playwright\.outputs\.version \}\}/,
  );
  assert.doesNotMatch(browserSteps, /restore-keys:/);
  // The idempotent install handles both a cold cache and an incomplete hit.
  // A complete hit is a no-op; Playwright's host checks stay enabled.
  assert.match(
    browserSteps,
    /run: pnpm --filter @prisma-prim\/web exec playwright install chromium\n/,
  );
  assert.doesNotMatch(
    setup,
    /--with-deps|install-deps|apt-get|SKIP_VALIDATE_HOST_REQUIREMENTS/,
  );
  for (const step of browserSteps.split(/\n {4}- name:/)) {
    assert.match(step, /if: \$\{\{ inputs\.chromium == 'true' \}\}/);
  }
});

async function readWorkflow() {
  return (await readFile(workflowUrl, 'utf8')).replaceAll('\r\n', '\n');
}

const officialImages = {
  node: 'public.ecr.aws/docker/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df',
  postgres:
    'public.ecr.aws/docker/library/postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',
  nginx:
    'public.ecr.aws/docker/library/nginx:1.28.0-alpine@sha256:30f1c0d78e0ad60901648be663a710bdadf19e4c10ac6782c235200619158284',
};

async function imageSources() {
  return Promise.all(
    [
      '../.github/workflows/ci.yml',
      './ci-start-postgres.sh',
      '../deploy/railway/api.Dockerfile',
      '../deploy/railway/web.Dockerfile',
      './railway-packaging-smoke.sh',
    ].map(async (path) =>
      (await readFile(new URL(path, import.meta.url), 'utf8')).replaceAll(
        '\r\n',
        '\n',
      ),
    ),
  );
}

function requireOfficialImageSources([workflow, ciPostgres, api, web, smoke]) {
  // The database jobs start PostgreSQL through ci-start-postgres.sh, which
  // pins the same official image; the workflow itself declares no image.
  assert.deepEqual([...workflow.matchAll(/^ +image: (\S+)$/gm)], []);
  assert.equal(
    /^postgres_image='([^']+)'$/m.exec(ciPostgres)?.[1],
    officialImages.postgres,
  );
  for (const [dockerfile, expected] of [
    [api, [officialImages.node, officialImages.node]],
    [web, [officialImages.node, officialImages.nginx]],
  ]) {
    assert.deepEqual(
      [...dockerfile.matchAll(/^FROM (\S+)/gm)].map((match) => match[1]),
      expected,
    );
  }
  const images = [];
  assert.equal(
    /^postgres_image='([^']+)'$/m.exec(smoke)?.[1],
    officialImages.postgres,
  );
  for (const command of smoke
    .replaceAll(/\\\n/g, ' ')
    .matchAll(/docker run (.+)/g)) {
    const tokens = command[1].match(/"[^"]*"|'[^']*'|\S+/g);
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (['--rm', '--detach', '--pull=never', '--interactive'].includes(token))
        continue;
      if (
        [
          '--name',
          '--network',
          '--network-alias',
          '--env',
          '--publish',
          '--workdir',
          '--tmpfs',
        ].includes(token)
      ) {
        index += 1;
        continue;
      }
      images.push(token);
      break;
    }
  }
  assert.deepEqual(images, [
    '"$api_image"', // Isolated commercial PDF package render.
    '"$api_image"',
    '"$postgres_image"',
    '"$api_image"',
    '"$api_image"',
    '"$web_image"',
  ]);
}

test('all CI services and packaging images use immutable official ECR indexes', async () => {
  requireOfficialImageSources(await imageSources());
});

test('the image-source guard rejects Docker Hub reintroduced at every image reference', async () => {
  const sources = await imageSources();
  let rejected = 0;
  for (const [sourceIndex, source] of sources.entries()) {
    for (const match of source.matchAll(
      /public\.ecr\.aws\/docker\/library\//g,
    )) {
      const mutated = [...sources];
      mutated[sourceIndex] =
        source.slice(0, match.index) +
        'docker.io/library/' +
        source.slice(match.index + match[0].length);
      assert.throws(() => requireOfficialImageSources(mutated));
      rejected += 1;
    }
  }
  assert.equal(rejected, 6);
  const replacedPdfImage = [...sources];
  replacedPdfImage[4] = sources[4].replace(
    '--interactive "$api_image"',
    '--interactive docker.io/library/node:24',
  );
  assert.notEqual(replacedPdfImage[4], sources[4]);
  assert.throws(() => requireOfficialImageSources(replacedPdfImage));
});

function jobsIn(workflow) {
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n'));
  const declarations = [...jobs.matchAll(/^ {2}([a-z_]+):\n/gm)];
  return Object.fromEntries(
    declarations.map((match, index) => [
      match[1],
      jobs.slice(match.index, declarations[index + 1]?.index),
    ]),
  );
}

function stepBody(job, step) {
  const start = job.indexOf(`- name: ${step}\n`);
  assert.notEqual(start, -1, `missing step ${step}`);
  const next = job.indexOf('\n      - name:', start);
  return job.slice(start, next === -1 ? undefined : next);
}

test('every canonical CI job uses the supported Ubuntu 24.04 standard runner', async () => {
  const jobs = jobsIn(await readWorkflow());
  assert.ok(Object.keys(jobs).length > 0);
  for (const [name, job] of Object.entries(jobs)) {
    assert.deepEqual(
      [...job.matchAll(/^ {4}runs-on: (.+)$/gm)].map((match) => match[1]),
      ['ubuntu-24.04'],
      `${name} must keep the pinned Playwright and packaging toolchain on its supported OS`,
    );
  }
});

// The literal graph is the issue's required coverage, independent of the gate implementation.
test('independent test families and packaging share only the fast prerequisite and the scope', async () => {
  const jobs = jobsIn(await readWorkflow());
  assert.deepEqual(Object.keys(jobs), [
    'checks',
    'scope',
    'postgres_image',
    'api',
    'web_unit',
    'browser',
    'acceptance',
    'build',
    'packaging',
    'flaky_guard',
    'quality',
  ]);
  assert.doesNotMatch(jobs.checks, /\bneeds:|\bif:/);
  assert.doesNotMatch(jobs.scope, /^ {4}(?:needs:|if:)/m);
  // One job per run acquires the PostgreSQL image for the database jobs.
  assert.match(jobs.postgres_image, /^ {4}needs: scope$/m);
  assert.match(
    jobs.postgres_image,
    /^ {4}if: \$\{\{ needs\.scope\.outputs\.docs_only != 'true' \}\}$/m,
  );
  for (const job of ['api', 'acceptance', 'packaging'])
    assert.match(jobs[job], /^ {4}needs: \[checks, scope, postgres_image\]$/m);
  for (const job of ['web_unit', 'browser', 'build'])
    assert.match(jobs[job], /^ {4}needs: \[checks, scope\]$/m);
  // Packaging loads the run's cached image instead of pulling it again.
  assert.match(
    stepBody(jobs.packaging, 'Restore PostgreSQL image'),
    /uses: actions\/cache\/restore@v4/,
  );
  assert.match(
    stepBody(jobs.packaging, 'Prove production image packaging'),
    /POSTGRES_IMAGE_ARCHIVE: \$\{\{ runner\.temp \}\}\/postgres-image\/postgres\.tar/,
  );
  for (const job of [
    'api',
    'web_unit',
    'browser',
    'acceptance',
    'build',
    'packaging',
  ]) {
    // Only a positive scope decision may skip a heavy family. Missing
    // proof always executes its unchanged, complete command.
    assert.match(
      jobs[job],
      new RegExp(
        `^ {4}if: \\$\\{\\{ needs\\.scope\\.outputs\\.docs_only != 'true' && needs\\.scope\\.outputs\\.${job === 'api' ? 'reuse_api' : 'reuse_all'} != 'true' \\}\\}$`,
        'm',
      ),
    );
  }
  assert.match(
    jobs.quality.replaceAll(/\s+/g, ' '),
    / needs: \[ checks, scope, postgres_image, api, web_unit, browser, acceptance, build, packaging, flaky_guard, \] /,
  );
  assert.match(jobs.quality, /^ {4}if: \$\{\{ always\(\) \}\}$/m);
  const gate = stepBody(jobs.quality, 'Require every verification result');
  assert.match(gate, /CI_JOB_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(gate, /run: node scripts\/verify-ci-results\.mjs/);
  assert.doesNotMatch(gate, /\bif:|continue-on-error/);
  assert.doesNotMatch(await readWorkflow(), /continue-on-error/);
});

test('CI runs on pull requests, the merge queue and the nightly main call, preserves read-only proof access and cancels obsolete runs', async () => {
  const workflow = await readWorkflow();
  // The bare call has no inputs: the nightly run cannot narrow the suite.
  assert.match(
    workflow,
    /on:\n {2}pull_request:\n {4}types: \[opened, synchronize, reopened, ready_for_review\]\n {2}merge_group:\n {4}types: \[checks_requested\]\n {2}workflow_dispatch:\n(?: {2}#[^\n]*\n)* {2}workflow_call:\n\npermissions:/,
  );
  assert.doesNotMatch(workflow, /^ {2}(?:push|schedule|pull_request_target):/m);
  assert.match(workflow, /permissions:\n {2}contents: read\n/);
  assert.doesNotMatch(workflow, /\bissues:|: write\b/);
  const concurrencyStart = workflow.indexOf('\nconcurrency:\n');
  const jobsStart = workflow.indexOf('\njobs:\n');
  assert.notEqual(concurrencyStart, -1);
  assert.ok(jobsStart > concurrencyStart);
  const concurrency = workflow
    .slice(concurrencyStart, jobsStart)
    .replaceAll(/\s+/g, ' ');
  // A nightly main run has a group of its own, so nothing cancels it.
  assert.match(
    concurrency,
    /group: ci-\$\{\{ github\.event\.pull_request\.number \|\| \(github\.event_name == 'schedule' && format\('nightly-\{0\}', github\.run_id\)\) \|\| github\.ref \}\}/,
  );
  assert.match(concurrency, /cancel-in-progress: true/);
  assert.doesNotMatch(workflow, /checkout_ref|preflight|\binputs\b/);
});

async function readMainHealth() {
  return (
    await readFile(
      new URL('../.github/workflows/main-health.yml', import.meta.url),
      'utf8',
    )
  ).replaceAll('\r\n', '\n');
}

function stepsOf(job) {
  const start = job.indexOf('\n    steps:\n');
  assert.notEqual(start, -1, 'missing steps');
  return job.slice(start).trimEnd();
}

test('main health reruns the CI fast checks on every main push and the complete CI nightly', async () => {
  const health = await readMainHealth();
  assert.match(
    health,
    /\non:\n {2}push:\n {4}branches: \[main\]\n {2}schedule:\n {4}- cron: '17 2 \* \* \*'\n\n/,
  );
  // Only main runs report: no pull request, queue, dispatched or chained run.
  assert.doesNotMatch(
    health,
    /^ {2}(?:pull_request|pull_request_target|merge_group|workflow_dispatch|workflow_run|workflow_call):/m,
  );
  const jobs = jobsIn(health);
  assert.deepEqual(Object.keys(jobs), ['checks', 'ci', 'report']);
  assert.match(
    jobs.checks,
    /^ {4}if: \$\{\{ github\.event_name == 'push' \}\}$/m,
  );
  for (const job of [jobs.checks, jobs.report])
    assert.deepEqual(
      [...job.matchAll(/^ {4}runs-on: (.+)$/gm)].map((match) => match[1]),
      ['ubuntu-24.04'],
    );
  // The push run executes exactly the steps of the CI `checks` job.
  assert.equal(
    stepsOf(jobs.checks),
    stepsOf(jobsIn(await readWorkflow()).checks),
  );
  // The nightly run is the complete CI itself, unnarrowed.
  assert.equal(
    jobs.ci.trimEnd(),
    "  ci:\n    if: ${{ github.event_name == 'schedule' }}\n    uses: ./.github/workflows/ci.yml",
  );
});

test('nothing cancels a main health run, and its reports run one at a time', async () => {
  const health = await readMainHealth();
  assert.doesNotMatch(health, /^concurrency:/m);
  assert.doesNotMatch(health, /cancel-in-progress: true/);
  const { checks, ci, report } = jobsIn(health);
  for (const job of [checks, ci]) assert.doesNotMatch(job, /concurrency:/);
  assert.match(
    report,
    /\n {4}concurrency:\n {6}group: main-red-report\n {6}cancel-in-progress: false\n/,
  );
});

test('only the main health report job writes issues, after every finished main run', async () => {
  const health = await readMainHealth();
  assert.match(
    health,
    /\npermissions:\n {2}contents: read\n {2}actions: read\n\n/,
  );
  const { checks, ci, report } = jobsIn(health);
  for (const job of [checks, ci]) assert.doesNotMatch(job, /permissions:/);
  assert.match(
    report,
    /\n {4}permissions:\n {6}contents: read\n {6}actions: read\n {6}issues: write\n {6}pull-requests: read\n/,
  );
  assert.equal([...health.matchAll(/: write\b/g)].length, 1);
  assert.match(report, /^ {4}needs: \[checks, ci\]$/m);
  // A failed job never skips the report; a cancelled run proves nothing.
  assert.match(report, /^ {4}if: \$\{\{ !cancelled\(\) \}\}$/m);
  const step = stepBody(report, 'Open, update or close the main-red issue');
  assert.match(step, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(step, /MAIN_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(
    step.trimEnd(),
    /\n {8}run: node scripts\/main-health-report\.mjs$/,
  );
  assert.doesNotMatch(health, /continue-on-error/);
  for (const line of health.split('\n'))
    if (/^\s*(?:- )?run:/.test(line))
      assert.doesNotMatch(line, /\$\{\{/, 'no expression inside a command');
});

test('a controlled failing dependency prevents the workflow aggregate command from succeeding', async () => {
  const { quality } = jobsIn(await readWorkflow());
  const command = /run: node (scripts\/[^\n]+)\n/u.exec(
    stepBody(quality, 'Require every verification result'),
  );
  assert.ok(command);
  const dependency = spawnSync(process.execPath, ['-e', 'process.exit(1)']);
  assert.equal(dependency.status, 1);
  const results = {
    checks: { result: 'success' },
    scope: {
      result: 'success',
      outputs: { docs_only: 'false', repeat_tests: 'false' },
    },
    api: { result: dependency.status === 0 ? 'success' : 'failure' },
    web_unit: { result: 'success' },
    browser: { result: 'success' },
    acceptance: { result: 'success' },
    build: { result: 'success' },
    packaging: { result: 'success' },
    flaky_guard: { result: 'skipped' },
  };
  const aggregate = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(`../${command[1]}`, import.meta.url))],
    { env: { CI_JOB_RESULTS: JSON.stringify(results) }, encoding: 'utf8' },
  );
  assert.equal(aggregate.status, 1);
  assert.match(aggregate.stderr, /api: failure/u);
  assert.doesNotMatch(aggregate.stdout, /All required CI jobs succeeded/u);
});

test('CI fails formatting first, then lint, types and the complete script suite', async () => {
  const { checks } = jobsIn(await readWorkflow());
  const requiredSteps = [
    ['Check out repository', 'uses: actions/checkout@v4'],
    [
      'Set up repository verification',
      'uses: ./.github/actions/setup-verification',
    ],
    ['Verify supported agent environment', 'run: pnpm agent:doctor'],
    ['Check formatting', 'run: pnpm format:check'],
    ['Lint', 'run: pnpm lint'],
    ['Type-check', 'run: pnpm typecheck'],
    ['Check Drizzle migrations match the schema', 'run: pnpm db:check-drift'],
    ['Test scripts', 'run: pnpm test:scripts'],
    [
      'Test documentation contracts',
      'run: pnpm --filter @prisma-prim/api exec vitest run src/demonstration',
    ],
  ];
  const positions = [];
  for (const [step, command] of requiredSteps) {
    const body = stepBody(checks, step);
    assert.ok(body.includes(command));
    assert.doesNotMatch(body, /\bif:/, `${step} must be unconditional`);
    positions.push(checks.indexOf(`- name: ${step}\n`));
  }
  assert.deepEqual(
    [...positions].sort((left, right) => left - right),
    positions,
    'fast verification steps must keep their documented order',
  );
});

test('every test family, host build and production packaging remains unconditional', async () => {
  const jobs = jobsIn(await readWorkflow());
  for (const [job, step, command] of [
    [
      'web_unit',
      'Test Web unit',
      'pnpm --filter @prisma-prim/web exec vitest run',
    ],
    [
      'browser',
      'Test browser',
      'pnpm --filter @prisma-prim/web test:browser --shard=${{ matrix.shard }}/3',
    ],
    [
      'acceptance',
      'Test acceptance',
      'pnpm --filter @prisma-prim/web test:browser:acceptance --shard=${{ matrix.shard }}/2',
    ],
    ['build', 'Build', 'pnpm build'],
    [
      'packaging',
      'Prove production image packaging',
      'bash scripts/railway-packaging-smoke.sh',
    ],
  ]) {
    const body = stepBody(jobs[job], step);
    assert.ok(body.includes(`run: ${command}\n`));
    assert.doesNotMatch(body, /\bif:/, `${step} must be unconditional`);
  }
  const configuration = stepBody(
    jobs.packaging,
    'Validate Railway configuration without credentials',
  );
  for (const command of ['install --frozen-lockfile', 'typecheck', 'test']) {
    assert.ok(configuration.includes(`pnpm --dir .railway ${command}\n`));
  }
  assert.doesNotMatch(configuration, /\bif:/);
});

test('sharded families cover every shard and the complete API suite', async () => {
  const jobs = jobsIn(await readWorkflow());
  assert.match(
    jobs.api,
    /^ {4}strategy:\n {6}matrix:\n {8}part: \['1\/3', '2\/3', '3\/3', serial\]$/m,
  );
  const api = stepBody(jobs.api, 'Test API');
  assert.match(api, /API_TEST_PART: \$\{\{ matrix\.part \}\}/);
  // The serial PostgreSQL files and every parallel shard together are
  // exactly the package's complete `test` script.
  assert.ok(
    api.includes('pnpm --filter @prisma-prim/api test:postgres:serial'),
  );
  assert.ok(
    api.includes(
      'pnpm --filter @prisma-prim/api test:parallel --shard="$API_TEST_PART"',
    ),
  );
  const apiPackage = JSON.parse(
    await readFile(
      new URL('../apps/api/package.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(
    apiPackage.scripts.test,
    'pnpm test:parallel && pnpm test:postgres:serial',
  );
  assert.match(
    jobs.browser,
    /^ {4}strategy:\n {6}matrix:\n {8}shard: \[1, 2, 3\]$/m,
  );
  // Acceptance shards never cancel each other: shard 1 owns the probe.
  assert.match(
    jobs.acceptance,
    /^ {4}strategy:\n(?: {6}#[^\n]*\n)* {6}fail-fast: false\n {6}matrix:\n {8}shard: \[1, 2\]$/m,
  );
  for (const job of ['api', 'browser'])
    assert.doesNotMatch(jobs[job], /fail-fast: false|max-parallel/);
  assert.doesNotMatch(jobs.acceptance, /max-parallel/);
});

test('database jobs start the cached pinned PostgreSQL and keep matching environment checks', async () => {
  const jobs = jobsIn(await readWorkflow());
  for (const [job, doctor] of [
    ['api', 'postgres'],
    ['acceptance', 'web-postgres'],
  ]) {
    assert.doesNotMatch(jobs[job], /\bservices:/);
    for (const [variable, database] of [
      ['DATABASE_URL', 'prisma_prim_dev'],
      ['TEST_DATABASE_URL', 'prisma_prim_test'],
      ['POSTGRES_ADMIN_URL', 'postgres'],
    ]) {
      assert.ok(
        jobs[job].includes(
          `${variable}: postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/${database}\n`,
        ),
      );
    }
    assert.doesNotMatch(
      stepBody(jobs[job], 'Set up repository verification'),
      /postgres: 'false'/,
    );
    assert.match(
      stepBody(jobs[job], 'Verify supported agent environment'),
      new RegExp(`run: pnpm agent:doctor:${doctor}\\n`),
    );
  }
  assert.match(
    stepBody(jobs.browser, 'Verify supported agent environment'),
    /run: pnpm agent:doctor:web\n/,
  );
  for (const job of ['checks', 'web_unit', 'browser', 'build']) {
    assert.doesNotMatch(jobs[job], /\bservices:|TEST_DATABASE_URL/);
    assert.match(
      stepBody(jobs[job], 'Set up repository verification'),
      /postgres: 'false'/,
    );
  }
  for (const job of ['checks', 'api', 'web_unit', 'build']) {
    assert.match(
      stepBody(jobs[job], 'Set up repository verification'),
      /chromium: 'false'/,
    );
  }
  const setup = (
    await readFile(
      new URL(
        '../.github/actions/setup-verification/action.yml',
        import.meta.url,
      ),
      'utf8',
    )
  ).replaceAll('\r\n', '\n');
  assert.match(setup, /postgres:\n {4}description:[^\n]+\n {4}default: 'true'/);
  assert.match(setup, /chromium:\n {4}description:[^\n]+\n {4}default: 'true'/);
  assert.match(setup, /if: \$\{\{ inputs\.postgres == 'true' \}\}/);
  assert.match(setup, /if: \$\{\{ inputs\.chromium == 'true' \}\}/);
  // Database jobs restore the run's cached image, then start it, before the
  // test database is provisioned; they never save it.
  const order = [
    '- name: Restore PostgreSQL image',
    '- name: Start PostgreSQL',
    '- name: Provision isolated test database',
  ].map((step) => setup.indexOf(step));
  assert.ok(order.every((index) => index !== -1));
  assert.deepEqual(
    [...order].sort((left, right) => left - right),
    order,
  );
  assert.match(setup, /uses: actions\/cache\/restore@v4/);
  assert.doesNotMatch(setup, /actions\/cache\/save/);
  const cacheKey = /^ +key: \$\{\{ steps\.postgres_image\.outputs\.key \}\}/gm;
  assert.equal([...setup.matchAll(cacheKey)].length, 1);
  assert.match(
    setup,
    /key=\$\(bash scripts\/ci-start-postgres\.sh cache-key\)/,
  );
  assert.match(setup, /run: bash scripts\/ci-start-postgres\.sh start\n/);

  // The postgres_image job looks the image up without downloading it and,
  // only on a miss, acquires and saves it under the same key.
  const image = jobs.postgres_image;
  const lookup = stepBody(image, 'Look up cached PostgreSQL image');
  assert.match(lookup, /id: lookup\n/);
  assert.match(lookup, /uses: actions\/cache\/restore@v4/);
  assert.match(lookup, /lookup-only: true/);
  const acquire = stepBody(image, 'Acquire PostgreSQL image');
  assert.match(acquire, /run: bash scripts\/ci-start-postgres\.sh acquire\n/);
  const save = stepBody(image, 'Save PostgreSQL image');
  assert.match(save, /uses: actions\/cache\/save@v4/);
  assert.match(
    acquire,
    /if: \$\{\{ steps\.lookup\.outputs\.cache-hit != 'true' && steps\.legacy\.outputs\.cache-hit != 'true' \}\}/,
  );
  assert.match(
    save,
    /if: \$\{\{ steps\.lookup\.outputs\.cache-hit != 'true' \}\}/,
  );
  assert.equal([...image.matchAll(cacheKey)].length, 2);
  assert.match(
    image,
    /key=\$\(bash scripts\/ci-start-postgres\.sh cache-key\)/,
  );
  assert.match(
    stepBody(jobs.packaging, 'Restore PostgreSQL image'),
    /key: \$\{\{ needs\.postgres_image\.outputs\.cache_key \}\}/,
  );
});

test('legacy PostgreSQL cache migration cannot restore a different image or platform', async () => {
  const { postgres_image: image } = jobsIn(await readWorkflow());
  const legacy = stepBody(
    image,
    'Restore compatible legacy PostgreSQL archive',
  );
  assert.match(legacy, /id: legacy\n/);
  assert.match(legacy, /uses: actions\/cache\/restore@v4/);
  assert.match(
    legacy,
    /if: \$\{\{ steps\.lookup\.outputs\.cache-hit != 'true' && steps\.postgres_image\.outputs\.key == 'postgres-image-Linux-X64-b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' \}\}/,
  );
  assert.match(
    legacy,
    /key: postgres-image-0ca492758d0f2da5e6d4b627ed0caef2927a438da76d7fdcd5968d9254fefb47\n/,
  );
  assert.doesNotMatch(legacy, /restore-keys:|lookup-only:/);
});

test('the scope job supplies exact PR or main-push revisions and safety metadata with full history', async () => {
  const { scope } = jobsIn(await readWorkflow());
  assert.match(
    scope,
    /^ {4}outputs:\n {6}docs_only: \$\{\{ steps\.classify\.outputs\.docs_only \}\}$/m,
  );
  assert.match(stepBody(scope, 'Check out repository'), /fetch-depth: 0/);
  const classify = stepBody(scope, 'Classify changed files');
  assert.match(classify, /id: classify\n/);
  assert.match(classify, /EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(classify, /EVENT_REF: \$\{\{ github\.ref \}\}/);
  assert.match(classify, /PUSH_FORCED: \$\{\{ github\.event\.forced \}\}/);
  assert.match(
    classify,
    /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/,
  );
  assert.match(
    classify,
    /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/,
  );
  assert.match(classify, /run: node scripts\/ci-change-scope\.mjs\n/);
  assert.doesNotMatch(classify, /\bif:/);
});

test('the scope job selects the changed test files of a pull request once, for the flaky guard', async () => {
  const { scope } = jobsIn(await readWorkflow());
  assert.match(
    scope,
    /^ {6}repeat_tests: \$\{\{ steps\.repeat\.outputs\.repeat_tests \}\}$/m,
  );
  assert.match(
    scope,
    /^ {6}repeat_matrix: \$\{\{ steps\.repeat\.outputs\.repeat_matrix \}\}$/m,
  );
  const select = stepBody(scope, 'Select changed test files to repeat');
  assert.match(select, /id: repeat\n/);
  assert.match(select, /EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(
    select,
    /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.match(
    select,
    /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/,
  );
  assert.match(select, /run: node scripts\/ci-changed-tests\.mjs\n/);
  assert.doesNotMatch(select, /\bif:|continue-on-error/);
});

test('flaky_guard repeats only the changed tests of a pull request, per family, and blocks the aggregate', async () => {
  const { flaky_guard: guard, quality } = jobsIn(await readWorkflow());
  assert.match(guard, /^ {4}needs: \[checks, scope, postgres_image\]$/m);
  assert.match(
    guard,
    /^ {4}if: \$\{\{ needs\.scope\.outputs\.repeat_tests == 'true' \}\}$/m,
  );
  assert.match(guard, /^ {4}name: flaky_guard \(\$\{\{ matrix\.label \}\}\)$/m);
  assert.match(guard, /^ {4}timeout-minutes: 30$/m);
  assert.match(
    guard,
    /^ {4}strategy:\n {6}fail-fast: false\n {6}matrix: \$\{\{ fromJSON\(needs\.scope\.outputs\.repeat_matrix\) \}\}\n/m,
  );
  for (const variable of ['DATABASE_URL', 'TEST_DATABASE_URL'])
    assert.match(guard, new RegExp(`^ {6}${variable}: postgresql://`, 'm'));
  assert.match(guard, /^ {6}POSTGRES_ADMIN_URL: postgresql:\/\//m);

  const setup = stepBody(guard, 'Set up repository verification');
  assert.match(setup, /uses: .\/.github\/actions\/setup-verification/);
  assert.match(setup, /postgres: \$\{\{ matrix\.postgres \}\}/);
  assert.match(setup, /chromium: \$\{\{ matrix\.chromium \}\}/);
  const doctor = stepBody(guard, 'Verify supported agent environment');
  assert.match(doctor, /DOCTOR_SCRIPT: \$\{\{ matrix\.doctor \}\}/);
  assert.match(doctor, /run: pnpm "\$DOCTOR_SCRIPT"\n/);
  const repeat = stepBody(guard, 'Repeat changed tests');
  assert.match(repeat, /REPEAT_FAMILY: \$\{\{ matrix\.family \}\}/);
  assert.match(repeat, /REPEAT_FILES: \$\{\{ toJSON\(matrix\.files\) \}\}/);
  assert.match(repeat, /run: node scripts\/ci-repeat-tests\.mjs\n/);
  assert.doesNotMatch(repeat, /\bif:|continue-on-error/);
  // Changed file names reach commands only through the environment.
  for (const line of guard.split('\n'))
    if (/^\s*(?:- )?run:/.test(line))
      assert.doesNotMatch(line, /\$\{\{/, 'no expression inside a command');

  // The aggregate requires it; a missing or skipped guard is judged there.
  assert.match(
    quality.replaceAll(/\s+/g, ' '),
    /needs: \[ [^\]]*packaging, flaky_guard, \] /,
  );
});

test('packaging accepts a restored cache only after current pinned-image verification', async () => {
  const { packaging } = jobsIn(await readWorkflow());
  const restore = stepBody(packaging, 'Restore pinned packaging base images');
  const verify = stepBody(packaging, 'Verify restored packaging base images');
  const acquire = stepBody(packaging, 'Acquire pinned packaging base images');
  const save = stepBody(packaging, 'Save pinned packaging base images');
  const key =
    /key: packaging-images-linux-amd64-\$\{\{ hashFiles\('deploy\/railway\/api\.Dockerfile', 'deploy\/railway\/web\.Dockerfile', 'scripts\/ci-packaging-images\.mjs'\) \}\}/;
  assert.match(restore, /id: packaging_images/);
  assert.match(restore, /uses: actions\/cache\/restore@v4/);
  assert.match(restore, key);
  assert.match(restore, /restore-keys: packaging-images-linux-amd64-\n/);
  assert.match(verify, /id: verified_packaging_cache\n/);
  assert.match(
    verify,
    /if: \$\{\{ steps\.packaging_images\.outputs\.cache-matched-key != '' \}\}/,
  );
  assert.match(
    verify,
    /run: \|\n {10}if node scripts\/ci-packaging-images\.mjs load; then\n {12}echo "verified=true" >> "\$GITHUB_OUTPUT"\n {10}else\n {12}echo "verified=false" >> "\$GITHUB_OUTPUT"\n {10}fi\n/,
  );
  assert.match(
    acquire,
    /if: \$\{\{ steps\.verified_packaging_cache\.outputs\.verified != 'true' \}\}/,
  );
  assert.match(save, /uses: actions\/cache\/save@v4/);
  assert.match(save, key);
  assert.match(
    save,
    /if: \$\{\{ steps\.packaging_images\.outputs\.cache-hit != 'true' \}\}/,
  );
  assert.match(acquire, /run: node scripts\/ci-packaging-images\.mjs acquire/);
  for (const body of [
    acquire,
    save,
    stepBody(packaging, 'Prove production image packaging'),
  ])
    assert.doesNotMatch(body, /continue-on-error:/);
  for (const body of [
    restore,
    verify,
    acquire,
    save,
    stepBody(packaging, 'Prove production image packaging'),
  ])
    assert.match(body, /\$\{\{ runner\.temp \}\}\/packaging-images/);
  const positions = [
    'Restore pinned packaging base images',
    'Verify restored packaging base images',
    'Acquire pinned packaging base images',
    'Save pinned packaging base images',
    'Prove production image packaging',
  ].map((step) => packaging.indexOf(`- name: ${step}\n`));
  assert.deepEqual(
    [...positions].sort((left, right) => left - right),
    positions,
  );
});
