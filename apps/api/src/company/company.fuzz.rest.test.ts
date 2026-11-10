import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/company-fuzz/commands.js';
import {
  checkEnd,
  closeCompanyWorld,
  INVARIANTS,
  openCompanyWorld,
  openRun,
  type CompanyWorld,
} from '../../test-support/company-fuzz/world.js';

/**
 * Seeded model-based fuzzing of the Company registry through the real API
 * on PostgreSQL (#1251, module 4 of #1205). Without FUZZ_* this is the
 * fixed-seed smoke. Nightly runs it large.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1251 });

(databaseUrl ? describe : describe.skip)(
  'Company registry invariant fuzzing',
  () => {
    let world: CompanyWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      world = await openCompanyWorld(databaseUrl);
    }, 120_000);
    afterAll(async () => {
      if (world) await closeCompanyWorld(world);
    });
    it(
      'keeps Company visibility, registration replay and history invariants',
      async () => {
        await runModelFuzz({
          settings,
          testFile: 'src/company/company.fuzz.rest.test.ts',
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
