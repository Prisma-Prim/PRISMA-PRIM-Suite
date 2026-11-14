import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { Worker } from 'node:worker_threads';
import { assertLocalTestDatabaseUrl } from '../apps/api/test-support/postgres-database-target.mjs';
import { plan as localBrowserPlan } from './verify-local-browser.mjs';
import {
  EvidenceError,
  openPrivateEvidence,
  preparePrivateOutput,
} from './private-evidence.mjs';

// One named acceptance journey (apps/web/e2e/<name>.acceptance.spec.ts) at the
// canonical desktop and narrow projects, each repetition on a fresh isolated
// database created by the acceptance global setup. See .agents/skills/verify.
const schema = 'prisma-prim-journey-verification/v1';
const specSuffix = '.acceptance.spec.ts';
const maximumRepeat = 100;
const usage =
  'Usage: pnpm verify:journey <journey> [--repeat N] [--cpu-load[=THREADS]] [--output DIR] | --list | --help';
const exitCodes = Object.freeze({
  passed: 0,
  failed: 1,
  'usage-error': 2,
  error: 3,
  interrupted: 3,
});

class JourneyUsageError extends Error {
  name = 'JourneyUsageError';
}

function positiveInteger(flag, value, maximum) {
  if (!/^[1-9]\d*$/u.test(value ?? '') || Number(value) > maximum)
    throw new JourneyUsageError(
      `${flag} expects a whole number from 1 to ${maximum}.`,
    );
  return Number(value);
}

export function parseJourneyArguments(argv) {
  const options = {
    action: 'run',
    journey: null,
    repeat: 1,
    cpuLoad: null,
    output: null,
  };
  const words = [...argv];
  while (words.length) {
    const word = words.shift();
    const separator = word.indexOf('=');
    const flag = !word.startsWith('--')
      ? null
      : separator === -1
        ? word
        : word.slice(0, separator);
    const inline =
      flag && separator !== -1 ? word.slice(separator + 1) : undefined;
    if (flag === '--list' || flag === '--help') {
      if (argv.length !== 1)
        throw new JourneyUsageError(`${flag} takes no other argument.`);
      return { ...options, action: flag.slice(2) };
    }
    if (flag === '--repeat')
      options.repeat = positiveInteger(
        flag,
        inline ?? words.shift(),
        maximumRepeat,
      );
    else if (flag === '--cpu-load')
      options.cpuLoad =
        inline === undefined ? 'auto' : positiveInteger(flag, inline, 256);
    else if (flag === '--output') {
      options.output = inline ?? words.shift() ?? null;
      if (!options.output)
        throw new JourneyUsageError('--output expects a directory.');
    } else if (flag) throw new JourneyUsageError(`Unknown flag ${flag}.`);
    else if (options.journey)
      throw new JourneyUsageError('Name exactly one journey.');
    else options.journey = word;
  }
  if (!options.journey) throw new JourneyUsageError('Name one journey.');
  return options;
}

export async function listJourneys(root) {
  return (await readdir(join(root, 'apps/web/e2e')))
    .filter((name) => name.endsWith(specSuffix))
    .map((name) => name.slice(0, -specSuffix.length))
    .sort();
}

// Anchored to a path separator so "contract" never selects "model-contract".
export function journeyTestMatch(journey) {
  const escaped = `${journey}${specSuffix}`.replaceAll('.', '\\.');
  return new RegExp(`(?:^|[\\\\/])${escaped}$`, 'u');
}

function timestamp(date) {
  return date.toISOString().replace(/[-:]/gu, '').replace(/\.\d+/u, '');
}

