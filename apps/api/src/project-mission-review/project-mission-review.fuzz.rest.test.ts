import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/mission-review-fuzz/commands.js';
import {
  checkEnd,
  closeReviewWorld,
  INVARIANTS,
  openReviewWorld,
  openRun,
  type ReviewWorld,
} from '../../test-support/mission-review-fuzz/world.js';

/**
 * Seeded model-based fuzzing of mission result reviews through the real API
 * on PostgreSQL (#1257, module 5 of #1205). Without FUZZ_* this is the
 * fixed-seed smoke. Nightly runs it large.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1257 });

(databaseUrl ? describe : describe.skip)(
  'Mission result review invariant fuzzing',
  () => {
    let world: ReviewWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      world = await openReviewWorld(databaseUrl);
    }, 180_000);
    afterAll(async () => {
      if (world) await closeReviewWorld(world);
    });
    it.each([
      {
        seed: 1720017777,
        path: '40~11:5:4:4:3:3~AAEABbR:VB',
      },
      {
        seed: 1198500709,
        path: '40~2:8:7:7:9:7:7:6:5:5:7~BAACCBAABCDAAACI/J:VV1',
      },
    ])(
      'rejects changed-intent key reuse in the nightly regression $seed',
      async ({ seed, path }) => {
        await runModelFuzz({
          settings: readFuzzSettings(
            { FUZZ_SEED: String(seed), FUZZ_PATH: path },
            { seed: 1257 },
          ),
          testFile:
            'src/project-mission-review/project-mission-review.fuzz.rest.test.ts',
          invariants: INVARIANTS,
          commands: fuzzCommands,
          open: async () => {
            const opened = await openRun(world);
            return { model: opened.model, real: opened.api };
          },
          end: checkEnd,
        });
      },
      60_000,
    );
    it(
      'keeps Company isolation, review state, history and replay invariants',
      async () => {
        await runModelFuzz({
          settings,
          testFile:
            'src/project-mission-review/project-mission-review.fuzz.rest.test.ts',
          invariants: INVARIANTS,
          commands: fuzzCommands,
          open: async () => {
            const opened = await openRun(world);
            return { model: opened.model, real: opened.api };
          },
          end: checkEnd,
        });
      },
      settings.timeLimitMs + 5 * 60_000,
    );
  },
);
