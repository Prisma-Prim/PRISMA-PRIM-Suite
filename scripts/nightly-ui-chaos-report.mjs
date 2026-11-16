import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAXIMUM_CHAOS_SEED, chaosReplayCommand } from './ui-chaos.mjs';
import {
  BROWSER_SEQUENCE_CASES,
  parseBrowserSequenceEvidence,
  browserSequenceReplayCommand,
} from './browser-sequences.mjs';

// Seeded UI chaos (#1376, stage 2 of #1155) lands in the weekly inspection:
// each finished night on main updates a bounded part of its week (Monday, UTC) on
// the open `weekly-inspection` issue with every night's runtime and result,
// and each failure's seed, replay command and triage state. The comment
// keeps its nights in a data block, so a rerun of the same night replaces it.

/** The journeys of the nightly matrix (`.github/workflows/nightly-ui-chaos.yml`). */
export const CHAOS_JOURNEYS = [
  'certification-journey',
  'multi-company-home',
  'financial-action-sequences',
  'access-action-sequences',
  'document-action-sequences',
  'contract-action-sequences',
];
const INSPECTION_LABEL = 'weekly-inspection';
const BUG_LABEL = 'fuzz-found';
const DATA_VERSION = 1;
const MAXIMUM_COMMENT_PAGES = 10;
const MAXIMUM_COMMENT_LENGTH = 65536;
const STATUSES = ['passed', 'failed', 'error', 'interrupted', 'usage-error'];
const CONCLUSIONS = [
  'success',
  'failure',
  'cancelled',
  'skipped',
  'timed_out',
  'neutral',
  'action_required',
  'stale',
  null,
];

const marker = (week) => `<!-- nightly-ui-chaos week=${week} -->`;
const DATA = /<!-- nightly-ui-chaos-data (.*?) -->/su;

const isText = (value) => typeof value === 'string';
const isSeed = (value) =>
  Number.isInteger(value) && value >= 1 && value <= MAXIMUM_CHAOS_SEED;
const isCount = (value) => Number.isInteger(value) && value >= 0;
const isInstant = (value) =>
  isText(value) && !Number.isNaN(Date.parse(value)) && value.endsWith('Z');
const textOrNull = (value) => value === null || isText(value);

function validFailure(failure) {
  return (
    failure !== null &&
    typeof failure === 'object' &&
    isText(failure.title) &&
    isText(failure.project) &&
    textOrNull(failure.error ?? null)
  );
}

function sequenceEvidence(value, journey) {
  return parseBrowserSequenceEvidence({
    ...value,
    schema: 'prisma-prim-browser-sequences/v1',
    journey,
  });
}

function compactSequences(sequences) {
  const result = [];
  const passed = new Map();
  for (const sequence of sequences) {
    if (sequence.status !== 'passed' || sequence.path !== null) {
      result.push(sequence);
      continue;
    }
    const repetitions = sequence.repetitions ?? [
      { run: sequence.run, seed: sequence.seed },
    ];
    const key = JSON.stringify([
      sequence.caseId,
      sequence.width,
      sequence.steps,
    ]);
    const existing = passed.get(key);
    if (!existing) {
      const aggregate = {
        ...sequence,
        repetitions: [...repetitions],
        coverage: { ...sequence.coverage },
      };
      passed.set(key, aggregate);
      result.push(aggregate);
      continue;
    }
    existing.repetitions.push(...repetitions);
    existing.runs += sequence.runs;
    existing.shrinks += sequence.shrinks;
    existing.durationMilliseconds += sequence.durationMilliseconds;
    for (const [label, total] of Object.entries(sequence.coverage))
      existing.coverage[label] = (existing.coverage[label] ?? 0) + total;
  }
  return result;
}

function compactNight(night) {
  return {
    ...night,
    journeys: night.journeys.map((entry) => ({
      ...entry,
      ...(entry.sequences
        ? { sequences: compactSequences(entry.sequences) }
        : {}),
    })),
  };
}

