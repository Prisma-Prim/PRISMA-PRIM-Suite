import * as fc from 'fast-check';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import { test, startChaos } from './ui-chaos.fixture';
import {
  BROWSER_SEQUENCE_CASES,
  browserSequenceReplayCommand,
  readBrowserSequenceOptions,
} from '../../../scripts/browser-sequences.mjs';

export type SequenceValue =
  | string
  | number
  | boolean
  | null
  | SequenceValue[]
  | { [key: string]: SequenceValue };
export type BrowserAction = { label: string; run: () => Promise<void> };
export type BrowserSequenceWorld<T> = {
  actions: (value: T) => readonly BrowserAction[];
  verify: () => Promise<void>;
  settle: () => Promise<void>;
  dispose: () => Promise<void>;
  describe: () => SequenceValue;
};
export type BrowserSequenceAdapter<
  I extends SequenceValue,
  T extends SequenceValue,
> = {
  caseId: string;
  initial: fc.Arbitrary<I>;
  values: fc.Arbitrary<T>;
  open: (input: {
    page: Page;
    info: TestInfo;
    trial: number;
    initial: I;
  }) => Promise<BrowserSequenceWorld<T>>;
};
type ActionTrace = {
  label: string;
  value: SequenceValue;
  outcome: 'started' | 'passed';
};
type Trial = {
  trial: number;
  initial: SequenceValue;
  generated: { choice: number; value: SequenceValue }[];
  actions: ActionTrace[];
  model: SequenceValue;
} & ({ status: 'passed' } | { status: 'failed'; error: string });

function errorText(error: unknown): string {
  if (error instanceof AggregateError)
    return [error.message, ...error.errors.map(errorText)].join('; ');
  return error instanceof Error ? error.message : String(error);
}

/** A new native fixture and document, with no previous trial's browser preferences. */
async function resetPage(page: Page, info: TestInfo) {
  const baseURL = info.project.use.baseURL;
  if (!baseURL)
    throw new Error('Browser sequences require the configured App baseURL.');
  if (new URL(page.url()).origin === new URL(baseURL).origin)
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('prisma-prim.interface-locale', 'en');
    });
  await page.goto('about:blank');
  await page.context().clearCookies();
}

export async function runBrowserSequences<
  I extends SequenceValue,
  T extends SequenceValue,
