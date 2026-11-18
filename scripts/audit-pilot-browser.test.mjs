import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { preservePilotBrowserInstallation } from './audit-pilot/browser-environment.mjs';

const webRoot = fileURLToPath(new URL('../apps/web', import.meta.url));
function chromiumPath(environment) {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {chromium} from '@playwright/test';process.stdout.write(chromium.executablePath());",
    ],
    { cwd: webRoot, env: environment, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test(
  'the actual Playwright browser location survives the managed Linux cache replacement',
  { skip: process.platform !== 'linux' },
  async () => {
    const temporary = await mkdtemp(
      join(tmpdir(), 'audit-pilot-browser-cache-'),
    );
    try {
      const original = {
        ...process.env,
        XDG_CACHE_HOME: join(temporary, 'installed-cache'),
      };
      delete original.PLAYWRIGHT_BROWSERS_PATH;
      for (const explicit of [
        undefined,
        '0',
        join(temporary, 'explicit-browsers'),
        'relative-browser-cache',
      ]) {
        const environment = { ...original };
        if (explicit !== undefined)
          environment.PLAYWRIGHT_BROWSERS_PATH = explicit;
        const installed = chromiumPath(environment);
        const child = {
          ...preservePilotBrowserInstallation(environment),
          XDG_CACHE_HOME: join(temporary, 'managed-cache'),
        };
        assert.equal(chromiumPath(child), installed);
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
