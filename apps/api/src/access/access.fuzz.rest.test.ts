import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/access-fuzz/commands.js';
import {
  checkEnd,
  closeAccessWorld,
  INVARIANTS,
  openAccessWorld,
  openRun,
  type AccessWorld,
} from '../../test-support/access-fuzz/world.js';

/**
 * Seeded model-based fuzzing of Access grants through the real API on
 * PostgreSQL (#1249, module 4 of #1205). Without FUZZ_* this is the
 * fixed-seed smoke. Nightly runs it large. A failure prints FUZZ_SEED and
 * FUZZ_PATH.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1249 });

(databaseUrl ? describe : describe.skip)(
  'Access grant invariant fuzzing',
  () => {
    let world: AccessWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      world = await openAccessWorld(databaseUrl);
    }, 180_000);
    afterAll(async () => {
      if (world) await closeAccessWorld(world);
    });
    it(
      'keeps Company context, revocation, suspension, identity and history invariants',
      async () => {
        await runModelFuzz({
          settings,
          testFile: 'src/access/access.fuzz.rest.test.ts',
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
