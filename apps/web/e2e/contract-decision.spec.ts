import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import { contractDecisionMessages } from '../src/contract/contract-decision.copy';
import { resolveMessage } from '../src/localization/messages';
import { interfaceLocales } from '../src/localization/interface-locale';
import {
  buildClientRequest,
  requestListItemFor,
} from '../src/test/commercial-intake-responses';
const company = { id: 'company-one', displayName: 'Synthetic Company' };
const actor = {
  internalUserId: 'user-one',
  workspaceMembershipId: 'member-one',
  workspaceId: 'workspace-one',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Approver',
  email: 'approver@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    ...company,
    contractPermissions: [
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
    ],
    contractApproverAssignmentId: 'approver-one',
    contractApproverPermissionSetVersion: 'v1',
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
    ],
    commercialIntakePermissionAssignmentId: 'intake-one',
    commercialIntakePermissionSetVersion: 'v1',
  },
} satisfies ActorContext;
function run(opportunity: string, errors = false) {
  return {
    id: 'run-' + opportunity,
    contractVersionId: 'version-' + opportunity,
    ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: 'member-one',
    evaluatedAt: '2026-10-07T09:00:00.000Z',
    results: [
      { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
      { code: 'PARTY_AVAILABLE', status: errors ? 'ERROR' : 'PASS' },
      { code: 'PARTY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
      { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
      { code: 'PRICE_MATCHES_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
      { code: 'CONDITIONS_MATCH_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'ADDED_CONDITIONS_CONFIRMED', status: 'WARNING' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ],
  };
}
function detail(id: string) {
  return buildClientRequest({
    id: 'request-' + id,
    companyId: company.id,
    subject: 'Synthetic ' + id + ' Request',
    originalText: 'Synthetic captured evidence',
    capturedByWorkspaceMembershipId: 'member-one',
    capturedAt: '2026-10-07T06:00:00.000Z',
    clientAssociationStatus: 'hidden',
    initialOpportunity: {
      id,
      title: 'Synthetic ' + id + ' Opportunity',
      nextAction: 'Review exact Contract',
      responsibleActor: {
        workspaceMembershipId: 'member-one',
        displayName: 'Approver',
      },
    },
  });
}
function contract(id: string, decision: unknown, latest: unknown) {
  return {
    id: 'contract-' + id,
    companyId: company.id,
    opportunityId: id,
    kind: 'CONTRACT',
    origin: 'ACCEPTED_OFFER',
    sourceOfferId: 'offer-' + id,
    sourceOfferVersionId: 'accepted-' + id,
    sourceOffer: { illustrativeReference: 1, versionNumber: 1 },
    revision: decision ? 2 : 1,
    illustrativeReference: id === 'approve' ? 1 : 2,
    provisional: true,
    version: {
      id: 'version-' + id,
      versionNumber: 1,
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Synthetic recorded party',
        taxId: 'SYNTHETIC',
        legalAddress: 'Example Street',
      },
      qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: 1,
      issuingCompanyLabel: company.displayName,
      scopeNote: 'Synthetic accepted scope',
      commercialConditions: 'Synthetic conditions',
      termStartsOn: null,
      termEndsOn: null,
      specialConditions: 'Synthetic additional condition',
      latestQualityRun: latest,
      decision,
      decisionState: decision
        ? id === 'approve'
          ? 'APPROVED'
          : 'REJECTED'
        : 'PENDING',
      executionState: 'NOT_EXECUTED',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      pricingSnapshotId: 'snapshot-' + id,
      pricingSnapshot: {
        id: 'snapshot-' + id,
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
  };
}
for (const locale of interfaceLocales)
  test(`approver-only approval retry and rejection remain readable in ${locale}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      (value) =>
        window.localStorage.setItem('prisma-prim.interface-locale', value),
      locale,
    );
    const copy = (key: (typeof contractDecisionMessages.keys)[number]) =>
      resolveMessage(contractDecisionMessages, locale, key);
    const decisions = new Map<string, unknown>();
    const latest = new Map<string, unknown>();
    const attempts: Array<{ body: string | null; key: string | undefined }> =
      [];
    let referenceDenied = false;
    await page.route('**/api/**', async (route) => {
      const sent = route.request(),
        path = new URL(sent.url()).pathname;
      if (path.endsWith('/access/current-actor'))
        return route.fulfill({ json: actor });
      if (path.endsWith('/companies'))
        return route.fulfill({ json: [company] });
      if (path.endsWith('/commercial-intake/requests'))
        return route.fulfill({
          json: {
            items: ['approve', 'reject'].map((id) =>
              requestListItemFor(detail(id)),
            ),
          },
        });
      if (path.includes('/commercial-intake/requests/request-'))
        return route.fulfill({
          json: detail(path.endsWith('approve') ? 'approve' : 'reject'),
        });
      if (path.includes('/contracts/opportunities/')) {
        const id = path.includes('/opportunities/approve')
          ? 'approve'
          : 'reject';
        if (path.endsWith('/representation'))
          return route.fulfill({
            json: {
              contractId: 'contract-' + id,
              contractVersionId: 'version-' + id,
              templateCode: 'CONTRACT_ILLUSTRATIVE',
              templateVersion: 1,
              clauseVersions: [
                { code: 'CL_SUBJECT', version: 1 },
                { code: 'CL_PRICE', version: 1 },
                { code: 'CL_TERM', version: 1 },
                { code: 'CL_CONDITIONS', version: 1 },
                { code: 'CL_GENERAL', version: 1 },
              ],
              html: '<!doctype html><html lang="en"><body><p>Illustrative only — not approved for real use; not a signed agreement.</p><p>Synthetic immutable Contract</p></body></html>',
              sha256: '1'.repeat(64),
            },
          });
        if (path.endsWith('/quality-checks')) {
          latest.set(id, run(id, id === 'reject'));
          return route.fulfill({
            status: sent.method() === 'POST' ? 201 : 200,
            json:
              sent.method() === 'POST'
                ? latest.get(id)
                : { items: [latest.get(id)], nextCursor: null },
          });
        }
        if (
          sent.method() === 'POST' &&
          (path.endsWith('/approve') || path.endsWith('/reject'))
        ) {
          const value: unknown = sent.postDataJSON();
          if (
            typeof value !== 'object' ||
            value === null ||
            Array.isArray(value)
          )
            throw new Error('Malformed decision request');
          const input = Object.fromEntries(Object.entries(value));
          expect(input.expectedContractRevision).toBe(1);
          if (path.endsWith('/approve')) {
            if (
              JSON.stringify(input.acknowledgedWarningCodes) !==
              JSON.stringify(['ADDED_CONDITIONS_CONFIRMED'])
            )
              return route.fulfill({
                status: 409,
                json: { code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED' },
              });
            attempts.push({
              body: sent.postData(),
              key: sent.headers()['idempotency-key'],
            });
            decisions.set(id, {
              id: 'decision-' + id,
              contractVersionId: 'version-' + id,
              revision: 2,
              actorWorkspaceMembershipId: 'member-one',
              decidedAt: '2026-10-07T09:00:00.000Z',
              kind: 'APPROVE',
              qualityRun: run(id),
              acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
              representationChecksum: '1'.repeat(64),
            });
            latest.set(id, run(id));
            if (attempts.length === 1) return route.abort('failed');
          } else
            decisions.set(id, {
              id: 'decision-' + id,
              contractVersionId: 'version-' + id,
              revision: 2,
              actorWorkspaceMembershipId: 'member-one',
              decidedAt: '2026-10-07T09:00:00.000Z',
              kind: 'REJECT',
              reason: input.reason,
            });
          return route.fulfill({ status: 201, json: decisions.get(id) });
        }
        return route.fulfill({
          json: {
            contract: contract(
              id,
              decisions.get(id) ?? null,
              latest.get(id) ?? null,
            ),
          },
        });
      }
      if (
        path.includes('/offers/') ||
        path.includes('/clients/') ||
        path.includes('/pricing/')
      ) {
        referenceDenied = true;
        return route.fulfill({ status: 403, json: { message: 'Forbidden' } });
      }
      return route.fulfill({ json: { items: [], nextCursor: null } });
    });
    async function open(id: string) {
      await page.goto('/?frame=prisme#requests');
      await page.reload();
      await page
        .getByRole('button')
        .filter({
          has: page.getByText('Synthetic ' + id + ' Request', { exact: true }),
        })
        .click();
    }
    await open('approve');
    let decision = page.getByRole('region', {
      name: copy('title'),
      exact: true,
    });
    await decision
      .getByRole('button', { name: copy('approve'), exact: true })
      .click();
    await expect(decision.getByRole('alert')).toHaveText(copy('warnings'));
    await page
      .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
      .click();
    await decision.getByRole('checkbox').check();
    const approve = decision.getByRole('button', {
      name: copy('approve'),
      exact: true,
    });
    await approve.focus();
    await page.keyboard.press('Enter');
    const retry = decision.getByRole('button', {
      name: copy('retry'),
      exact: true,
    });
    await expect(retry).toBeVisible();
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(
      decision.getByText(copy('approved'), { exact: true }),
    ).toBeVisible();
    expect(attempts[1]).toEqual(attempts[0]);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(
        `contract-approved-${locale}-${testInfo.project.name}.png`,
      ),
    });
    await page.reload();
    await page
      .getByRole('button')
      .filter({
        has: page.getByText('Synthetic approve Request', { exact: true }),
      })
      .click();
    decision = page.getByRole('region', { name: copy('title'), exact: true });
    await expect(
      decision.getByText('1'.repeat(64), { exact: true }),
    ).toBeVisible();
    await expect(
      decision.getByRole('button', { name: copy('approve') }),
    ).toHaveCount(0);
    await open('reject');
    decision = page.getByRole('region', { name: copy('title'), exact: true });
    await page
      .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
      .click();
    await expect(
      page.getByText('Contract checks completed with errors.', { exact: true }),
    ).toBeVisible();
    await decision
      .getByRole('textbox', { name: copy('reason'), exact: true })
      .fill('Synthetic rejection reason');
    await decision
      .getByRole('button', { name: copy('reject'), exact: true })
      .click();
    await expect(
      decision.getByText('Synthetic rejection reason', { exact: true }),
    ).toBeVisible();
    await expect(
      decision.getByText(copy('rejected'), { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(
        `contract-rejected-${locale}-${testInfo.project.name}.png`,
      ),
    });
    expect(referenceDenied).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
