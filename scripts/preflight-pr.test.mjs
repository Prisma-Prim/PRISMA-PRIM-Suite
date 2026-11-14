import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

import { verifyAcceptanceProof } from './verify-acceptance-proof.mjs';

const command = fileURLToPath(new URL('./preflight-pr.mjs', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'pr-description-preflight-'));
after(() => rmSync(directory, { recursive: true, force: true }));

const body = `Closes #501

## Acceptance proof

| Criterion | Kind | Functional proof | Visual proof |
| --------- | ---- | ---------------- | ------------ |
| 1 | UI | \`apps/web/src/client/client-registration-form.test.tsx\` | \`apps/web/e2e/client-registration.acceptance.spec.ts\` |

- Exception: none.
`;
const context = {
  repository: 'Prisma-Prim/PRISMA-PRIM-Suite',
  pullRequest: 900,
  issues: [
    {
      number: 501,
      body: '## Acceptance criteria\n\n1. Register a synthetic Client.',
    },
  ],
  changedFiles: ['apps/web/src/client/client-registration-form.tsx'],
  comments: [],
  approvers: [],
};

function preflight({ text = body, facts = context, args = [] } = {}) {
  const file = join(directory, 'body.md');
  const factFile = join(directory, 'context.json');
  writeFileSync(file, text);
  writeFileSync(factFile, JSON.stringify(facts));
  return spawnSync(
    process.execPath,
    [command, '--body', file, '--context', factFile, ...args],
    {
      cwd: directory,
      encoding: 'utf8',
    },
  );
}

for (const file of [
  '.prisma-agent-evidence/run.json',
  'apps/web/test-results/SYNTHETIC_PRIVATE_SCREEN.png',
  'apps/web/playwright-report/index.html',
]) {
  test('refuses a private evidence path before publication without echoing it', () => {
    const result = preflight({ facts: { ...context, changedFiles: [file] } });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /private evidence/iu);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /SYNTHETIC_PRIVATE_SCREEN/u,
    );
  });
}

test('validates a UI description without CI reports and identifies its limited scope', () => {
  const result = preflight();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /description preflight passed/iu);
  assert.match(result.stdout, /tests and screenshots have not been verified/iu);
});

for (const [name, text, expected] of [
  [
    'missing proof table from PR #1290',
    body.replace('## Acceptance proof', '## Checks'),
    /no "## Acceptance proof"/u,
  ],
  [
    'descriptive criterion identifier from PR #1310',
    body.replace('| 1 | UI', '| Registration | UI'),
    /has no row/u,
  ],
  [
    'extra Exception prose from PR #1323',
    body.replace('Exception: none.', 'Exception: none. No UI source changed.'),
    /Exception line must link/u,
  ],
]) {
  test(`rejects ${name} before test results exist`, () => {
    const result = preflight({ text });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, expected);
    assert.doesNotMatch(result.stdout, /preflight passed/iu);
  });
}

test('preflight cannot turn missing executed evidence into a passing CI verdict', () => {
  const result = verifyAcceptanceProof({
    ...context,
    pullRequest: { number: context.pullRequest, body },
    results: { families: [], records: [] },
    evidenceStage: 'description',
  });
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.includes('did not run')));
});

test('rejects duplicate issue facts instead of choosing one silently', () => {
  const result = preflight({
    facts: { ...context, issues: [...context.issues, ...context.issues] },
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /duplicate issue/iu);
});

for (const [name, facts] of [
  ['unavailable issue', { ...context, issues: [] }],
  ['unreadable issue', { ...context, issues: [{ number: 501, body: null }] }],
]) {
  test(`refuses ${name} facts without claiming description success`, () => {
    const result = preflight({ facts });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /could not be read/iu);
    assert.doesNotMatch(result.stdout, /preflight passed/iu);
  });
}

