import { enterClassicCompatibility } from './classic-compatibility';
import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import {
  captureUnion,
  companyA,
  companyB,
  first,
  firstId,
  navigateUnion,
  second,
  secondId,
  unionPanel,
} from './prisme-client-union.fixture';

test('retries an uncertain reversal explicitly from fresh Prisme history', async ({
  page,
}, testInfo) => {
  const projectionReference = '24800000-0000-4000-8000-000000000001';
  const actor: ActorContext = {
    ...actorContextFixture,
    workspacePermissions: ['client.manage'],
    activeCompany: {
      ...companyA,
      clientPermissions: [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
      clientPermissionAssignmentId: '24800000-0000-4000-8000-000000000002',
      clientPermissionSetVersion: 'v2',
    },
  };
  const reversalCommands: {
    body: string | null;
    key: string | undefined;
    company: string | undefined;
  }[] = [];
  const state = {
    activityReads: 0,
    clientReads: 0,
    reversalCommands,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actor });
    if (path.endsWith('/companies'))
      return route.fulfill({ json: [companyA, companyB] });
    if (path.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(companyA.id, { active_clients: 1 }),
      });
    if (path.endsWith('/activity-log')) {
      state.activityReads++;
      return route.fulfill({ json: { events: [] } });
    }
    if (path.endsWith('/client-duplicate-reviews'))
      return route.fulfill({ json: { items: [], next_cursor: null } });
    if (path.endsWith('/client-union-sources'))
      return route.fulfill({
        json: [{ id: secondId, displayName: second.displayName }],
      });
    if (path.endsWith(`/clients/${secondId}/union-history`))
      return route.fulfill({
        json: {
          events: [
            {
              action: 'client.union_confirmed',
              projectionReference,
              companyId: companyA.id,
            },
          ],
          detailReferences: [projectionReference],
        },
      });
    if (
      path.endsWith(`/client-union-operations/${projectionReference}/reversal`)
    ) {
      state.reversalCommands.push({
        body: request.postData(),
        key: request.headers()['idempotency-key'],
        company: request.headers()['x-company-context-id'],
      });
      if (state.reversalCommands.length === 1)
        return route.fulfill({ status: 503 });
      return route.fulfill({
        status: 201,
        json: { outcome: 'reversed', clientIds: [firstId, secondId] },
      });
    }
    if (path.endsWith(`/client-union-operations/${projectionReference}`))
      return route.fulfill({
        json: {
          state: 'united',
          operationId: 'never-presented-operation-id',
          projectionReference,
          canonicalClientId: firstId,
          originals: [first, second],
          companies: [companyA, companyB],
          reason: 'Same verified legal identity.',
          occurredAt: '2026-09-12T12:00:00.000Z',
          actor: {
            internalUserId: actor.internalUserId,
            displayName: actor.displayName,
          },
          identityBasis: {
            kind: 'exact_tax_identifier',
            identifier: 'must-not-be-presented',
          },
          contactSources: [{ source: 'must-not-be-presented' }],
          reversal: null,
          canReverse: true,
        },
      });
    if (path.endsWith('/clients')) {
      state.clientReads++;
      return route.fulfill({
        json: [first].map((client) => ({
          id: client.id,
          displayName: client.displayName,
          relatedToActiveCompany: true,
        })),
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#clients');
  const union = unionPanel(page);
  await expect(
    union.getByRole('button', { name: 'Review existing duplicates' }),
  ).toHaveCount(0);
  await union
    .getByRole('button', { name: 'Superseded Client history' })
    .click();
  await expect(
    union.getByRole('button', { name: second.displayName, exact: true }),
  ).toBeVisible();
  await captureUnion(page, testInfo, 'union-superseded-sources');
  await union
    .getByRole('button', { name: second.displayName, exact: true })
    .click();
  await expect(
    union.getByText('Authorized resolver confirmed a Client union'),
  ).toBeVisible();
  await captureUnion(page, testInfo, 'union-history-redacted');
  await union
    .getByRole('button', { name: 'View authorized union details' })
    .click();
  await expect(
    union.getByRole('heading', { name: 'Attributable union history' }),
  ).toBeVisible();
  await expect(union.getByText('United', { exact: true })).toBeVisible();
  await expect(
    union.getByRole('heading', {
      name: `Source 1 · ${first.displayName}`,
    }),
  ).toBeVisible();
  await expect(
    union.getByRole('heading', {
      name: `Source 2 · ${second.displayName}`,
    }),
  ).toBeVisible();
  await expect(
    union.getByText(companyA.displayName, { exact: true }),
  ).toBeVisible();
  await expect(
    union.getByText(companyB.displayName, { exact: true }),
  ).toBeVisible();
  const reversal = union.getByRole('form', { name: 'Reverse union' });
  const reason = reversal.getByLabel('Reason for reversal');
  const acknowledgement = reversal.getByRole('checkbox');
  const reverse = reversal.getByRole('button', { name: 'Reverse union' });
  await reverse.click();
  await expect(reversal.getByRole('alert')).toContainText(
    'Give a reason and confirm the complete captured Company set before reversing.',
  );
  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(acknowledgement).toHaveAttribute('aria-invalid', 'true');
  expect(state.reversalCommands).toHaveLength(0);
  await captureUnion(page, testInfo, 'union-detail-authorized');
  await reason.fill('Restore the separate dossiers deliberately.');
  await acknowledgement.check();
  await reverse.click();
  await expect(reversal.getByRole('alert')).toContainText(
    'No confirmation has been received for this reversal.',
  );
  const fieldsetBox = await reversal.locator('fieldset').boundingBox();
  expect(fieldsetBox).not.toBeNull();
  expect(fieldsetBox?.width).toBeGreaterThan(
    testInfo.project.name === 'desktop' ? 600 : 280,
  );
  expect(state.reversalCommands).toHaveLength(1);
  await captureUnion(page, testInfo, 'union-reversal-uncertain');
  await navigateUnion(page, 'Activity Log');
  await navigateUnion(page, 'Clients');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await enterClassicCompatibility(page);
  await expect(reversal.getByLabel('Reason for reversal')).toHaveValue(
    'Restore the separate dossiers deliberately.',
  );
  await expect(reversal.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(reversal.getByLabel('Reason for reversal')).toHaveValue(
    'Restore the separate dossiers deliberately.',
  );
  const clientsBefore = state.clientReads;
  const activityBefore = state.activityReads;
  await reversal.getByRole('button', { name: 'Retry reversal' }).click();
  await expect(union.getByText(/Union reversed\./)).toBeVisible();
  expect(state.reversalCommands).toHaveLength(2);
  expect(state.reversalCommands[1]).toEqual(state.reversalCommands[0]);
  expect(state.reversalCommands[0]?.key).toBeTruthy();
  expect(state.reversalCommands[0]?.company).toBe(companyA.id);
  expect(JSON.parse(state.reversalCommands[0]?.body ?? '{}')).toEqual({
    reason: 'Restore the separate dossiers deliberately.',
    companyIds: [companyA.id, companyB.id],
  });
  expect(state.clientReads).toBeGreaterThan(clientsBefore);
  expect(state.activityReads).toBeGreaterThan(activityBefore);
  await captureUnion(page, testInfo, 'union-reversal-confirmed');
});
