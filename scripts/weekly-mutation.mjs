import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutationModules } from './mutation/modules.mjs';

// The weekly, non-blocking mutation run (.github/workflows/weekly-mutation.yml).
// `select` lists the allowlisted modules (scripts/mutation/modules.mjs) that
// changed on main in the last 7 days; `report` posts their StrykerJS results
// as one comment on the open `weekly-inspection` issue.
//
// Every module goes through Stryker's command runner: Stryker 10.1.1's vitest
// runner does not activate module-level (static) mutants with Vitest 4, and
// node:test has no Stryker runner. Each mutant therefore runs the module's
// whole unit test file, so no mutant is reported as uncovered.

const WINDOW_DAYS = 7;
const SURVIVOR_LIMIT = 30;
const LABEL = 'weekly-inspection';
const ARTIFACT_PREFIX = 'weekly-mutation-';
const ALLOWLIST = 'scripts/mutation/modules.mjs';
const ISSUE_BODY = [
  'Every Monday the weekly inspection posts here: the delivery report of the past 7 days (`.github/workflows/weekly-inspection.yml`) and a mutation run on the sensitive modules changed that week (`.github/workflows/weekly-mutation.yml`).',
  '',
  'It never blocks a pull request. Keep this issue open so the next reports land here.',
].join('\n');

function idOf(module) {
  return posix.basename(module).replace(/\.[cm]?[jt]s$/u, '');
}

function projectOf(entry) {
  if (entry.runner === 'node:test') return '.';
  const match = /^apps\/[^/]+(?=\/)/u.exec(entry.module);
  if (!match)
    throw new Error(`${entry.module}: a vitest module must live in apps/.`);
  return match[0];
}

function inProject(project, path) {
  return project === '.' ? path : posix.relative(project, path);
}

/**
 * The mutation jobs of the allowlisted modules: each runs Stryker from its
 * package (`project`) and writes its JSON report to `report`, under a
 * gitignored `coverage/` folder.
 */
export function mutationTargets(modules = mutationModules) {
  return modules.map((entry) => {
    const id = idOf(entry.module);
    const project = projectOf(entry);
    return {
      id,
      module: entry.module,
      project,
      report: posix.join(project, 'coverage/mutation', `${id}.json`),
    };
  });
}

/**
 * The allowlisted modules changed on main in the last 7 days.
 * `git(args)` returns the output of a git command.
 */
export function selectChangedModules({ git, now = new Date() }) {
  const since = new Date(
    now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const changed = new Set(
    git([
      'log',
      '--no-renames',
      '--name-only',
      '--format=',
      `--since=${since}`,
      'origin/main',
    ])
      .split('\n')
      .map((line) => line.trim()),
  );
  return {
    since,
    modules: mutationTargets().filter((target) => changed.has(target.module)),
  };
}

/** The StrykerJS config of one allowlisted module, relative to its package. */
export function strykerConfig(id) {
  const entry = mutationModules.find(
    (candidate) => idOf(candidate.module) === id,
  );
  if (!entry) throw new Error(`MUTATION_MODULE names an unknown module: ${id}`);
  const [target] = mutationTargets([entry]);
  const test = inProject(target.project, entry.test);
  const copied =
    entry.runner === 'node:test'
      ? [`${posix.dirname(entry.module)}/**`]
      : ['package.json', 'tsconfig*.json', 'vite*.config.ts', 'src/**'];
  return {
    testRunner: 'command',
    commandRunner: {
      // `--reporter` replaces the GitHub Actions reporters of the Vitest
      // configs, whose relative path does not exist inside the sandbox.
      command:
        entry.runner === 'node:test'
          ? `node --test ${test}`
          : `node node_modules/vitest/vitest.mjs run --reporter=dot ${test}`,
    },
    mutate: [inProject(target.project, entry.module)],
    // The sandbox copies only what the unit test needs.
    ignorePatterns: [
      '/**',
      ...[
        ...copied,
        ...(entry.reads ?? []).map((path) => inProject(target.project, path)),
      ].map((path) => `!/${path}`),
    ],
    incremental: false,
    timeoutMS: 10_000,
    reporters: ['clear-text', 'progress-append-only', 'json'],
    clearTextReporter: { allowColor: false, logTests: false, maxTestsToLog: 0 },
    jsonReporter: { fileName: inProject(target.project, target.report) },
  };
}

/**
 * Counts a StrykerJS JSON report and lists its surviving mutants in source
 * order. The score is Stryker's: detected (killed or timed out) over valid
 * mutants; compile and runtime errors and ignored mutants are not valid.
 */
export function summarizeReport(report, project) {
  const counts = { Killed: 0, Timeout: 0, Survived: 0, NoCoverage: 0 };
  const survivors = [];
  for (const [file, { mutants }] of Object.entries(report.files ?? {}))
    for (const mutant of mutants ?? []) {
      if (Object.hasOwn(counts, mutant.status)) counts[mutant.status] += 1;
      if (mutant.status === 'Survived')
        survivors.push({ file: posix.join(project, file), mutant });
    }
  survivors.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.mutant.location.start.line - right.mutant.location.start.line ||
      left.mutant.location.start.column - right.mutant.location.start.column,
  );
  const detected = counts.Killed + counts.Timeout;
  const valid = detected + counts.Survived + counts.NoCoverage;
  return {
    killed: counts.Killed,
    timeout: counts.Timeout,
    survived: counts.Survived,
    noCoverage: counts.NoCoverage,
    score: valid === 0 ? undefined : (detected / valid) * 100,
    survivors: survivors.map(({ file, mutant }) => ({
      file,
      line: mutant.location.start.line,
      mutator: mutant.mutatorName,
      replacement: mutant.replacement ?? '',
    })),
  };
}

