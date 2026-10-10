import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);

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

function requireOfficialImageSources([workflow, api, web, smoke]) {
  const services = [...workflow.matchAll(/^ +image: (\S+)$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(services, [
    officialImages.postgres,
    officialImages.postgres,
  ]);
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
      if (['--rm', '--detach', '--pull=never'].includes(token)) continue;
      if (
        [
          '--name',
          '--network',
          '--network-alias',
          '--env',
          '--publish',
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
  assert.equal(rejected, 7);
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

// The literal graph is the issue's required coverage, independent of the gate implementation.
test('independent test families and packaging share only the fast prerequisite', async () => {
  const jobs = jobsIn(await readWorkflow());
  assert.deepEqual(Object.keys(jobs), [
    'checks',
    'api',
    'web_unit',
    'browser',
    'acceptance',
    'build',
    'packaging',
    'quality',
  ]);
  assert.doesNotMatch(jobs.checks, /\bneeds:|\bif:/);
  for (const job of [
    'api',
    'web_unit',
    'browser',
    'acceptance',
    'build',
    'packaging',
  ]) {
    assert.match(jobs[job], /^ {4}needs: checks$/m);
    assert.doesNotMatch(jobs[job], /^ {4}if:/m);
  }
  assert.match(
    jobs.quality,
    /^ {4}needs: \[checks, api, web_unit, browser, acceptance, build, packaging\]$/m,
  );
  assert.match(jobs.quality, /^ {4}if: \$\{\{ always\(\) \}\}$/m);
  const gate = stepBody(jobs.quality, 'Require every verification result');
  assert.match(gate, /CI_JOB_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(gate, /run: node scripts\/verify-ci-results\.mjs/);
  assert.doesNotMatch(gate, /\bif:|continue-on-error/);
  assert.doesNotMatch(await readWorkflow(), /continue-on-error/);
});

test('CI preserves PR and main triggers, read-only permissions and obsolete PR cancellation', async () => {
  const workflow = await readWorkflow();
  assert.match(
    workflow,
    /on:\n {2}pull_request:\n {2}push:\n {4}branches:\n {6}- main\n/,
  );
  assert.match(workflow, /permissions:\n {2}contents: read\n/);
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
    api: { result: dependency.status === 0 ? 'success' : 'failure' },
    web_unit: { result: 'success' },
    browser: { result: 'success' },
    acceptance: { result: 'success' },
    build: { result: 'success' },
    packaging: { result: 'success' },
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
    ['Test scripts', 'run: pnpm test:scripts'],
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
    ['api', 'Test API', 'pnpm --filter @prisma-prim/api test'],
    [
      'web_unit',
      'Test Web unit',
      'pnpm --filter @prisma-prim/web exec vitest run',
    ],
    ['browser', 'Test browser', 'pnpm --filter @prisma-prim/web test:browser'],
    [
      'acceptance',
      'Test acceptance',
      'pnpm --filter @prisma-prim/web test:browser:acceptance',
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

test('database jobs own isolated PostgreSQL services and matching environment checks', async () => {
  const jobs = jobsIn(await readWorkflow());
  for (const [job, doctor] of [
    ['api', 'postgres'],
    ['acceptance', 'web-postgres'],
  ]) {
    assert.match(
      jobs[job],
      /services:\n {6}postgres:\n {8}image: public\.ecr\.aws\/docker\/library\/postgres:17-alpine@sha256:[a-f0-9]{64}\n/,
    );
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
});
