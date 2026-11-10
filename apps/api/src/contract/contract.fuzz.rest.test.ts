import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/contract-fuzz/commands.js';
import {
  checkEnd,
  closeContractWorld,
  INVARIANTS,
  openContractWorld,
  openRun,
  type ContractWorld,
} from '../../test-support/contract-fuzz/world.js';

/**
 * Seeded model-based fuzzing of illustrative Contracts through the real API
 * on PostgreSQL (#1245, module 3 of #1205). Without FUZZ_* this is the
 * fixed-seed smoke. Nightly runs it large. A failure prints FUZZ_SEED and
 * FUZZ_PATH.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1245 });

(databaseUrl ? describe : describe.skip)(
  'Illustrative Contract invariant fuzzing',
  () => {
    let world: ContractWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      world = await openContractWorld(databaseUrl);
    }, 180_000);
    afterAll(async () => {
      if (world) await closeContractWorld(world);
    });
    it(
      'keeps Company isolation, one Contract, version state, signature, Project link, history and replay invariants',
      async () => {
        await runModelFuzz({
          settings,
          testFile: 'src/contract/contract.fuzz.rest.test.ts',
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
