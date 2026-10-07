import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
const company = { id: 'company-one', displayName: 'Synthetic Company' };
const actor = {
  internalUserId: 'user-one',
  workspaceMembershipId: 'member-one',
  workspaceId: 'workspace-one',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Reader',
  email: 'reader@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    ...company,
    clientPermissions: [],
    contractPermissions: [
      'commercial.contract.read',
      'commercial.contract.prepare',
    ],
    contractPermissionAssignmentId: 'contract-grant',
    contractPermissionSetVersion: 'v1',
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
    ],
    commercialIntakePermissionAssignmentId: 'intake-grant',
    commercialIntakePermissionSetVersion: 'v1',
  },
} satisfies ActorContext;
const detail = {
  id: 'request-one',
  companyId: company.id,
  sourceKind: 'MANUAL_TEXT',
  sourceLabel: null,
  reportedReceivedAt: null,
  subject: 'Contract checks Request',
  originalText: 'Synthetic captured evidence',
  capturedByWorkspaceMembershipId: 'member-one',
  capturedAt: '2026-10-07T06:00:00.000Z',
  version: 1,
  clientAssociationStatus: 'hidden',
  initialOpportunity: {
    id: 'opportunity-one',
    title: 'Contract checks Opportunity',
    scope: null,
    nextAction: 'Review Contract checks',
    status: 'OPEN',
    responsibleWorkspaceMembershipId: 'member-one',
    responsibleActor: {
      workspaceMembershipId: 'member-one',
      displayName: 'Reader',
    },
    createdAt: '2026-10-07T06:00:00.000Z',
    version: 1,
  },
};
function run(id: string, current: boolean) {
  return {
    id,
    contractVersionId: 'version-one',
    ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: 'member-one',
    evaluatedAt: current
      ? '2026-10-08T00:00:00.000Z'
      : '2026-10-07T09:00:00.000Z',
    results: [
      { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
      { code: 'PARTY_AVAILABLE', status: 'PASS' },
      { code: 'PARTY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_CURRENT', status: current ? 'WARNING' : 'PASS' },
      { code: 'PARTY_TAX_ID_RECORDED', status: 'ERROR' },
      { code: 'PRICE_MATCHES_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
      { code: 'CONDITIONS_MATCH_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'ADDED_CONDITIONS_CONFIRMED', status: 'PASS' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ],
  };
}
test('reviews attributed exact-version results, retries by keyboard and reopens earlier evidence', async ({
  page,
}, testInfo) => {
  // HTTP fixtures exercise the real production browser boundary. PostgreSQL REST
  // and acceptance suites independently prove business evaluation and persistence.
  let latest: ReturnType<typeof run> | null = null;
  let denied = false;
  const attempts: Array<{ body: string | null; key: string | undefined }> = [];
  const old = run('run-one', false),
    newer = run('run-two', true);
  const contract = () => ({
    id: 'contract-one',
    companyId: company.id,
    opportunityId: 'opportunity-one',
    kind: 'CONTRACT',
    origin: 'ACCEPTED_OFFER',
    sourceOfferId: 'offer-one',
    sourceOfferVersionId: 'accepted-version',
    sourceOffer: { illustrativeReference: 1, versionNumber: 1 },
    revision: 1,
    illustrativeReference: 1,
    provisional: true,
    version: {
      id: 'version-one',
      versionNumber: 1,
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Synthetic recorded party',
        taxId: null,
        legalAddress: 'Example Street',
      },
      issuingCompanyLabel: company.displayName,
      scopeNote: 'Synthetic accepted scope',
      commercialConditions: 'Accepted conditions',
      termStartsOn: null,
      termEndsOn: null,
      specialConditions: null,
      latestQualityRun: latest,
      decisionState: 'PENDING',
      executionState: 'NOT_EXECUTED',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      pricingSnapshotId: 'snapshot-one',
      pricingSnapshot: {
        id: 'snapshot-one',
        currency: 'EUR',
        subtotal: '300.00',
        taxTotal: '45.00',
        total: '345.00',
        lines: [
          {
            serviceName: 'Illustrative service',
            quantity: '1',
            lineNet: '300.00',
            lineTax: '45.00',
          },
        ],
      },
    },
  });
  await page.route('**/api/**', async (route) => {
    const sent = route.request(),
      path = new URL(sent.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actor });
    if (path.endsWith('/companies')) return route.fulfill({ json: [company] });
    if (path.endsWith('/commercial-intake/requests'))
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
    if (path.endsWith('/commercial-intake/requests/request-one'))
      return route.fulfill({ json: detail });
    if (path.endsWith('/contracts/opportunities/opportunity-one'))
      return route.fulfill({ json: { contract: contract() } });
    if (path.includes('/quality-checks')) {
      if (denied)
        return route.fulfill({
          status: 403,
          json: { statusCode: 403, message: 'Forbidden' },
        });
      if (sent.method() === 'POST') {
        attempts.push({
          body: sent.postData(),
          key: sent.headers()['idempotency-key'],
        });
        latest = attempts.length <= 2 ? old : newer;
        if (attempts.length === 1) return route.abort('failed');
        return route.fulfill({ status: 201, json: latest });
      }
      if (path.endsWith('/run-one')) return route.fulfill({ json: old });
      return route.fulfill({
        json: {
          items: latest?.id === 'run-two' ? [newer, old] : [old],
          nextCursor: null,
        },
      });
    }
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto('/?frame=prisme#requests');
  await page
    .getByRole('button')
    .filter({ has: page.getByText(detail.subject, { exact: true }) })
    .click();
  const checks = page.getByRole('region', {
    name: 'Contract Quality Checks',
    exact: true,
  });
  await expect(
    checks.getByText('No Contract Quality Check run yet.'),
  ).toBeVisible();
  const button = checks.getByRole('button', {
    name: 'Run Contract Quality Checks',
    exact: true,
  });
  await button.focus();
  await page.keyboard.press('Enter');
  const retry = checks.getByRole('button', {
    name: 'Retry the same Contract Quality Checks',
    exact: true,
  });
  await expect(retry).toBeVisible();
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(
    checks.getByText('Contract checks completed with errors.'),
  ).toBeVisible();
  expect(attempts[1]).toEqual(attempts[0]);
  await expect(checks.getByText('version-one', { exact: true })).toBeVisible();
  await expect(checks.getByText('member-one', { exact: true })).toBeVisible();
  await expect(checks.getByText('PASS', { exact: true })).toHaveCount(10);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(
      'contract-quality-' + testInfo.project.name + '.png',
    ),
  });
  await button.click();
  await expect(checks.getByText('WARNING', { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole('button')
    .filter({ has: page.getByText(detail.subject, { exact: true }) })
    .click();
  await expect(
    checks.getByText('2026-10-08T00:00:00.000Z', { exact: true }),
  ).toBeVisible();
  await checks.getByRole('button', { name: 'Reopen recorded checks' }).click();
  await checks
    .getByRole('button', { name: 'Reopen run · 2026-10-07T09:00:00.000Z' })
    .click();
  await expect(checks.getByText('WARNING', { exact: true })).toHaveCount(0);
  await expect(checks.locator('time')).toHaveText('2026-10-07T09:00:00.000Z');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(
      'contract-quality-reopened-' + testInfo.project.name + '.png',
    ),
  });
  denied = true;
  await button.click();
  await expect(
    checks.getByText('Contract Quality Check access is unavailable.'),
  ).toBeVisible();
  await expect(checks.getByText('member-one', { exact: true })).toHaveCount(0);
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
});
