import { contractRecordedLocales } from '../src/test/contract-recorded-values-fixture';
import { chooseContractLocale } from './contract-recorded-values';
import { contractMessages } from '../src/contract/contract.copy';
import { expect, test } from '@playwright/test';
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
      const expected = contractRecordedLocales.find(
        (item) => item.locale === locale,
      );
      if (!expected) throw new Error('Missing locale expectations');
      const displayVersion = (number: number) =>
        number === 1 ? expected.ordinal : expected.ordinal.slice(0, -1) + '1';
      const calls: string[] = [];
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
        revision: number + 999,
        illustrativeReference: 1,
        provisional: true,
        version: {
          id: 'version-' + number,
          versionNumber: number + 999,
          createdContractRevision: number + 999,
          predecessorVersionId: number === 1 ? 'version-999' : 'version-1',
          supersededByVersionId:
            number === 1 && head === 2 ? 'version-2' : null,
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
                  { field: 'termStartsOn', before: null, after: '2028-02-29' },
                  {
                    field: 'termEndsOn',
                    before: '2028-02-29',
                    after: '2028-03-01',
                  },
                ],
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
          commercialConditions: 'Accepted conditions',
          termStartsOn: number === 2 ? '2028-02-29' : null,
          termEndsOn: number === 2 ? '2028-03-01' : '2028-02-29',
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
            subtotal: '345.00',
            taxTotal: '0.00',
            total: '345.00',
            lines: [
              {
                serviceName: 'Illustrative service',
                quantity: '1',
                lineNet: '345.00',
                lineTax: '0.00',
              },
            ],
          },
        },
      });
      await page.route('**/api/**', async (route) => {
        const sent = route.request(),
          path = new URL(sent.url()).pathname;
        calls.push(path);
        if (path.endsWith('/access/current-actor'))
          return route.fulfill({ json: currentActor });
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
        if (path.endsWith('/contracts/opportunities/opportunity-one'))
          return route.fulfill({ json: { contract: contract(head) } });
        if (path.endsWith('/versions/version-1'))
          return route.fulfill({ json: { contract: contract(1) } });
        if (path.endsWith('/versions/version-2'))
          return route.fulfill({ json: { contract: contract(2) } });
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
                versionNumber: 1001,
                revision: 1001,
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
          .filter({ has: page.getByText(requestSubject, { exact: true }) })
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
          name: copy('version') + ' ' + displayVersion(1),
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
      await revisions.getByLabel(copy('start')).fill('2028-02-29');
      await revisions.getByLabel(copy('end')).fill('2028-03-01');
      await revisions
        .getByRole('button', { name: copy('create'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        revisions.getByText(copy('uncertain'), { exact: true }),
      ).toBeVisible();
      await expect(revisions.getByLabel(copy('conditions'))).toBeDisabled();
      const uncertainReads = calls.length;
      const alternate = locale === 'fr' ? 'ru' : 'fr';
      await chooseContractLocale(page, locale, alternate);
      await expect(
        page.getByText(
          resolveMessage(contractVersionMessages, alternate, 'uncertain'),
          { exact: true },
        ),
      ).toBeVisible();
      expect(calls).toHaveLength(uncertainReads);
      await chooseContractLocale(page, alternate, locale);
      expect(calls).toHaveLength(uncertainReads);
      await revisions
        .getByRole('button', { name: copy('retry'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        history.getByRole('button', {
          name: copy('version') + ' ' + displayVersion(2),
          exact: true,
        }),
      ).toBeDisabled();
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(JSON.parse(attempts[0]?.body ?? 'null')).toMatchObject({
        expectedContractRevision: 1000,
        termStartsOn: '2028-02-29',
        termEndsOn: '2028-03-01',
        specialConditions: 'Exact revised text',
      });
      await expect(
        history
          .getByRole('region', { name: copy('differences'), exact: true })
          .getByText(copy('specialConditions'), { exact: true }),
      ).toBeVisible();
      await expect(
        history.getByText(copy('after') + ': ' + expected.start, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        history.getByText(copy('after') + ': ' + expected.end, { exact: true }),
      ).toBeVisible();
      const historic = history.getByRole('button', {
        name: copy('version') + ' ' + expected.ordinal,
        exact: true,
      });
      await historic.focus();
      await page.keyboard.press('Enter');
      await expect(historic).toBeDisabled();
      expect(calls.some((path) => path.endsWith('/versions/version-1'))).toBe(
        true,
      );
      const historicReads = calls.length;
      await chooseContractLocale(page, locale, alternate);
      await expect(
        page.getByRole('button', {
          name:
            resolveMessage(contractVersionMessages, alternate, 'version') +
            ' ' +
            (alternate === 'fr' ? '1\u202f000' : '1\u00a0000'),
          exact: true,
        }),
      ).toBeDisabled();
      expect(calls).toHaveLength(historicReads);
      await chooseContractLocale(page, alternate, locale);
      expect(calls).toHaveLength(historicReads);
      await history
        .getByRole('button', {
          name: copy('version') + ' ' + displayVersion(2),
          exact: true,
        })
        .click();
      await expect(
        history.getByText(copy('after') + ': ' + expected.start, {
          exact: true,
        }),
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
          name: copy('version') + ' ' + displayVersion(2),
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
        .getByRole('region', {
          name: resolveMessage(contractMessages, locale, 'title'),
          exact: true,
        })
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