function validStoredSequence(sequence, journey) {
  const evidence = sequenceEvidence(sequence, journey);
  return (
    isCount(sequence.run) &&
    evidence &&
    (sequence.repetitions === undefined ||
      (evidence.status === 'passed' &&
        evidence.path === null &&
        Array.isArray(sequence.repetitions) &&
        sequence.repetitions.length > 0 &&
        sequence.repetitions.every(
          (sample) =>
            sample !== null &&
            typeof sample === 'object' &&
            isCount(sample.run) &&
            isSeed(sample.seed),
        ) &&
        sequence.repetitions[0].run === sequence.run &&
        sequence.repetitions[0].seed === sequence.seed))
  );
}
function sequencesInRun(run, journey) {
  if (run.sequences !== undefined && !Array.isArray(run.sequences)) return null;
  const sequences = (run.sequences ?? []).map((value) =>
    sequenceEvidence(value, journey),
  );
  if (
    sequences.some((value) => !value || value.seed !== run.chaosSeed) ||
    (BROWSER_SEQUENCE_CASES.some((entry) => entry.journey === journey) &&
      run.status === 'passed' &&
      !sequences.length)
  )
    return null;
  return sequences.map((value) => ({ run: run.run, ...value }));
}

/**
 * The summary `pnpm verify:journey --chaos` writes, reduced to what the
 * report shows, or null when it is malformed or names no nightly journey:
 * that job then failed outside its runs.
 */
export function parseChaosSummary(text) {
  let summary;
  try {
    summary = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    summary === null ||
    typeof summary !== 'object' ||
    !CHAOS_JOURNEYS.includes(summary.journey) ||
    !STATUSES.includes(summary.status) ||
    !isSeed(summary.chaosSeed) ||
    typeof summary.stoppedByBudget !== 'boolean' ||
    !Array.isArray(summary.runs) ||
    !summary.runs.every(
      (run) =>
        run !== null &&
        typeof run === 'object' &&
        isCount(run.run) &&
        STATUSES.includes(run.status) &&
        isSeed(run.chaosSeed) &&
        Array.isArray(run.failures) &&
        run.failures.every(validFailure) &&
        sequencesInRun(run, summary.journey) !== null,
    )
  )
    return null;
  const sequences = summary.runs.flatMap((run) =>
    sequencesInRun(run, summary.journey),
  );
  return {
    ...(sequences.length ? { sequences } : {}),
    journey: summary.journey,
    status: summary.status,
    stoppedByBudget: summary.stoppedByBudget,
    runs: summary.runs.length,
    passed: summary.runs.filter((run) => run.status === 'passed').length,
    message: isText(summary.message) ? summary.message : null,
    failures: summary.runs.flatMap((run) =>
      run.failures.map((failure) => ({
        run: run.run,
        seed: run.chaosSeed,
        project: failure.project,
        title: failure.title,
        error: failure.error ?? null,
      })),
    ),
  };
}

/** The valid summaries under the downloaded artifacts, by journey. */
export function readChaosSummaries(directory) {
  let files;
  try {
    files = readdirSync(directory, { recursive: true, encoding: 'utf8' });
  } catch {
    return new Map();
  }
  const summaries = new Map();
  for (const file of files
    .filter((name) => name.replaceAll('\\', '/').endsWith('summary.json'))
    .sort()) {
    const summary = parseChaosSummary(
      readFileSync(join(directory, file), 'utf8'),
    );
    if (summary) summaries.set(summary.journey, summary);
  }
  return summaries;
}

