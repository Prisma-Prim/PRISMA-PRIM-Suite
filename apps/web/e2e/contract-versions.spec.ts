import { expect, test } from '@playwright/test';
import { contractVersionMessages } from '../src/contract/contract-version.copy';
import { resolveMessage } from '../src/localization/messages';
import {
  interfaceLocales,
  interfaceLocaleStorageKey,
} from '../src/localization/interface-locale';
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
    clientPermissions: ['client.read'],
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
for (const locale of interfaceLocales)
  test(
    'requires current Client read and revises by keyboard with exact retry in ' +
      locale,
    async ({ page }, testInfo) => {
      const copy = (key: (typeof contractVersionMessages.keys)[number]) =>
        resolveMessage(contractVersionMessages, locale, key);
      await page.addInitScript(
        ({ key, locale }) => window.localStorage.setItem(key, locale),
        { key: interfaceLocaleStorageKey, locale },
      );
      let head = 1;
      const ownerWithoutClientRead: ActorContext = {
        ...actor,
        workspacePermissions: ['client.manage'],
        activeCompany: { ...actor.activeCompany, clientPermissions: [] },
      };
      let currentActor: ActorContext = ownerWithoutClientRead;
      const attempts: Array<{ body: string | null; key: string | undefined }> =
        [];
      const contract = (number: number) => ({
        id: 'contract-one',
        companyId: company.id,
        opportunityId: 'opportunity-one',
        kind: 'CONTRACT',
        origin: 'ACCEPTED_OFFER',
        sourceOfferId: 'offer-one',
        sourceOfferVersionId: 'accepted-version',
        sourceOffer: { illustrativeReference: 1, versionNumber: 1 },
        revision: number,
        illustrativeReference: 1,
        provisional: true,
        version: {
          id: 'version-' + number,
          versionNumber: number,
          createdContractRevision: number,
          predecessorVersionId: number === 1 ? null : 'version-1',
          supersededByVersionId: null,
          supersededAt: null,
          differences:
            number === 1
              ? []
              : [
                  {
                    field: 'specialConditions',
                    before: null,
                    after: 'Exact revised text',
                  },
                ],
          recipient: {
            kind: 'PRIMARY',
            legalName: 'Synthetic recorded party',
            taxId: 'SYNTHETIC',
            legalAddress: 'Example Street',
          },
          issuingCompanyLabel: company.displayName,
          scopeNote: 'Synthetic accepted scope',
          commercialConditions: 'Accepted conditions',
          termStartsOn: null,
          termEndsOn: null,
          specialConditions: number === 1 ? null : 'Exact revised text',
          latestQualityRun: null,
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
          return route.fulfill({ json: currentActor });
        if (path.endsWith('/companies'))
          return route.fulfill({ json: [company] });
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
                    responsibleActor:
                      detail.initialOpportunity.responsibleActor,
                  },
                },
              ],
            },
          });
        if (path.endsWith('/commercial-intake/requests/request-one'))
          return route.fulfill({ json: detail });
        if (path.endsWith('/contracts/opportunities/opportunity-one'))
          return route.fulfill({ json: { contract: contract(head) } });
        if (path.endsWith('/versions')) {
          if (sent.method() === 'POST') {
            attempts.push({
              body: sent.postData(),
              key: sent.headers()['idempotency-key'],
            });
            head = 2;
            if (attempts.length === 1) return route.abort('failed');
            return route.fulfill({
              status: 201,
              json: {
                contractId: 'contract-one',
                contractVersionId: 'version-2',
                versionNumber: 2,
                revision: 2,
                createdAt: '2026-10-09T00:00:00.000Z',
                provisional: true,
              },
            });
          }
          return route.fulfill({
            json: {
              items:
                head === 1
                  ? [contract(1).version]
                  : [contract(2).version, contract(1).version],
              nextCursor: null,
            },
          });
        }
        return route.fulfill({ json: { items: [], nextCursor: null } });
      });
      const openRequest = async () => {
        await page
          .getByRole('button')
          .filter({ has: page.getByText(detail.subject, { exact: true }) })
          .click();
      };
      const revisions = page.getByRole('region', {
        name: copy('title'),
        exact: true,
      });
      const history = page.getByRole('region', {
        name: copy('history'),
        exact: true,
      });
      await page.goto('/?frame=prisme#requests');
      await openRequest();
      await expect(
        history.getByRole('button', {
          name: copy('version') + ' 1',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText('Synthetic accepted scope')).toBeVisible();
      await expect(revisions).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: copy('create'), exact: true }),
      ).toHaveCount(0);
      expect(attempts).toHaveLength(0);
      currentActor = actor;
      await page.reload();
      await openRequest();
      await revisions.getByLabel(copy('conditions')).fill('Exact revised text');
      await revisions
        .getByRole('button', { name: copy('create'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        revisions.getByText(copy('uncertain'), { exact: true }),
      ).toBeVisible();
      await expect(revisions.getByLabel(copy('conditions'))).toBeDisabled();
      await revisions
        .getByRole('button', { name: copy('retry'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        history.getByRole('button', {
          name: copy('version') + ' 2',
          exact: true,
        }),
      ).toBeDisabled();
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      await expect(
        history
          .getByRole('region', { name: copy('differences'), exact: true })
          .getByText(copy('specialConditions'), { exact: true }),
      ).toBeVisible();
      await history.screenshot({
        path: testInfo.outputPath(
          'c6-' + locale + '-' + testInfo.project.name + '.png',
        ),
      });
      currentActor = ownerWithoutClientRead;
      await page.reload();
      await openRequest();
      await expect(
        history.getByRole('button', {
          name: copy('version') + ' 2',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText('Synthetic accepted scope')).toBeVisible();
      await expect(revisions).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: copy('create'), exact: true }),
      ).toHaveCount(0);
      expect(attempts).toHaveLength(2);
      await page
        .getByRole('region', { name: 'Contract', exact: true })
        .screenshot({
          path: testInfo.outputPath(
            'c6-client-read-revoked-' +
              locale +
              '-' +
              testInfo.project.name +
              '.png',
          ),
        });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    },
  );
