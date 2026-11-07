import { writeFile } from 'node:fs/promises';
import * as fc from 'fast-check';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { fuzzCommands } from '../../test-support/internal-task-fuzz/commands.js';
import {
  describeFailure,
  failureText,
  readFuzzSettings,
} from '../../test-support/internal-task-fuzz/settings.js';
import {
  checkEnd,
  openWorld,
  type FuzzApi,
  type Model,
} from '../../test-support/internal-task-fuzz/world.js';
import {
  openInternalTaskFixture,
  type InternalTaskFixture,
} from './internal-task.test-support.js';

/**
 * Seeded model-based fuzzing of Company isolation, access revocation and
 * history/Activity Log invariants through the real API (#1156, stage 1 of
 * #1155). Without FUZZ_* variables this is the fixed-seed smoke of the
 * regular API CI; `.github/workflows/nightly-fuzz.yml` runs it large with a
 * random seed. A failure prints FUZZ_SEED and FUZZ_PATH, which replay it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env);

(databaseUrl ? describe : describe.skip)(
  'Internal Company Task invariant fuzzing',
  () => {
    let fixture: InternalTaskFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      fixture = await openInternalTaskFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });
    it(
      'keeps Company isolation, revocation, history and version invariants under seeded command sequences',
      async () => {
        const replay = settings.replay;
        console.info(
          `Fuzzing with FUZZ_SEED=${settings.seed}` +
            (replay === undefined
              ? `, ${settings.runs} runs of up to ${settings.steps} steps.`
              : `, replaying FUZZ_PATH.`),
        );
        const property = fc.asyncProperty(
          fuzzCommands({
            steps: settings.steps,
            replayPath:
              replay === undefined || replay.commands === ''
                ? undefined
                : replay.commands,
          }),
          async (commands) => {
            let world: { model: Model; real: FuzzApi } | undefined;
            await fc.asyncModelRun(async () => {
              const opened = await openWorld(fixture);
              world = { model: opened.model, real: opened.api };
              return world;
            }, commands);
            if (world) await checkEnd(world.model, world.real);
          },
        );
        const started = Date.now();
        const details = await fc.check(property, {
          seed: settings.seed,
          numRuns: settings.runs,
          // Uniform sequence lengths: biased generation keeps most short.
          unbiased: true,
          ...(replay === undefined
            ? {}
            : { path: replay.path, endOnFailure: true }),
          plugins: [fc.interruptAfterTimeLimit(settings.timeLimitMs)],
        });
        console.info(
          `Fuzzed ${details.numRuns} runs in ${Math.round((Date.now() - started) / 1000)} s` +
            (details.interrupted ? ', stopped by the time limit.' : '.'),
        );
        if (!details.failed) return;
        const failure = describeFailure({
          seed: details.seed,
          steps: settings.steps,
          counterexamplePath: details.counterexamplePath,
          // A one-element tuple prints as its element: fast-check's
          // commands value, which lists the commands that ran.
          commands:
            details.counterexample === null
              ? null
              : String(details.counterexample),
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
      },
      settings.timeLimitMs + 5 * 60_000,
    );
  },
);