/** The Monday (UTC) that starts the week of an instant, as YYYY-MM-DD. */
export function weekOf(instant) {
  const date = new Date(instant);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function minutesBetween(start, end) {
  if (!isInstant(start) || !isInstant(end)) return null;
  return Math.round((Date.parse(end) - Date.parse(start)) / 6_000) / 10;
}

/**
 * One night: the workflow run, and per journey its job's conclusion and
 * real runtime with the chaos summary's runs and failures.
 */
export function nightOf({ run, jobs, summaries }) {
  return compactNight({
    runId: run.id,
    attempt: run.run_attempt,
    event: run.event,
    sha: run.head_sha,
    startedAt: run.run_started_at,
    journeys: CHAOS_JOURNEYS.filter(
      (journey) =>
        run.event !== 'workflow_dispatch' ||
        jobs.some((entry) => entry.name === `chaos (${journey})`) ||
        summaries.has(journey),
    ).map((journey) => {
      const job = jobs.find((entry) => entry.name === `chaos (${journey})`);
      const summary = summaries.get(journey) ?? null;
      return {
        ...(summary?.sequences?.length ? { sequences: summary.sequences } : {}),
        journey,
        conclusion: job?.conclusion ?? null,
        jobMinutes: job
          ? minutesBetween(job.started_at, job.completed_at)
          : null,
        runs: summary?.runs ?? 0,
        passed: summary?.passed ?? 0,
        status: summary?.status ?? null,
        stoppedByBudget: summary?.stoppedByBudget ?? false,
        failures: (summary?.failures ?? []).map((failure) => ({
          ...failure,
          project: inert(failure.project),
          title: inert(failure.title),
          error: failure.error === null ? null : inert(failure.error),
        })),
      };
    }),
  });
}

function validNight(night) {
  return (
    night !== null &&
    typeof night === 'object' &&
    Number.isSafeInteger(night.runId) &&
    isCount(night.attempt) &&
    isText(night.event) &&
    /^[0-9a-f]{40}$/u.test(night.sha) &&
    isInstant(night.startedAt) &&
    Array.isArray(night.journeys) &&
    night.journeys.every(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        CHAOS_JOURNEYS.includes(entry.journey) &&
        CONCLUSIONS.includes(entry.conclusion) &&
        (entry.jobMinutes === null || typeof entry.jobMinutes === 'number') &&
        isCount(entry.runs) &&
        isCount(entry.passed) &&
        (entry.status === null || STATUSES.includes(entry.status)) &&
        typeof entry.stoppedByBudget === 'boolean' &&
        (entry.sequences === undefined ||
          (Array.isArray(entry.sequences) &&
            entry.sequences.every((sequence) =>
              validStoredSequence(sequence, entry.journey),
            ))) &&
        Array.isArray(entry.failures) &&
        entry.failures.every(
          (failure) =>
            validFailure(failure) &&
            isCount(failure.run) &&
            isSeed(failure.seed),
        ),
    )
  );
}

/**
 * The nights a week's comment holds, `[]` for a comment of another kind,
 * or null when its data block is unreadable: that comment is then left as
 * it is and the night goes to a new one, so no night is silently lost.
 */
export function nightsInComment(body, week) {
  if (!body?.startsWith(marker(week))) return [];
  const match = DATA.exec(body);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    if (data?.version !== DATA_VERSION || !Array.isArray(data.nights))
      return null;
    return data.nights.every(validNight) ? data.nights : null;
  } catch {
    return null;
  }
}

/** The week's nights with this one added, or replacing a rerun of it. */
export function withNight(nights, night) {
  return [...nights.filter((entry) => entry.runId !== night.runId), night].sort(
    (left, right) => left.startedAt.localeCompare(right.startedAt),
  );
}

// Run text is data: never let it notify anyone or break out of its code span.
function inert(text) {
  return text
    .replaceAll('@', '(at)')
    .replaceAll('`', "'")
    .replaceAll('\n', ' ');
}

function result(entry) {
  if (entry.status === 'passed' || entry.status === 'failed')
    return entry.status;
  if (entry.status !== null) return `could not run (${entry.status})`;
  if (entry.conclusion === 'failure' || entry.conclusion === 'timed_out')
    return 'failed without a summary';
  return entry.conclusion === 'success'
    ? 'success without a summary'
    : (entry.conclusion ?? 'no job');
}

