import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/payment-fuzz/commands.js';
import {
  checkEnd,
  INVARIANTS,
  openPaymentWorld,
  openRun,
  type PaymentWorld,
} from '../../test-support/payment-fuzz/world.js';
import {
  createPaymentEvidenceFixture,
  type PaymentEvidenceFixture,
} from '../documents/payment-evidence.test-support.js';

/**
 * Seeded model-based fuzzing of manual incoming Payment observations through
 * the real API on PostgreSQL (#1218, first module of #1205): Company
 * isolation, revocation and the per-command matrix of the five Payment
 * bundles, the independent-author rule, the §8 state machine, kept
 * confirmations, replacement chains, one revision and one restricted event
 * per success, stale and no-op refusals, replay and inventory order.
 * Without FUZZ_* variables this is the fixed-seed smoke of the regular API
 * CI; `.github/workflows/nightly-fuzz.yml` runs it large with a random seed.
 * A failure prints FUZZ_SEED and FUZZ_PATH, which replay it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1218 });

(databaseUrl ? describe : describe.skip)(
  'Manual Payment observation invariant fuzzing',
  () => {
    let fixture: PaymentEvidenceFixture;
    let world: PaymentWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      fixture = await createPaymentEvidenceFixture(databaseUrl);
      world = await openPaymentWorld(fixture);
    }, 120_000);
    afterAll(async () => {
      await fixture?.close();
    });
    it(
      'keeps Company isolation, bundle, authorship, state, history, replacement, replay and order invariants under seeded command sequences',
      async () => {
        await runModelFuzz({
          settings,
          testFile: 'src/payment/payment.fuzz.rest.test.ts',
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
