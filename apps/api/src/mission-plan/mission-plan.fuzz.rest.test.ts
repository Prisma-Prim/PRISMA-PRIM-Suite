import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/mission-plan-fuzz/commands.js';
import {
  checkEnd,
  closeMissionPlanWorld,
  INVARIANTS,
  openMissionPlanWorld,
  openRun,
  type MissionPlanWorld,
} from '../../test-support/mission-plan-fuzz/world.js';

/**
 * Seeded model-based fuzzing of Company mission plans through the real API
 * on PostgreSQL (#1255, module 5 of #1205). Without FUZZ_* this is the
 * fixed-seed smoke. Nightly runs it large.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1255 });

(databaseUrl ? describe : describe.skip)(
  'Mission plan invariant fuzzing',
  () => {
    let world: MissionPlanWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      world = await openMissionPlanWorld(databaseUrl);
    }, 120_000);
    afterAll(async () => {
      if (world) await closeMissionPlanWorld(world);
    });
    it(
      'keeps Company isolation, version growth, immutability, history and replay invariants',
      async () => {
        await runModelFuzz({
          settings,
          testFile: 'src/mission-plan/mission-plan.fuzz.rest.test.ts',
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