/**
 * The number of the `fuzz-found` issue that cites a seed ("seed 123",
 * "Seed `123`" or "--chaos 123"), if any.
 */
export function bugCiting(issues, seed) {
  const cited = new RegExp(
    `(?:seed[^0-9a-z]{0,3}|--chaos )${seed}(?![0-9])`,
    'iu',
  );
  return (
    issues.find((issue) => cited.test(`${issue.title}\n${issue.body ?? ''}`))
      ?.number ?? null
  );
}

/** The whole comment of one week, with its data block last. */
export function renderWeek({ week, nights, bugs, server, repository }) {
  const base = `${server}/${repository}`;
  const retained = nights.map(compactNight);
  const rows = retained.flatMap((night) =>
    night.journeys.map((entry) => {
      const time = night.startedAt.slice(0, 16).replace('T', ' ');
      const runs = `${entry.passed} of ${entry.runs}${entry.stoppedByBudget ? ' (budget)' : ''}`;
      const minutes =
        entry.jobMinutes === null ? '—' : `${entry.jobMinutes.toFixed(1)} min`;
      return `| ${time} | [${night.event === 'schedule' ? 'nightly' : night.event}](${base}/actions/runs/${night.runId}) | [\`${night.sha.slice(0, 7)}\`](${base}/commit/${night.sha}) | ${entry.journey} | ${runs} | ${result(entry)} | ${minutes} |`;
    }),
  );
  const sequenceRows = retained.flatMap((night) =>
    night.journeys.flatMap((entry) =>
      (entry.sequences ?? []).map((sequence) => {
        const evidence = sequenceEvidence(sequence, entry.journey);
        const samples = sequence.repetitions ?? [{ seed: evidence.seed }];
        const replay =
          evidence.path === null
            ? `seeds: ${samples.map(({ seed }) => `\`${seed}\``).join(', ')}`
            : `\`${browserSequenceReplayCommand(evidence)}\``;
        const coverage =
          Object.entries(evidence.coverage)
            .map(([label, total]) => `${label}=${total}`)
            .join(', ') || 'none';
        const repetitions = sequence.repetitions
          ? sequence.repetitions.map(({ run }) => run).join(', ')
          : sequence.run;
        return `| ${night.startedAt.slice(0, 10)} / ${repetitions} | ${evidence.caseId} / ${evidence.width} | ${evidence.status} | ${evidence.runs} | ${evidence.shrinks} | ${(evidence.durationMilliseconds / 1000).toFixed(1)} s | ${coverage} | ${replay} |`;
      }),
    ),
  );
  const failures = retained.flatMap((night) =>
    night.journeys.flatMap((entry) =>
      entry.failures.map((failure) => ({ night, entry, failure })),
    ),
  );
  const filed = failures.filter(({ failure }) => bugs.has(failure.seed));
  const harness = retained.flatMap((night) =>
    night.journeys
      .filter((entry) => !['passed', 'failed'].includes(result(entry)))
      .map((entry) => ({ night, entry })),
  );
  const data = JSON.stringify({
    version: DATA_VERSION,
    nights: retained,
  }).replaceAll('>', '\\u003e');
  return [
    marker(week),
    `## Nightly UI chaos, week of ${week}`,
    '',
    'Seeded UI chaos (#1376, stage 2 of #1155) replays acceptance journeys on a throwaway database under response delays, out-of-order responses, a slowed CPU, double submits and back navigation, with the Company switch and access loss of `multi-company-home`. It never blocks a pull request. Generated financial, Access, Document and Contract action sequences (#1422, #1425, #1427, #1431) vary native actions and values, retain reductions and exact replay, and report only measured coverage. Every failure stays counted here.',
    '',
    '| Night (UTC) | Run | Commit | Journey | Runs passed | Result | Job time |',
    '| --- | --- | --- | --- | ---: | --- | ---: |',
    ...rows,
    ...(sequenceRows.length
      ? [
          '',
          'Generated browser sequence evidence:',
          '',
          'Successful repetitions are aggregated by night, case, screen and step bound; every seed is retained. Per-repetition detail remains in the run summary artifact. Failures, interruptions and exact replays remain separate.',
          '',
          '| Night / repetition | Case / screen | Result | Model runs | Reductions | Duration | Verified actions | Seeds / exact replay |',
          '| --- | --- | --- | ---: | ---: | ---: | --- | --- |',
          ...sequenceRows,
        ]
      : []),
    '',
    failures.length === 0
      ? '**Failures:** none in this comment.'
      : `**Failures:** ${failures.length} in this comment, ${filed.length} filed as a real bug, ${failures.length - filed.length} not filed (a false alarm once triaged).`,
    '',
    ...failures.map(({ night, entry, failure }, index) => {
      const bug = bugs.get(failure.seed);
      return `${index + 1}. ${night.startedAt.slice(0, 10)}, ${entry.journey}, run ${failure.run}, ${inert(failure.project)}: \`${inert(failure.title)}\`.${failure.error ? ` \`${inert(failure.error)}\`.` : ''} Seed \`${failure.seed}\`; replay \`${chaosReplayCommand(entry.journey, failure.seed)}\`. Triage: ${bug ? `real bug #${bug}` : 'not filed'}.`;
    }),
    ...(harness.length === 0
      ? []
      : [
          '',
          `**Could not run:** ${harness
            .map(
              ({ night, entry }) =>
                `${night.startedAt.slice(0, 10)} ${entry.journey} (${result(entry)})`,
            )
            .join(
              '; ',
            )}. Read the run log; this is the harness or its setup, not a journey failure.`,
        ]),
    '',
    'Replay a failure on a local `*_test` database as the verify skill describes. Triage at the weekly inspection: a real bug becomes an issue labelled `fuzz-found` that cites its seed, and this comment then names it; a failure left unfiled counts as a false alarm.',
    '',
    `<!-- nightly-ui-chaos-data ${data} -->`,
  ].join('\n');
}