export function planJourneyVerification({
  root,
  journeys,
  journey,
  repeat,
  cpuLoad,
  output,
  evidenceRoot,
  parallelism,
  playwrightCli,
  startedAt,
}) {
  if (!journeys.includes(journey))
    throw new JourneyUsageError(
      `Unknown journey "${journey}". Journeys: ${journeys.join(', ')}.`,
    );
  const web = join(root, 'apps/web');
  // Absolute, because Playwright resolves outputDir against the wrapper config.
  if (!output && !evidenceRoot)
    throw new JourneyUsageError(
      'A qualified private evidence root is required.',
    );
  const evidenceDirectory = output
    ? resolve(output)
    : join(evidenceRoot, `${journey}-${timestamp(startedAt)}-${randomUUID()}`);
  const local = localBrowserPlan(root, evidenceDirectory, 'acceptance');
  return {
    schema,
    journey,
    spec: join(web, 'e2e', `${journey}${specSuffix}`),
    root,
    repeat,
    cpuLoadThreads:
      cpuLoad === 'auto' ? parallelism : cpuLoad === null ? 0 : cpuLoad,
    startedAt: startedAt.toISOString(),
    evidenceDirectory,
    summaryFile: join(evidenceDirectory, 'summary.json'),
    environment: local.environment,
    clean: [...local.cleanDirectories, ...local.cleanFiles],
    builds: local.builds.map((step, index) => ({
      ...step,
      log: join(evidenceDirectory, `build-${index + 1}.log`),
    })),
    canonicalConfig: local.canonicalConfig,
    canonicalCommand: [...local.builds, local.preview]
      .map((step) => [step.command, ...step.args].join(' '))
      .join(' && '),
    previewCommand: [local.preview.command, ...local.preview.args].join(' '),
    startupMilliseconds: local.startupMilliseconds,
    web,
    runs: Array.from({ length: repeat }, (_, index) => {
      const directory = join(evidenceDirectory, `run-${index + 1}`);
      const config = join(directory, 'playwright.config.mjs');
      return {
        run: index + 1,
        directory,
        config,
        results: join(directory, 'results'),
        report: join(directory, 'report.json'),
        log: join(directory, 'playwright.log'),
        command: process.execPath,
        args: [playwrightCli, 'test', '--config', config],
        cwd: web,
      };
    }),
  };
}

// Same pattern as the Codex Cloud aligned config: import the canonical config
// and change only startup, selection and evidence, never test deadlines.
export function renderJourneyConfig(plan, run) {
  return `import path from 'node:path';
import base from ${JSON.stringify(pathToFileURL(plan.canonicalConfig).href)};

const web = ${JSON.stringify(plan.web)};
if (base.webServer?.command !== ${JSON.stringify(plan.canonicalCommand)})
  throw new Error('The acceptance web server changed; update the startup plan in scripts/verify-local-browser.mjs with it.');

export default {
  ...base,
  testDir: path.resolve(web, base.testDir),
  testMatch: ${journeyTestMatch(plan.journey).toString()},
  globalSetup: path.resolve(web, base.globalSetup),
  outputDir: ${JSON.stringify(run.results)},
  reporter: [['list'], ['json', { outputFile: ${JSON.stringify(run.report)} }]],
  use: { ...base.use, trace: 'on', screenshot: 'on' },
  webServer: {
    ...base.webServer,
    cwd: web,
    command: ${JSON.stringify(plan.previewCommand)},
    timeout: ${plan.startupMilliseconds},
  },
};
`;
}

function sanitize(text) {
  return stripVTControlCharacters(String(text))
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '[redacted PostgreSQL URL]')
    .trim()
    .slice(0, 500);
}

function failedTests(suite, titles = []) {
  const path = suite.title ? [...titles, suite.title] : titles;
  return [
    ...(suite.specs ?? []).flatMap((spec) =>
      spec.tests
        .filter((entry) => entry.status === 'unexpected')
        .map((entry) => ({
          title: [...path, spec.title].join(' › '),
          project: entry.projectName,
        })),
    ),
    ...(suite.suites ?? []).flatMap((child) => failedTests(child, path)),
  ];
}

async function evidenceFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { recursive: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { screenshots: [], traces: [] };
    throw error;
  }
  const paths = entries.map((entry) => join(directory, entry)).sort();
  return {
    screenshots: paths.filter((path) => path.endsWith('.png')),
    traces: paths.filter(
      (path) => basename(path).startsWith('trace') && path.endsWith('.zip'),
    ),
  };
}

