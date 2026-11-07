import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LABEL = 'fuzz-found';
const FUZZ_TEST_FILE = 'src/internal-task/internal-task.fuzz.rest.test.ts';
// Each report and pass comment carries one marker, so a passing night
// comments once after the latest failure instead of every night.
const FAILED = '<!-- nightly-fuzz: failed -->';
const PASSED = '<!-- nightly-fuzz: passed -->';
const MAXIMUM_COMMENT_PAGES = 5;

/**
 * The verdict of the fuzz job's result (`needs.fuzz.result`): a failure
 * found something or broke the harness, a success is a passing night, and a
 * cancelled or skipped job proves nothing.
 */
export function fuzzVerdict(result) {
  if (result === 'failure') return 'failed';
  if (result === 'success') return 'passed';
  return 'none';
}

/**
 * The failure report the test writes (FUZZ_REPORT), or null when it is
 * missing or malformed: the job then failed outside the property.
 */
export function parseFuzzReport(text) {
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    report === null ||
    typeof report !== 'object' ||
    !Number.isInteger(report.seed) ||
    !['path', 'invariant', 'rule', 'detail'].every(
      (field) => typeof report[field] === 'string',
    ) ||
    !/^(?:[0-9]+~[0-9:]+~[A-Za-z0-9+/:]*)?$/u.test(report.path) ||
    !Array.isArray(report.sequence) ||
    !report.sequence.every((command) => typeof command === 'string')
  )
    return null;
  return report;
}

/** The local replay command, built only from the validated seed and path. */
export function replayCommand(report) {
  return `FUZZ_SEED=${report.seed}${report.path === '' ? '' : ` FUZZ_PATH='${report.path}'`} pnpm --filter @prisma-prim/api exec vitest run ${FUZZ_TEST_FILE}`;
}

// Report text is data from the run: never let it notify anyone or break
// out of its code block.
function inert(text) {
  return text.replaceAll('@', '(at)').replaceAll('`', "'");
}

function links(run) {
  const repository = `${run.server}/${run.repository}`;
  return {
    commit: `[\`${run.sha.slice(0, 7)}\`](${repository}/commit/${run.sha})`,
    run: `${repository}/actions/runs/${run.runId}`,
  };
}

function failureReport(run, report) {
  const link = links(run);
  const facts = report
    ? [
        `**Broken invariant:** \`${inert(report.invariant)}\`. ${inert(report.rule)}`,
        '',
        '```text',
        inert(report.detail),
        '```',
        '',
        `**Seed:** \`${report.seed}\``,
        '',
        `**Shrunk sequence** (${report.sequence.length} commands):`,
        '',
        ...report.sequence.map(
          (command, index) => `${index + 1}. \`${inert(command)}\``,
        ),
        '',
        '**Replay locally** (PostgreSQL test profile):',
        '',
        '```sh',
        replayCommand(report),
        '```',
      ]
    : [
        'The fuzz job failed without a counterexample report: the failure is in its setup, its timeout or the harness, not a shrunk sequence. Read the run log.',
      ];
  return [
    '**Nightly fuzz failed** on `main`.',
    '',
    ...facts,
    '',
    `Commit: ${link.commit}`,
    `Run: ${link.run}`,
    '',
    'Triage: replay the sequence; a confirmed bug gets its own fix issue, whose regression test is this sequence. The owner closes this issue after triage.',
    '',
    FAILED,
  ].join('\n');
}

async function latestMarker(api, issue) {
  let latest = issue.body?.includes(FAILED) ? FAILED : null;
  for (let page = 1; page <= MAXIMUM_COMMENT_PAGES; page += 1) {
    const comments = await api(
      'GET',
      `issues/${issue.number}/comments?per_page=100&page=${page}`,
    );
    for (const comment of comments)
      for (const marker of [FAILED, PASSED])
        if (comment.body?.includes(marker)) latest = marker;
    if (comments.length < 100) break;
  }
  return latest;
}

/**
 * Keeps one open `fuzz-found` issue in step with a finished nightly fuzz on
 * main: a failure opens it or comments on the open one; the first passing
 * night after a failure comments. Only the owner closes it, after triage.
 * `api(method, path, body)` calls the repository's GitHub REST API.
 */
export async function reportNightlyFuzz({
  result,
  report,
  run,
  api,
  log = console.log,
}) {
  const verdict = fuzzVerdict(result);
  if (verdict === 'none' || run.ref !== 'refs/heads/main') {
    log(`No verdict for ${result} on ${run.ref}: nothing to report.`);
    return;
  }
  const open = (
    await api('GET', `issues?labels=${LABEL}&state=open&per_page=100`)
  )
    .filter((issue) => !issue.pull_request)
    .sort((left, right) => left.number - right.number);

  if (verdict === 'passed') {
    const link = links(run);
    for (const issue of open) {
      if ((await latestMarker(api, issue)) === PASSED) {
        log(`#${issue.number} already records a passing night.`);
        continue;
      }
      await api('POST', `issues/${issue.number}/comments`, {
        body: `A later nightly fuzz passed at ${link.commit} in ${link.run}. Close this issue after triage.\n\n${PASSED}`,
      });
      log(`Commented on #${issue.number}.`);
    }
    if (open.length === 0) log('The nightly fuzz passed; no open issue.');
    return;
  }

  const body = failureReport(run, report);
  if (open.length > 0) {
    const [issue] = open;
    await api('POST', `issues/${issue.number}/comments`, { body });
    log(`Reported the failure on #${issue.number}.`);
    return;
  }
  try {
    await api('POST', 'labels', {
      name: LABEL,
      color: 'd93f0b',
      description: 'The nightly fuzz broke an invariant; the owner closes it',
    });
  } catch {
    // The label already exists.
  }
  const issue = await api('POST', 'issues', {
    title: report
      ? `Nightly fuzz broke ${inert(report.invariant)} at ${run.sha.slice(0, 7)}`
      : `Nightly fuzz failed at ${run.sha.slice(0, 7)}`,
    body,
    labels: [LABEL],
  });
  log(`Opened #${issue.number}.`);
}

function gitHubApi(method, path, body) {
  const output = execFileSync(
    'gh',
    [
      'api',
      '--method',
      method,
      `repos/${process.env.GITHUB_REPOSITORY}/${path}`,
      ...(body ? ['--input', '-'] : []),
    ],
    {
      encoding: 'utf8',
      input: body ? JSON.stringify(body) : undefined,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return output.trim() === '' ? undefined : JSON.parse(output);
}

async function main() {
  let report = null;
  try {
    report = parseFuzzReport(
      readFileSync(process.env.FUZZ_REPORT ?? '', 'utf8'),
    );
  } catch {
    // No report: the job failed before or outside the property.
  }
  await reportNightlyFuzz({
    result: process.env.FUZZ_RESULT,
    report,
    run: {
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA ?? '',
      server: process.env.GITHUB_SERVER_URL,
      repository: process.env.GITHUB_REPOSITORY,
      runId: process.env.GITHUB_RUN_ID,
    },
    api: async (method, path, body) => gitHubApi(method, path, body),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
