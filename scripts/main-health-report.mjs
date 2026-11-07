import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LABEL = 'main-red';
// Marks an issue that recorded a complete CI failure. The fast checks after
// a push do not prove the suites that failed, so only a passing nightly
// complete CI closes such an issue.
const COMPLETE_FAILURE = '<!-- main-red: complete CI failure -->';
const MAXIMUM_COMMITS = 20;
const FAILED = new Set(['failure', 'timed_out']);

/**
 * The verdict of one main run from its jobs' results (`toJSON(needs)`): red
 * when a job failed, green when a job succeeded and none failed or was
 * cancelled, otherwise none: a cancelled or unexecuted run proves nothing.
 */
export function mainHealth(results) {
  if (results === null || typeof results !== 'object' || Array.isArray(results))
    throw new Error('Expected a JSON object of job results.');
  const outcomes = Object.values(results).map((job) => job?.result);
  if (outcomes.includes('failure')) return 'red';
  if (
    outcomes.includes('success') &&
    outcomes.every((outcome) => outcome === 'success' || outcome === 'skipped')
  )
    return 'green';
  return 'none';
}

async function failedJobs(api, run, results) {
  try {
    const { jobs } = await api(
      'GET',
      `actions/runs/${run.runId}/jobs?filter=latest&per_page=100`,
    );
    const failed = jobs
      .filter((job) => FAILED.has(job.conclusion))
      .map((job) => `[${job.name}](${job.html_url})`);
    if (failed.length > 0) return failed;
  } catch {
    // The verdict's own job names still locate the failure.
  }
  return Object.entries(results)
    .filter(([, job]) => job?.result === 'failure')
    .map(([name]) => name);
}

async function mergedPullRequests(api, commits) {
  const numbers = new Set();
  try {
    for (const commit of commits.slice(0, MAXIMUM_COMMITS))
      for (const pull of await api('GET', `commits/${commit}/pulls`))
        if (pull.merged_at && pull.base?.ref === 'main')
          numbers.add(pull.number);
  } catch {
    return 'could not be read';
  }
  if (numbers.size === 0) return 'none found';
  return [...numbers]
    .sort((left, right) => left - right)
    .map((number) => `#${number}`)
    .join(', ');
}

function links(run) {
  const repository = `${run.server}/${run.repository}`;
  return {
    commit: `[\`${run.sha.slice(0, 7)}\`](${repository}/commit/${run.sha})`,
    run: `${repository}/actions/runs/${run.runId}`,
    workflow: `${run.workflow} (${run.event === 'schedule' ? 'nightly complete CI' : 'fast checks after a push'})`,
  };
}

async function redReport(api, run, results) {
  const link = links(run);
  return [
    `**\`main\` is red**: a run on \`main\` failed.`,
    '',
    `Workflow: ${link.workflow}`,
    `Failed jobs: ${(await failedJobs(api, run, results)).join(', ')}`,
    `Commit: ${link.commit}`,
    `Run: ${link.run}`,
    `Merged pull requests: ${await mergedPullRequests(api, run.commits)}`,
    '',
    'Revert the offending pull request or fix forward. A later passing run on `main` closes this issue; after a complete CI failure, only a passing nightly complete CI does.',
    ...(run.event === 'schedule' ? ['', COMPLETE_FAILURE] : []),
  ].join('\n');
}

/**
 * Keeps one open `main-red` issue in step with a finished main run: a red
 * run opens it or comments on the open one, a green run comments and closes
 * it. `api(method, path, body)` calls the repository's GitHub REST API.
 */
export async function reportMainHealth({
  results,
  run,
  api,
  log = console.log,
}) {
  const health = mainHealth(results);
  if (
    health === 'none' ||
    run.ref !== 'refs/heads/main' ||
    !['push', 'schedule'].includes(run.event)
  ) {
    log(`No verdict for ${run.event} on ${run.ref}: nothing to report.`);
    return;
  }
  const open = (
    await api('GET', `issues?labels=${LABEL}&state=open&per_page=100`)
  )
    .filter((issue) => !issue.pull_request)
    .sort((left, right) => left.number - right.number);

  if (health === 'green') {
    const link = links(run);
    for (const issue of open) {
      if (run.event !== 'schedule' && issue.body?.includes(COMPLETE_FAILURE)) {
        log(`#${issue.number} waits for a passing nightly complete CI.`);
        continue;
      }
      await api('POST', `issues/${issue.number}/comments`, {
        body: `\`main\` is green again: ${link.workflow} passed at ${link.commit} in ${link.run}.`,
      });
      await api('PATCH', `issues/${issue.number}`, {
        state: 'closed',
        state_reason: 'completed',
      });
      log(`Closed #${issue.number}.`);
    }
    if (open.length === 0) log('main is green; no open main-red issue.');
    return;
  }

  const report = await redReport(api, run, results);
  if (open.length > 0) {
    const [issue] = open;
    await api('POST', `issues/${issue.number}/comments`, { body: report });
    if (run.event === 'schedule' && !issue.body?.includes(COMPLETE_FAILURE))
      await api('PATCH', `issues/${issue.number}`, {
        body: `${issue.body ?? ''}\n\n${COMPLETE_FAILURE}`,
      });
    log(`Reported the failure on #${issue.number}.`);
    return;
  }
  try {
    await api('POST', 'labels', {
      name: LABEL,
      color: 'b60205',
      description: 'A run on main failed; closed when main is green again',
    });
  } catch {
    // The label already exists.
  }
  const issue = await api('POST', 'issues', {
    title: `main is red since ${run.sha.slice(0, 7)}`,
    body: report,
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
  let results;
  try {
    results = JSON.parse(process.env.MAIN_RESULTS ?? '');
    mainHealth(results);
  } catch {
    console.error('MAIN_RESULTS must be a JSON object of job results.');
    process.exitCode = 1;
    return;
  }
  const event = process.env.GITHUB_EVENT_NAME;
  const sha = process.env.GITHUB_SHA ?? '';
  // A push names its commits; a nightly run tests the current main commit.
  let commits = [];
  try {
    if (event === 'push')
      commits = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
        .commits.map((commit) => commit.id)
        .filter((id) => /^[0-9a-f]{40}$/u.test(id));
  } catch {
    // The pushed head commit still names the last merge.
  }
  await reportMainHealth({
    results,
    run: {
      event,
      ref: process.env.GITHUB_REF,
      sha,
      workflow: process.env.GITHUB_WORKFLOW,
      server: process.env.GITHUB_SERVER_URL,
      repository: process.env.GITHUB_REPOSITORY,
      runId: process.env.GITHUB_RUN_ID,
      commits: commits.length > 0 ? commits : [sha],
    },
    api: async (method, path, body) => gitHubApi(method, path, body),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