/** A Markdown code span that a table cell cannot break. */
function code(text) {
  const escaped = text.replace(/\s+/gu, ' ').replaceAll('|', '\\|');
  const fence = '`'.repeat(
    Math.max(0, ...(escaped.match(/`+/gu) ?? []).map((run) => run.length)) + 1,
  );
  const padding = /^`|`$/u.test(escaped) ? ' ' : '';
  return `${fence}${padding}${escaped}${padding}${fence}`;
}

function replacementCell(replacement) {
  const text = replacement.replace(/\s+/gu, ' ').trim();
  if (text === '') return '(empty)';
  return code(text.length > 80 ? `${text.slice(0, 79)}…` : text);
}

function windowText(since) {
  const date = new Date(since);
  return Number.isNaN(date.getTime())
    ? `in the last ${WINDOW_DAYS} days`
    : `since ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * The weekly comment. `modules` is undefined when the selection failed;
 * `reports` maps a module id to its parsed JSON report; `run` holds the run
 * URL and each module's artifact URL.
 */
export function renderComment({ since, modules, reports, run }) {
  const lines = ['<!-- weekly-mutation -->', '## Weekly mutation run', ''];
  if (!Array.isArray(modules)) {
    lines.push(
      `The run could not select the changed modules; see [the run](${run.url}).`,
    );
    return lines.join('\n');
  }
  if (modules.length === 0) {
    lines.push(
      `No allowlisted module changed on \`main\` ${windowText(since)}, so no mutation testing ran. Allowlist: \`${ALLOWLIST}\`; [run](${run.url}).`,
    );
    return lines.join('\n');
  }
  lines.push(
    `${modules.length} allowlisted module${modules.length === 1 ? '' : 's'} changed on \`main\` ${windowText(since)}. Allowlist: \`${ALLOWLIST}\`; [run](${run.url}).`,
    '',
    "Each mutant ran the module's whole unit test file, so none is counted as uncovered. Surviving mutants are candidate test gaps to triage.",
  );
  for (const target of modules) {
    lines.push('', `### \`${target.module}\``, '');
    const report = reports[target.id];
    if (!report) {
      lines.push(
        `No report: its mutation job failed or timed out; see [the run](${run.url}).`,
      );
      continue;
    }
    const summary = summarizeReport(report, target.project);
    const score =
      summary.score === undefined ? 'n/a' : `${summary.score.toFixed(1)}%`;
    lines.push(
      `Score ${score}: ${summary.killed} killed, ${summary.timeout} timed out, ${summary.survived} survived, ${summary.noCoverage} without coverage. See the [full JSON report](${run.artifacts[target.id] ?? run.url}).`,
    );
    if (summary.survivors.length === 0) {
      lines.push('', 'No mutant survived.');
      continue;
    }
    lines.push(
      '',
      '| Location | Mutator | Replacement |',
      '| --- | --- | --- |',
    );
    for (const survivor of summary.survivors.slice(0, SURVIVOR_LIMIT))
      lines.push(
        `| ${code(`${survivor.file}:${survivor.line}`)} | ${survivor.mutator.replaceAll('|', '\\|')} | ${replacementCell(survivor.replacement)} |`,
      );
    if (summary.survivors.length > SURVIVOR_LIMIT)
      lines.push(
        '',
        `Showing ${SURVIVOR_LIMIT} of ${summary.survivors.length} surviving mutants.`,
      );
  }
  return lines.join('\n');
}

// In an issue comment an @name notifies someone and `@codex` starts a Codex
// task, even from a mutant's replacement. A zero-width space after the @
// keeps the text readable and inert; e-mail addresses are left alone.
function inert(text) {
  return text.replaceAll(
    /(^|[^\w])@(?=\w)/gu,
    `$1@${String.fromCodePoint(0x200b)}`,
  );
}

/**
 * Comments on the oldest open `weekly-inspection` issue, creating it first
 * when none is open. `api(method, path, body)` calls the repository's GitHub
 * REST API.
 */
export async function postWeeklyComment({ api, body, log = console.log }) {
  const [open] = (
    await api('GET', `issues?labels=${LABEL}&state=open&per_page=100`)
  )
    .filter((issue) => !issue.pull_request)
    .sort((left, right) => left.number - right.number);
  let number = open?.number;
  if (number === undefined) {
    try {
      await api('POST', 'labels', {
        name: LABEL,
        color: '0e8a16',
        description: 'Weekly inspection reports; never blocks a pull request',
      });
    } catch {
      // The label already exists.
    }
    ({ number } = await api('POST', 'issues', {
      title: 'Weekly inspection',
      body: ISSUE_BODY,
      labels: [LABEL],
    }));
    log(`Opened #${number}.`);
  }
  await api('POST', `issues/${number}/comments`, { body: inert(body) });
  log(`Commented on #${number}.`);
  return number;
}

/**
 * Posts the weekly comment for the selected modules, linking each report to
 * its run artifact. `readReport(target)` returns a parsed report or undefined.
 */
export async function reportWeeklyMutation({
  modules,
  since,
  readReport,
  api,
  run,
  log = console.log,
}) {
  const url = `${run.server}/${run.repository}/actions/runs/${run.runId}`;
  const artifacts = {};
  try {
    const listed = await api(
      'GET',
      `actions/runs/${run.runId}/artifacts?per_page=100`,
    );
    for (const artifact of listed.artifacts)
      if (artifact.name.startsWith(ARTIFACT_PREFIX))
        artifacts[artifact.name.slice(ARTIFACT_PREFIX.length)] =
          `${url}/artifacts/${artifact.id}`;
  } catch {
    // Each report then links to the run, which lists its artifacts.
  }
  const reports = {};
  for (const target of modules ?? []) {
    const report = readReport(target);
    if (report) reports[target.id] = report;
  }
  const body = renderComment({
    since,
    modules,
    reports,
    run: { url, artifacts },
  });
  return postWeeklyComment({ api, body, log });
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

/** The selected targets named by MUTATION_MODULES, or undefined. */
function selectedTargets(value) {
  try {
    const targets = mutationTargets();
    const selected = JSON.parse(value ?? '').map((module) =>
      targets.find((target) => target.id === module.id),
    );
    return selected.every(Boolean) ? selected : undefined;
  } catch {
    return undefined;
  }
}

function readReportFrom(directory) {
  return (target) => {
    try {
      return JSON.parse(
        readFileSync(join(directory, `${target.id}.json`), 'utf8'),
      );
    } catch {
      return undefined;
    }
  };
}

async function main(command) {
  if (command === 'select') {
    const { since, modules } = selectChangedModules({
      git: (args) =>
        execFileSync('git', args, {
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
        }),
    });
    const output = `modules=${JSON.stringify(modules)}\nsince=${since}\n`;
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, output);
      console.log(
        `Changed allowlisted modules since ${since}: ${modules.map((target) => target.module).join(', ') || 'none'}.`,
      );
    } else process.stdout.write(output);
    return;
  }
  if (command === 'report') {
    await reportWeeklyMutation({
      modules: selectedTargets(process.env.MUTATION_MODULES),
      since: process.env.MUTATION_SINCE ?? '',
      readReport: readReportFrom(process.env.MUTATION_REPORTS ?? ''),
      api: async (method, path, body) => gitHubApi(method, path, body),
      run: {
        server: process.env.GITHUB_SERVER_URL,
        repository: process.env.GITHUB_REPOSITORY,
        runId: process.env.GITHUB_RUN_ID,
      },
    });
    return;
  }
  console.error('Usage: node scripts/weekly-mutation.mjs select|report');
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await main(process.argv[2]);
