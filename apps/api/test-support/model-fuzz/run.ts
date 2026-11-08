import { writeFile } from 'node:fs/promises';
import * as fc from 'fast-check';
import { InvariantViolation } from './checks.js';
import type { FuzzSettings } from './settings.js';

/** What a failure records, for the console and the `fuzz-found` issue. */
export interface FuzzFailure {
  /** The fuzz test file, relative to `apps/api`, that found it. */
  testFile: string;
  seed: number;
  path: string;
  invariant: string;
  rule: string;
  detail: string;
  sequence: string[];
  runs: number;
  shrinks: number;
  replay: string;
}

/**
 * Describes a failing run from fast-check's details. `commands` is the
 * printed counterexample: the commands that ran, comma-separated, then the
 * replay hint fast-check appends as a comment. An error that is no
 * InvariantViolation breaks `model-agreement`, which every catalogue names.
 */
export function describeFailure(input: {
  testFile: string;
  invariants: Readonly<Record<string, string>>;
  seed: number;
  steps: number;
  counterexamplePath: string | null;
  commands: string | null;
  error: unknown;
  runs: number;
  shrinks: number;
}): FuzzFailure {
  const match = /^(.*?)(?: \/\*replayPath="([^"]*)"\*\/)?$/su.exec(
    input.commands ?? '',
  );
  const listed = match?.[1] ?? '';
  const path =
    input.counterexamplePath === null
      ? ''
      : `${input.steps}~${input.counterexamplePath}~${match?.[2] ?? ''}`;
  const invariant =
    input.error instanceof InvariantViolation
      ? input.error.invariant
      : 'model-agreement';
  return {
    testFile: input.testFile,
    seed: input.seed,
    path,
    invariant,
    rule: input.invariants[invariant] ?? 'No catalogued rule.',
    detail:
      input.error instanceof Error
        ? input.error.message
        : String(input.error ?? 'no error recorded'),
    sequence: listed === '' ? [] : listed.split(','),
    runs: input.runs,
    shrinks: input.shrinks,
    replay: `FUZZ_SEED=${input.seed}${path === '' ? '' : ` FUZZ_PATH='${path}'`} pnpm --filter @prisma-prim/api exec vitest run ${input.testFile}`,
  };
}

export function failureText(failure: FuzzFailure) {
  return [
    `Broken invariant: ${failure.invariant}. ${failure.rule}`,
    `Detail: ${failure.detail}`,
    `Shrunk sequence (${failure.sequence.length} commands after ${failure.shrinks} shrinks, run ${failure.runs}):`,
    ...failure.sequence.map((command, index) => `  ${index + 1}. ${command}`),
    `Replay: ${failure.replay}`,
  ].join('\n');
}

/**
 * Runs one seeded model-based property: each run opens a fresh world, runs
 * one generated command sequence against it, then checks its end state. It
 * logs the seed and the measured runs, writes a failure's JSON report to
 * FUZZ_REPORT and throws the shrunk failure with its replay command.
 */
export async function runModelFuzz<Model extends object, Real>(input: {
  settings: FuzzSettings;
  testFile: string;
  invariants: Readonly<Record<string, string>>;
  commands: (options: {
    steps: number;
    replayPath: string | undefined;
  }) => fc.Arbitrary<Iterable<fc.AsyncCommand<Model, Real>>>;
  open: () => Promise<{ model: Model; real: Real }>;
  end: (model: Model, real: Real) => Promise<void>;
}): Promise<void> {
  const { settings } = input;
  const replay = settings.replay;
  console.info(
    `Fuzzing with FUZZ_SEED=${settings.seed}` +
      (replay === undefined
        ? `, ${settings.runs} runs of up to ${settings.steps} steps.`
        : `, replaying FUZZ_PATH.`),
  );
  const property = fc.asyncProperty(
    input.commands({
      steps: settings.steps,
      replayPath:
        replay === undefined || replay.commands === ''
          ? undefined
          : replay.commands,
    }),
    async (commands) => {
      let world: { model: Model; real: Real } | undefined;
      await fc.asyncModelRun(async () => {
        world = await input.open();
        return world;
      }, commands);
      if (world) await input.end(world.model, world.real);
    },
  );
  const started = Date.now();
  const details = await fc.check(property, {
    seed: settings.seed,
    numRuns: settings.runs,
    // Uniform sequence lengths: biased generation keeps most short.
    unbiased: true,
    ...(replay === undefined ? {} : { path: replay.path, endOnFailure: true }),
    plugins: [fc.interruptAfterTimeLimit(settings.timeLimitMs)],
  });
  console.info(
    `Fuzzed ${details.numRuns} runs in ${Math.round((Date.now() - started) / 1000)} s` +
      (details.interrupted ? ', stopped by the time limit.' : '.'),
  );
  if (!details.failed) return;
  const failure = describeFailure({
    testFile: input.testFile,
    invariants: input.invariants,
    seed: details.seed,
    steps: settings.steps,
    counterexamplePath: details.counterexamplePath,
    // A one-element tuple prints as its element: fast-check's commands
    // value, which lists the commands that ran.
    commands:
      details.counterexample === null ? null : String(details.counterexample),
    error: details.errorInstance,
    runs: details.numRuns,
    shrinks: details.numShrinks,
  });
  if (settings.reportFile)
    await writeFile(
      settings.reportFile,
      JSON.stringify(failure, null, 2) + '\n',
    );
  throw new Error(failureText(failure), { cause: details.errorInstance });
}