async function runOutcome(run, result, signal) {
  let report = null;
  try {
    report = JSON.parse(await readFile(run.report, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const stats = report?.stats ?? {};
  const tests = {
    passed: stats.expected ?? 0,
    failed: stats.unexpected ?? 0,
    flaky: stats.flaky ?? 0,
    skipped: stats.skipped ?? 0,
  };
  const passed =
    result.exitCode === 0 && result.signal === null && tests.passed > 0;
  const status = signal.aborted
    ? 'interrupted'
    : passed
      ? 'passed'
      : tests.failed > 0
        ? 'failed'
        : 'error';
  return {
    run: run.run,
    status,
    exitCode: result.exitCode,
    tests,
    failures: (report?.suites ?? []).flatMap((suite) => failedTests(suite)),
    message:
      status !== 'error'
        ? null
        : result.exitCode === 0 && result.signal === null
          ? 'No test ran.'
          : report?.errors?.length
            ? sanitize(report.errors[0].message)
            : `Playwright exited with code ${result.exitCode}${result.signal ? ` (${result.signal})` : ''}; see ${run.log}.`,
    log: run.log,
    report: run.report,
    ...(await evidenceFiles(run.results)),
  };
}

// Child output goes to its log; Playwright's own lines are echoed too.
async function executeStep(step, { log, echo, signal }) {
  const stream = createWriteStream(log, { mode: 0o600 });
  // Windows only starts pnpm's .cmd shim through a shell; the words are fixed.
  const shell = process.platform === 'win32' && step.command === 'pnpm';
  const child = spawn(
    shell ? [step.command, ...step.args].join(' ') : step.command,
    shell ? [] : step.args,
    { cwd: step.cwd, env: step.env, shell, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const [source, target] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ])
    source.on('data', (chunk) => {
      stream.write(chunk);
      if (echo) target.write(chunk);
    });
  const stop = () => child.kill('SIGTERM');
  signal.addEventListener('abort', stop, { once: true });
  try {
    return await new Promise((resolve) => {
      child.once('error', () => resolve({ exitCode: null, signal: null }));
      child.once('close', (exitCode, childSignal) =>
        resolve({ exitCode, signal: childSignal }),
      );
    });
  } finally {
    signal.removeEventListener('abort', stop);
    await new Promise((resolve) => stream.end(resolve));
  }
}

// Busy threads inside this process: they cannot outlive it.
function startCpuLoad(count) {
  const threads = Array.from(
    { length: count },
    () => new Worker('for (;;) {}', { eval: true }),
  );
  return () => Promise.all(threads.map((thread) => thread.terminate()));
}

export async function runJourneyVerification(
  plan,
  {
    execute = executeStep,
    startCpuLoad: load = startCpuLoad,
    signal = new AbortController().signal,
    report = (line) => console.log(line),
  } = {},
) {
  const summary = {
    schema,
    journey: plan.journey,
    spec: plan.spec,
    status: 'incomplete',
    exitCode: null,
    repeat: plan.repeat,
    cpuLoadThreads: plan.cpuLoadThreads,
    startedAt: plan.startedAt,
    finishedAt: null,
    evidenceDirectory: plan.evidenceDirectory,
    summaryFile: plan.summaryFile,
    builds: [],
    runs: [],
    message: null,
  };
  const env = { ...process.env, ...plan.environment };
  try {
    await mkdir(plan.evidenceDirectory, { recursive: true, mode: 0o700 });
    // Only the generated outputs the shared local startup protocol names.
    for (const path of plan.clean)
      await rm(join(plan.root, path), { recursive: true, force: true });
    for (const step of plan.builds) {
      report(`Building: ${[step.command, ...step.args].join(' ')}`);
      const result = await execute(
        { ...step, env },
        { log: step.log, echo: false, signal },
      );
      const passed = result.exitCode === 0 && result.signal === null;
      summary.builds.push({
        command: step.command,
        args: step.args,
        status: passed ? 'passed' : 'failed',
        exitCode: result.exitCode,
        log: step.log,
      });
      if (signal.aborted) throw new Error('Interrupted.');
      if (!passed) {
        summary.status = 'error';
        summary.message = `Build failed; see ${step.log}.`;
        return await finish(summary);
      }
    }
    const stopLoad = plan.cpuLoadThreads
      ? load(plan.cpuLoadThreads)
      : async () => {};
    try {
      for (const run of plan.runs) {
        await mkdir(run.directory, { recursive: true, mode: 0o700 });
        await writeFile(run.config, renderJourneyConfig(plan, run), {
          mode: 0o600,
        });
        report(
          `Run ${run.run}/${plan.repeat}: ${plan.journey}, fresh database${plan.cpuLoadThreads ? `, ${plan.cpuLoadThreads} CPU load threads` : ''}.`,
        );
        const outcome = await runOutcome(
          run,
          await execute(
            { command: run.command, args: run.args, cwd: run.cwd, env },
            { log: run.log, echo: true, signal },
          ),
          signal,
        );
        summary.runs.push(outcome);
        if (outcome.status !== 'passed') break;
      }
    } finally {
      await stopLoad();
    }
    summary.status = summary.runs.at(-1).status;
    summary.message = summary.runs.at(-1).message;
  } catch (error) {
    summary.status = signal.aborted ? 'interrupted' : 'error';
    summary.message = sanitize(error.message);
  }
  return finish(summary);
}

async function finish(summary) {
  summary.exitCode = exitCodes[summary.status];
  summary.finishedAt = new Date().toISOString();
  await writeFile(
    summary.summaryFile,
    `${JSON.stringify(summary, null, 2)}\n`,
    { mode: 0o600 },
  );
  return summary;
}

async function main(argv, environment) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const journeys = await listJourneys(root);
  const refuse = (status, message, extra = {}) => {
    console.error(message);
    console.log(
      JSON.stringify({
        schema,
        status,
        exitCode: exitCodes[status],
        message,
        ...extra,
      }),
    );
    return exitCodes[status];
  };
  let plan;
  try {
    const options = parseJourneyArguments(argv);
    if (options.action === 'list') {
      for (const journey of journeys) console.log(journey);
      return 0;
    }
    if (options.action === 'help') {
      console.log(`${usage}\nJourneys: ${journeys.join(', ')}`);
      return 0;
    }
    plan = planJourneyVerification({
      root,
      journeys,
      ...options,
      output: options.output
        ? preparePrivateOutput({ cwd: root, output: options.output })
        : null,
      evidenceRoot: options.output
        ? null
        : openPrivateEvidence({ cwd: root, category: 'journeys' }).directory,
      parallelism: availableParallelism(),
      playwrightCli: createRequire(join(root, 'apps/web/package.json')).resolve(
        '@playwright/test/cli',
      ),
      startedAt: new Date(),
    });
    let existing = [];
    try {
      existing = await readdir(plan.evidenceDirectory);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (existing.length)
      throw new JourneyUsageError('--output must be a new or empty directory.');
  } catch (error) {
    if (error instanceof JourneyUsageError || error instanceof EvidenceError)
      return refuse('usage-error', `${error.message}\n${usage}`, { journeys });
    throw error;
  }
  if (!environment.TEST_DATABASE_URL)
    return refuse(
      'error',
      'TEST_DATABASE_URL is required. Run through `node scripts/managed-postgres.mjs -- pnpm verify:journey ...`, or export a loopback *_test database URL.',
    );
  try {
    assertLocalTestDatabaseUrl(environment.TEST_DATABASE_URL);
  } catch (error) {
    return refuse('error', error.message);
  }
  const interruption = new AbortController();
  const interrupt = () => interruption.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const summary = await runJourneyVerification(plan, {
    signal: interruption.signal,
  });
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  const last = summary.runs.at(-1);
  console.log(
    `\nJourney ${summary.journey}: ${summary.status} after ${summary.runs.length}/${summary.repeat} run(s).${summary.message ? ` ${summary.message}` : ''}`,
  );
  for (const path of last?.screenshots ?? [])
    console.log(`Screenshot: ${path}`);
  for (const path of last?.traces ?? []) console.log(`Trace: ${path}`);
  console.log(`Summary: ${summary.summaryFile}`);
  console.log(JSON.stringify(summary));
  return summary.exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2), process.env);
  } catch (error) {
    // An unexpected fault keeps the stable "could not run" contract.
    const message = sanitize(error.message);
    console.error(message);
    console.log(
      JSON.stringify({ schema, status: 'error', exitCode: 3, message }),
    );
    process.exitCode = exitCodes.error;
  }
}
