import { expect, test, type Page } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import {
  parseEstimateVersion,
  type EstimateVersion,
} from '../src/profitability-estimate/profitability-contract';
import {
  syntheticInputs,
  syntheticVersion,
} from '../src/profitability-estimate/profitability.fixture';
import { actorContextFixture } from './actor-context.fixture';

const company = {
  id: '00000000-0000-4000-8000-000000000498',
  displayName: 'Synthetic Profitability Company',
};
const requestId = '00000000-0000-4000-8000-000000000499';
const opportunityId = '00000000-0000-4000-8000-000000000500';
const directorMember = {
  internalUserId: '00000000-0000-4000-8000-000000000501',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000502',
  displayName: 'Synthetic Director',
  email: 'director@example.test',
};
const basePath = `/api/opportunities/${opportunityId}/profitability-estimates`;
const scope = {
  workspaceId: actorContextFixture.workspaceId,
  companyId: company.id,
  opportunityId,
};
function requestDetail() {
  return {
    id: requestId,
    subject: 'Synthetic confirmed-cost request',
    companyId: company.id,
    sourceKind: 'MANUAL_TEXT',
    clientAssociationStatus: 'absent',
    sourceLabel: 'Synthetic manual intake',
    reportedReceivedAt: null,
    scope: null,
    originalText:
      'Synthetic qualification request, unrelated to any real Client.',
    capturedByWorkspaceMembershipId: actorContextFixture.workspaceMembershipId,
    capturedAt: '2026-10-01T08:00:00.000Z',
    version: 1,
    initialOpportunity: {
      id: opportunityId,
      title: 'Synthetic confirmed-cost opportunity',
      scope: null,
      nextAction: 'Prepare a confirmed-cost estimate',
      status: 'OPEN',
      responsibleWorkspaceMembershipId:
        actorContextFixture.workspaceMembershipId,
      responsibleActor: {
        workspaceMembershipId: actorContextFixture.workspaceMembershipId,
        displayName: actorContextFixture.displayName,
      },
      createdAt: '2026-10-01T08:00:00.000Z',
      version: 1,
    },
  };
}
function actor(contributor: boolean, director: boolean): ActorContext {
  return {
    ...actorContextFixture,
    workspacePermissions: ['company.assignment.manage'],
    activeCompany: {
      ...company,
      clientPermissions: ['client.read'],
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
      ],
      ...(contributor
        ? {
            profitabilityContributorPermissions: [
              'commercial.profitability_estimate.read',
              'commercial.profitability_estimate.create',
            ],
            profitabilityContributorPermissionAssignmentId: 'contributor-498',
            profitabilityContributorPermissionSetVersion: 'v1',
          }
        : {}),
      ...(director
        ? {
            profitabilityDirectorPermissions: [
              'commercial.profitability_estimate.read',
              'commercial.profitability_estimate.decide',
            ],
            profitabilityDirectorPermissionAssignmentId: 'director-498',
            profitabilityDirectorPermissionSetVersion: 'v1',
          }
        : {}),
    },
  };
}
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function openRequest(page: Page) {
  await page.goto('/#requests');
  const back = page.getByRole('button', { name: 'Back to Requests' });
  if (await back.isVisible()) await back.click();
  await page
    .getByRole('list', { name: 'Client Requests' })
    .getByRole('button')
    .click();
}
async function fill(page: Page) {
  const panel = page.locator('.profitability-estimate');
  await panel.getByLabel('ISO currency').fill('EUR');
  for (const [label, value] of [
    ['Executor cost', '60.00'],
    ['Confirmed fiscal cost', '10.00'],
    ['Explicit allocated overhead', '10.00'],
    ['Proposed commercial price', '125.00'],
    ['Target profitability (%)', '20'],
  ])
    if (label && value) await panel.getByLabel(label).fill(value);
  await choose(page, 'Executor type', 'Patent consultant');
  await choose(page, 'Pricing intent', 'Ordinary pricing');
  await panel.getByRole('button', { name: 'Add direct cost' }).click();
  await choose(page, 'Category', 'Travel');
  await panel.getByLabel('Cost label').fill('Synthetic travel');
  await panel.getByLabel('Amount (EUR)', { exact: true }).fill('20.00');
  await panel.getByRole('checkbox').check();
}
async function overflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}

