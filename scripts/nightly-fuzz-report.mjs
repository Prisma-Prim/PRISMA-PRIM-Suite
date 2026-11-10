import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'fuzz-found';
/** The fuzzed test files of the nightly matrix, relative to `apps/api`. */
export const FUZZ_TEST_FILES = [
  'src/internal-task/internal-task.fuzz.rest.test.ts',
  'src/invoice-record/invoice-record.fuzz.rest.test.ts',
  'src/payment/payment.fuzz.rest.test.ts',
  'src/documents/documents.fuzz.rest.test.ts',
  'src/contract/contract.fuzz.rest.test.ts',
  'src/certification/certification.fuzz.rest.test.ts',
];
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
 * The failure report a fuzz test writes (FUZZ_REPORT), or null when it is
 * missing, malformed or names no fuzzed file: that job then failed outside
 * the property.
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
    !FUZZ_TEST_FILES.includes(report.testFile) ||
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

/**
 * The local replay command, built only from the validated test file, seed
 * and path.
 */
export function replayCommand(report) {
  return `FUZZ_SEED=${report.seed}${report.path === '' ? '' : ` FUZZ_PATH='${report.path}'`} pnpm --filter @prisma-prim/api exec vitest run ${report.testFile}`;
}

/**
 * Every valid report under the downloaded artifacts directory, one per
 * failing module, in a stable order.
 */
export function readFuzzReports(directory) {
  let files;
  try {
    files = readdirSync(directory, { recursive: true, encoding: 'utf8' });
  } catch {
    return [];
  }
  return files
    .filter((file) => file.replaceAll('\\', '/').endsWith('fuzz-report.json'))
    .sort()
    .map((file) => parseFuzzReport(readFileSync(join(directory, file), 'utf8')))
    .filter((report) => report !== null);
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

function reportFacts(report) {
  return [
    `**Fuzzed file:** \`${report.testFile}\``,
    '',
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
  ];
}

function failureReport(run, reports) {
  const link = links(run);
  const facts =
    reports.length > 0
      ? reports.flatMap((report, index) => [
          ...(index === 0 ? [] : ['', '---', '']),
          ...reportFacts(report),
        ])
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
 * main: a failure opens it or comments on the open one, with every failing
 * module's report; the first passing night after a failure comments. Only
 * the owner closes it, after triage. `api(method, path, body)` calls the
 * repository's GitHub REST API.
 */
export async function reportNightlyFuzz({
  result,
  reports = [],
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

  const body = failureReport(run, reports);
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
    title:
      reports.length > 0
        ? `Nightly fuzz broke ${reports.map((report) => inert(report.invariant)).join(', ')} at ${run.sha.slice(0, 7)}`
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
  // No report: every failing job failed before or outside its property.
  const reports = readFuzzReports(process.env.FUZZ_REPORTS ?? '');
  await reportNightlyFuzz({
    result: process.env.FUZZ_RESULT,
    reports,
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
