import { contractMessages } from '../src/contract/contract.copy';
import { expect, test } from '@playwright/test';
import { contractDecisionMessages } from '../src/contract/contract-decision.copy';
import { contractPrecontractMessages } from '../src/contract/contract-precontract.copy';
import { resolveMessage } from '../src/localization/messages';
import {
  interfaceLocales,
  interfaceLocaleStorageKey,
} from '../src/localization/interface-locale';
import type { ActorContext } from '../src/access-types';
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
  displayName: 'Reader',
  email: 'reader@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    ...company,
    clientPermissions: ['client.read'],
    offerPermissions: [
      'commercial.offer.read',
      'commercial.offer.prepare',
      'commercial.offer.transmission.record',
      'commercial.pricing.snapshot.read',
    ],
    offerPermissionAssignmentId: 'offer-one',
    offerPermissionSetVersion: 'v1',
    contractPermissions: [
      'commercial.contract.read',
      'commercial.contract.prepare',
      'commercial.contract.project.link',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
    ],
    contractApproverAssignmentId: 'approver-one',
    contractApproverPermissionSetVersion: 'v1',
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
const requestSubject = 'Precontract Request';
const detail = buildClientRequest({
  id: 'request-one',
  companyId: company.id,
  subject: requestSubject,
  originalText: 'Synthetic captured evidence',
  capturedByWorkspaceMembershipId: 'member-one',
  capturedAt: '2026-10-07T06:00:00.000Z',
  clientAssociationStatus: 'visible',
  clientReference: {
    originalClientId: 'client-one',
    currentClientId: 'client-one',
    displayName: 'Synthetic Client',
  },
  initialOpportunity: {
    id: 'opportunity-one',
    title: 'Precontract Opportunity',
    nextAction: 'Prepare preliminary work',
    responsibleActor: {
      workspaceMembershipId: 'member-one',
      displayName: 'Reader',
    },
  },
});
const run = {
  id: 'precontract-run',
  contractVersionId: 'precontract-version',
  ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
  ruleSetVersion: 1,
  actorWorkspaceMembershipId: 'member-one',
  evaluatedAt: '2026-10-07T09:00:00.000Z',
  results: [
    'SOURCE_COMPANY_MATCHES',
    'PARTY_AVAILABLE',
    'PARTY_MATCHES_SOURCE',
    'PARTY_IDENTITY_MATCHES_SOURCE',
    'PARTY_IDENTITY_CURRENT',
    'PARTY_TAX_ID_RECORDED',
    'PRICE_MATCHES_ACCEPTED_OFFER',
    'PRICING_SNAPSHOT_COHERENT',
    'CONDITIONS_MATCH_ACCEPTED_OFFER',
    'ADDED_CONDITIONS_CONFIRMED',
    'TERM_END_NOT_PASSED',
    'PROVISIONAL_MARKER_PRESENT',
  ].map((code) => ({
    code,
    status: code === 'ADDED_CONDITIONS_CONFIRMED' ? 'WARNING' : 'PASS',
  })),
};

