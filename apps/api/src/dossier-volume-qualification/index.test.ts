import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { scoreLiterals, qualifyBatch } from './index.js';
import { preparedInputs, repeatPrepared } from './fixtures.js';
import { loadPrivateInputs } from './private-input.js';
import { parseArguments } from './main.js';

it('counts independent literal expectations as a multiset, with explicit false positives and negatives', () => {
  expect(scoreLiterals(['a', 'a', 'b'], ['a', 'b', 'c', 'c'])).toEqual({
    expected: 3,
    observed: 4,
    matched: 2,
    falsePositive: 2,
    falseNegative: 1,
    precision: 0.5,
    recall: 2 / 3,
  });
  expect(scoreLiterals([], []).recall).toBeNull();
});

it('extracts real bilingual spatial PDFs and merged/nested DOCX with equivalent literal results at both concurrency settings', async () => {
  const inputs = await preparedInputs();
  const again = await preparedInputs();
  const hashes = (values: typeof inputs) =>
    values.map((v) => createHash('sha256').update(v.bytes).digest('hex'));
  expect(hashes(inputs)).toEqual(hashes(again));
  const serial = await qualifyBatch({
    inputs,
    concurrency: 1,
    mode: 'prepared',
  });
  const parallel = await qualifyBatch({
    inputs,
    concurrency: 2,
    mode: 'prepared',
  });
  expect(serial.status).toBe('completed');
  expect(serial.accounting).toMatchObject({
    planned: 6,
    admitted: 6,
    completed: 6,
    notAdmitted: 0,
    failed: 0,
    partial: 3,
    unreadable: 1,
  });
  expect(serial.observations.map((o) => o.prepared?.resultSha256)).toEqual(
    parallel.observations.map((o) => o.prepared?.resultSha256),
  );
  expect(serial.observations.every((o) => o.quality?.stateMatched)).toBe(true);
  // Literal spatial table oracle, independent of parser output or successful exit.
  expect(serial.observations[0]?.quality).toEqual({
    stateMatched: true,
    passages: scoreLiterals(['x'], ['x']),
    candidates: scoreLiterals(['a', 'b', 'c'], ['a', 'b', 'c']),
  });
  expect(hashes(inputs)).toEqual(hashes(again));
  expect(repeatPrepared(inputs, 'medium')).toHaveLength(24);
  expect(repeatPrepared(inputs, 'large')).toHaveLength(60);
}, 20_000);

it('keeps interruption explicit, drains admitted bounded work, and restarts the exact unchanged sources', async () => {
  const inputs = await preparedInputs();
  const interrupted = await qualifyBatch({
    inputs,
    concurrency: 2,
    mode: 'prepared',
    stopAfter: 1,
  });
  expect(interrupted.status).toBe('interrupted');
  expect(interrupted.stopReason).toBe('completion_threshold');
  expect(interrupted.accounting.completed).toBe(
    interrupted.accounting.admitted,
  );
  expect(interrupted.accounting.completed).toBeLessThan(inputs.length);
  expect(
    interrupted.accounting.notAdmitted + interrupted.accounting.completed,
  ).toBe(inputs.length);
  const restarted = await qualifyBatch({
    inputs,
    concurrency: 1,
    mode: 'prepared',
  });
  for (const observation of interrupted.observations)
    expect(observation.prepared).toEqual(
      restarted.observations[observation.ordinal]?.prepared,
    );
  const controller = new AbortController();
  controller.abort();
  const cancelled = await qualifyBatch({
    inputs,
    concurrency: 1,
    mode: 'prepared',
    signal: controller.signal,
  });
  expect(cancelled).toMatchObject({
    status: 'interrupted',
    stopReason: 'signal',
    accounting: { admitted: 0, completed: 0, notAdmitted: 6 },
  });
}, 20_000);

it('admits a hashed local corpus but exports no private names, paths, text or source fingerprints', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fictional-private-volume-'));
  try {
    const input = (await preparedInputs())[3];
    if (!input) throw new Error('Missing prepared Word input');
    const path = 'SECRET-SOURCE.docx';
    await writeFile(join(root, path), input.bytes);
    const manifest = {
      version: 'dossier-volume-input/v1',
      files: [
        {
          path,
          kind: 'docx',
          language: 'ro',
          sha256: createHash('sha256').update(input.bytes).digest('hex'),
        },
      ],
    };
    const writeManifest = () =>
      writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    await writeManifest();
    const loaded = await loadPrivateInputs(root);
    const report = await qualifyBatch({
      inputs: loaded,
      concurrency: 1,
      mode: 'private',
    });
    expect(report.accounting.completed).toBe(1);
    expect(report.observations[0]).toMatchObject({
      prepared: null,
      quality: null,
    });
    const output = JSON.stringify(report);
    for (const privateValue of [
      root,
      path,
      manifest.files[0]?.sha256,
      'Știință',
      '00042',
      'header',
      'credential',
    ])
      if (privateValue) expect(output).not.toContain(privateValue);
    expect(await readFile(join(root, path))).toEqual(Buffer.from(input.bytes));
    manifest.files[0].path = '../SECRET-SOURCE.docx';
    await writeManifest();
    await expect(loadPrivateInputs(root)).rejects.toThrow(
      /^invalid_private_input$/u,
    );
    manifest.files[0].path = 'link.docx';
    await symlink(join(root, path), join(root, 'link.docx'));
    await writeManifest();
    await expect(loadPrivateInputs(root)).rejects.toThrow(
      /^invalid_private_input$/u,
    );
    manifest.files[0].path = path;
    manifest.files[0].sha256 = '0'.repeat(64);
    await writeManifest();
    await expect(loadPrivateInputs(root)).rejects.toThrow(
      /^invalid_private_input$/u,
    );
    await writeFile(join(root, 'manifest.json'), '{"files":"SECRET"}');
    await expect(loadPrivateInputs(root)).rejects.toThrow(
      /^invalid_private_input$/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('refuses ambiguous, duplicated and unbounded CLI inputs without echoing private arguments', () => {
  expect(parseArguments(['--prepared', 'small', '--concurrency', '2'])).toEqual(
    {
      mode: { kind: 'prepared', size: 'small' },
      concurrency: 2,
      stopAfter: undefined,
    },
  );
  for (const args of [
    [],
    ['--prepared', 'huge'],
    ['--corpus', 'SECRET', '--prepared', 'small'],
    ['--concurrency', '99'],
    ['--corpus', 'SECRET', '--corpus', 'SECRET'],
    ['--corpus'],
    ['--prepared', 'small', '--unknown', 'SECRET'],
  ])
    expect(() => parseArguments(args)).toThrow(/^invalid_private_input$/u);
});

it('rejects special private source and manifest files without waiting for a FIFO writer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fictional-private-fifo-'));
  try {
    execFileSync('mkfifo', [join(root, 'source.pdf')]);
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({
        version: 'dossier-volume-input/v1',
        files: [
          {
            path: 'source.pdf',
            kind: 'pdf',
            language: 'ru',
            sha256: '0'.repeat(64),
          },
        ],
      }),
    );
    await expect(loadPrivateInputs(root)).rejects.toThrow(
      /^invalid_private_input$/u,
    );
    await rm(join(root, 'manifest.json'));
    execFileSync('mkfifo', [join(root, 'manifest.json')]);
    await expect(loadPrivateInputs(root)).rejects.toThrow(
      /^invalid_private_input$/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
