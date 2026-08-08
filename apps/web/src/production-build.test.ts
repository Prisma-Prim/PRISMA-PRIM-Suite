// @vitest-environment node

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { build } from 'vite';

let outputDirectory: string | undefined;
const originalIdentityMode = process.env.VITE_ACCESS_IDENTITY_MODE;
const originalProvider = process.env.VITE_DEMO_EXTERNAL_PROVIDER;

afterEach(async () => {
  if (outputDirectory)
    await rm(outputDirectory, { force: true, recursive: true });
  restoreEnvironment('VITE_ACCESS_IDENTITY_MODE', originalIdentityMode);
  restoreEnvironment('VITE_DEMO_EXTERNAL_PROVIDER', originalProvider);
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

it('omits local-demo identity injection from a normal production build', async () => {
  outputDirectory = await mkdtemp(join(tmpdir(), 'prisma-prim-production-'));
  process.env.VITE_ACCESS_IDENTITY_MODE = 'local-demo';
  process.env.VITE_DEMO_EXTERNAL_PROVIDER = 'must-not-reach-production';

  await build({
    mode: 'production',
    build: { outDir: outputDirectory },
    logLevel: 'silent',
  });

  const assetNames = await readdir(join(outputDirectory, 'assets'));
  const javascript = await Promise.all(
    assetNames
      .filter((name) => name.endsWith('.js'))
      .map((name) => readFile(join(outputDirectory!, 'assets', name), 'utf8')),
  );
  const emittedApplication = javascript.join('\n');

  expect(emittedApplication).not.toContain('must-not-reach-production');
  expect(emittedApplication).not.toContain('x-test-external-provider');
});
