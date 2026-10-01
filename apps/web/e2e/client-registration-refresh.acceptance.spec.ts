import { selectOption } from './select-option';
import { actorWithComparableDocumentPermissions } from '../src/test/equivalent-actor';
import {
  test,
  type ClientRegistrationDiagnostics,
} from './client-registration-diagnostics';
import {
  expect,
  type Locator,
  type Page,
  type Response,
  type Route,
} from '@playwright/test';

test('keeps a Client registration across an equivalent Company refresh through the real API and PostgreSQL', async ({
  page,
  clientDiagnostics,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const settledName = `Refresh-settled Client ${suffix}`;
  const retriedName = `Refresh-retried Client ${suffix}`;
  const created = 'Client created and linked to the active Company.';
  const commands: { key: string | undefined; body: string | null }[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/clients'
    )
      commands.push({
        key: request.headers()['idempotency-key'],
        body: request.postData(),
      });
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const expectedCompanyId = process.env.ACCEPTANCE_PRIMARY_COMPANY_ID;
  if (!expectedCompanyId)
    throw new Error('Missing the primary acceptance Company.');
  const initialActor = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/access/current-actor' &&
      response.request().method() === 'GET' &&
      response.request().headers()['x-company-context-id'] ===
        expectedCompanyId,
  );
  await page.goto('/');
  const company = page.getByLabel('Active Company', { exact: true });
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  // A previous test may leave another readable Company after failing. Select
  // this journey's Company before waiting for its Company-scoped actor.
  await selectOption(company, { label: 'PRISMA-PRIM' });
  await expect(company).toHaveText('PRISMA-PRIM');
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  const initialActorResponse = await initialActor;
  expect(initialActorResponse.status()).toBe(200);
  const expectedActor: unknown = await initialActorResponse.json();
  const companyId = initialActorResponse.request().headers()[
    'x-company-context-id'
  ];
  if (!companyId)
    throw new Error('Expected the initial active Company context.');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();

  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  const clients = page.locator('.client-workspace');
  await expect(company).toHaveText('PRISMA-PRIM');
  await navigate(page, navigation, 'Clients', narrow);
  await clients
    .getByRole('button', { name: 'New Client', exact: true })
    .click();

  const settled = await holdNextClientRegistration(
    page,
    'deliver',
    clientDiagnostics,
  );
  await clients.getByLabel('Client display name').fill(settledName);
  await clients
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  const settledReceipt = await settled.committed;
  expect(settledReceipt.status).toBe(201);
  await refreshActiveCompany({
    page,
    company,
    clients,
    narrow,
    companyId,
    expectedActor,
  });
  await expect(
    clients.getByRole('button', { name: 'Creating…' }),
  ).toBeDisabled();
  await expect(clients.getByLabel('Client display name')).toHaveValue(
    settledName,
  );
  settled.release();
  await expect(clients.getByText(created)).toBeVisible();
  await expect(
    clients.getByRole('heading', { name: settledName, exact: true }),
  ).toHaveCount(1);
  expect(commands).toHaveLength(1);

  const lost = await holdNextClientRegistration(
    page,
    'lose',
    clientDiagnostics,
  );
  await clients.getByLabel('Client display name').fill(retriedName);
  await clients
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  const committedReceipt = await lost.committed;
  expect(committedReceipt.status).toBe(201);
  await refreshActiveCompany({
    page,
    company,
    clients,
    narrow,
    companyId,
    expectedActor,
  });
  await expect(
    clients.getByRole('button', { name: 'Creating…' }),
  ).toBeDisabled();
  await expect(clients.getByLabel('Client display name')).toHaveValue(
    retriedName,
  );
  lost.release();
  await expect(
    clients.getByText(
      'The Client creation could not be confirmed. Retry the same details safely.',
    ),
  ).toBeVisible();
  const replay = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/clients',
  );
  await clients
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  expect(await receipt(await replay)).toEqual(committedReceipt);
  await expect(clients.getByText(created)).toBeVisible();
  await expect(
    clients.getByRole('heading', { name: retriedName, exact: true }),
  ).toHaveCount(1);
  expect(commands).toHaveLength(3);
  expect(commands[1]?.key).toEqual(expect.any(String));
  expect(commands[2]).toEqual(commands[1]);
  await page.screenshot({
    path: testInfo.outputPath(
      `client-registration-refresh-${narrow ? 'narrow' : 'desktop'}.png`,
    ),
    fullPage: true,
  });

  await page.goto('/#activity');
  const activityResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/activity-log' &&
      response.request().method() === 'GET',
  );
  await page.reload();
  const registrations = clientCreations(await (await activityResponse).json());
  expect(
    registrations.filter(({ displayName }) => displayName === settledName),
  ).toEqual([{ clientAccountId: settledReceipt.id, displayName: settledName }]);
  expect(
    registrations.filter(({ displayName }) => displayName === retriedName),
  ).toEqual([
    { clientAccountId: committedReceipt.id, displayName: retriedName },
  ]);
});

type ClientReceipt = { status: number; id: string };

type HeldRegistration = {
  readonly committed: Promise<ClientReceipt>;
  readonly release: () => void;
};

/**
 * Lets the next Client registration reach the real API and PostgreSQL, then
 * holds its response until released so an Access refresh can land first.
 */
