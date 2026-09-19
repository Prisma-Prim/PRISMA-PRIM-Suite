import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('fresh Git checkout preserves LF even when autocrlf is enabled', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prisma-checkout-contract-'));
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'core.autocrlf=true', ...args], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git('init');
    await writeFile(
      join(directory, '.gitattributes'),
      await readFile(new URL('../.gitattributes', import.meta.url)),
    );
    await writeFile(join(directory, 'example.mjs'), 'first\nsecond\n');
    git('add', '.gitattributes', 'example.mjs');
    await unlink(join(directory, 'example.mjs'));
    git('checkout-index', '--all');
    assert.equal(
      await readFile(join(directory, 'example.mjs'), 'utf8'),
      'first\nsecond\n',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
