import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';

const companyId = '22222222-2222-4222-8222-222222222222';
const firstClientId = '33333333-3333-4333-8333-333333333331';
const secondClientId = '33333333-3333-4333-8333-333333333332';

const resolverActor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: companyId,
    displayName: 'PRISMA-PRIM',
    clientPermissions: [
      'client.read',
      'client.create',
      'client.update',
      'client.duplicate.resolve',
    ],
    clientPermissionAssignmentId: '44444444-4444-4444-8444-444444444444',
    clientPermissionSetVersion: 'v2',
  },
};

test('unites two existing dossiers and reverses the union from the Client workspace', async ({
  page,
}, testInfo) => {
  let united = false;
  const projections: Array<Record<string, unknown>> = [];

  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: resolverActor }),
  );
  await page.route('**/api/companies', (route) =>
    route.fulfill({
      json: [{ id: companyId, displayName: 'PRISMA-PRIM' }],
    }),
  );
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [], clientUnionOperations: projections } }),
  );
  await page.route('**/api/client-duplicate-reviews?*', (route) =>
    route.fulfill({ json: { items: [], next_cursor: null } }),
  );
  await page.route('**/api/clients', (route) =>
    route.fulfill({
      json: united
        ? [listed(firstClientId, 'Exemplu SRL')]
        : [
            listed(firstClientId, 'Exemplu SRL'),
            listed(secondClientId, 'EXEMPLU S.R.L.'),
          ],
    }),
  );
  await page.route('**/api/client-union-comparisons', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      clientAccountIds: [firstClientId, secondClientId],
    });
    return route.fulfill({ status: 201, json: comparison() });
  });
  await page.route('**/api/client-unions', (route) => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    expect(request.headers()['idempotency-key']).toBeTruthy();
    expect(request.postDataJSON()).toMatchObject({
      canonicalClientAccountId: firstClientId,
      fieldSelections: { displayName: firstClientId },
      confirmedCompanyIds: [companyId],
      reason: 'Same registered tax identifier and the same legal address.',
    });
    united = true;
    projections.push(projection('client.union_confirmed', 1));
    return route.fulfill({ status: 201, json: operation('confirmed') });
  });
  await page.route('**/api/client-unions/*/reversal', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      reason: 'The dossiers are distinct branches after verification.',
    });
    united = false;
    projections.push(projection('client.union_reversed', 2));
    return route.fulfill({ status: 201, json: operation('reversed') });
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Unite two existing Client dossiers' }),
  ).toBeVisible();

  await page
    .getByLabel('Client 1 to compare')
    .selectOption({ label: 'Exemplu SRL' });
  await page
    .getByLabel('Client 2 to compare')
    .selectOption({ label: 'EXEMPLU S.R.L.' });
  await page.getByRole('button', { name: 'Compare dossiers' }).click();

  await expect(
    page.getByRole('heading', { name: 'Review both dossiers before uniting' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `client-union-comparison-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  await page.getByLabel('Keep the Client display name of Exemplu SRL').check();
  await page.getByLabel('PRISMA-PRIM', { exact: true }).check();
  await page
    .getByLabel('Written reason for the union')
    .fill('Same registered tax identifier and the same legal address.');
  await page.getByRole('button', { name: 'Confirm union' }).click();

  await expect(
    page.getByText(
      'The dossiers are united. Both originals remain preserved and the union is reversible.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Authorized resolver united two Client dossiers'),
  ).toBeVisible();

  await page
    .getByLabel('Written reason for the reversal')
    .fill('The dossiers are distinct branches after verification.');
  await page.getByRole('button', { name: 'Reverse union' }).click();

  await expect(
    page.getByText(
      'The union is reversed. Both original dossiers are readable again.',
    ),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `client-union-reversed-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

function listed(id: string, displayName: string) {
  return { id, displayName, relatedToActiveCompany: true };
}

function comparison() {
  return {
    outcome: 'comparison',
    comparison_reference: '55555555-5555-4555-8555-555555555555',
    normalizedIdentifier: '1010101010101',
    clients: [
      comparedDossier(firstClientId, 'Exemplu SRL', 'Ana Pop'),
      comparedDossier(secondClientId, 'EXEMPLU S.R.L.', 'Ion Rusu'),
    ],
    affectedCompanies: [{ id: companyId, displayName: 'PRISMA-PRIM' }],
    differingFields: ['displayName'],
  };
}

function comparedDossier(id: string, displayName: string, contact: string) {
  return {
    id,
    displayName,
    taxId: '1010101010101',
    address: 'Chisinau',
    telephone: null,
    generalEmail: null,
    businessActivity: null,
    contacts: [{ name: contact }],
    version: 1,
    relatedToActiveCompany: true,
    involvedCompanyDisplayNames: ['PRISMA-PRIM'],
    unitedWithClientAccountId: null,
    contactSources: [{ clientAccountId: id, index: 0 }],
  };
}

function operation(status: 'confirmed' | 'reversed') {
  return {
    unionOperationId: '66666666-6666-4666-8666-666666666666',
    status,
    canonicalClientAccountId: firstClientId,
    supersededClientAccountId: secondClientId,
    normalizedIdentifier: '1010101010101',
    affectedCompanyIds: [companyId],
    unionReason: 'Same registered tax identifier and the same legal address.',
    reversalReason:
      status === 'reversed'
        ? 'The dossiers are distinct branches after verification.'
        : null,
    confirmedAt: '2026-09-12T10:00:00.000Z',
    confirmedByInternalUserId: resolverActor.internalUserId,
    reversedAt: status === 'reversed' ? '2026-09-12T10:05:00.000Z' : null,
    reversedByInternalUserId:
      status === 'reversed' ? resolverActor.internalUserId : null,
    snapshots: [
      {
        clientAccountId: firstClientId,
        role: 'canonical',
        version: 1,
        displayName: 'Exemplu SRL',
        taxId: '1010101010101',
        address: 'Chisinau',
        telephone: null,
        generalEmail: null,
        contacts: [{ name: 'Ana Pop' }],
        businessActivity: null,
      },
      {
        clientAccountId: secondClientId,
        role: 'superseded',
        version: 1,
        displayName: 'EXEMPLU S.R.L.',
        taxId: '1010101010101',
        address: 'Chisinau',
        telephone: null,
        generalEmail: null,
        contacts: [{ name: 'Ion Rusu' }],
        businessActivity: null,
      },
    ],
  };
}

function projection(
  action: 'client.union_confirmed' | 'client.union_reversed',
  companyLocalPosition: number,
) {
  return {
    targetType: 'client_union_operation',
    action,
    projectionReference: `77777777-7777-4777-8777-77777777777${companyLocalPosition}`,
    companyId,
    actor: 'authorized-resolver',
    companyLocalPosition,
  };
}
