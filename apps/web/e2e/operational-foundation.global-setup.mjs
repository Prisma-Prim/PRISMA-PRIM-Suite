import { startDocumentAcceptanceScanner } from './document-content-scanner.mjs';
/* global URL, fetch, process */

import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const apiPort = 4174;
const workspaceId = '00000000-0000-4000-8000-000000000281';
const administratorIdentity = {
  provider: 'local-demo',
  subject: 'workspace-owner',
  displayName: 'Workspace Owner',
  email: 'owner@example.test',
};
const primaryIdentity = {
  provider: 'local-demo',
  subject: 'local-demonstration-user',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
};
const otherCompanyIdentity = {
  provider: 'local-demo',
  subject: 'other-company-member',
  displayName: 'Other Company Member',
  email: 'other-company-member@example.test',
};
// Eligible to be a Project's responsible member, never a Task assignee.
const responsibleColleagueIdentity = {
  provider: 'local-demo',
  subject: 'responsible-colleague',
  displayName: 'Ion Popa',
  email: 'ion@example.test',
};

export default async function globalSetup() {
  const baseDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!baseDatabaseUrl)
    throw new Error(
      'TEST_DATABASE_URL is required for the operational acceptance journey.',
    );

  const [{ createIsolatedPostgresTestDatabase }, harnessModule] =
    await Promise.all([
      import('../../api/dist/database/isolated-postgres-test-database.js'),
      import('../../api/dist/database/postgres-rest-test-harness.js'),
    ]);
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl,
    namePrefix: 'operational_acceptance',
  });
  const clockDirectory = await mkdtemp(
    join(tmpdir(), 'prisma-acceptance-clock-'),
  );
  if (
    dirname(clockDirectory) !== resolve(tmpdir()) ||
    !basename(clockDirectory).startsWith('prisma-acceptance-clock-')
  )
    throw new Error(
      'Synthetic clock directory must stay inside the temporary directory.',
    );
  const clockFile = join(clockDirectory, 'offset.json');
  await writeFile(clockFile, '0');
  process.env.ACCEPTANCE_CLOCK_OFFSET_FILE = clockFile;
  const serverClock = {
    now: () => {
      const offset = JSON.parse(readFileSync(clockFile, 'utf8'));
      if (typeof offset !== 'number' || !Number.isSafeInteger(offset))
        throw new Error('Invalid synthetic acceptance clock offset');
      return new Date(Date.now() + offset);
    },
  };
  let harness;
  let documentScanner;
  try {
    documentScanner = await startDocumentAcceptanceScanner();
    harness = await harnessModule.createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        DOCUMENT_MALWARE_SCANNER_HOST: documentScanner.host,
        DOCUMENT_MALWARE_SCANNER_PORT: documentScanner.port,
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: administratorIdentity.provider,
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: administratorIdentity.subject,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Operational Acceptance Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: primaryIdentity.provider,
            subject: primaryIdentity.subject,
            workspaceId,
          },
          {
            provider: otherCompanyIdentity.provider,
            subject: otherCompanyIdentity.subject,
            workspaceId,
          },
          {
            provider: responsibleColleagueIdentity.provider,
            subject: responsibleColleagueIdentity.subject,
            workspaceId,
          },
        ]),
      },
      listenPort: apiPort,
      migrationsFolder: fileURLToPath(
        new URL('../../api/drizzle', import.meta.url),
      ),
    });
    await seedAccessFixture(harness.origin);
  } catch (error) {
    await Promise.allSettled([
      Promise.resolve().then(() => harness?.close()),
      Promise.resolve().then(() => documentScanner?.close()),
      Promise.resolve().then(() => database.close()),
      Promise.resolve().then(() =>
        rm(clockDirectory, { recursive: true, force: true }),
      ),
    ]);
    throw error;
  }

  return async () => {
    try {
      await harness.close();
    } finally {
      try {
        await documentScanner.close();
      } finally {
        try {
          await database.close();
        } finally {
          await rm(clockDirectory, { recursive: true, force: true });
        }
      }
    }
  };
}

