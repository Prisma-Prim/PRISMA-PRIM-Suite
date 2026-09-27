import { selectOption } from './select-option';
import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';

test('compares existing Clients, confirms their union and reverses it', async ({
  page,
}, testInfo) => {
  const firstId = '00000000-0000-4000-8000-000000002181';
  const secondId = '00000000-0000-4000-8000-000000002182';
  const companyA = {
    id: '00000000-0000-4000-8000-000000002183',
    displayName: 'PRISMA-PRIM',
  };
  const companyB = {
    id: '00000000-0000-4000-8000-000000002184',
    displayName: 'BIC',
  };
  const first = {
    id: firstId,
    version: 1,
    displayName: 'Exemplu SRL',
    taxId: 'UNION-X',
    address: null,
    telephone: '+373 60 000 001',
    generalEmail: null,
    businessActivity: null,
    contacts: [{ name: 'Alex' }],
  };
  const second = {
    ...first,
    id: secondId,
    displayName: 'Exemplu S.R.L.',
    address: 'Chisinau',
    contacts: [{ name: 'Dana' }],
  };
  const actor = {
    ...actorContextFixture,
    activeCompany: {
      ...companyA,
      clientPermissions: [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
    },
  } satisfies ActorContext;
  let united = false;
  let reversed = false;
  const reviewReference = '00000000-0000-4000-8000-000000002185';
  const projectionReference = '00000000-0000-4000-8000-000000002186';
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actor });
    if (path.endsWith('/companies'))
      return route.fulfill({ json: [companyA, companyB] });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (path.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(companyA.id, {
          active_clients: united && !reversed ? 1 : 2,
        }),
      });
    if (path.endsWith('/client-duplicate-reviews'))
      return route.fulfill({ json: { items: [], next_cursor: null } });
    if (path.endsWith('/client-union-sources'))
      return route.fulfill({
        json:
          united && !reversed
            ? [{ id: secondId, displayName: second.displayName }]
            : [],
      });
    if (path.endsWith('/union-history'))
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
    if (path.endsWith('/clients'))
      return route.fulfill({
        json: [
          {
            id: firstId,
            displayName: first.displayName,
            relatedToActiveCompany: true,
          },
        ],
      });
    if (path.endsWith(`/clients/${firstId}`))
      return route.fulfill({
        json: {
          ...first,
          version: reversed ? 3 : united ? 2 : 1,
          contacts:
            united && !reversed
              ? [...first.contacts, ...second.contacts]
              : first.contacts,
          relatedToActiveCompany: true,
          involvedCompanyDisplayNames: [
            companyA.displayName,
            companyB.displayName,
          ],
        },
      });
    if (path.endsWith(`/clients/${firstId}/union-reviews`))
      return route.fulfill({
        status: 201,
        json: {
          outcome: 'comparison',
          reviewReference,
          clients: [first, second],
          companies: [companyA, companyB],
        },
      });
    if (path.endsWith(`/client-union-reviews/${reviewReference}/confirm`)) {
      expect(request.postDataJSON()).toMatchObject({
        canonicalClientId: firstId,
        reviewedDifferences: true,
        companyIds: [companyA.id, companyB.id],
        reason: 'Same verified legal identity.',
      });
      expect(request.headers()['idempotency-key']).toBeTruthy();
      united = true;
      return route.fulfill({
        status: 201,
        json: {
          outcome: 'united',
          canonicalClientId: firstId,
          projectionReference,
        },
      });
    }
    if (path.endsWith(`/client-union-operations/${projectionReference}`))
      return route.fulfill({
        json: {
          state: 'united',
          operationId: 'internal-operation',
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
          reversal: null,
          canReverse: true,
        },
      });
    if (
      path.endsWith(`/client-union-operations/${projectionReference}/reversal`)
    ) {
      expect(request.postDataJSON()).toEqual({
        reason: 'Restore separate dossiers.',
        companyIds: [companyA.id, companyB.id],
      });
      reversed = true;
      return route.fulfill({
        status: 201,
        json: { outcome: 'reversed', clientIds: [firstId, secondId] },
      });
    }
    if (path.endsWith('/legal-entities'))
      return route.fulfill({ json: { clientVersion: 1, legalEntities: [] } });
    return route.fulfill({ status: 404 });
  });

  await page.goto('/?frame=classic');
  await page.getByRole('button', { name: 'Open dossier', exact: true }).click();
  const union = page.getByRole('region', { name: 'Governed Client union' });
  await union
    .getByRole('button', { name: 'Review existing duplicates' })
    .click();
  await expect(
    union.getByRole('heading', { name: 'Compare the two existing Clients' }),
  ).toBeVisible();
  await expect(union.getByText('Alex', { exact: true })).toBeVisible();
  await expect(union.getByText('Dana', { exact: true })).toBeVisible();
  const confirm = union.getByRole('form', { name: 'Confirm union' });
  for (const select of await confirm.getByRole('combobox').all())
    await selectOption(select, firstId);
  await confirm
    .getByLabel('Reason for this union')
    .fill('Same verified legal identity.');
  for (const checkbox of await confirm.getByRole('checkbox').all())
    await checkbox.check();
  await page.screenshot({
    path: testInfo.outputPath(
      `client-union-comparison-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  await confirm
    .getByRole('button', { name: 'Confirm union', exact: true })
    .click();
  await expect(
    page.getByText(
      'Union confirmed. The canonical dossier is now available in the affected Companies.',
      { exact: true },
    ),
  ).toBeVisible();
  // A fresh page has no selected active dossier. The superseded source must
  // remain discoverable without reconstructing a private API URL.
  await page.reload();
  await expect(
    union.getByRole('button', { name: 'Review existing duplicates' }),
  ).toHaveCount(0);
  await union
    .getByRole('button', { name: 'Superseded Client history' })
    .click();
  await union
    .getByRole('button', { name: second.displayName, exact: true })
    .click();
  await union
    .getByRole('button', { name: 'View authorized union details' })
    .click();
  await expect(
    union.getByRole('heading', { name: 'Attributable union history' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `client-union-history-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  await union
    .getByRole('button', { name: 'Open canonical Client dossier' })
    .click();
  await expect(
    union.getByRole('button', { name: 'Review existing duplicates' }),
  ).toBeVisible();
  await union
    .getByRole('button', { name: 'Union history', exact: true })
    .click();
  await union
    .getByRole('button', { name: 'View authorized union details' })
    .click();
  const reversal = union.getByRole('form', { name: 'Reverse union' });
  await reversal
    .getByLabel('Reason for reversal')
    .fill('Restore separate dossiers.');
  await reversal.getByRole('checkbox').check();
  await reversal
    .getByRole('button', { name: 'Reverse union', exact: true })
    .click();
  await expect(union.getByText(/Union reversed\./)).toBeVisible();
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  await page.screenshot({
    path: testInfo.outputPath(
      `client-union-reversed-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});