>(input: {
  page: Page;
  info: TestInfo;
  adapter: BrowserSequenceAdapter<I, T>;
}) {
  const { page, info, adapter } = input;
  const entry = BROWSER_SEQUENCE_CASES.find(
    (candidate) => candidate.id === adapter.caseId,
  );
  if (!entry)
    throw new Error(`Unregistered browser sequence case: ${adapter.caseId}.`);
  const options = readBrowserSequenceOptions({
    journey: entry.journey,
    environment: process.env,
  });
  const width = info.project.name.endsWith('narrow') ? 'narrow' : 'desktop';
  if (
    options.replay &&
    (options.replay.caseId !== adapter.caseId || options.replay.width !== width)
  )
    test.skip(
      true,
      'An explicit replay selects a different adapter or viewport.',
    );

  let attempts = 0;
  const trials: Trial[] = [];
  let original: {
    trial: Trial;
    screenshot: string | null;
    artifactError: string | null;
  } | null = null;
  const generated = fc.record({
    initial: adapter.initial,
    steps: fc.array(
      fc.noShrink(fc.record({ choice: fc.nat(), value: adapter.values })),
      {
        minLength: 1,
        maxLength: options.steps,
      },
    ),
  });
  let active: Promise<void> | undefined;
  let draining = false;
  const executeTrial = async ({
    initial,
    steps,
  }: {
    initial: I;
    steps: { choice: number; value: T }[];
  }) => {
    const trial = ++attempts;
    const actions: ActionTrace[] = [];
    let world: BrowserSequenceWorld<T> | undefined;
    let chaos: Awaited<ReturnType<typeof startChaos>> | undefined;
    let loggedChaos = false;
    let failure: { error: unknown } | null = null;
    async function retainOriginal() {
      if (original || !failure) return;
      let screenshot: string | null = null;
      let artifactError: string | null = null;
      try {
        screenshot = info.outputPath(
          `${adapter.caseId}-original-counterexample.png`,
        );
        await page.screenshot({ path: screenshot, fullPage: true });
        await info.attach('original-counterexample', {
          path: screenshot,
          contentType: 'image/png',
        });
      } catch (error) {
        artifactError = errorText(error);
      }
      original = {
        trial: {
          trial,
          initial,
          generated: steps,
          actions: [...actions],
          model: world?.describe() ?? null,
          status: 'failed',
          error: errorText(failure.error),
        },
        screenshot,
        artifactError,
      };
    }
    try {
      await resetPage(page, info);
      // Feature auth/fault handlers must wrap the delayed native response.
      chaos = await startChaos(page, info, options.seed, {
        attachmentName: `sequence-chaos-${trial}.json`,
      });
      world = await adapter.open({ page, info, trial, initial });
      await world.verify();
      for (const step of steps) {
        if (draining) break;
        const enabled = world.actions(step.value);
        const action = enabled[step.choice % enabled.length];
        if (!action)
          throw new Error(`No supported browser action in ${adapter.caseId}.`);
        const trace: ActionTrace = {
          label: action.label,
          value: step.value,
          outcome: 'started',
        };
        actions.push(trace);
        await action.run();
        await world.verify();
        trace.outcome = 'passed';
      }
      await world.settle();
      await world.verify();
      loggedChaos = true;
      await chaos.finish({ check: true });
    } catch (error) {
      failure = { error };
      await retainOriginal();
      if (chaos && !loggedChaos) {
        try {
          await chaos.finish({ check: false });
        } catch (artifactError) {
          failure = {
            error: new AggregateError(
              [error, artifactError],
              'Sequence and chaos evidence failed',
            ),
          };
        }
      }
    } finally {
      for (const dispose of [() => world?.dispose(), () => chaos?.dispose()]) {
        try {
          await dispose();
        } catch (error) {
          failure = {
            error: failure
              ? new AggregateError(
                  [failure.error, error],
                  'Sequence cleanup failed',
                )
              : error,
          };
        }
      }
    }
    const model = world?.describe() ?? null;
    if (failure) {
      await retainOriginal();
      trials.push({
        trial,
        initial,
        generated: steps,
        actions,
        model,
        status: 'failed',
        error: errorText(failure.error),
      });
      throw failure.error;
    }
    trials.push({
      trial,
      initial,
      generated: steps,
      actions,
      model,
      status: 'passed',
    });
  };
  const runTrial = (input: Parameters<typeof executeTrial>[0]) => {
    active = executeTrial(input);
    return active;
  };
  const property = fc.asyncProperty(generated, runTrial);
  const selected = options.replay
    ? fc.sample(fc.tuple(generated), {
        seed: options.seed,
        path: options.replay.path,
        numRuns: 1,
        unbiased: true,
      })[0]
    : undefined;
  if (options.replay && !selected)
    throw new Error('The retained sequence path selected no case.');
  const checked = selected
    ? fc.asyncProperty(fc.constant(selected[0]), runTrial)
    : property;
  const started = Date.now();
  const details = await fc.check(checked, {
    seed: options.seed,
    numRuns: options.runs,
    unbiased: true,
    ...(options.replay ? { endOnFailure: true } : {}),
    plugins: [fc.interruptAfterTimeLimit(options.budgetMilliseconds)],
  });
  // The library's time limit leaves its predicate running; ownership ends after cleanup.
  draining = details.interrupted;
  await Promise.allSettled(active ? [active] : []);
  const failurePath = options.replay?.path ?? details.counterexamplePath;
  const replay =
    failurePath === null
      ? null
      : browserSequenceReplayCommand({
          caseId: adapter.caseId,
          width,
          seed: details.seed,
          steps: options.steps,
          path: failurePath,
        });
  const status =
    details.interrupted && details.counterexample === null
      ? 'interrupted'
      : details.failed
        ? 'failed'
        : details.interrupted || details.numRuns !== options.runs
          ? 'interrupted'
          : 'passed';
  const report = {
    schema: 'prisma-prim-browser-sequences/v1',
    caseId: adapter.caseId,
    journey: entry.journey,
    width,
    seed: details.seed,
    steps: options.steps,
    status,
    path: failurePath,
    replay,
    runs: details.numRuns,
    shrinks: details.numShrinks,
    durationMilliseconds: Date.now() - started,
    interrupted: details.interrupted,
    original,
    counterexample: details.counterexample,
    trials,
    coverage: Object.fromEntries(
      [
        ...new Set(
          trials.flatMap((trial) =>
            trial.actions.map((action) => action.label),
          ),
        ),
      ].map((label) => [
        label,
        trials
          .flatMap((trial) => trial.actions)
          .filter(
            (action) => action.label === label && action.outcome === 'passed',
          ).length,
      ]),
    ),
  };
  const reportPath = info.outputPath(`${adapter.caseId}-sequences.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await info.attach('browser-sequences', {
    path: reportPath,
    contentType: 'application/json',
  });
  console.log(
    `Browser sequences ${adapter.caseId}@${width}: ${status}; seed ${details.seed}; ${details.numRuns} runs; ${details.numShrinks} shrinks; ${report.durationMilliseconds} ms; actions ${JSON.stringify(report.coverage)}${replay ? `; replay: ${replay}` : ''}`,
  );
  if (status !== 'passed')
    throw new Error(
      `Browser sequences ${adapter.caseId}@${width}: ${status}. ${errorText(details.errorInstance)}${replay ? ` Replay: ${replay}` : ''}. Original action trace: ${JSON.stringify(report.original)}`,
    );
  if (
    !trials.some((trial) =>
      trial.actions.some((action) => action.outcome === 'passed'),
    )
  )
    throw new Error(
      'No browser action was verified; an empty sequence cannot pass.',
    );
}
