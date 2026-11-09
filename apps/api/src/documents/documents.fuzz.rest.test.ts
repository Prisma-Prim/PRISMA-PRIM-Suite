import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/documents-fuzz/commands.js';
import {
  checkEnd,
  INVARIANTS,
  openDocumentsWorld,
  openRun,
  type DocumentsWorld,
} from '../../test-support/documents-fuzz/world.js';
import {
  createPaymentEvidenceFixture,
  type PaymentEvidenceFixture,
} from './payment-evidence.test-support.js';

/**
 * Seeded model-based fuzzing of Documents and official Versions through the
 * real API on PostgreSQL (#1241, module 2 of #1205): Company isolation, the
 * same not-found for a hidden Document or Project, revocation, one history
 * fact per success, monotonic revisions, one Project link, and one official
 * Version. Without FUZZ_* variables this is the fixed-seed smoke of the
 * regular API CI; `.github/workflows/nightly-fuzz.yml` runs it large with a
 * random seed. A failure prints FUZZ_SEED and FUZZ_PATH, which replay it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1241 });

(databaseUrl ? describe : describe.skip)(
  'Document and official Version invariant fuzzing',
  () => {
    let fixture: PaymentEvidenceFixture;
    let world: DocumentsWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      fixture = await createPaymentEvidenceFixture(databaseUrl);
      world = await openDocumentsWorld(fixture);
    }, 120_000);
    afterAll(async () => {
      await fixture?.close();
    });
    it(
      'keeps Company isolation, Project link, official Version, history, revocation and replay invariants under seeded command sequences',
      async () => {
        await runModelFuzz({
          settings,
          testFile: 'src/documents/documents.fuzz.rest.test.ts',
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
