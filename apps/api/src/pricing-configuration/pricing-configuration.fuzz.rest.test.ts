import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/pricing-fuzz/commands.js';
import {
  checkEnd,
  closePricingWorld,
  INVARIANTS,
  openPricingWorld,
  openRun,
  type PricingWorld,
} from '../../test-support/pricing-fuzz/world.js';

/**
 * Seeded model-based fuzzing of pricing configuration through the real API
 * on PostgreSQL (#1261, module 6 of #1205). Without FUZZ_* this is the
 * fixed-seed smoke. Nightly runs it large.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1261 });

(databaseUrl ? describe : describe.skip)(
  'Pricing configuration invariant fuzzing',
  () => {
    let world: PricingWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      world = await openPricingWorld(databaseUrl);
    }, 180_000);
    afterAll(async () => {
      if (world) await closePricingWorld(world);
    });
    it(
      'keeps Company isolation, version growth, history and replay invariants',
      async () => {
        await runModelFuzz({
          settings,
          testFile:
            'src/pricing-configuration/pricing-configuration.fuzz.rest.test.ts',
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