async function seedAccessFixture(origin) {
  await readActor(origin, administratorIdentity);
  const primaryActor = await readActor(origin, primaryIdentity);
  const primaryCompany = await command(
    origin,
    administratorIdentity,
    '/companies',
    { displayName: 'PRISMA-PRIM' },
    'fixture-primary-company',
  );
  const otherCompany = await command(
    origin,
    administratorIdentity,
    '/companies',
    { displayName: 'BIC' },
    'fixture-other-company',
  );
  const primaryCompanyId = stringProperty(primaryCompany, 'id');
  const otherCompanyId = stringProperty(otherCompany, 'id');
  const primaryMembershipId = stringProperty(
    primaryActor,
    'workspaceMembershipId',
  );

  for (const route of [
    '/company-context-assignments',
    '/company-director-client-assignments',
    '/company-project-assignments',
    '/company-task-manager-assignments',
    '/company-document-registrar-assignments',
    '/company-document-project-organizer-assignments',
    '/company-commercial-intake-assignments',
    '/company-service-catalogue-assignments',
  ]) {
    await command(
      origin,
      administratorIdentity,
      route,
      {
        workspaceMembershipId: primaryMembershipId,
        companyId: primaryCompanyId,
      },
      `fixture-primary-${route.slice(1)}`,
    );
  }

  const colleagueActor = await readActor(origin, responsibleColleagueIdentity);
  for (const route of [
    '/company-context-assignments',
    '/company-director-client-assignments',
    '/company-project-assignments',
  ]) {
    await command(
      origin,
      administratorIdentity,
      route,
      {
        workspaceMembershipId: stringProperty(
          colleagueActor,
          'workspaceMembershipId',
        ),
        companyId: primaryCompanyId,
      },
      `fixture-colleague-${route.slice(1)}`,
    );
  }

  const otherActor = await readActor(origin, otherCompanyIdentity);
  const otherMembershipId = stringProperty(otherActor, 'workspaceMembershipId');
  for (const route of [
    '/company-context-assignments',
    '/company-director-client-assignments',
    '/company-project-assignments',
  ]) {
    await command(
      origin,
      administratorIdentity,
      route,
      {
        workspaceMembershipId: otherMembershipId,
        companyId: otherCompanyId,
      },
      `fixture-other-${route.slice(1)}`,
    );
  }

  const otherClient = await command(
    origin,
    otherCompanyIdentity,
    '/clients',
    { displayName: 'Other Company Confidential Client' },
    'fixture-other-client',
    otherCompanyId,
  );
  const otherProject = await command(
    origin,
    otherCompanyIdentity,
    '/projects',
    {
      title: 'Other Company Confidential Project',
      clientAccountId: stringProperty(otherClient, 'id'),
    },
    'fixture-other-project',
    otherCompanyId,
  );
  process.env.ACCEPTANCE_OTHER_CLIENT_ID = stringProperty(otherClient, 'id');
  process.env.ACCEPTANCE_OTHER_PROJECT_ID = stringProperty(otherProject, 'id');
  process.env.ACCEPTANCE_OTHER_COMPANY_ID = otherCompanyId;
  process.env.ACCEPTANCE_PRIMARY_COMPANY_ID = primaryCompanyId;
  process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID = primaryMembershipId;
}

async function readActor(origin, identity) {
  const response = await fetch(`${origin}/api/access/current-actor`, {
    headers: identityHeaders(identity),
  });
  return responseBody(response, 200);
}

async function command(
  origin,
  identity,
  requestPath,
  body,
  idempotencyKey,
  companyId,
) {
  const response = await fetch(`${origin}/api${requestPath}`, {
    method: 'POST',
    headers: {
      ...identityHeaders(identity),
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
      ...(companyId ? { 'x-company-context-id': companyId } : {}),
    },
    body: JSON.stringify(body),
  });
  return responseBody(response, 201);
}

function identityHeaders(identity) {
  return {
    'x-test-external-provider': identity.provider,
    'x-test-external-subject': identity.subject,
    'x-test-display-name': identity.displayName,
    'x-test-email': identity.email,
  };
}

async function responseBody(response, expectedStatus) {
  const value = await response.json();
  if (response.status !== expectedStatus)
    throw new Error(
      `Fixture request failed with status ${response.status}: ${JSON.stringify(value)}`,
    );
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Fixture response must be an object.');
  return value;
}

function stringProperty(value, property) {
  const result = value[property];
  if (typeof result !== 'string')
    throw new Error(`Fixture response property ${property} must be a string.`);
  return result;
}