test('independent administration → Contributor → uncertain exact retry → MODIFY → fresh correction → APPROVE → immutable reload → independent revocation', async ({
  page,
}, testInfo) => {
  let contributor = false;
  let director = false;
  let actingAsDirector = false;
  let versions: EstimateVersion[] = [];
  let lostAcknowledgement = false;
  const receipts = new Map<string, EstimateVersion>();
  const submissionAttempts: { key: string; body: string }[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: actingAsDirector
          ? { ...actor(false, director), ...directorMember }
          : actor(contributor, false),
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/clients')
      return route.fulfill({ json: { clients: [], nextCursor: null } });
    if (path === '/api/company-context-assignments/administration')
      return route.fulfill({
        json: {
          members: [
            {
              workspaceMembershipId: actorContextFixture.workspaceMembershipId,
              displayName: actorContextFixture.displayName,
              email: actorContextFixture.email,
            },
            directorMember,
          ],
          companies: [company],
          assignments: [
            ...(contributor
              ? [
                  {
                    id: 'contributor-498',
                    bundle: 'Company Profitability Contributor',
                    workspaceMembershipId:
                      actorContextFixture.workspaceMembershipId,
                  },
                ]
              : []),
            ...(director
              ? [
                  {
                    id: 'director-498',
                    bundle: 'Company Profitability Director',
                    workspaceMembershipId: directorMember.workspaceMembershipId,
                  },
                ]
              : []),
          ].map((item) => ({
            ...item,
            companyId: company.id,
            active: true,
            permissionSetVersion: 'v1',
          })),
        },
      });
    if (path.startsWith('/api/company-profitability-')) {
      const membershipId = path.includes('contributor')
        ? actorContextFixture.workspaceMembershipId
        : directorMember.workspaceMembershipId;
      if (request.method() === 'POST') {
        const body: unknown = request.postDataJSON();
        expect(body).toMatchObject({
          workspaceMembershipId: membershipId,
          companyId: company.id,
        });
      } else expect(path).toContain(membershipId);
      if (path.includes('contributor'))
        contributor = request.method() === 'POST';
      else director = request.method() === 'POST';
      return route.fulfill({ json: { outcome: 'changed' } });
    }
    if (path === '/api/commercial-intake/requests') {
      const detail = requestDetail();
      return route.fulfill({
        json: {
          items: [
            {
              id: detail.id,
              subject: detail.subject,
              capturedAt: detail.capturedAt,
              initialOpportunity: {
                title: detail.initialOpportunity.title,
                nextAction: detail.initialOpportunity.nextAction,
                responsibleActor: detail.initialOpportunity.responsibleActor,
              },
            },
          ],
        },
      });
    }
    if (path === `/api/commercial-intake/requests/${requestId}`)
      return route.fulfill({ json: requestDetail() });
    if (path === basePath && request.method() === 'GET')
      return route.fulfill({
        json: {
          items: versions,
          latestVersionNumber: versions[0]?.versionNumber ?? null,
        },
      });
    if (path === basePath && request.method() === 'POST') {
      const key = request.headers()['idempotency-key'] ?? '';
      const body = request.postData() ?? '';
      submissionAttempts.push({ key, body });
      const receipt = receipts.get(key);
      if (receipt) return route.fulfill({ json: receipt });
      const input: unknown = request.postDataJSON();
      if (
        typeof input !== 'object' ||
        input === null ||
        !('expectedLatestVersionNumber' in input)
      )
        throw new Error('Missing complete estimate command.');
      expect(input.expectedLatestVersionNumber).toBe(
        versions[0]?.versionNumber ?? null,
      );
      const inputs = Object.fromEntries(
        Object.entries(input).filter(
          ([key]) => key !== 'expectedLatestVersionNumber',
        ),
      );
      const number = versions.length + 1;
      const version = parseEstimateVersion(
        {
          ...syntheticVersion(number),
          ...scope,
          id: `version-${number}`,
          clientRequestId: requestId,
          inputs,
          createdByWorkspaceMembershipId:
            actorContextFixture.workspaceMembershipId,
          results:
            number === 1
              ? syntheticVersion().results
              : {
                  totalCost: '100.00',
                  profit: '100.00',
                  profitabilityPercent: '50.00',
                  targetDifferencePercentagePoints: '30.00',
                },
        },
        scope,
      );
      versions = [version, ...versions];
      receipts.set(key, version);
      if (!lostAcknowledgement) {
        lostAcknowledgement = true;
        return route.abort('failed');
      }
      return route.fulfill({ status: 201, json: version });
    }
    if (path.startsWith(`${basePath}/versions/`)) {
      const version = versions.find((item) =>
        path.includes(`/versions/${item.id}`),
      );
      if (!version) return route.fulfill({ status: 404 });
      if (path.endsWith('/decision')) {
        const input: unknown = request.postDataJSON();
        if (
          typeof input !== 'object' ||
          input === null ||
          !('code' in input) ||
          (input.code !== 'MODIFY' && input.code !== 'APPROVE')
        )
          throw new Error('Unexpected Director command.');
        expect(director && actingAsDirector).toBe(true);
        expect('expectedDecision' in input && input.expectedDecision).toBe(
          null,
        );
        expect(
          'expectedVersionNumber' in input && input.expectedVersionNumber,
        ).toBe(version.versionNumber);
        const decided: EstimateVersion = {
          ...version,
          decision: {
            id: `decision-${version.versionNumber}`,
            code: input.code,
            decidedByWorkspaceMembershipId:
              directorMember.workspaceMembershipId,
            decidedAt: '2026-10-01T09:00:00.000Z',
          },
        };
        versions = versions.map((item) =>
          item.id === decided.id ? decided : item,
        );
        return route.fulfill({ json: decided });
      }
      return route.fulfill({ json: version });
    }
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#access');
  await choose(
    page,
    'Workspace member',
    `${actorContextFixture.displayName} — ${actorContextFixture.email}`,
  );
  await choose(page, 'Company', company.displayName);
  await choose(page, 'Access bundle', 'Company Profitability Contributor');
  await page.getByRole('button', { name: 'Grant access' }).click();
  await expect(
    page.getByText('Access granted. Server state refreshed.'),
  ).toBeVisible();
  expect(contributor).toBe(true);
  expect(director).toBe(false);
  await openRequest(page);
  const panel = page.locator('.profitability-estimate');
  await expect(
    panel.getByText('No Profitability Estimate Versions yet.'),
  ).toBeVisible();
  await expect(panel.getByLabel('Target profitability (%)')).toHaveValue('');
  await fill(page);
  await panel.getByRole('button', { name: 'Save confirmed version' }).click();
  await expect(panel.getByText(/The result is unconfirmed/u)).toBeVisible();
  await expect(panel.getByLabel('Proposed commercial price')).toBeDisabled();
  await panel.getByRole('button', { name: 'Retry exact command' }).click();
  await expect(panel.getByText('Version saved.')).toBeVisible();
  expect(submissionAttempts).toHaveLength(2);
  expect(submissionAttempts[1]).toEqual(submissionAttempts[0]);
  await expect(
    panel.getByRole('button', { name: 'Approve this version' }),
  ).toHaveCount(0);
  await overflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `profitability-contributor-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  await page.goto('/#access');
  await choose(
    page,
    'Workspace member',
    `${actorContextFixture.displayName} — ${actorContextFixture.email}`,
  );
  await choose(page, 'Company', company.displayName);
  await choose(
    page,
    'Workspace member',
    `${directorMember.displayName} — ${directorMember.email}`,
  );
  await choose(page, 'Access bundle', 'Company Profitability Director');
  await page.getByRole('button', { name: 'Grant access' }).click();
  await expect(
    page.getByText('Access granted. Server state refreshed.'),
  ).toBeVisible();
  expect(contributor && director).toBe(true);
  actingAsDirector = true;
  await page.reload();
  await openRequest(page);
  await expect(
    panel.getByRole('button', { name: 'Save confirmed version' }),
  ).toHaveCount(0);
  await panel.getByRole('button', { name: 'Open version 1' }).click();
  await panel
    .getByRole('button', { name: 'Return this version for modification' })
    .click();
  await expect(
    panel.getByText('Director decision recorded for this exact version.'),
  ).toBeVisible();
  actingAsDirector = false;
  await page.reload();
  await openRequest(page);
  await panel.getByRole('button', { name: 'Open version 1' }).click();
  await panel.getByRole('button', { name: 'Prepare correction' }).click();
  await expect(panel.getByRole('checkbox')).not.toBeChecked();
  await panel.getByLabel('Proposed commercial price').fill('200.00');
  await panel.getByRole('button', { name: 'Save confirmed version' }).click();
  await expect(panel.getByText(/Complete required fields/u)).toBeVisible();
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Save confirmed version' }).click();
  await expect(panel.getByText('Version saved.')).toBeVisible();
  actingAsDirector = true;
  await page.reload();
  await openRequest(page);
  await panel.getByRole('button', { name: 'Open version 2' }).click();
  await panel.getByRole('button', { name: 'Approve this version' }).click();
  await expect(
    panel.getByText('Director decision recorded for this exact version.'),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Reload estimate' }).click();
  await expect(
    panel.getByText('Decision for this version: Approved'),
  ).toBeVisible();
  await expect(
    panel.getByText('Decision for this version: Returned for modification'),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Open version 1' }).click();
  await expect(
    panel
      .locator('.profitability-version')
      .getByText('125.00 EUR', { exact: true }),
  ).toBeVisible();
  await expect(
    panel
      .locator('.profitability-version')
      .getByText('25.00 EUR', { exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Open version 2' }).click();
  await expect(
    panel
      .locator('.profitability-version')
      .getByText('200.00 EUR', { exact: true }),
  ).toBeVisible();
  await expect(
    panel
      .locator('.profitability-version')
      .getByText('50.00%', { exact: true }),
  ).toBeVisible();
  await overflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `profitability-approved-history-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  const oldVersion = versions.find((item) => item.versionNumber === 1);
  expect(oldVersion?.inputs.proposedPrice).toBe('125.00');
  expect(oldVersion?.decision?.code).toBe('MODIFY');

  await page.goto('/#access');
  await choose(
    page,
    'Workspace member',
    `${actorContextFixture.displayName} — ${actorContextFixture.email}`,
  );
  await choose(page, 'Company', company.displayName);
  await choose(page, 'Access bundle', 'Company Profitability Contributor');
  await page.getByRole('button', { name: 'Revoke access' }).click();
  await expect(
    page.getByText('Access revoked. Server state refreshed.'),
  ).toBeVisible();
  await openRequest(page);
  await expect(
    panel.getByRole('button', { name: 'Open version 2' }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Save confirmed version' }),
  ).toHaveCount(0);
  await page.goto('/#access');
  await choose(
    page,
    'Workspace member',
    `${actorContextFixture.displayName} — ${actorContextFixture.email}`,
  );
  await choose(page, 'Company', company.displayName);
  await choose(
    page,
    'Workspace member',
    `${directorMember.displayName} — ${directorMember.email}`,
  );
  await choose(page, 'Access bundle', 'Company Profitability Director');
  await page.getByRole('button', { name: 'Revoke access' }).click();
  await expect(
    page.getByText('Access revoked. Server state refreshed.'),
  ).toBeVisible();
  await openRequest(page);
  await expect(panel).toHaveCount(0);
  expect(versions).toHaveLength(2);
});

test('safe history failure, stale reload, strategic loss and keyboard locale continuity', async ({
  page,
}, testInfo) => {
  let reads = 0;
  let stale = true;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/current-actor')
      return route.fulfill({ json: actor(true, false) });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/clients')
      return route.fulfill({ json: { clients: [], nextCursor: null } });
    if (path === '/api/commercial-intake/requests') {
      const detail = requestDetail();
      return route.fulfill({
        json: {
          items: [
            {
              id: detail.id,
              subject: detail.subject,
              capturedAt: detail.capturedAt,
              initialOpportunity: {
                title: detail.initialOpportunity.title,
                nextAction: detail.initialOpportunity.nextAction,
                responsibleActor: detail.initialOpportunity.responsibleActor,
              },
            },
          ],
        },
      });
    }
    if (path === `/api/commercial-intake/requests/${requestId}`)
      return route.fulfill({ json: requestDetail() });
    if (path === basePath && request.method() === 'GET')
      return ++reads === 1
        ? route.fulfill({ status: 500 })
        : route.fulfill({ json: { items: [], latestVersionNumber: null } });
    if (path === basePath && request.method() === 'POST') {
      if (stale) {
        stale = false;
        return route.fulfill({ status: 409 });
      }
      return route.fulfill({
        json: {
          ...syntheticVersion(),
          ...scope,
          clientRequestId: requestId,
          inputs: {
            ...syntheticInputs,
            pricingIntent: {
              kind: 'STRATEGIC',
              reason: 'Synthetic strategic reason',
            },
            proposedPrice: '80.00',
          },
          results: {
            totalCost: '100.00',
            profit: '-20.00',
            profitabilityPercent: '-25.00',
            targetDifferencePercentagePoints: '-45.00',
          },
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  await openRequest(page);
  const panel = page.locator('.profitability-estimate');
  await expect(
    panel.getByText('Estimate history could not be loaded. Reload.'),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Reload estimate' }).click();
  await expect(
    panel.getByText('No Profitability Estimate Versions yet.'),
  ).toBeVisible();
  await fill(page);
  await page.getByLabel('Interface language', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('option', { name: 'Français', exact: true }).click();
  await expect(panel.getByLabel('Prix commercial proposé')).toHaveValue(
    '125.00',
  );
  await page.getByLabel('Langue de l’interface', { exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await panel.getByRole('button', { name: 'Save confirmed version' }).click();
  await expect(
    panel.getByText(/The version or decision changed/u),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Reload estimate' }).click();
  await expect(panel.getByLabel('Proposed commercial price')).toHaveValue(
    '125.00',
  );
  await expect(panel.getByRole('checkbox')).not.toBeChecked();
  await panel.getByLabel('Proposed commercial price').fill('80.00');
  await choose(page, 'Pricing intent', 'Strategic pricing');
  await panel
    .getByLabel('Strategic-price reason')
    .fill('Synthetic strategic reason');
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Save confirmed version' }).click();
  await expect(panel.getByText('Version saved.')).toBeVisible();
  await expect(
    panel
      .locator('.profitability-version')
      .getByText('−20.00 EUR', { exact: true }),
  ).toBeVisible();
  await expect(
    panel
      .locator('.profitability-version')
      .getByText('−25.00%', { exact: true }),
  ).toBeVisible();
  await overflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `profitability-loss-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});
