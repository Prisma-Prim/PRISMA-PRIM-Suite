import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

async function readWorkflow() {
  return (
    await readFile(
      new URL('../.github/workflows/weekly-inspection.yml', import.meta.url),
      'utf8',
    )
  ).replaceAll('\r\n', '\n');
}

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

/** The shell script of a step's `run: |` block, dedented. */
function scriptOf(step) {
  const start = step.indexOf('        run: |\n');
  assert.notEqual(start, -1, 'missing run block');
  return step
    .slice(start + '        run: |\n'.length)
    .split('\n')
    .map((line) => line.replace(/^ {10}/u, ''))
    .join('\n');
}

/** Every line of every `run:` command, inline or block. */
function commandLines(workflow) {
  const commands = [];
  let blockIndent = null;
  for (const line of workflow.split('\n')) {
    const indent = line.length - line.trimStart().length;
    if (blockIndent !== null && (line.trim() === '' || indent > blockIndent)) {
      commands.push(line);
      continue;
    }
    blockIndent = null;
    const run = /^( *)(?:- )?run:(.*)$/u.exec(line);
    if (run === null) continue;
    if (run[2].trim() === '|') blockIndent = run[1].length;
    else commands.push(run[2]);
  }
  return commands;
}

const POST_STEP = 'Comment on the weekly-inspection issue';

test('the weekly inspection runs every Monday at 06:00 UTC and on demand, never for a pull request', async () => {
  const workflow = await readWorkflow();
  assert.match(
    workflow,
    /\non:\n {2}schedule:\n {4}- cron: '5 3 \* \* 1'\n {2}workflow_dispatch:\n\n/,
  );
  // Non-blocking: no pull request, push or queue event, so no check gates on it.
  assert.doesNotMatch(
    workflow,
    /^ {2}(?:pull_request|pull_request_target|merge_group|push|workflow_run|workflow_call):/m,
  );
  const jobs = jobsIn(workflow);
  assert.deepEqual(Object.keys(jobs), ['report', 'post']);
  for (const job of Object.values(jobs))
    assert.deepEqual(
      [...job.matchAll(/^ {4}runs-on: (.+)$/gm)].map((match) => match[1]),
      ['ubuntu-24.04'],
    );
});

test('the report job measures the last 7 days with a read-only token', async () => {
  const workflow = await readWorkflow();
  assert.match(workflow, /\npermissions:\n {2}contents: read\n\n/);
  const { report } = jobsIn(workflow);
  assert.match(
    report,
    /\n {4}permissions:\n {6}contents: read\n {6}pull-requests: read\n {6}issues: read\n {6}checks: read\n {6}actions: read\n {4}outputs:\n/,
  );
  assert.match(
    report,
    /\n {4}outputs:\n {6}report: \$\{\{ steps\.measure\.outputs\.report \}\}\n/,
  );
  assert.match(
    stepBody(report, 'Set up Node.js'),
    /node-version-file: \.node-version/,
  );
  const measure = stepBody(report, 'Measure the last 7 days');
  assert.match(measure, /\n {8}id: measure\n/);
  assert.match(measure, /\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n/);
  // No window argument: the script's default is the last 7 days.
  assert.match(
    scriptOf(measure),
    /^node scripts\/delivery-metrics\.mjs > "\$RUNNER_TEMP\/report\.md"$/m,
  );
  assert.match(scriptOf(measure), /"\$GITHUB_OUTPUT"/);
});

test('only the posting job may write issues, and commands read the report from the environment', async () => {
  const workflow = await readWorkflow();
  const { report, post } = jobsIn(workflow);
  assert.equal([...workflow.matchAll(/: write\b/g)].length, 1);
  // `issues: write` and nothing else.
  assert.match(post, /\n {4}permissions:\n {6}issues: write\n(?! {6})/);
  assert.doesNotMatch(report, /: write\b/);
  assert.match(post, /^ {4}needs: report$/m);
  const step = stepBody(post, POST_STEP);
  assert.match(step, /\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n/);
  assert.match(step, /\n {10}GH_REPO: \$\{\{ github\.repository \}\}\n/);
  assert.match(
    step,
    /\n {10}REPORT: \$\{\{ needs\.report\.outputs\.report \}\}\n/,
  );
  assert.doesNotMatch(workflow, /continue-on-error/);
  // Untrusted text (pull request titles, the report) reaches commands only
  // through the environment.
  const commands = commandLines(workflow);
  assert.ok(commands.length > 0);
  for (const line of commands)
    assert.doesNotMatch(line, /\$\{\{/, `no expression in a command: ${line}`);
});

test('nothing cancels a weekly inspection run, and posts run one at a time', async () => {
  const workflow = await readWorkflow();
  assert.doesNotMatch(workflow, /cancel-in-progress: true/);
  assert.doesNotMatch(workflow, /^concurrency:/m);
  const { report, post } = jobsIn(workflow);
  assert.doesNotMatch(report, /concurrency:/);
  assert.match(
    post,
    /\n {4}concurrency:\n {6}group: weekly-inspection-issue\n {6}cancel-in-progress: false\n/,
  );
});

// ---- The posting script, run against a fake gh ------------------------------

/** Runs the posting step with `openIssues` open; returns gh's calls. */
async function post(openIssues) {
  const script = scriptOf(
    stepBody(jobsIn(await readWorkflow()).post, POST_STEP),
  );
  const directory = mkdtempSync(join(tmpdir(), 'weekly-inspection-'));
  try {
    const log = join(directory, 'gh.log');
    const comment = join(directory, 'comment.md');
    writeFileSync(
      join(directory, 'gh'),
      [
        '#!/usr/bin/env bash',
        'printf "%s\\n" "$*" >> "$FAKE_GH_LOG"',
        'case "$1 $2" in',
        '  "issue list") printf "%s" "$FAKE_GH_OPEN" ;;',
        '  "issue create") echo "https://github.com/$GH_REPO/issues/1200" ;;',
        '  "issue comment") cat > "$FAKE_GH_COMMENT" ;;',
        '  "label create") ;;',
        '  *) echo "unexpected gh $*" >&2; exit 1 ;;',
        'esac',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    // GitHub's default shell for `run`.
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${directory}${delimiter}${process.env.PATH}`,
          GH_REPO: 'Prisma-Prim/PRISMA-PRIM-Suite',
          REPORT: '# Delivery metrics\n\n- Merged: 3',
          ISSUE_BODY: 'What this issue is.',
          FAKE_GH_LOG: log,
          FAKE_GH_COMMENT: comment,
          FAKE_GH_OPEN: openIssues.map((number) => `${number}\n`).join(''),
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return {
      calls: readFileSync(log, 'utf8').trimEnd().split('\n'),
      comment: readFileSync(comment, 'utf8'),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the report is posted on the oldest open weekly-inspection issue', async () => {
  const { calls, comment } = await post([12, 7]);

  assert.deepEqual(calls, [
    'issue list --label weekly-inspection --state open --json number --jq .[].number',
    'issue comment 7 --body-file -',
  ]);
  assert.equal(comment, '# Delivery metrics\n\n- Merged: 3\n');
});

test('without an open weekly-inspection issue, the post creates it first', async () => {
  const { calls, comment } = await post([]);

  assert.equal(calls.length, 4);
  assert.match(calls[1], /^label create weekly-inspection /);
  assert.equal(
    calls[2],
    'issue create --title Weekly inspection --label weekly-inspection --body What this issue is.',
  );
  assert.equal(calls[3], 'issue comment 1200 --body-file -');
  assert.equal(comment, '# Delivery metrics\n\n- Merged: 3\n');
});
