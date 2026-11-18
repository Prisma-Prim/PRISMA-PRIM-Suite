import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import { createSystemAdapter } from '../../../scripts/managed-postgres.mjs';
import { parseAuditPilotArguments } from '../../../scripts/audit-pilot/protocol.mjs';
import { assertLocalTestDatabaseUrl } from '../../api/test-support/postgres-database-target.mjs';
import { startOperationalAcceptance } from './operational-foundation.global-setup.mjs';
import { createAuditPilotSession } from './audit-pilot-session.mjs';
import { chromium } from '@playwright/test';

const { AbortController, fetch } = globalThis;
const options = parseAuditPilotArguments(process.argv.slice(2));
const stop = new AbortController();
const interrupt = () => stop.abort();
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
let teardown;
let session;
let browser;
let stage = 'database target';
const actorPaths = [];
try {
  assertLocalTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const environment = { ...process.env };
  for (const key of Object.keys(environment))
    if (key.startsWith('VITE_')) delete environment[key];
  Object.assign(environment, {
    VITE_API_URL: '/api',
    VITE_CLERK_PUBLISHABLE_KEY: '',
    VITE_ACCESS_IDENTITY_MODE: 'local-demo',
    VITE_DEMO_EXTERNAL_PROVIDER: 'local-demo',
    VITE_DEMO_EXTERNAL_SUBJECT: 'local-demonstration-user',
    VITE_DEMO_DISPLAY_NAME: 'Ada Ionescu',
    VITE_DEMO_EMAIL: 'ada@example.test',
  });
  const adapter = createSystemAdapter();
  stage = 'native application builds';
  for (const args of [
    ['--filter', '@prisma-prim/api', 'build'],
    ['--filter', '@prisma-prim/web', 'build', '--mode', 'local-demo'],
  ]) {
    const result = await adapter.run('pnpm', args, {
      env: environment,
      signal: stop.signal,
      stdio: 'inherit',
      timeoutMilliseconds: 180_000,
    });
    if (result.status !== 0) throw new Error('Pilot build failed.');
  }
  stop.signal.throwIfAborted();
  stage = 'isolated native setup';
  teardown = await startOperationalAcceptance({ dossierHarnessEnabled: false });
  stop.signal.throwIfAborted();
  stage = 'fictional dossier and guide';
  session = await createAuditPilotSession();
  stop.signal.throwIfAborted();
  const guideUrl = `${session.origin}/__pilot`;
  const response = await fetch(guideUrl, { signal: stop.signal });
  if (response.status !== 200) throw new Error('Pilot guide readiness failed.');
  stage = 'disabled external account connection';
  const connection = await fetch(
    `${session.origin}/api/projects/${session.manifest.projectId}/dossier-analysis/harness/connect`,
    { method: 'POST', signal: stop.signal },
  );
  if (
    connection.status !== 503 ||
    (await connection.json()).code !== 'configuration_required'
  )
    throw new Error(
      'External account connection must remain disabled in this pilot.',
    );
  if (options.action === 'check') {
    stage = 'actual application readiness';
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.includes('/access/current-actor') && actorPaths.length < 8)
        actorPaths.push(path);
    });
    const actor = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/access/current-actor',
      { timeout: 15_000 },
    );
    await page.goto(session.origin);
    const reply = await actor;
    if (
      reply.status() !== 200 ||
      typeof (await reply.json()).workspaceMembershipId !== 'string'
    )
      throw new Error('Pilot native Actor readiness failed.');
    await page
      .locator('.production-body')
      .waitFor({ state: 'visible', timeout: 15_000 });
    await browser.close();
    browser = undefined;
  }
  const report = {
    schema: session.manifest.schema,
    status: 'ready',
    classification: session.manifest.classification,
    guideUrl,
    manifestUrl: `${session.origin}/__pilot/manifest`,
    caseId: session.manifest.caseId,
  };
  if (process.env.PRISMA_AUDIT_PILOT_READY_FILE)
    await writeFile(
      process.env.PRISMA_AUDIT_PILOT_READY_FILE,
      JSON.stringify(report),
      { flag: 'wx', mode: 0o600 },
    );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (options.action !== 'check')
    await new Promise((resolve) => {
      if (stop.signal.aborted) resolve();
      else stop.signal.addEventListener('abort', resolve, { once: true });
    });
  process.exitCode = stop.signal.aborted ? 130 : 0;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ schema: 'prisma-prim-local-audit-pilot-startup/v1', status: 'failed', stage, error: error instanceof Error ? error.name : 'unknown', actorPaths })}\n`,
  );
  process.stderr.write(
    'Fictional audit pilot could not complete its bounded native startup.\n',
  );
  process.exitCode = stop.signal.aborted ? 130 : 1;
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await session?.close();
    } finally {
      await teardown?.();
    }
  }
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
