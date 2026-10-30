import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const command = fileURLToPath(
  new URL('../knowledge-qualification.mjs', import.meta.url),
);
function example() {
  return {
    schema: 'prisma-prim-knowledge-bundle/v1',
    content: {
      format: 'prisma-prim-synthetic-knowledge-content/v1',
      corpusId: 'SYN-CORPUS',
      corpusVersion: 1,
      dataKind: 'synthetic',
      profiles: [
        {
          profileId: 'P-A',
          workspaceRef: 'W-A',
          companyRef: 'C-A',
          purposes: ['cited-answer'],
          permittedSources: [{ sourceId: 'S-ONE', version: 2 }],
        },
      ],
      sources: [
        {
          sourceId: 'S-ONE',
          version: 2,
          workspaceRef: 'W-A',
          companyRef: 'C-A',
          language: 'en',
          admission: 'synthetic-approved',
          status: 'current',
          title: 'Fictional inventory',
          passages: [
            { locator: 'p1', text: 'The fictional store has four boxes.' },
          ],
        },
      ],
    },
    expectations: {
      format: 'prisma-prim-synthetic-knowledge-expectations/v1',
      corpusId: 'SYN-CORPUS',
      corpusVersion: 1,
      expectationSetId: 'SYN-EXPECT',
      expectationSetVersion: 1,
      dataKind: 'synthetic',
      cases: [
        {
          caseId: 'K01',
          caseVersion: 1,
          language: 'en',
          purpose: 'cited-answer',
          profileId: 'P-A',
          mode: 'current',
          question: 'How many fictional boxes?',
          candidateRefs: [{ sourceId: 'S-ONE', version: 2 }],
          expected: {
            outcome: 'supported',
            retrievalRefs: [{ sourceId: 'S-ONE', version: 2 }],
            citations: [
              {
                sourceId: 'S-ONE',
                version: 2,
                locator: 'p1',
                quote: 'The fictional store has four boxes.',
              },
            ],
            requiredProperties: ['Four boxes.'],
            prohibitedOutcomes: ['Invent a different count.'],
          },
        },
      ],
    },
  };
}
function observations() {
  return {
    schema: 'prisma-prim-knowledge-observations/v1',
    dataKind: 'synthetic',
    corpusId: 'SYN-CORPUS',
    corpusVersion: 1,
    expectationSetId: 'SYN-EXPECT',
    expectationSetVersion: 1,
    runId: 'RUN-ONE',
    runVersion: 1,
    methodId: 'literal-example',
    methodVersion: 1,
    evidenceKind: 'authored_fixture',
    observations: [
      {
        caseId: 'K01',
        caseVersion: 1,
        profileId: 'P-A',
        purpose: 'cited-answer',
        mode: 'current',
        status: 'completed',
        retrievalRefs: [{ sourceId: 'S-ONE', version: 2 }],
        outcome: 'supported',
        citations: [
          {
            sourceId: 'S-ONE',
            version: 2,
            locator: 'p1',
            quote: 'The fictional store has five boxes.',
          },
        ],
        initialFields: [],
        finalFields: [],
        humanEventRef: null,
      },
    ],
  };
}
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'knowledge-qualification-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bundle = join(directory, 'bundle.json'),
    run = join(directory, 'observations.json'),
    out = join(directory, 'result.tar');
  const original = JSON.stringify(example());
  writeFileSync(bundle, original);
  writeFileSync(run, JSON.stringify(observations()));
  return { directory, bundle, run, out, original };
}
function invoke(args) {
  return spawnSync(process.execPath, [command, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1048576,
    env: { PATH: process.env.PATH },
  });
}

export { example, observations, setup, invoke };
