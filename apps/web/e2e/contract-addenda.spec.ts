import { contractMessages } from '../src/contract/contract.copy';
import { expect, test } from '@playwright/test';
import { contractAddendumMessages } from '../src/contract/contract-addendum.copy';
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
    contractPermissions: [
      'commercial.contract.read',
      'commercial.contract.prepare',
      'commercial.contract.project.link',
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
const requestSubject = 'Contract checks Request';
const detail = buildClientRequest({
  id: 'request-one',
  companyId: company.id,
  subject: requestSubject,
  originalText: 'Synthetic captured evidence',
  capturedByWorkspaceMembershipId: 'member-one',
  capturedAt: '2026-10-07T06:00:00.000Z',
  clientAssociationStatus: 'hidden',
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
    'C8 creates, revises and reopens distinct Addenda by keyboard in ' + locale,
    async ({ page }, testInfo) => {
      const copy = (key: (typeof contractAddendumMessages.keys)[number]) =>
        resolveMessage(contractAddendumMessages, locale, key);
      const versionCopy = (
        key: (typeof contractVersionMessages.keys)[number],
      ) => resolveMessage(contractVersionMessages, locale, key);
      await page.addInitScript(
        ({ key, locale }) => window.localStorage.setItem(key, locale),
        { key: interfaceLocaleStorageKey, locale },
      );
      const run = {
        id: 'run-one',
        contractVersionId: 'version-one',
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
          'PROVISIONAL_MARKER_PRESENT',
        ].map((code) => ({ code, status: 'PASS' })),
      };
      const decision = {
        id: 'decision-one',
        contractVersionId: 'version-one',
        revision: 2,
        kind: 'APPROVE',
        actorWorkspaceMembershipId: 'member-one',
        decidedAt: run.evaluatedAt,
        qualityRun: run,
        acknowledgedWarningCodes: [],
        representationChecksum: '1'.repeat(64),
      };
      const parent = {
        id: 'contract-one',
        companyId: company.id,
        opportunityId: 'opportunity-one',
        kind: 'CONTRACT',
        origin: 'ACCEPTED_OFFER',
        sourceOfferId: 'offer-one',
        sourceOfferVersionId: 'accepted-version',
        sourceOffer: { illustrativeReference: 1, versionNumber: 1 },
        illustrativeReference: 1,
        revision: 3,
        provisional: true,
        linkedProjects: [],
        version: {
          id: 'version-one',
          versionNumber: 1,
          createdContractRevision: 1,
          predecessorVersionId: null,
          supersededByVersionId: null,
          differences: [],
          recipient: {
            kind: 'PRIMARY',
            legalName: 'Synthetic parent party',
            taxId: 'SYNTHETIC',
            legalAddress: 'Example Street',
          },
          qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
          qualityRuleSetVersion: 1,
          issuingCompanyLabel: company.displayName,
          scopeNote: 'Exact executed parent content',
          commercialConditions: null,
          termStartsOn: null,
          termEndsOn: null,
          specialConditions: null,
          pricingSnapshotId: 'snapshot-one',
          pricingSnapshot: {
            id: 'snapshot-one',
            currency: 'EUR',
            subtotal: '300.00',
            taxTotal: '45.00',
            total: '345.00',
            lines: [],
          },
          latestQualityRun: run,
          decisionState: 'APPROVED',
          decision,
          executionState: 'EXECUTED',
          signature: {
            id: 'signature-one',
            contractVersionId: 'version-one',
            revision: 3,
            evidenceKind: 'SIMULATED',
            provenance: 'ILLUSTRATIVE',
            provisional: true,
            actorWorkspaceMembershipId: 'member-one',
            recordedAt: run.evaluatedAt,
            providerSignatoryLabel: 'Provider',
            clientSignatoryLabel: 'Client',
            providerSignedOn: '2026-10-07',
            clientSignedOn: '2026-10-07',
            note: null,
            qualityRun: run,
            acknowledgedWarningCodes: [],
            representationChecksum: decision.representationChecksum,
          },
          provenance: 'ILLUSTRATIVE',
          provisional: true,
        },
      };
      let count = 0,
        head = 1;
      const attempts: Array<{ body: string | null; key: string | undefined }> =
        [];
      const child = (ordinal: number, number = 1) => ({
        ...parent,
        id: 'child-' + ordinal,
        kind: 'ADDENDUM',
        origin: null,
        sourceOfferId: null,
        sourceOfferVersionId: null,
        sourceOffer: null,
        parentContractId: parent.id,
        addendumOrdinal: ordinal,
        parent: {
          id: parent.id,
          kind: 'CONTRACT',
          illustrativeReference: 1,
          versionNumber: 1,
          revision: 3,
        },
        revision: number,
        version: {
          ...parent.version,
          id: 'child-' + ordinal + '-version-' + number,
          versionNumber: number,
          createdContractRevision: number,
          predecessorVersionId: number === 1 ? null : 'child-1-version-1',
          supersededByVersionId: null,
          decisionState: 'PENDING',
          decision: null,
          executionState: 'NOT_EXECUTED',
          signature: null,
          latestQualityRun: null,
          scopeNote: null,
          pricingSnapshotId: null,
          pricingSnapshot: null,
          changeSummary:
            number === 2 ? 'Revised exact child' : 'Exact child ' + ordinal,
          differences:
            number === 2
              ? [
                  {
                    field: 'changeSummary',
                    before: 'Exact child 1',
                    after: 'Revised exact child',
                  },
                ]
              : [],
        },
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
        if (path.endsWith('/addenda')) {
          attempts.push({
            body: sent.postData(),
            key: sent.headers()['idempotency-key'],
          });
          if (attempts.length === 1) {
            count = 1;
            return route.abort('failed');
          }
          if (attempts.length > 2) count = 2;
          return route.fulfill({ status: 201, json: child(count) });
        }
        if (path.endsWith('/versions') && sent.method() === 'POST') {
          head = 2;
          return route.fulfill({
            status: 201,
            json: {
              contractId: 'child-1',
              contractVersionId: 'child-1-version-2',
              versionNumber: 2,
              revision: 2,
              provisional: true,
            },
          });
        }
        const ordinal = path.includes('/agreements/child-2') ? 2 : 1;
        if (path.endsWith('/versions'))
          return route.fulfill({
            json: {
              items: path.includes('/agreements/')
                ? [child(ordinal, ordinal === 1 ? head : 1).version]
                : [parent.version],
              nextCursor: null,
            },
          });
        if (path.includes('/agreements/child-'))
          return route.fulfill({
            json: { contract: child(ordinal, ordinal === 1 ? head : 1) },
          });
        if (path.endsWith('/contracts/opportunities/opportunity-one'))
          return route.fulfill({
            json: {
              contract: {
                ...parent,
                addenda: Array.from({ length: count }, (_, index) => ({
                  id: 'child-' + (index + 1),
                  addendumOrdinal: index + 1,
                  illustrativeReference: 1,
                  versionNumber: index === 0 ? head : 1,
                  decisionState: 'PENDING',
                  executionState: 'NOT_EXECUTED',
                })),
              },
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
        .getByRole('textbox', { name: copy('summary'), exact: true })
        .fill('Exact child 1');
      await panel
        .getByRole('button', { name: copy('create'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByText(copy('uncertain'), { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole('textbox', { name: copy('summary'), exact: true }),
      ).toBeDisabled();
      await panel
        .getByRole('button', { name: copy('retry'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByRole('button', { name: copy('back'), exact: true }),
      ).toBeVisible();
      expect(attempts[1]).toEqual(attempts[0]);
      await expect(
        panel.getByText(copy('noSnapshot'), { exact: true }),
      ).toBeVisible();
      await panel
        .getByRole('textbox', { name: copy('summary'), exact: true })
        .fill('Revised exact child');
      await panel
        .getByRole('button', { name: copy('revise'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel
          .getByRole('definition')
          .filter({ hasText: /^Revised exact child$/ }),
      ).toBeVisible();
      await expect(
        panel
          .getByRole('region', {
            name: versionCopy('differences'),
            exact: true,
          })
          .getByText(versionCopy('changeSummary'), { exact: true }),
      ).toBeVisible();
      await panel.screenshot({
        path: testInfo.outputPath(
          'c8-revised-' + locale + '-' + testInfo.project.name + '.png',
        ),
      });
      await panel
        .getByRole('button', { name: copy('back'), exact: true })
        .click();
      await expect(
        panel.getByText('Exact executed parent content', { exact: true }),
      ).toBeVisible();
      await panel
        .getByRole('textbox', { name: copy('summary'), exact: true })
        .fill('Exact child 2');
      await panel
        .getByRole('button', { name: copy('create'), exact: true })
        .click();
      await expect(
        panel.getByRole('definition').filter({ hasText: 'Exact child 2' }),
      ).toBeVisible();
      await panel
        .getByRole('button', { name: copy('back'), exact: true })
        .click();
      const list = panel.getByRole('region', {
        name: copy('title'),
        exact: true,
      });
      await expect(list.getByRole('button')).toHaveText([
        copy('open') + ' 1',
        copy('open') + ' 2',
      ]);
      await list
        .getByRole('button', { name: copy('open') + ' 1', exact: true })
        .click();
      await expect(
        panel
          .getByRole('definition')
          .filter({ hasText: /^Revised exact child$/ }),
      ).toBeVisible();
      await panel
        .getByRole('button', { name: copy('back'), exact: true })
        .click();
      await panel.screenshot({
        path: testInfo.outputPath(
          'c8-parent-' + locale + '-' + testInfo.project.name + '.png',
        ),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    },
  );