for (const [name, facts] of [
  ['repository', { ...context, repository: undefined }],
  ['changed-file list', { ...context, changedFiles: undefined }],
  [
    'issue number',
    { ...context, issues: [{ number: '501', body: context.issues[0].body }] },
  ],
]) {
  test(`rejects missing or malformed ${name} metadata`, () => {
    const result = preflight({ facts });
    assert.equal(result.status, 2, result.stderr);
    assert.doesNotMatch(result.stdout, /preflight passed/iu);
  });
}

for (const args of [
  ['--unknown', 'value'],
  ['--body'],
  ['--context', 'again.json'],
  ['--repo', context.repository],
]) {
  test(`rejects ambiguous or malformed arguments ${args[0]}`, () => {
    const result = preflight({ args });
    assert.equal(result.status, 2, result.stderr);
  });
}

test('help works without Git, GitHub or input files', () => {
  const result = spawnSync(process.execPath, [command, '--help'], {
    cwd: directory,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--body FILE --repo OWNER\/NAME/u);
  assert.match(result.stdout, /--context FILE/u);
});

test('does not repeat an unreadable input payload in its diagnostic', () => {
  const file = join(directory, 'malformed-context.json');
  const text = 'SYNTHETIC_PRIVATE_PAYLOAD';
  writeFileSync(file, `${text}{`);
  const description = join(directory, 'body.md');
  writeFileSync(description, body);
  const result = spawnSync(
    process.execPath,
    [command, '--body', description, '--context', file],
    {
      cwd: directory,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not valid JSON/u);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(text, 'u'));
});

function githubFixture(data) {
  const fixture = mkdtempSync(join(directory, 'github-'));
  const bin = join(fixture, 'bin');
  mkdirSync(bin);
  const responses = join(fixture, 'responses.json');
  const reads = join(fixture, 'reads.jsonl');
  writeFileSync(responses, JSON.stringify(data));
  writeFileSync(
    join(bin, 'gh'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PREFLIGHT_TEST_READS, JSON.stringify(args) + '\\n');
if (args[0] !== 'api' || args[args.indexOf('--method') + 1] !== 'GET') process.exit(3);
const route = args.at(-1).split('/').slice(3).join('/').split('?')[0];
const data = JSON.parse(fs.readFileSync(process.env.PREFLIGHT_TEST_RESPONSES, 'utf8'));
if (!Object.hasOwn(data, route)) process.exit(4);
process.stdout.write(JSON.stringify(args.includes('--slurp') ? [data[route]] : data[route]));
`,
    { mode: 0o700 },
  );
  return {
    reads,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      PREFLIGHT_TEST_RESPONSES: responses,
      PREFLIGHT_TEST_READS: reads,
    },
  };
}

const externalFixture = {
  skip:
    process.platform === 'win32'
      ? 'This executable fixture uses a POSIX shebang; offline CLI coverage is platform-independent.'
      : false,
};

function checkout(files) {
  const root = mkdtempSync(join(directory, 'checkout-'));
  execFileSync('git', ['init', '--quiet', '--initial-branch', 'main', root]);
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  }
  execFileSync('git', ['-C', root, 'add', '--all']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Synthetic Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'seed',
  ]);
  return root;
}

test(
  'checks a replacement body when the existing PR description is null',
  externalFixture,
  () => {
    const description = join(directory, 'replacement.md');
    writeFileSync(description, body);
    const { env } = githubFixture({
      'pulls/900': { number: 900, body: null },
      'pulls/900/files': [],
      'issues/501': context.issues[0],
      'issues/900/comments': [],
    });
    const result = spawnSync(
      process.execPath,
      [
        command,
        '--repo',
        context.repository,
        '--pr',
        '900',
        '--body',
        description,
      ],
      {
        cwd: directory,
        env,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
  },
);

test(
  'reads current PR and issue facts through authenticated read-only GitHub CLI calls',
  externalFixture,
  () => {
    const { reads, env } = githubFixture({
      'pulls/900': { number: 900, body },
      'pulls/900/files': context.changedFiles.map((filename) => ({ filename })),
      'issues/501': context.issues[0],
      'issues/900/comments': [],
    });
    const result = spawnSync(
      process.execPath,
      [command, '--repo', context.repository, '--pr', '900'],
      {
        cwd: directory,
        encoding: 'utf8',
        env,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Source: GitHub/iu);
    assert.match(
      result.stdout,
      /tests and screenshots have not been verified/iu,
    );
    const requests = readFileSync(reads, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(requests.length, 4);
    assert.ok(
      requests.every((args) => args[args.indexOf('--method') + 1] === 'GET'),
    );
  },
);

test(
  'includes untracked UI files outside the invoking subdirectory before PR creation',
  externalFixture,
  () => {
    const root = checkout({ 'README.md': 'Synthetic repository.' });
    mkdirSync(join(root, 'apps/web/src'), { recursive: true });
    writeFileSync(join(root, 'apps/web/src/new-screen.tsx'), '');
    const tools = join(root, 'tools');
    mkdirSync(tools);
    const description = join(directory, 'tooling-only.md');
    writeFileSync(
      description,
      body.replace(
        /\| 1 \| UI .*\n/u,
        '| 1 | tooling | `node --check scripts/preflight-pr.mjs` | — |\n',
      ),
    );
    const { env } = githubFixture({ 'issues/501': context.issues[0] });
    const result = spawnSync(
      process.execPath,
      [
        command,
        '--repo',
        context.repository,
        '--body',
        description,
        '--base',
        'main',
      ],
      {
        cwd: tools,
        env,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /changes web UI source/u);
  },
);

test(
  'includes staged UI content even when an unstaged edit restores the baseline',
  externalFixture,
  () => {
    const file = 'apps/web/src/synthetic-screen.tsx';
    const root = checkout({ [file]: '' });
    writeFileSync(join(root, file), '// Synthetic staged change.\n');
    execFileSync('git', ['-C', root, 'add', file]);
    writeFileSync(join(root, file), '');
    assert.equal(
      execFileSync('git', ['-C', root, 'diff', 'main', '--name-only'], {
        encoding: 'utf8',
      }),
      '',
    );
    assert.equal(
      execFileSync(
        'git',
        ['-C', root, 'diff', '--cached', 'main', '--name-only'],
        { encoding: 'utf8' },
      ).trim(),
      file,
    );
    const description = join(directory, 'index-tooling-only.md');
    writeFileSync(
      description,
      body.replace(
        /\| 1 \| UI .*\n/u,
        '| 1 | tooling | `node --check scripts/preflight-pr.mjs` | — |\n',
      ),
    );
    const { env } = githubFixture({ 'issues/501': context.issues[0] });
    const result = spawnSync(
      process.execPath,
      [
        command,
        '--repo',
        context.repository,
        '--body',
        description,
        '--base',
        'main',
      ],
      {
        cwd: root,
        env,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /changes web UI source/u);
  },
);

test(
  'fails explicitly when required live issue facts are unavailable',
  externalFixture,
  () => {
    const { env } = githubFixture({
      'pulls/900': { number: 900, body },
      'pulls/900/files': [],
    });
    const result = spawnSync(
      process.execPath,
      [command, '--repo', context.repository, '--pr', '900'],
      {
        cwd: directory,
        env,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Cannot read issues\/501 through gh/u);
    assert.doesNotMatch(result.stdout, /preflight passed/iu);
  },
);

test(
  'identifies an approved exception using the actual GitHub comment identity',
  externalFixture,
  () => {
    const url = `https://github.com/${context.repository}/pull/900#issuecomment-777`;
    const { env } = githubFixture({
      'pulls/900': {
        number: 900,
        body: body.replace('Exception: none.', `Exception: ${url}`),
      },
      'pulls/900/files': [],
      'issues/501': context.issues[0],
      'issues/900/comments': [
        {
          id: 777,
          user: { login: 'owner-login' },
          body: 'Acceptance proof exception: synthetic fixture.',
          html_url: url,
        },
      ],
    });
    const result = spawnSync(
      process.execPath,
      [command, '--repo', context.repository, '--pr', '900'],
      {
        cwd: directory,
        env: { ...env, PROOF_EXCEPTION_APPROVERS: 'owner-login' },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /approved exception/iu);
  },
);
