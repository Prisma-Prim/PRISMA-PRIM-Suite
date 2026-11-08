import { afterAll, beforeAll, describe, it } from 'vitest';
import { fuzzCommands } from '../../test-support/internal-task-fuzz/commands.js';
import {
  checkEnd,
  INVARIANTS,
  openWorld,
} from '../../test-support/internal-task-fuzz/world.js';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
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
const settings = readFuzzSettings(process.env, { seed: 1156 });

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
        await runModelFuzz({
          settings,
          testFile: 'src/internal-task/internal-task.fuzz.rest.test.ts',
          invariants: INVARIANTS,
          commands: fuzzCommands,
          open: async () => {
            const opened = await openWorld(fixture);
            return { model: opened.model, real: opened.api };
          },
          end: checkEnd,
        });
      },
      settings.timeLimitMs + 5 * 60_000,
    );
  },
);
