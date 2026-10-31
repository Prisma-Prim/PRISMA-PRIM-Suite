import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('complete declared one-case evaluation produces the v2 owned regular USTAR outcome', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pilot-v2-red-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of ['cases', 'runs'])
    copyFileSync(
      new URL(`fixtures/pilot-evaluation/one.${name}.json`, import.meta.url),
      join(directory, `${name}.json`),
    );
  const target = join(directory, 'result.tar');
  const child = spawnSync(
    process.execPath,
    [
      'scripts/pilot-evaluation.mjs',
      '--cases',
      join(directory, 'cases.json'),
      '--runs',
      join(directory, 'runs.json'),
      '--output',
      target,
    ],
    { encoding: 'utf8', env: { PATH: process.env.PATH } },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(
    lstatSync(target).isFile(),
    true,
    'the completed output must be one regular file',
  );
  assert.equal(
    child.stdout,
    '{"schema":"prisma-prim-pilot-receipt/v2","dataKind":"synthetic","measurementBasis":"declared_inputs_unverified","format":"ustar","entries":["result.json","report.md"]}\n',
  );
});

import './pilot-evaluation-tests/oracles.mjs';
import './pilot-evaluation-tests/schemas.mjs';
import './pilot-evaluation-tests/metrics.mjs';
import './pilot-evaluation-tests/provenance.mjs';
import './pilot-evaluation-tests/files.mjs';
import './pilot-evaluation-tests/container.mjs';
