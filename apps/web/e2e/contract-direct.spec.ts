import { contractMessages } from '../src/contract/contract.copy';
import { contractDecisionMessages } from '../src/contract/contract-decision.copy';
import { expect, test } from '@playwright/test';
import { contractDirectMessages } from '../src/contract/contract-direct.copy';
import { contractVersionMessages } from '../src/contract/contract-version.copy';
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
    pricingUserPermissionAssignmentId: 'pricing-one',
    pricingUserPermissionSetVersion: 'v1',
    pricingUserPermissions: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.calculate',
      'commercial.pricing.snapshot.read',
    ],
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
const requestSubject = 'Contract checks Request';
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
    title: 'Contract checks Opportunity',
    nextAction: 'Review Contract checks',
    responsibleActor: {
      workspaceMembershipId: 'member-one',
      displayName: 'Reader',
    },
  },
});

for (const locale of interfaceLocales)
  test(
    'C9 creates, retries and revises DIRECT without Offer access in ' + locale,
    async ({ page }, testInfo) => {
      const copy = (key: (typeof contractDirectMessages.keys)[number]) =>
          resolveMessage(contractDirectMessages, locale, key),
        versionCopy = (key: (typeof contractVersionMessages.keys)[number]) =>
          resolveMessage(contractVersionMessages, locale, key);
      await page.addInitScript(
        ({ key, locale }) => window.localStorage.setItem(key, locale),
        { key: interfaceLocaleStorageKey, locale },
      );
      const decisionCopy = (
        key: (typeof contractDecisionMessages.keys)[number],
      ) => resolveMessage(contractDecisionMessages, locale, key);
      let head = 0;
      const attempts: Array<{ body: string | null; key: string | undefined }> =
          [],
        calls: string[] = [];
      const run = () => ({
        id: 'direct-run-' + head,
        contractVersionId: 'version-' + head,
        ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
        ruleSetVersion: 1,
        actorWorkspaceMembershipId: 'member-one',
        evaluatedAt: '2026-10-07T09:00:00.000Z',
        results: [
          'SOURCE_COMPANY_MATCHES',
          'PARTY_AVAILABLE',
          'PARTY_IDENTITY_CURRENT',
          'PARTY_TAX_ID_RECORDED',
          'PRICING_SNAPSHOT_COHERENT',
          'DIRECT_ORIGIN_REVIEWED',
          'PROVISIONAL_MARKER_PRESENT',
        ].map((code) => ({
          code,
          status: code === 'DIRECT_ORIGIN_REVIEWED' ? 'WARNING' : 'PASS',
        })),
      });
      const approvals: unknown[] = [];
      const contract = (number = head) => ({
        id: 'contract-one',
        companyId: company.id,
        opportunityId: 'opportunity-one',
        kind: 'CONTRACT',
        origin: 'DIRECT',
        directReason: ' Exact internal reason ',
        sourceOfferId: null,
        sourceOfferVersionId: null,
        sourceOffer: null,
        parent: null,
        parentContractId: null,
        addendumOrdinal: null,
        illustrativeReference: 1,
        revision: number,
        provisional: true,
        linkedProjects: [],
        addenda: [],
        version: {
          id: 'version-' + number,
          versionNumber: number,
          provenance: 'ILLUSTRATIVE',
          provisional: true,
          createdContractRevision: number,
          predecessorVersionId: number === 2 ? 'version-1' : null,
          supersededByVersionId:
            number === 1 && head === 2 ? 'version-2' : null,
          differences:
            number === 2
              ? [
                  {
                    field: 'scopeNote',
                    before: ' Exact direct scope ',
                    after: 'Revised direct scope',
                  },
                ]
              : [],
          recipient: {
            kind: 'PRIMARY',
            legalName: 'Synthetic Client',
            taxId: 'SYNTHETIC',
            legalAddress: 'Synthetic address',
          },
          qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
          qualityRuleSetVersion: 1,
          issuingCompanyLabel: company.displayName,
          scopeNote:
            number === 2 ? 'Revised direct scope' : ' Exact direct scope ',
          commercialConditions: null,
          termStartsOn: null,
          termEndsOn: null,
          specialConditions: null,
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
          decisionState: 'PENDING',
          decision: null,
          executionState: 'NOT_EXECUTED',
          signature: null,
          latestQualityRun: number === 2 ? run() : null,
        },
      });
      await page.route('**/api/**', async (route) => {
        const sent = route.request(),
          path = new URL(sent.url()).pathname;
        calls.push(path);
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
        if (path.endsWith('/snapshots'))
          return route.fulfill({
            json: {
              items: [
                {
                  id: 'snapshot-one',
                  currency: 'EUR',
                  total: '345.00',
                  committedAt: '2026-10-07T09:00:00.000Z',
                },
              ],
              nextCursor: null,
            },
          });
        if (path.endsWith('/legal-entities'))
          return route.fulfill({
            json: { clientVersion: 1, legalEntities: [] },
          });
        if (path.endsWith('/direct')) {
          attempts.push({
            body: sent.postData(),
            key: sent.headers()['idempotency-key'],
          });
          head = 1;
          if (attempts.length === 1) return route.abort('failed');
          return route.fulfill({ status: 201, json: contract() });
        }
        if (path.endsWith('/approve')) {
          const body: unknown = sent.postDataJSON();
          approvals.push(body);
          if (
            typeof body !== 'object' ||
            body === null ||
            !('acknowledgedWarningCodes' in body) ||
            !Array.isArray(body.acknowledgedWarningCodes) ||
            body.acknowledgedWarningCodes.length !== 1 ||
            body.acknowledgedWarningCodes[0] !== 'DIRECT_ORIGIN_REVIEWED'
          )
            return route.fulfill({
              status: 409,
              json: { code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED' },
            });
          return route.fulfill({
            status: 201,
            json: {
              id: 'direct-decision',
              contractVersionId: 'version-' + head,
              revision: 3,
              kind: 'APPROVE',
              actorWorkspaceMembershipId: 'member-one',
              decidedAt: '2026-10-07T09:00:00.000Z',
              qualityRun: run(),
              acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
              representationChecksum: '1'.repeat(64),
            },
          });
        }
        if (path.endsWith('/versions') && sent.method() === 'POST') {
          head = 2;
          return route.fulfill({
            status: 201,
            json: {
              contractId: 'contract-one',
              contractVersionId: 'version-2',
              revision: 2,
              versionNumber: 2,
              provisional: true,
            },
          });
        }
        if (path.endsWith('/versions'))
          return route.fulfill({
            json: {
              items: [
                contract().version,
                ...(head === 2 ? [contract(1).version] : []),
              ],
              nextCursor: null,
            },
          });
        if (path.endsWith('/representation'))
          return route.fulfill({
            json: {
              contractId: 'contract-one',
              contractVersionId: 'version-' + head,
              templateCode: 'CONTRACT_ILLUSTRATIVE',
              templateVersion: 1,
              clauseVersions: [
                'CL_SUBJECT',
                'CL_PRICE',
                'CL_TERM',
                'CL_CONDITIONS',
                'CL_GENERAL',
              ].map((code) => ({ code, version: 1 })),
              html: '<h1>Provisional illustrative direct Contract</h1><p>Direct origin</p>',
              sha256: '1'.repeat(64),
            },
          });
        if (path.includes('/contracts/opportunities/'))
          return route.fulfill({
            json: {
              contract: head
                ? contract(path.endsWith('/version-1') ? 1 : head)
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
      await panel
        .getByRole('textbox', { name: copy('reason'), exact: true })
        .fill(' Exact internal reason ');
      await panel
        .getByRole('textbox', { name: copy('scope'), exact: true })
        .fill(' Exact direct scope ');
      await panel
        .getByRole('button', { name: copy('create'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByText(copy('uncertain'), { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole('textbox', { name: copy('reason'), exact: true }),
      ).toBeDisabled();
      await panel
        .getByRole('button', { name: copy('retry'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByText(copy('origin'), { exact: true }),
      ).toBeVisible();
      expect(attempts[1]).toEqual(attempts[0]);
      await panel
        .getByRole('textbox', { name: copy('scope'), exact: true })
        .fill('Revised direct scope');
      await panel
        .getByRole('button', { name: copy('revise'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel
          .getByRole('definition')
          .filter({ hasText: /^Revised direct scope$/ }),
      ).toBeVisible();
      await expect(
        panel
          .getByRole('region', { name: versionCopy('history'), exact: true })
          .getByRole('button'),
      ).toHaveCount(2);
      await panel
        .getByRole('button', { name: decisionCopy('approve'), exact: true })
        .click();
      await expect(
        panel.getByText(decisionCopy('warnings'), { exact: true }),
      ).toBeVisible();
      await panel
        .getByRole('checkbox', {
          name: decisionCopy('acknowledge') + ': ' + copy('review'),
          exact: true,
        })
        .check();
      await panel
        .getByRole('button', { name: decisionCopy('approve'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByText(decisionCopy('success'), { exact: true }),
      ).toBeVisible();
      expect(approvals).toEqual([
        { expectedContractRevision: 2, acknowledgedWarningCodes: [] },
        {
          expectedContractRevision: 2,
          acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
        },
      ]);
      expect(calls.some((path) => path.includes('/offers/'))).toBe(false);
      await panel.screenshot({
        path: testInfo.outputPath(
          'c9-direct-' + locale + '-' + testInfo.project.name + '.png',
        ),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    },
  );
