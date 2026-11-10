import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/project-fuzz/commands.js';
import {
  checkEnd,
  closeProjectWorld,
  INVARIANTS,
  openProjectWorld,
  openRun,
  type ProjectWorld,
} from '../../test-support/project-fuzz/world.js';

/**
 * Seeded model-based fuzzing of Projects through the real API on PostgreSQL
 * (#1253, module 5 of #1205). Without FUZZ_* this is the fixed-seed smoke.
 * Nightly runs it large.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1253 });

(databaseUrl ? describe : describe.skip)(
  'Project lifecycle invariant fuzzing',
  () => {
    let world: ProjectWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      world = await openProjectWorld(databaseUrl);
    }, 180_000);
    afterAll(async () => {
      if (world) await closeProjectWorld(world);
    });
    it(
      'keeps Company isolation, lifecycle, responsibility, history and replay invariants',
      async () => {
        await runModelFuzz({
          settings,
          testFile: 'src/project/project.fuzz.rest.test.ts',
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
