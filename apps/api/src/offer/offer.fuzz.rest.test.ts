import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/offer-fuzz/commands.js';
import {
  checkEnd,
  closeOfferWorld,
  INVARIANTS,
  openOfferWorld,
  openRun,
  type OfferWorld,
} from '../../test-support/offer-fuzz/world.js';

/**
 * Seeded model-based fuzzing of illustrative Offers through the real API
 * on PostgreSQL (#1259, module 6 of #1205). Without FUZZ_* this is the
 * fixed-seed smoke. Nightly runs it large.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1259 });

(databaseUrl ? describe : describe.skip)('Offer invariant fuzzing', () => {
  let world: OfferWorld;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('PostgreSQL required.');
    world = await openOfferWorld(databaseUrl);
  }, 180_000);
  afterAll(async () => {
    if (world) await closeOfferWorld(world);
  });
  it(
    'keeps Company isolation, step order, history and replay invariants',
    async () => {
      await runModelFuzz({
        settings,
        testFile: 'src/offer/offer.fuzz.rest.test.ts',
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
});