async function holdNextClientRegistration(
  page: Page,
  delivery: 'deliver' | 'lose',
  diagnostics: ClientRegistrationDiagnostics,
): Promise<HeldRegistration> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let recordCommit: (receipt: ClientReceipt) => void = () => undefined;
  let failCommit: (error: unknown) => void = () => undefined;
  const committed = new Promise<ClientReceipt>((resolve, reject) => {
    recordCommit = resolve;
    failCommit = reject;
  });
  const clientCollection = (url: URL) => url.pathname === '/api/clients';
  let held = false;
  const handler = async (route: Route) => {
    if (held || route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    held = true;
    diagnostics.record({ delivery, phase: 'held' });
    try {
      const response = await route.fetch();
      const committedReceipt = await receipt(response);
      diagnostics.record({
        delivery,
        phase: 'committed',
        status: committedReceipt.status,
        clientId: committedReceipt.id,
      });
      recordCommit(committedReceipt);
      await released;
      if (delivery === 'lose') {
        await route.abort('connectionfailed');
        diagnostics.record({ delivery, phase: 'lost' });
      } else {
        await route.fulfill({ response });
        diagnostics.record({ delivery, phase: 'delivered' });
      }
    } catch (error: unknown) {
      diagnostics.record({ delivery, phase: 'handler-failed' });
      failCommit(error);
      throw error;
    } finally {
      diagnostics.record({ delivery, phase: 'unroute-start' });
      await page.unroute(clientCollection, handler);
      diagnostics.record({ delivery, phase: 'unroute-finished' });
    }
  };
  await page.route(clientCollection, handler);
  return {
    committed,
    release: () => {
      diagnostics.record({ delivery, phase: 'released' });
      release();
    },
  };
}

async function refreshActiveCompany({
  page,
  company,
  clients,
  narrow,
  companyId,
  expectedActor,
}: {
  page: Page;
  company: Locator;
  clients: Locator;
  narrow: boolean;
  companyId: string;
  expectedActor: unknown;
}): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(company).toHaveText('PRISMA-PRIM');
  // Re-selecting the committed value is a no-op; it must not refresh Access.
  await selectOption(company, { label: 'PRISMA-PRIM' });
  await expect(company).toBeEnabled();
  await expect(company).toHaveText('PRISMA-PRIM');
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();

  // Inject only the search refusal. The existing public recovery path performs
  // the actor and Activity Log reads against the real API, with unchanged rights.
  // This fault injection is not evidence of a server authorization denial.
  await page.route(
    (url) => url.pathname === '/api/clients/search',
    (route) => route.fulfill({ status: 403, json: { message: 'Forbidden' } }),
    { times: 1 },
  );
  const search = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/clients/search' &&
      response.request().method() === 'GET',
  );
  const confirmation = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/access/current-actor' &&
      response.request().method() === 'GET',
  );
  const activity = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/activity-log' &&
      response.request().method() === 'GET',
  );
  await clients.getByLabel('Find a shared Client').fill('Refresh');
  await clients
    .getByRole('button', { name: 'Search Clients', exact: true })
    .click();
  expect((await search).status()).toBe(403);
  const refreshedActor = await confirmation;
  expect(refreshedActor.status()).toBe(200);
  expect(refreshedActor.request().headers()['x-company-context-id']).toBe(
    companyId,
  );
  const actualActor: unknown = await refreshedActor.json();
  expect(actorWithComparableDocumentPermissions(actualActor)).toEqual(
    actorWithComparableDocumentPermissions(expectedActor),
  );
  expect((await activity).status()).toBe(200);
  // The enabled Search action proves the recovery callback has finished before
  // the held registration is released; observing the HTTP reply alone does not.
  await expect(
    clients.getByRole('button', { name: 'Search Clients', exact: true }),
  ).toBeEnabled();
  await expect(
    clients.getByText('You do not have permission to manage Clients.', {
      exact: true,
    }),
  ).toBeVisible();
  await clients
    .getByRole('button', { name: 'Back to Company Clients', exact: true })
    .click();
}

async function receipt(
  response: Pick<Response, 'status' | 'json'>,
): Promise<ClientReceipt> {
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string'
  )
    throw new Error('Expected a Client registration receipt with an id.');
  return { status: response.status(), id: value.id };
}

function clientCreations(
  value: unknown,
): { clientAccountId: string; displayName: string }[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('events' in value) ||
    !Array.isArray(value.events)
  )
    throw new Error('Expected an Activity Log response.');
  return value.events.flatMap((event: unknown) => {
    if (
      typeof event !== 'object' ||
      event === null ||
      !('action' in event) ||
      event.action !== 'client.created'
    )
      return [];
    if (
      !('target' in event) ||
      typeof event.target !== 'object' ||
      event.target === null ||
      !('clientAccountId' in event.target) ||
      typeof event.target.clientAccountId !== 'string' ||
      !('displayName' in event.target) ||
      typeof event.target.displayName !== 'string'
    )
      throw new Error('Expected a complete Client creation event.');
    return [
      {
        clientAccountId: event.target.clientAccountId,
        displayName: event.target.displayName,
      },
    ];
  });
}

async function navigate(
  page: Page,
  navigation: Locator,
  label: string,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await navigation.getByRole('link', { name: label, exact: true }).click();
}
