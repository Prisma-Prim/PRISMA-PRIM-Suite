import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const documentPath = new URL(
  '../docs/agents/measurement-evidence.md',
  import.meta.url,
);

function ustarText(path, name) {
  const bytes = readFileSync(path);
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const entryName = header
      .subarray(0, 100)
      .toString('ascii')
      .replace(/\0.*$/u, '');
    const size = Number.parseInt(
      header.subarray(124, 136).toString('ascii').replace(/\0.*$/u, '').trim(),
      8,
    );
    offset += 512;
    const body = bytes.subarray(offset, offset + size).toString('utf8');
    if (entryName === name) return body;
    offset += Math.ceil(size / 512) * 512;
  }
  return '';
}

test('the published pilot figure matches a fresh comparator run', () => {
  const document = readFileSync(documentPath, 'utf8');
  const directory = mkdtempSync(join(tmpdir(), 'measurement-evidence-'));
  const output = join(directory, 'result.tar');
  try {
    const child = spawnSync(
      process.execPath,
      [
        'scripts/pilot-evaluation.mjs',
        '--cases',
        'scripts/fixtures/pilot-evaluation/one.cases.json',
        '--runs',
        'scripts/fixtures/pilot-evaluation/one.runs.json',
        '--output',
        output,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.match(
      document,
      new RegExp(child.stdout.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    const report = ustarText(output, 'report.md');
    const time = report.split('\n').find((line) => line.startsWith('Time: '));
    assert.ok(time, 'the fresh report has a time line');
    assert.ok(document.includes(time), time);

    assert.match(document, /Revision: `[0-9a-f]{40}`/u);
    const blobs = [...document.matchAll(/Blob `([^`]+)`: `([0-9a-f]{40})`/gu)];
    assert.equal(blobs.length, 3);
    for (const [, path, blob] of blobs) {
      const now = execFileSync('git', ['rev-parse', `HEAD:${path}`], {
        encoding: 'utf8',
      }).trim();
      assert.equal(now, blob, path);
    }

    for (const phrase of [
      'actual measurement',
      'result on prepared examples',
      'unverified declared data',
      'estimate',
      'node scripts/pilot-evaluation.mjs',
      'node scripts/knowledge-qualification.mjs',
      'scripts/fixtures/pilot-evaluation/one.cases.json',
      'scripts/fixtures/pilot-evaluation/one.runs.json',
      'exit 0',
      'not a complete result',
      'full campaign',
      'routine change',
      'No model call judges a figure',
      'human assessment',
    ]) {
      assert.ok(document.includes(phrase), phrase);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