async function allComments(api, issue) {
  const comments = [];
  for (let page = 1; page <= MAXIMUM_COMMENT_PAGES; page += 1) {
    const batch = await api(
      'GET',
      `issues/${issue}/comments?per_page=100&page=${page}`,
    );
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  return comments;
}

function retainPartNote(body, previousBody) {
  const note =
    /\n\n((?:The \[earlier report part\]|This entry supersedes run|The earlier comment of this week)[^\n]+)\n\nReplay a failure/u.exec(
      previousBody ?? '',
    )?.[1];
  return note
    ? body.replace('\n\nReplay a failure', `\n\n${note}\n\nReplay a failure`)
    : body;
}

function requireCommentSize(body, runId) {
  if (body.length > MAXIMUM_COMMENT_LENGTH)
    throw new Error(
      `The report for run ${runId} exceeds GitHub's comment limit; its complete evidence remains in the workflow artifacts. The oversized comment was not written.`,
    );
}

/**
 * Adds a finished nightly UI chaos run on main to its week's comment on the
 * open `weekly-inspection` issue. `api(method, path, body)` calls the
 * repository's GitHub REST API.
 */
export async function reportNightlyUiChaos({
  ref,
  runId,
  summaries,
  server,
  repository,
  api,
  log = console.log,
}) {
  if (ref !== 'refs/heads/main') {
    log(`Nightly UI chaos on ${ref}: only main reports.`);
    return;
  }
  const run = await api('GET', `actions/runs/${runId}`);
  const { jobs } = await api(
    'GET',
    `actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`,
  );
  const night = nightOf({ run, jobs, summaries });
  const week = weekOf(night.startedAt);

  const [inspection] = (
    await api(
      'GET',
      `issues?labels=${INSPECTION_LABEL}&state=open&per_page=100`,
    )
  )
    .filter((issue) => !issue.pull_request)
    .sort((left, right) => left.number - right.number);
  if (!inspection)
    throw new Error(
      'No open weekly-inspection issue: the Weekly inspection workflow creates it.',
    );
  const comments = await allComments(api, inspection.number);
  const weekComments = comments.filter((comment) =>
    comment.body?.startsWith(marker(week)),
  );
  const existing =
    weekComments.findLast((comment) =>
      nightsInComment(comment.body, week)?.some(
        (entry) => entry.runId === night.runId,
      ),
    ) ?? weekComments.at(-1);
  const previous = existing ? nightsInComment(existing.body, week) : [];
  const nights = withNight(previous ?? [], night);

  const bugIssues = (
    await api('GET', `issues?labels=${BUG_LABEL}&state=all&per_page=100`)
  ).filter((issue) => !issue.pull_request);
  const bugs = new Map();
  const wholeWeek = [
    ...weekComments.flatMap(
      (comment) => nightsInComment(comment.body, week) ?? [],
    ),
    ...nights,
  ];
  for (const entry of wholeWeek.flatMap((item) => item.journeys))
    for (const failure of entry.failures) {
      const bug = bugCiting(bugIssues, failure.seed);
      if (bug !== null) bugs.set(failure.seed, bug);
    }
  async function refreshOtherParts(updatedCommentId) {
    for (const comment of weekComments) {
      if (comment.id === updatedCommentId) continue;
      const retained = nightsInComment(comment.body, week);
      if (retained === null) continue;
      const refreshed = retainPartNote(
        renderWeek({ week, nights: retained, bugs, server, repository }),
        comment.body,
      );
      requireCommentSize(refreshed, night.runId);
      if (refreshed !== comment.body)
        await api('PATCH', `issues/comments/${comment.id}`, {
          body: refreshed,
        });
    }
  }
  let body = retainPartNote(
    renderWeek({ week, nights, bugs, server, repository }),
    existing?.body,
  );
  const continuation = body.length > MAXIMUM_COMMENT_LENGTH;
  if (continuation) {
    body = renderWeek({ week, nights: [night], bugs, server, repository });
    if (existing) {
      const earlier =
        existing.html_url ??
        `${server}/${repository}/issues/${inspection.number}#issuecomment-${existing.id}`;
      const note = previous?.some((entry) => entry.runId === night.runId)
        ? `This entry supersedes run ${night.runId} in the [earlier report part](${earlier}); its earlier evidence remains there.`
        : `The [earlier report part](${earlier}) retains all its nights and failures. This continuation keeps each GitHub comment within its size limit.`;
      body = body.replace(
        '\n\nReplay a failure',
        `\n\n${note}\n\nReplay a failure`,
      );
    }
  }
  if (previous === null)
    body = body.replace(
      '\n\nReplay a failure',
      `\n\nThe earlier comment of this week has unreadable data and stays as it is: [comment](${existing.html_url}).\n\nReplay a failure`,
    );
  requireCommentSize(body, night.runId);

  if (existing && previous !== null && !continuation) {
    await api('PATCH', `issues/comments/${existing.id}`, { body });
    await refreshOtherParts(existing.id);
    log(`Updated the week of ${week} on #${inspection.number}.`);
    return;
  }
  await api('POST', `issues/${inspection.number}/comments`, {
    body,
  });
  await refreshOtherParts();
  log(`Opened the week of ${week} on #${inspection.number}.`);
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
  await reportNightlyUiChaos({
    ref: process.env.GITHUB_REF,
    runId: process.env.GITHUB_RUN_ID,
    summaries: readChaosSummaries(process.env.CHAOS_SUMMARIES ?? ''),
    server: process.env.GITHUB_SERVER_URL,
    repository: process.env.GITHUB_REPOSITORY,
    api: async (method, path, body) => gitHubApi(method, path, body),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