for (const locale of interfaceLocales)
  test(
    'C7 creates, retries, reviews and approves a Precontract with the keyboard in ' +
      locale,
    async ({ page }, testInfo) => {
      const copy = (key: (typeof contractPrecontractMessages.keys)[number]) =>
          resolveMessage(contractPrecontractMessages, locale, key),
        decisionCopy = (key: (typeof contractDecisionMessages.keys)[number]) =>
          resolveMessage(contractDecisionMessages, locale, key);
      await page.addInitScript(
        ({ key, locale }) => window.localStorage.setItem(key, locale),
        { key: interfaceLocaleStorageKey, locale },
      );
      let created = false,
        approved = false;
      const attempts: Array<{ body: string | null; key: string | undefined }> =
          [],
        approvals: unknown[] = [];
      const precontract = () => ({
        id: 'precontract-one',
        companyId: company.id,
        opportunityId: 'opportunity-one',
        kind: 'PRECONTRACT',
        origin: 'ACCEPTED_OFFER',
        sourceOfferId: 'offer-one',
        sourceOfferVersionId: 'accepted-version',
        sourceOffer: { illustrativeReference: 3, versionNumber: 1 },
        parent: null,
        parentContractId: null,
        addendumOrdinal: null,
        precontract: null,
        illustrativeReference: 1,
        revision: approved ? 2 : 1,
        provisional: true,
        linkedProjects: [],
        addenda: [],
        version: {
          id: 'precontract-version',
          versionNumber: 1,
          provenance: 'ILLUSTRATIVE',
          provisional: true,
          createdContractRevision: 1,
          predecessorVersionId: null,
          supersededByVersionId: null,
          differences: [],
          recipient: {
            kind: 'PRIMARY',
            legalName: 'Synthetic Client',
            taxId: 'SYNTHETIC',
            legalAddress: 'Synthetic address',
          },
          qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
          qualityRuleSetVersion: 1,
          issuingCompanyLabel: company.displayName,
          scopeNote: 'Accepted scope',
          commercialConditions: null,
          termStartsOn: null,
          termEndsOn: '2026-12-31',
          specialConditions: null,
          preliminaryWork: {
            scope: 'Synthetic preliminary survey',
            financialConditions: 'Synthetic advance',
            limits: 'Synthetic limit until the Contract',
          },
          changeSummary: null,
          pricingSnapshotId: 'snapshot-one',
          pricingSnapshot: {
            id: 'snapshot-one',
            currency: 'EUR',
            subtotal: '300.00',
            taxTotal: '45.00',
            total: '345.00',
            lines: [],
          },
          decisionState: approved ? 'APPROVED' : 'PENDING',
          decision: approved ? decision() : null,
          executionState: 'NOT_EXECUTED',
          signature: null,
          latestQualityRun: approved ? run : null,
        },
      });
      const decision = () => ({
        id: 'precontract-decision',
        contractVersionId: 'precontract-version',
        revision: 2,
        kind: 'APPROVE',
        actorWorkspaceMembershipId: 'member-one',
        decidedAt: '2026-10-07T09:00:00.000Z',
        qualityRun: run,
        acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
        representationChecksum: '1'.repeat(64),
      });
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
              items: [requestListItemFor(detail)],
            },
          });
        if (path.endsWith('/commercial-intake/requests/request-one'))
          return route.fulfill({ json: detail });
        if (path.startsWith('/api/offers/opportunities/'))
          return route.fulfill({
            json: {
              offer: {
                version: {
                  id: 'accepted-version',
                  clientResponseState: 'ACCEPTED',
                  provenance: 'ILLUSTRATIVE',
                  provisional: true,
                  decisionState: 'APPROVED',
                  supersededByVersionId: null,
                },
              },
            },
          });
        if (
          path === '/api/contracts/opportunities/opportunity-one' &&
          sent.method() === 'POST'
        ) {
          attempts.push({
            body: sent.postData(),
            key: sent.headers()['idempotency-key'],
          });
          created = true;
          if (attempts.length === 1) return route.abort('failed');
          return route.fulfill({ status: 201, json: precontract() });
        }
        if (path.endsWith('/quality-checks') && sent.method() === 'POST')
          return route.fulfill({ status: 201, json: run });
        if (path.endsWith('/quality-checks'))
          return route.fulfill({ json: { items: [], nextCursor: null } });
        if (path.endsWith('/approve')) {
          const body: unknown = sent.postDataJSON();
          approvals.push(body);
          if (
            typeof body !== 'object' ||
            body === null ||
            !('acknowledgedWarningCodes' in body) ||
            !Array.isArray(body.acknowledgedWarningCodes) ||
            body.acknowledgedWarningCodes.length !== 1
          )
            return route.fulfill({
              status: 409,
              json: { code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED' },
            });
          approved = true;
          return route.fulfill({ status: 201, json: decision() });
        }
        if (path.endsWith('/versions'))
          return route.fulfill({
            json: { items: [precontract().version], nextCursor: null },
          });
        if (path.endsWith('/representation'))
          return route.fulfill({
            json: {
              contractId: 'precontract-one',
              contractVersionId: 'precontract-version',
              templateCode: 'PRECONTRACT_ILLUSTRATIVE',
              templateVersion: 1,
              clauseVersions: [
                'CL_SUBJECT',
                'CL_PRICE',
                'CL_TERM',
                'CL_CONDITIONS',
                'CL_PRELIMINARY_WORK',
                'CL_GENERAL',
              ].map((code) => ({ code, version: 1 })),
              html: '<h1>Illustrative Precontract</h1><h2>Preliminary work — CL_PRELIMINARY_WORK v1</h2>',
              sha256: '1'.repeat(64),
            },
          });
        if (path.endsWith('/agreements/precontract-one'))
          return route.fulfill({ json: { contract: precontract() } });
        if (path === '/api/contracts/opportunities/opportunity-one')
          return route.fulfill({
            json: {
              contract: null,
              precontract: created
                ? {
                    id: 'precontract-one',
                    illustrativeReference: 1,
                    versionNumber: 1,
                    decisionState: approved ? 'APPROVED' : 'PENDING',
                    executionState: 'NOT_EXECUTED',
                  }
                : null,
            },
          });
        return route.fulfill({ json: { items: [], nextCursor: null } });
      });
      await page.goto('/?frame=prisme#requests');
      await page
        .getByRole('button')
        .filter({ has: page.getByText(requestSubject, { exact: true }) })
        .click();
      const panel = page.getByRole('region', {
        name: resolveMessage(contractMessages, locale, 'title'),
        exact: true,
      });
      const editor = panel.getByRole('region', {
        name: copy('create'),
        exact: true,
      });
      await editor
        .getByRole('textbox', { name: copy('scope'), exact: true })
        .fill('Synthetic preliminary survey');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Synthetic advance');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Synthetic limit until the Contract');
      await editor.getByLabel(copy('end'), { exact: true }).fill('2026-12-31');
      await editor
        .getByRole('button', { name: copy('create'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        editor.getByText(copy('uncertain'), { exact: true }),
      ).toBeVisible();
      await expect(
        editor.getByRole('textbox', { name: copy('scope'), exact: true }),
      ).toBeDisabled();
      await editor
        .getByRole('button', { name: copy('retry'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByText(copy('success'), { exact: true }),
      ).toBeVisible();
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(JSON.parse(attempts[0]?.body ?? '{}')).toEqual({
        kind: 'PRECONTRACT',
        acceptedOfferVersionId: 'accepted-version',
        preliminaryWorkScope: 'Synthetic preliminary survey',
        preliminaryFinancialConditions: 'Synthetic advance',
        preliminaryLimits: 'Synthetic limit until the Contract',
        termStartsOn: null,
        termEndsOn: '2026-12-31',
        specialConditions: null,
      });
      await expect(
        panel.getByRole('heading', { name: copy('title'), exact: true }),
      ).toBeVisible();
      await expect(
        panel
          .getByRole('definition')
          .filter({ hasText: /^Synthetic limit until the Contract$/u }),
      ).toBeVisible();
      await panel
        .getByRole('button', {
          name: 'Run Contract Quality Checks',
          exact: true,
        })
        .click();
      await expect(
        panel.getByText('Contract checks completed with warnings.', {
          exact: true,
        }),
      ).toBeVisible();
      const decisionRegion = panel.getByRole('region', {
        name: decisionCopy('title'),
        exact: true,
      });
      await decisionRegion
        .getByRole('button', { name: decisionCopy('approve'), exact: true })
        .click();
      await expect(
        decisionRegion.getByText(decisionCopy('warnings'), { exact: true }),
      ).toBeVisible();
      await expect(decisionRegion.getByRole('checkbox')).toHaveCount(1);
      await decisionRegion.getByRole('checkbox').check();
      await panel
        .getByRole('button', { name: decisionCopy('approve'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByText(decisionCopy('success'), { exact: true }),
      ).toBeVisible();
      expect(approvals.at(-1)).toEqual({
        expectedContractRevision: 1,
        acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
      });
      await panel.screenshot({
        path: testInfo.outputPath(
          'c7-precontract-' + locale + '-' + testInfo.project.name + '.png',
        ),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await panel
        .getByRole('button', { name: copy('back'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      const listed = panel.getByRole('region', {
        name: copy('section'),
        exact: true,
      });
      await expect(
        listed.getByRole('button', { name: copy('open'), exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole('region', { name: copy('create'), exact: true }),
      ).toHaveCount(0);
    },
  );
