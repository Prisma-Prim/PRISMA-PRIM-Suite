import { afterAll, beforeAll, describe, it } from 'vitest';
import { runModelFuzz } from '../../test-support/model-fuzz/run.js';
import { readFuzzSettings } from '../../test-support/model-fuzz/settings.js';
import { fuzzCommands } from '../../test-support/certification-fuzz/commands.js';
import {
  checkEnd,
  closeCertificationWorld,
  INVARIANTS,
  openCertificationWorld,
  openRun,
  type CertificationWorld,
} from '../../test-support/certification-fuzz/world.js';

/**
 * Seeded model-based fuzzing of Certification Cases through the real API on
 * PostgreSQL (#1247, module 3 of #1205). Without FUZZ_* this is the fixed-seed
 * smoke. Nightly runs it large. A failure prints FUZZ_SEED and FUZZ_PATH.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const settings = readFuzzSettings(process.env, { seed: 1247 });

(databaseUrl ? describe : describe.skip)(
  'Certification Case invariant fuzzing',
  () => {
    let world: CertificationWorld;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      world = await openCertificationWorld(databaseUrl);
    }, 240_000);
    afterAll(async () => {
      if (world) await closeCertificationWorld(world);
    });
    it(
      'keeps Company isolation, step order, decision, history, revocation and replay invariants',
      async () => {
        await runModelFuzz({
          settings,
          testFile: 'src/certification/certification.fuzz.rest.test.ts',
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
