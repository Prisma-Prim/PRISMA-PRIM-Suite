import { afterAll, beforeAll, describe, it } from 'vitest';
import { fuzzCommands } from '../../test-support/invoice-record-fuzz/commands.js';
import {
  checkEnd,
  INVARIANTS,
  openInvoiceWorld,
  openRun,
  type InvoiceWorld,
} from '../../test-support/invoice-record-fuzz/world.js';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import { openEstimateOfferFixture } from '../offer/offer-estimate-preparation.test-support.js';

/**
 * Seeded model-based fuzzing of manual external Invoice Records through the
 * real API on PostgreSQL (#1211, first module of #1205): Company isolation,
 * revocation of the three Invoice bundles, one revision and one restricted
 * event per success, single active entries, replacement chains, stale and
 * no-op refusals, terminal withdrawal, replay and inventory order. Without
 * FUZZ_* variables this is the fixed-seed smoke of the regular API CI;
 * `.github/workflows/nightly-fuzz.yml` runs it large with a random seed. A
 * failure prints FUZZ_SEED and FUZZ_PATH, which replay it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1211 });

(databaseUrl ? describe : describe.skip)(
  'External Invoice Record invariant fuzzing',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
    let world: InvoiceWorld;
    beforeAll(async () => {
      scanner = await openDocumentScannerFixture();
      fixture = await openEstimateOfferFixture({
        scannerEnvironment: scanner.environment,
      });
      world = await openInvoiceWorld(fixture);
    }, 120_000);
    afterAll(async () => {
      await fixture?.close();
      await scanner?.close();
    });
    it(
      'keeps Company isolation, revocation, history, source, replacement, replay and order invariants under seeded command sequences',
      async () => {
        await runModelFuzz({
          settings,
          testFile: 'src/invoice-record/invoice-record.fuzz.rest.test.ts',
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
