import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
  type Response,
  type TestInfo,
} from '@playwright/test';
import { openSelect, selectOption } from './select-option';

// TE-2 (#597): one commercial case from Request to signed agreement, Project
// and Activity, driven through the real UI, API and PostgreSQL. Synthetic data
// only; every price, Offer and agreement is illustrative and provisional.
// Configuration and authority are prepared through the API, as in the
// per-slice specs; the commercial case itself goes through the interface.

const apiOrigin = 'http://127.0.0.1:4174';
const webOrigin = 'http://127.0.0.1:4173';

const identities = {
  owner: {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': 'workspace-owner',
    'x-test-display-name': 'Workspace Owner',
    'x-test-email': 'owner@example.test',
  },
  // The browser identity of the local demonstration build.
  ada: {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': 'local-demonstration-user',
    'x-test-display-name': 'Ada Ionescu',
    'x-test-email': 'ada@example.test',
  },
  // The second eligible member, who becomes responsible and acts next.
  ion: {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': 'responsible-colleague',
    'x-test-display-name': 'Ion Popa',
    'x-test-email': 'ion@example.test',
  },
  // A member of BIC only.
  other: {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': 'other-company-member',
    'x-test-display-name': 'Other Company Member',
    'x-test-email': 'other-company-member@example.test',
  },
} as const;
type Identity = (typeof identities)[keyof typeof identities];

type Bundle =
  | 'company-context'
  | 'company-director-client'
  | 'company-commercial-intake'
  | 'company-service-catalogue'
  | 'company-pricing-configuration'
  | 'company-pricing-user'
  | 'company-pricing-adjustment'
  | 'company-offer-preparer'
  | 'company-offer-approver'
  | 'company-contract-preparer'
  | 'company-contract-approver'
  | 'company-project'
  | 'company-opportunity-manager'
  | 'company-sales-stage-configuration'
  | 'company-commercial-activity-reader';

const journeyBundles: readonly Bundle[] = [
  'company-context',
  'company-director-client',
  'company-commercial-intake',
  'company-service-catalogue',
  'company-pricing-configuration',
  'company-pricing-user',
  'company-pricing-adjustment',
  'company-offer-preparer',
  'company-offer-approver',
  'company-contract-preparer',
  'company-contract-approver',
  'company-project',
  'company-opportunity-manager',
  'company-sales-stage-configuration',
  'company-commercial-activity-reader',
];
const offerBundles: readonly Bundle[] = [
  'company-offer-preparer',
  'company-offer-approver',
];
// "Every bundle in BIC only" for the isolation proof (PRD 18.14 and 19.16):
// each Company role bundle the journey actor holds, except the three the
// foundation seed already grants the BIC member in BIC.
const seededOtherCompanyBundles: readonly Bundle[] = [
  'company-context',
  'company-director-client',
  'company-project',
];
const otherCompanyBundles: readonly Bundle[] = journeyBundles.filter(
  (bundle) => !seededOtherCompanyBundles.includes(bundle),
);

let initialClockOffset = 0;
test.beforeEach(async () => {
  const value: unknown = JSON.parse(await readFile(clockFile(), 'utf8'));
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Invalid synthetic acceptance clock');
  initialClockOffset = value;
});
test.afterEach(async () => {
  await writeClockOffset(initialClockOffset);
});

test('follows one commercial case from Request to signed agreement, Project and Activity', async ({
  page,
  request,
  browser,
}, testInfo) => {
  // The complete journey also follows every projected Activity version link.
  // Reserve time for those round trips; individual assertions keep their limits.
  test.setTimeout(1_200_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Commercial Journey ${suffix}`;
  const clientName = `Synthetic Journey Client ${suffix}`;
  const subject = `Journey audit request ${suffix}`;
  const opportunityTitle = `Certify the ${suffix} journey site`;
  const serviceName = `Illustrative journey audit ${suffix}`;
  const qualification = `Calificare ${suffix}`;
  const contracting = `Contractare ${suffix}`;
  // Every value the journey types that the Activity contract forbids
  // projecting (PRD 17.3, 18.10, 19.12, 23.6 and 25.2): texts, reasons,
  // conditions, signatories, the IDNO and user-entered dates. Defined once and
  // typed from here, so the leak check of step 10 cannot drift from the run.
  const entered = {
    originalText: `Exact synthetic source of the ${suffix} commercial journey.`,
    firstNextAction: 'Arrange the scoping call',
    secondNextAction: 'Confirm the audit scope with the Client',
    ionNextAction: 'Send the audit questionnaire',
    netReduction: '30.00',
    adjustmentReason: 'Synthetic loyalty reduction',
    offerScope: `Synthetic audit scope ${suffix}`,
    firstConditions: 'Synthetic first conditions',
    negotiatedConditions: 'Synthetic negotiated conditions',
    clientTaxId: `IDNO-JOURNEY-${suffix.toUpperCase()}`,
    preliminaryScope: 'Synthetic site survey before the Contract',
    preliminaryConditions: 'Synthetic advance capped at cost',
    preliminaryLimits: 'Synthetic limit: survey only',
    precontractTermEnd: '2099-12-31',
    contractTermStart: '2026-11-02',
    specialConditions: 'Synthetic special conditions agreed in negotiation',
    providerSignatory: 'Synthetic provider signatory',
    clientSignatory: 'Synthetic Client signatory',
    changeSummary: `Synthetic extension of the audit scope ${suffix}`,
    addendumTermEnd: '2100-06-30',
  } as const;
  // The Snapshot content of step 4: the configured unit amount, unit, tax
  // rate and label, rule label, the typed net reduction and every derived
  // amount (2 × 300.0000, 15 % tax, 30.00 off), plus the values the journey
  // types from server receipts: the reported received time and the signing
  // dates. Snapshot content and user-entered dates are forbidden Activity
  // content as well (PRD 25.2). The currency and quantity are not
  // distinctive enough to scan for.
  const snapshotContent = [
    '300.0000',
    'illustrative-unit',
    '15.00',
    'Illustrative tax',
    'Synthetic journey rule',
    '600.00',
    '90.00',
    entered.netReduction,
    '570.00',
    '85.50',
    '655.50',
  ];
  const typedFromReceipts: string[] = [];

  const ada = await membershipOf(request, identities.ada);
  const ion = await membershipOf(request, identities.ion);
  const companyId = await registerCompany(request, companyName, suffix);
  for (const bundle of journeyBundles)
    await grant(request, { bundle, membership: ada, companyId });
  for (const bundle of [
    'company-context',
    'company-commercial-intake',
  ] as const)
    await grant(request, { bundle, membership: ion, companyId });
  await publishIllustrativeConfiguration(request, {
    companyId,
    suffix,
    serviceName,
  });

  const journey: Journey = { page, narrow, companyName, subject };
  const intake = page.locator('.commercial-intake-workspace');
  const feedback = intake.locator(':scope > [role="alert"]');
  const sessions: Page[] = [];
  let clientRequestId = '';
  let opportunityId = '';
  let projectId = '';
  const childAgreements: {
    id: string;
    kind: 'PRECONTRACT' | 'ADDENDUM';
    versionId: string;
    qualityRunId: string;
  }[] = [];
  // The Access labels of both responsible actors, as the change records them.
  let adaLabel = '';
  let ionLabel = '';
  await page.emulateMedia({ reducedMotion: 'reduce' });

  try {
    await test.step('the Company starts without Requests', async () => {
      await openSection(journey, 'Client Requests');
      await expect(
        intake.getByText(`No Client Requests for ${companyName} yet.`, {
          exact: true,
        }),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-empty');
    });

    await test.step('register the synthetic Client without a tax identifier', async () => {
      await openSection(journey, 'Clients');
      const clients = page.locator('.client-workspace');
      await clients
        .getByRole('button', { name: 'New Client', exact: true })
        .click();
      await clients.getByLabel('Client display name').fill(clientName);
      const created = page.waitForResponse(
        mutation('POST', /^\/api\/clients$/u),
      );
      await clients
        .getByRole('button', { name: 'Create Client', exact: true })
        .click();
      expect((await created).status()).toBe(201);
      await clients.getByRole('button', { name: 'Close registration' }).click();
    });

    await test.step('1. capture the Request with its initial Opportunity, then associate the Client', async () => {
      await openSection(journey, 'Client Requests');
      await intake.getByRole('button', { name: 'Capture Request' }).click();
      await expect(feedback).toHaveText(
        'Enter the required request and Opportunity fields.',
      );
      await intake
        .getByLabel('Original request text')
        .fill(entered.originalText);
      await intake.getByLabel('Subject').fill(subject);
      await intake.getByLabel('Opportunity title').fill(opportunityTitle);
      await intake.getByLabel('Next action').fill(entered.firstNextAction);
      const captured = page.waitForResponse(
        mutation('POST', /^\/api\/commercial-intake\/requests$/u),
      );
      await intake.getByRole('button', { name: 'Capture Request' }).click();
      const capturedResponse = await captured;
      expect(capturedResponse.status()).toBe(201);
      const receipt = object(await capturedResponse.json());
      clientRequestId = text(receipt.id);
      opportunityId = text(object(receipt.initialOpportunity).id);

      await reopenRequest(journey);
      await expect(
        intake.getByText(entered.originalText, { exact: true }),
      ).toBeVisible();
      await expect(
        intake.getByText('Responsible actor: Ada Ionescu', { exact: true }),
      ).toBeVisible();
      await expect(
        intake.getByText('No Client associated', { exact: true }),
      ).toBeVisible();
      await intake
        .getByLabel('Search Clients by name', { exact: true })
        .fill(clientName);
      await intake.getByRole('button', { name: 'Search Clients' }).click();
      await selectOption(
        intake.getByLabel('Existing Client', { exact: true }),
        {
          label: clientName,
        },
      );
      const associated = page.waitForResponse(
        mutation(
          'POST',
          /^\/api\/commercial-intake\/requests\/[^/]+\/client-association$/u,
        ),
      );
      await intake
        .getByRole('button', { name: 'Confirm Client association' })
        .click();
      expect((await associated).status()).toBe(200);
      await expect(feedback).toHaveText('Client associated.');

      await reopenRequest(journey);
      await expect(requestClient(intake)).toContainText(clientName);
      await expect(
        intake.getByText(opportunityTitle, { exact: true }).first(),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-request');
    });

    await test.step('2. set the next action, then hand the case to Ion Popa', async () => {
      await intake.getByRole('button', { name: 'Edit next action' }).click();
      await intake.getByLabel('Next action').fill(entered.secondNextAction);
      const saved = page.waitForResponse(
        mutation(
          'POST',
          /^\/api\/commercial-intake\/opportunities\/[^/]+\/next-action$/u,
        ),
      );
      await intake.getByRole('button', { name: 'Save next action' }).click();
      expect((await saved).status()).toBe(200);
      await expect(feedback).toHaveText('Next action saved.');
      await reopenRequest(journey);
      await expect(
        intake.getByText(`Next action: ${entered.secondNextAction}`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        intake.getByText('Version: 2', { exact: true }),
      ).toBeVisible();

      ionLabel = await responsibleLabel(request, {
        companyId,
        opportunityId,
        membership: ion,
      });
      await intake.getByRole('button', { name: 'Change responsible' }).click();
      const choices = await openSelect(
        intake.getByLabel('New responsible actor', { exact: true }),
      );
      const colleague = choices.getByRole('option', {
        name: /^Ion Popa · [0-9A-Z]+$/u,
      });
      await expect(colleague).toHaveAttribute('data-value', ion);
      await colleague.click();
      const changed = page.waitForResponse(
        mutation(
          'POST',
          /^\/api\/commercial-intake\/opportunities\/[^/]+\/responsible$/u,
        ),
      );
      await intake.getByRole('button', { name: 'Save responsible' }).click();
      expect((await changed).status()).toBe(200);
      adaLabel = await responsibleLabel(request, {
        companyId,
        opportunityId,
        membership: ada,
      });
      await reopenRequest(journey);
      await expect(
        intake.getByText('Responsible actor: Ion Popa', { exact: true }),
      ).toBeVisible();
      await expect(
        intake.getByText('Version: 3', { exact: true }),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-reassigned');
    });

    // Ion opens the case at version 3 before Ada's next change lands.
    const ionPage = await openSession(browser, identities.ion, page);
    sessions.push(ionPage);
    const ionJourney: Journey = { ...journey, page: ionPage };
    const ionIntake = ionPage.locator('.commercial-intake-workspace');
    await test.step('Ion opens the case he is now responsible for', async () => {
      await reopenRequest(ionJourney);
      await expect(
        ionIntake.getByText('Responsible actor: Ion Popa', { exact: true }),
      ).toBeVisible();
      await expect(
        ionIntake.getByText('Version: 3', { exact: true }),
      ).toBeVisible();
    });

    await test.step('3a. without a configured stage the editor explains what is missing', async () => {
      await intake.getByRole('button', { name: 'Change Sales Stage' }).click();
      await expect(
        intake.getByText(
          'No Sales Stage is configured for this Company yet. A holder of Company Sales Stage Configuration must create one first in the Sales Stage settings.',
          { exact: true },
        ),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-stage-empty');
      await intake
        .locator('.commercial-intake-stage')
        .getByRole('button', { name: 'Cancel' })
        .click();
    });

    await test.step('3b. create two Sales Stages and place the case on the first', async () => {
      await intake.getByRole('button', { name: 'Back to Requests' }).click();
      await intake
        .getByRole('button', { name: 'Sales Stage settings' })
        .click();
      const settings = intake.getByRole('region', {
        name: 'Sales Stage settings',
      });
      await expect(
        settings.getByText(
          'No Sales Stage is configured for this Company yet.',
          {
            exact: true,
          },
        ),
      ).toBeVisible();
      for (const label of [qualification, contracting]) {
        await settings
          .getByLabel('New stage label', { exact: true })
          .fill(label);
        const created = page.waitForResponse(
          mutation('POST', /^\/api\/sales-stages$/u),
        );
        await settings.getByRole('button', { name: 'Add stage' }).click();
        expect((await created).status()).toBe(201);
      }
      const stages = settings.getByRole('list', { name: 'Sales Stages' });
      await expect(
        stages.getByText(qualification, { exact: true }),
      ).toBeVisible();
      await expect(
        stages.getByText(contracting, { exact: true }),
      ).toBeVisible();
      await reopenRequest(journey);
      await setStage(journey, qualification);
      await reopenRequest(journey);
      await expect(
        intake.getByText(`Sales Stage: ${qualification}`, { exact: true }),
      ).toBeVisible();
      await expect(
        intake.getByText('Version: 4', { exact: true }),
      ).toBeVisible();
    });

    await test.step("criterion 3: Ion's stale edit conflicts with Ada's newer change, then Ion acts", async () => {
      const ionFeedback = ionIntake.locator(':scope > [role="alert"]');
      await ionIntake.getByRole('button', { name: 'Edit next action' }).click();
      await ionIntake.getByLabel('Next action').fill(entered.ionNextAction);
      const stale = ionPage.waitForResponse(
        mutation(
          'POST',
          /^\/api\/commercial-intake\/opportunities\/[^/]+\/next-action$/u,
        ),
      );
      await ionIntake.getByRole('button', { name: 'Save next action' }).click();
      expect((await stale).status()).toBe(409);
      await expect(ionFeedback).toHaveText(
        'This Opportunity changed since you loaded it. Reload the Request before editing again.',
      );
      await capture(ionPage, testInfo, 'journey-stale-edit');
      await ionIntake.getByRole('button', { name: 'Reload Request' }).click();
      await expect(
        ionIntake.getByText('Version: 4', { exact: true }),
      ).toBeVisible();
      await expect(
        ionIntake.getByText(`Sales Stage: ${qualification}`, { exact: true }),
      ).toBeVisible();
      await ionIntake.getByRole('button', { name: 'Edit next action' }).click();
      await ionIntake.getByLabel('Next action').fill(entered.ionNextAction);
      const saved = ionPage.waitForResponse(
        mutation(
          'POST',
          /^\/api\/commercial-intake\/opportunities\/[^/]+\/next-action$/u,
        ),
      );
      await ionIntake.getByRole('button', { name: 'Save next action' }).click();
      expect((await saved).status()).toBe(200);
      await expect(ionFeedback).toHaveText('Next action saved.');
      await reopenRequest(ionJourney);
      await expect(
        ionIntake.getByText(`Next action: ${entered.ionNextAction}`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        ionIntake.getByText('Version: 5', { exact: true }),
      ).toBeVisible();
      await reopenRequest(journey);
      await expect(
        intake.getByText(`Next action: ${entered.ionNextAction}`, {
          exact: true,
        }),
      ).toBeVisible();
    });

    await test.step('4. calculate an adjusted illustrative Pricing Snapshot', async () => {
      const pricing = intake.locator('.pricing-snapshot-panel');
      await expect(
        pricing.getByText('Illustrative pricing', { exact: true }),
      ).toBeVisible();
      await pricing.getByLabel(serviceName, { exact: true }).check();
      const line = pricing
        .getByRole('group')
        .filter({ has: page.getByLabel(serviceName, { exact: true }) });
      await line.getByLabel('Quantity', { exact: true }).fill('2');
      await line
        .getByLabel('Apply a fixed net discount', { exact: true })
        .check();
      await line
        .getByLabel('Net reduction', { exact: true })
        .fill(entered.netReduction);
      const reason = line.getByRole('textbox', {
        name: 'Adjustment reason',
        exact: true,
      });
      await reason.fill('   ');
      await pricing.getByRole('button', { name: 'Calculate and save' }).click();
      await expect(pricing.getByRole('alert')).toHaveText(
        'Correct the highlighted values and try again.',
      );
      await reason.fill(entered.adjustmentReason);
      const calculated = page.waitForResponse(
        mutation('POST', /^\/api\/pricing\/opportunities\/[^/]+\/snapshots$/u),
      );
      await pricing.getByRole('button', { name: 'Calculate and save' }).click();
      expect((await calculated).status()).toBe(201);
      await expectAdjustedSnapshot(pricing, entered.adjustmentReason);

      await reopenRequest(journey);
      await pricing
        .getByRole('button', { name: /Reopen snapshot: 655\.50 EUR/u })
        .click();
      await expectAdjustedSnapshot(pricing, entered.adjustmentReason);
      await expect(
        pricing.getByText('2 × 300.0000 EUR/illustrative-unit'),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-snapshot');
    });

    const offer = page.locator('.offer-panel');
    const summary = offer.locator('.offer-summary');
    await test.step('5a. prepare Offer v1 and run its Quality Checks', async () => {
      await expect(
        offer.getByLabel('Validity in days', { exact: true }),
      ).toHaveValue('30');
      await expect(
        page
          .getByRole('region', { name: 'Contract', exact: true })
          .getByText('No Contract has been prepared for this Opportunity.'),
      ).toBeVisible();
      const snapshots = await openSelect(
        offer.getByRole('combobox', { name: 'Pricing Snapshot', exact: true }),
      );
      await snapshots
        .getByRole('option')
        .filter({ hasText: '655.50 EUR' })
        .click();
      await offer
        .getByRole('textbox', { name: 'Scope note', exact: true })
        .fill(entered.offerScope);
      await offer
        .getByRole('textbox', { name: 'Commercial conditions', exact: true })
        .fill(entered.firstConditions);
      const prepared = page.waitForResponse(
        mutation('POST', /^\/api\/offers\/opportunities\/[^/]+$/u),
      );
      await offer.getByRole('button', { name: 'Prepare version 1' }).click();
      expect((await prepared).status()).toBe(201);

      await reopenRequest(journey);
      const pendingOffer = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: `/offers/opportunities/${opportunityId}`,
          }),
        ).offer,
      );
      expect(object(pendingOffer.version).validityDays).toBe(30);
      await expect(
        summary.getByText('Illustrative and provisional', { exact: true }),
      ).toBeVisible();
      await expect(
        summary.getByText('Pending · not transmitted · no Client response', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        summary.getByText('Draft — not approved', { exact: true }),
      ).toBeVisible();
      const draftOffer = offer.locator('.offer-representation');
      await expect(
        draftOffer.getByText('Draft — not approved', { exact: true }),
      ).toBeVisible();
      const offerDocument = draftOffer.frameLocator(
        'iframe[title="Illustrative Offer representation"]',
      );
      await expect(
        offerDocument.getByText(
          'Provisional illustrative document — cannot be accepted — no legal effect — no official number',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        offerDocument.getByRole('heading', {
          name: 'Illustrative Offer',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        offerDocument
          .getByRole('term')
          .filter({ hasText: /^Offer Version$/u })
          .locator('xpath=following-sibling::dd[1]'),
      ).toHaveText('1');
      const originalServiceRow = offerDocument
        .getByRole('row')
        .filter({ hasText: serviceName });
      await expect(originalServiceRow.getByRole('cell').nth(4)).toHaveText(
        '600.00 EUR',
      );
      await expect(originalServiceRow.getByRole('cell').nth(6)).toHaveText(
        '90.00 EUR',
      );
      const discountRow = originalServiceRow.locator(
        'xpath=following-sibling::tr[1]',
      );
      await expect(discountRow.getByRole('cell')).toHaveText([
        `Fixed discount: ${entered.adjustmentReason}`,
        '30.00 EUR',
        'Tax reduction',
        '4.50 EUR',
      ]);
      await expect(
        discountRow.locator('xpath=following-sibling::tr[1]').getByRole('cell'),
      ).toHaveText([
        'Adjusted line',
        '570.00 EUR',
        'Adjusted tax',
        '85.50 EUR',
      ]);
      await expect(
        offerDocument
          .getByRole('row')
          .filter({ hasText: `Fixed discount: ${entered.adjustmentReason}` })
          .getByRole('cell'),
      ).toHaveText([
        `Fixed discount: ${entered.adjustmentReason}`,
        '30.00 EUR',
        'Tax reduction',
        '4.50 EUR',
      ]);
      await expect(
        offerDocument
          .getByRole('row')
          .filter({ hasText: /^Adjusted line/u })
          .getByRole('cell'),
      ).toHaveText([
        'Adjusted line',
        '570.00 EUR',
        'Adjusted tax',
        '85.50 EUR',
      ]);
      for (const [label, value] of [
        ['Template Version', 'OFFER_ILLUSTRATIVE v2'],
        ['Subtotal', '570.00 EUR'],
        ['Tax total', '85.50 EUR'],
        ['Total', '655.50 EUR'],
        ['Currency', 'EUR'],
      ])
        await expect(
          offerDocument
            .getByRole('term')
            .filter({ hasText: new RegExp(`^${label}$`, 'u') })
            .locator('xpath=following-sibling::dd[1]'),
        ).toHaveText(value);
      const quality = offer.locator('.offer-quality');
      await expect(
        quality.getByText('No Quality Check run yet.', { exact: true }),
      ).toBeVisible();
      await quality
        .getByRole('button', { name: 'Run Quality Checks', exact: true })
        .click();
      await expect(
        quality.getByText('Checks completed with warnings.', { exact: true }),
      ).toBeVisible();
      await expect(
        quality.locator('li').filter({ hasText: 'Recipient tax ID recorded' }),
      ).toContainText('WARNING');
      await reopenRequest(journey);
      await expect(
        quality.getByText('Checks completed with warnings.', { exact: true }),
      ).toBeVisible();
    });

    await test.step('5b. approval requires the warning acknowledgement', async () => {
      await offer
        .getByRole('button', { name: 'Approve this version', exact: true })
        .click();
      await expect(
        offer
          .getByRole('region', { name: 'Internal decision', exact: true })
          .getByRole('alert'),
      ).toHaveText(
        'Acknowledge exactly the current warnings. Run Quality Checks to refresh them.',
      );
      await capture(page, testInfo, 'journey-offer-unacknowledged');
      await offer
        .getByRole('checkbox', { name: 'Recipient tax ID recorded' })
        .check();
      await offer
        .getByRole('button', { name: 'Approve this version', exact: true })
        .click();
      await expect(
        offer.getByText('Version approved.', { exact: true }),
      ).toBeVisible();
      await reopenRequest(journey);
      await expect(
        offer.getByText('Approved internally', { exact: true }),
      ).toBeVisible();
    });

    await test.step('criterion 3: a revoked Offer bundle is denied safely and leaks no history', async () => {
      // Revoke only once the loaded page has finished reading the Offer.
      await page.waitForLoadState('networkidle');
      for (const bundle of offerBundles)
        await revoke(request, { bundle, membership: ada, companyId });
      const denied = page.waitForResponse(mutation('POST', /\/transmission$/u));
      await offer
        .getByRole('button', {
          name: 'Record simulated transmission',
          exact: true,
        })
        .click();
      expect((await denied).status()).toBe(403);
      // The panel drops the loaded Offer instead of keeping stale content.
      const unavailable = offer.getByRole('status').filter({
        hasText: /^Offer access is not available for this Opportunity\.$/u,
      });
      await expect(unavailable).toBeVisible();
      await expect(summary).toHaveCount(0);
      await capture(page, testInfo, 'journey-offer-denied');
      await reopenRequest(journey);
      await expect(
        page.getByText(entered.originalText, { exact: true }),
      ).toBeVisible();
      await expect(unavailable).toBeVisible();
      await expect(summary).toHaveCount(0);
      await expect(page.getByText('Approved internally')).toHaveCount(0);
      await openSection(journey, 'Activity Log');
      const activity = page.locator('.activity-log');
      await expect(
        activityRow(
          page,
          'Ada Ionescu captured a Client Request',
          `Client Request: ${clientRequestId}`,
        ),
      ).toHaveCount(1);
      await expect(activity).not.toContainText('Illustrative Offer');
      await expect(activity).not.toContainText('Offer Version');
      await expect(
        activity.getByRole('button', { name: /Open Offer/u }),
      ).toHaveCount(0);
      await capture(page, testInfo, 'journey-offer-denied-activity');

      for (const bundle of offerBundles)
        await grant(request, { bundle, membership: ada, companyId });
      await reopenRequest(journey);
      // The refused command committed nothing.
      await expect(
        offer.getByText('Approved internally', { exact: true }),
      ).toBeVisible();
    });

    await test.step('5c. record the simulated transmission of Offer v1', async () => {
      const transmitted = page.waitForResponse(
        mutation('POST', /\/transmission$/u),
      );
      await offer
        .getByRole('button', {
          name: 'Record simulated transmission',
          exact: true,
        })
        .click();
      expect((await transmitted).status()).toBe(201);
      await reopenRequest(journey);
      await expect(
        offer.getByText(
          'Simulated transmission recorded · Client response pending',
          { exact: true },
        ),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-offer-v1-transmitted');
    });

    await test.step('5d. negotiate Offer v2, approve it and record the simulated acceptance', async () => {
      await offer
        .getByRole('button', { name: 'Prepare a new version', exact: true })
        .click();
      await offer
        .getByRole('textbox', { name: 'Commercial conditions', exact: true })
        .fill(entered.negotiatedConditions);
      const created = page.waitForResponse(mutation('POST', /\/versions$/u));
      await offer
        .getByRole('button', { name: 'Create new version', exact: true })
        .click();
      expect((await created).status()).toBe(201);
      await reopenRequest(journey);
      await expect(
        offer.getByText(`Current value: ${entered.negotiatedConditions}`, {
          exact: true,
        }),
      ).toBeVisible();
      const conditionsDifference = offer
        .locator('.offer-version-history dl > div')
        .filter({
          has: page
            .getByRole('term')
            .filter({ hasText: /^Commercial conditions · Changed$/u }),
        });
      await expect(conditionsDifference).toHaveCount(1);
      await expect(conditionsDifference.getByRole('definition')).toHaveText([
        `Previous value: ${entered.firstConditions}`,
        `Current value: ${entered.negotiatedConditions}`,
      ]);
      await expect(
        summary.getByText('Draft — not approved', { exact: true }),
      ).toBeVisible();

      await offer
        .getByRole('button', { name: 'Run Quality Checks', exact: true })
        .click();
      await expect(
        offer.getByText('Checks completed with warnings.', { exact: true }),
      ).toBeVisible();
      await reopenRequest(journey);
      await expect(
        offer.getByText('Checks completed with warnings.', { exact: true }),
      ).toBeVisible();
      await expect(
        offer
          .locator('.offer-quality li')
          .filter({ hasText: 'Recipient tax ID recorded' }),
      ).toContainText('WARNING');
      await offer
        .getByRole('checkbox', { name: 'Recipient tax ID recorded' })
        .check();
      await offer
        .getByRole('button', { name: 'Approve this version', exact: true })
        .click();
      await expect(
        offer.getByText('Version approved.', { exact: true }),
      ).toBeVisible();
      await reopenRequest(journey);
      await expect(
        offer.getByText('Approved internally', { exact: true }),
      ).toBeVisible();

      const transmission = page.waitForResponse(
        mutation('POST', /\/transmission$/u),
      );
      await offer
        .getByRole('button', {
          name: 'Record simulated transmission',
          exact: true,
        })
        .click();
      const transmitted = await transmission;
      expect(transmitted.status()).toBe(201);
      const transmittedAt = text(
        object(await transmitted.json()).transmittedAt,
      );
      typedFromReceipts.push(transmittedAt);
      await reopenRequest(journey);
      const response = offer.locator('.offer-client-response');
      await response
        .getByLabel('Reported received time (UTC)')
        .fill(transmittedAt);
      const accepted = page.waitForResponse(
        mutation('POST', /\/client-response$/u),
      );
      await response
        .getByRole('button', {
          name: 'Record simulated acceptance',
          exact: true,
        })
        .click();
      expect((await accepted).status()).toBe(201);
      await reopenRequest(journey);
      await expect(
        offer.getByText('Simulated Client acceptance recorded', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        offer.getByRole('button', {
          name: 'Prepare a new version',
          exact: true,
        }),
      ).toHaveCount(0);
      const offerPath = `/offers/opportunities/${opportunityId}`;
      const acceptedOffer = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: offerPath,
          }),
        ).offer,
      );
      const acceptedVersion = object(acceptedOffer.version);
      expect(acceptedVersion.validityDays).toBe(30);
      await expectVersionRefused(request, {
        companyId,
        path: `${offerPath}/versions`,
        key: `journey-accepted-offer-version-${suffix}`,
        code: 'OFFER_ACCEPTED',
        data: {
          expectedOfferRevision: acceptedOffer.revision,
          pricingSnapshotId: text(acceptedVersion.pricingSnapshotId),
          recipient: { kind: 'PRIMARY' },
          validityDays: acceptedVersion.validityDays,
          scopeNote: entered.offerScope,
          commercialConditions: entered.negotiatedConditions,
        },
      });
      const offerAfterRefusal = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: offerPath,
          }),
        ).offer,
      );
      expect(offerAfterRefusal.revision).toBe(acceptedOffer.revision);
      expect(offerAfterRefusal.version).toEqual(acceptedVersion);
      await capture(page, testInfo, 'journey-offer-accepted');
    });

    await test.step('3c. move the case to the second Sales Stage', async () => {
      await setStage(journey, contracting);
      await reopenRequest(journey);
      await expect(
        intake.getByText(`Sales Stage: ${contracting}`, { exact: true }),
      ).toBeVisible();
      const history = intake.getByRole('list', { name: 'Sales Stage history' });
      await expect(history.getByRole('listitem')).toHaveCount(2);
      await expect(history.getByRole('listitem').nth(0)).toContainText(
        `${qualification} → ${contracting}`,
      );
    });

    await test.step('record the Client IDNO required by the agreements', async () => {
      await intake.getByRole('button', { name: 'Open Client dossier' }).click();
      await page
        .getByRole('button', { name: 'Correct Client dossier', exact: true })
        .click();
      const correction = page.getByRole('form', {
        name: 'Correct Client dossier',
      });
      await correction
        .getByLabel('IDNO / tax code', { exact: true })
        .fill(entered.clientTaxId);
      const corrected = page.waitForResponse(
        mutation('PATCH', /^\/api\/clients\/[^/]+$/u),
      );
      await correction.getByRole('button', { name: 'Save correction' }).click();
      expect((await corrected).status()).toBe(200);
      await reopenRequest(journey);
    });

    const contract = page.getByRole('region', {
      name: 'Contract',
      exact: true,
    });
    const checks = contract.getByRole('region', {
      name: 'Contract Quality Checks',
      exact: true,
    });
    const decision = contract.getByRole('region', {
      name: 'Contract decision',
      exact: true,
    });
    const signatures = contract.getByRole('region', {
      name: 'Simulated Contract signatures',
      exact: true,
    });
    const projects = contract.getByRole('region', {
      name: 'Contract Projects',
      exact: true,
    });

    /**
     * Runs the checks, approves and signs the open agreement version,
     * reloading through `reopen` after each durable step so that every state
     * is read back from PostgreSQL before the next command relies on it.
     */
    // The acknowledgeable Contract Quality Check warnings the journey raises.
    const identityWarning = 'Recorded identity matches the source';
    const addedConditionsWarning =
      'Added terms and conditions need confirmation';
    async function approveAndSign(
      agreementPath: string,
      reopen: () => Promise<void>,
      // The exact acknowledgeable warnings of this version (PRD 19.16).
      warnings: readonly string[],
    ): Promise<void> {
      const recordedIdno = checks
        .getByRole('listitem')
        .filter({ hasText: 'IDNO / tax code is recorded' });
      const noRun = checks.getByText('No Contract Quality Check run yet.', {
        exact: true,
      });
      const completedAgreementCommand = (
        action: 'quality-checks' | 'approve' | 'signature',
      ) =>
        page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname.startsWith(
              `/api${agreementPath}/versions/`,
            ) &&
            new URL(response.url()).pathname.endsWith(`/${action}`),
        );
      await expect(noRun).toBeVisible();
      const checksCompleted = completedAgreementCommand('quality-checks');
      await checks
        .getByRole('button', {
          name: 'Run Contract Quality Checks',
          exact: true,
        })
        .click();
      expect((await checksCompleted).status()).toBe(201);
      // The recorded IDNO clears the only blocking agreement check.
      await expect(recordedIdno).toContainText('PASS');
      await reopen();
      await expect(noRun).toHaveCount(0);
      await expect(recordedIdno).toContainText('PASS');
      // Exactly the expected warnings, by label and count, before any box.
      const acknowledgements = warnings.map((warning) =>
        decision.getByRole('checkbox', {
          name: `I acknowledge this warning: ${warning}`,
          exact: true,
        }),
      );
      await expect(decision.getByRole('checkbox')).toHaveCount(warnings.length);
      for (const acknowledgement of acknowledgements)
        await expect(acknowledgement).toHaveCount(1);
      const approve = decision.getByRole('button', {
        name: 'Approve exact Contract Version',
        exact: true,
      });
      if (warnings.length > 0) {
        // Approval is refused until exactly the current warnings are
        // acknowledged (PRD 19.16).
        await approve.click();
        await expect(
          decision.getByText(
            'Acknowledge exactly the current warnings. Run and review checks again.',
            { exact: true },
          ),
        ).toBeVisible();
        for (const acknowledgement of acknowledgements)
          await acknowledgement.check();
      }
      const approved = completedAgreementCommand('approve');
      await approve.click();
      expect((await approved).status()).toBe(201);
      await expect(
        decision.getByText('Approved internally', { exact: true }),
      ).toBeVisible();
      await reopen();
      await expect(
        decision.getByText('Approved internally', { exact: true }),
      ).toBeVisible();
      // Persisted approval already acknowledged every current warning.
      // Signature must not silently repair a missing acknowledgement.
      await expect(signatures.getByRole('checkbox')).toHaveCount(0);
      const signedOn = await approvalDate(request, {
        companyId,
        path: agreementPath,
      });
      typedFromReceipts.push(signedOn);
      await signatures
        .getByLabel('Provider signatory label', { exact: true })
        .fill(entered.providerSignatory);
      await signatures
        .getByLabel('Client signatory label', { exact: true })
        .fill(entered.clientSignatory);
      await signatures
        .getByLabel('Provider signing date', { exact: true })
        .fill(signedOn);
      await signatures
        .getByLabel('Client signing date', { exact: true })
        .fill(signedOn);
      const signed = completedAgreementCommand('signature');
      await signatures
        .getByRole('button', {
          name: 'Record both simulated signatures',
          exact: true,
        })
        .click();
      expect((await signed).status()).toBe(201);
      const executed = signatures.getByText(
        'Executed — simulated evidence only',
        { exact: true },
      );
      await expect(executed).toBeVisible();
      await reopen();
      await expect(executed).toBeVisible();
      const evidence = (label: RegExp) =>
        signatures
          .getByRole('term')
          .filter({ hasText: label })
          .locator('xpath=following-sibling::dd[1]');
      await expect(evidence(/^Provider signatory label$/u)).toHaveText(
        entered.providerSignatory,
      );
      await expect(evidence(/^Client signatory label$/u)).toHaveText(
        entered.clientSignatory,
      );
      await expect(
        evidence(/^Provider signing date$/u).locator('time'),
      ).toHaveAttribute('datetime', signedOn);
      await expect(
        evidence(/^Client signing date$/u).locator('time'),
      ).toHaveAttribute('datetime', signedOn);
    }

    const contractsPath = `/contracts/opportunities/${opportunityId}`;
    async function rememberChildAgreement(id: string): Promise<void> {
      const agreement = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: `${contractsPath}/agreements/${id}`,
          }),
        ).contract,
      );
      const version = object(agreement.version);
      const kind = agreement.kind;
      if (kind !== 'PRECONTRACT' && kind !== 'ADDENDUM')
        throw new Error('Expected a child agreement kind');
      childAgreements.push({
        id: text(agreement.id),
        kind,
        versionId: text(version.id),
        qualityRunId: text(object(version.latestQualityRun).id),
      });
    }
    await test.step('6. prepare, approve and sign the Precontract, then create its Project', async () => {
      const editor = contract.getByRole('region', {
        name: 'Create Precontract',
        exact: true,
      });
      await editor
        .getByRole('textbox', { name: 'Preliminary work scope', exact: true })
        .fill(entered.preliminaryScope);
      await editor
        .getByRole('textbox', {
          name: 'Preliminary financial conditions',
          exact: true,
        })
        .fill(entered.preliminaryConditions);
      await editor
        .getByRole('textbox', {
          name: 'Limits until the Contract',
          exact: true,
        })
        .fill(entered.preliminaryLimits);
      await editor
        .getByLabel('Precontract term end', { exact: true })
        .fill(entered.precontractTermEnd);
      await editor
        .getByRole('button', { name: 'Create Precontract', exact: true })
        .click();
      await expect(
        contract.getByText('Precontract created.', { exact: true }),
      ).toBeVisible();
      await reopenPrecontract(journey);
      await expect(
        contract.getByText('Pending approval · Not executed', { exact: true }),
      ).toBeVisible();

      const precontractId = text(
        object(
          object(
            await apiRead(request, {
              identity: identities.ada,
              companyId,
              path: contractsPath,
            }),
          ).precontract,
        ).id,
      );
      const draftDocumentRead = page.waitForResponse(
        mutation(
          'GET',
          /^\/api\/contracts\/opportunities\/[^/]+\/agreements\/[^/]+\/versions\/[^/]+\/representation$/u,
        ),
      );
      await contract
        .getByRole('button', { name: 'Open exact Contract document' })
        .click();
      expect((await draftDocumentRead).status()).toBe(200);
      const draftPrecontract = contract.getByRole('region', {
        name: 'Illustrative Contract document',
        exact: true,
      });
      const precontractDocument = draftPrecontract.frameLocator(
        'iframe[title="Illustrative Contract document"]',
      );
      await expect(
        precontractDocument.getByRole('heading', {
          name: 'Illustrative Precontract',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        precontractDocument
          .getByRole('term')
          .filter({ hasText: /^Contract Version$/u })
          .locator('xpath=following-sibling::dd[1]'),
      ).toHaveText('1');
      await expect(
        precontractDocument.getByText(
          'Provisional illustrative document — cannot be accepted — no legal effect — no official number — not a signed agreement — clauses are placeholders',
          { exact: true },
        ),
      ).toBeVisible();
      for (const clause of [
        'Subject — CL_SUBJECT v1',
        'Price — CL_PRICE v1',
        'Term — CL_TERM v1',
        'Conditions — CL_CONDITIONS v1',
        'Preliminary work — CL_PRELIMINARY_WORK v1',
        'General — CL_GENERAL v1',
      ])
        await expect(
          precontractDocument.getByRole('heading', {
            name: clause,
            exact: true,
          }),
        ).toBeVisible();
      await expect(
        precontractDocument.getByText(
          'No approved legal wording exists for this clause. This is an illustrative placeholder.',
          { exact: true },
        ),
      ).toHaveCount(6);
      await capture(page, testInfo, 'journey-precontract-draft');
      // PRD 19.5 and 19.16 require this state marker in the viewer,
      // outside the immutable representation bytes (PRD 18.7 and 19.7).
      await expect(
        draftPrecontract.getByText('Draft — not approved', { exact: true }),
      ).toBeVisible();
      // The IDNO recorded since the Offer and the preliminary work and term
      // end raise exactly the two Precontract warnings (PRD 19.16, step 3).
      await approveAndSign(
        `${contractsPath}/agreements/${precontractId}`,
        () => reopenPrecontract(journey),
        [identityWarning, addedConditionsWarning],
      );
      const precontractPath = `${contractsPath}/agreements/${precontractId}`;
      const executedPrecontract = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: precontractPath,
          }),
        ).contract,
      );
      await expectVersionRefused(request, {
        companyId,
        path: `${precontractPath}/versions`,
        key: `journey-executed-precontract-version-${suffix}`,
        code: 'CONTRACT_EXECUTED',
        data: {
          expectedContractRevision: executedPrecontract.revision,
          termStartsOn: null,
          termEndsOn: entered.precontractTermEnd,
          specialConditions: null,
          preliminaryWorkScope: entered.preliminaryScope,
          preliminaryFinancialConditions: entered.preliminaryConditions,
          preliminaryLimits: entered.preliminaryLimits,
        },
      });
      const precontractAfterRefusal = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: precontractPath,
          }),
        ).contract,
      );
      expect(precontractAfterRefusal.revision).toBe(
        executedPrecontract.revision,
      );
      expect(precontractAfterRefusal.version).toEqual(
        executedPrecontract.version,
      );
      await rememberChildAgreement(precontractId);

      const creation = projects.getByRole('region', {
        name: 'Create a preparatory Project',
        exact: true,
      });
      await expect(
        creation.getByRole('textbox', { name: 'New Project title' }),
      ).toHaveValue(opportunityTitle);
      await creation.getByRole('checkbox').check();
      const createdProject = page.waitForResponse(
        mutation(
          'POST',
          /^\/api\/contracts\/opportunities\/[^/]+\/agreements\/[^/]+\/projects\/create$/u,
        ),
      );
      await creation
        .getByRole('button', { name: 'Create and link Project', exact: true })
        .click();
      const creationResponse = await createdProject;
      expect(creationResponse.status()).toBe(201);
      const creationPayload: unknown = JSON.parse(
        creationResponse.request().postData() ?? 'null',
      );
      expect(object(creationPayload).acknowledgedCandidateProjectIds).toEqual(
        [],
      );
      await expect(projects.getByText(opportunityTitle).first()).toBeVisible();
      await reopenPrecontract(journey);
      await expect(
        projects.getByRole('button', { name: 'Open Project', exact: true }),
      ).toHaveCount(1);
      await capture(page, testInfo, 'journey-precontract-executed');
    });

    await test.step('7a. prepare the Contract from the accepted Offer and revise it before approval', async () => {
      await contract
        .getByRole('button', { name: 'Back to the Contract area', exact: true })
        .click();
      await contract
        .getByRole('button', { name: 'Create Contract', exact: true })
        .click();
      await expect(
        contract.getByText('Contract created.', { exact: true }),
      ).toBeVisible();
      await reopenRequest(journey);
      await expect(
        contract.getByText('Illustrative reference 1 · version 2', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        contract
          .getByRole('term')
          .filter({ hasText: /^Illustrative Precontract reference$/u }),
      ).toBeVisible();

      // Before the revision adds terms, v1 has exactly the identity warning
      // and no blocking result (PRD 19.16, step 6). Prove it after reload too.
      await expect(
        contract.getByRole('button', {
          name: 'Open Contract Version 1',
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        checks.getByText('No Contract Quality Check run yet.', { exact: true }),
      ).toBeVisible();
      await checks
        .getByRole('button', {
          name: 'Run Contract Quality Checks',
          exact: true,
        })
        .click();
      await expect(
        checks.getByText('Contract checks completed with warnings.', {
          exact: true,
        }),
      ).toBeVisible();
      await reopenRequest(journey);
      await expect(
        contract.getByRole('button', {
          name: 'Open Contract Version 1',
          exact: true,
        }),
      ).toBeDisabled();
      const firstVersionResults = checks
        .locator('ul')
        .first()
        .getByRole('listitem');
      await expect(
        firstVersionResults.filter({
          has: page.locator('strong').filter({ hasText: /^WARNING$/u }),
        }),
      ).toHaveText([`${identityWarning} WARNING`]);
      await expect(
        firstVersionResults.filter({
          has: page.locator('strong').filter({ hasText: /^ERROR$/u }),
        }),
      ).toHaveCount(0);
      await expect(
        firstVersionResults.filter({ hasText: 'IDNO / tax code is recorded' }),
      ).toContainText('PASS');
      await expect(decision.getByRole('checkbox')).toHaveCount(1);
      await expect(
        decision.getByRole('checkbox', {
          name: `I acknowledge this warning: ${identityWarning}`,
          exact: true,
        }),
      ).toHaveCount(1);

      const revisions = contract.getByRole('region', {
        name: 'Revise Contract before signature',
        exact: true,
      });
      await revisions
        .getByLabel('Revised term start')
        .fill(entered.contractTermStart);
      await revisions
        .getByLabel('Revised term end')
        .fill(entered.precontractTermEnd);
      await revisions
        .getByLabel('Revised special conditions')
        .fill(entered.specialConditions);
      await revisions
        .getByRole('button', {
          name: 'Create new Contract Version',
          exact: true,
        })
        .click();
      const history = contract.getByRole('region', {
        name: 'Contract Version history',
        exact: true,
      });
      await expect(
        history.getByRole('button', {
          name: 'Open Contract Version 2',
          exact: true,
        }),
      ).toBeDisabled();
      await reopenRequest(journey);
      await expect(
        history.getByRole('button', {
          name: 'Open Contract Version 2',
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        history.getByRole('region', {
          name: 'Changes from the preceding version',
          exact: true,
        }),
      ).toContainText('Special conditions');
    });

    await test.step('7b. approve and sign Contract v2, then link the existing Project', async () => {
      const mainContractId = text(
        object(
          object(
            await apiRead(request, {
              identity: identities.ada,
              companyId,
              path: contractsPath,
            }),
          ).contract,
        ).id,
      );
      // The Request detail opens the current Contract Version by default.
      // Version 2 needs its own checks: the identity warning again and
      // `ADDED_CONDITIONS_CONFIRMED` for its term and special conditions
      // (PRD 19.16, revision variant).
      await approveAndSign(contractsPath, () => reopenRequest(journey), [
        identityWarning,
        addedConditionsWarning,
      ]);

      const candidate = projects.getByRole('radio', {
        name: new RegExp(opportunityTitle, 'u'),
      });
      await expect(candidate).toHaveCount(1);
      await expect(candidate).toHaveAccessibleName(
        / · Illustrative Precontract 1$/u,
      );
      // The empty candidate acknowledgement used for the Precontract is now
      // obsolete. Exercise the public refusal without a successful mutation.
      const beforeRefusal = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: contractsPath,
          }),
        ).contract,
      );
      const expectedRevision = beforeRefusal.revision;
      expect(beforeRefusal.id).toBe(mainContractId);
      if (
        typeof expectedRevision !== 'number' ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1
      )
        throw new Error('Expected a positive Contract revision');
      const staleCandidates = await request.post(
        `${apiOrigin}/api${contractsPath}/projects/create`,
        {
          headers: {
            ...identities.ada,
            'x-company-context-id': companyId,
            'idempotency-key': `journey-stale-project-candidates-${suffix}`,
          },
          data: {
            title: opportunityTitle,
            acknowledgedCandidateProjectIds: [],
            expectedContractRevision: expectedRevision,
          },
        },
      );
      const refusal: unknown = await staleCandidates.json();
      expect(staleCandidates.status(), JSON.stringify(refusal)).toBe(409);
      expect(refusal).toMatchObject({ code: 'PROJECT_CANDIDATES_CHANGED' });
      const afterRefusal = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: contractsPath,
          }),
        ).contract,
      );
      expect(afterRefusal.revision).toBe(expectedRevision);
      expect(afterRefusal.version).toEqual(beforeRefusal.version);
      await candidate.check();
      const linked = page.waitForResponse(
        mutation('POST', /^\/api\/contracts\/opportunities\/[^/]+\/projects$/u),
      );
      await projects
        .getByRole('button', { name: 'Link selected Project' })
        .click();
      expect((await linked).status()).toBe(201);
      await expect(
        projects.getByText('Project linked.', { exact: true }),
      ).toBeVisible();
      const persistedContractRead = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          new URL(response.url()).pathname === `/api${contractsPath}`,
      );
      await reopenRequest(journey);
      expect((await persistedContractRead).status()).toBe(200);
      await expect(
        projects.getByRole('button', { name: 'Open Project', exact: true }),
      ).toHaveCount(1);
      await capture(page, testInfo, 'journey-contract-executed');

      // One Project, linked from both agreements: no duplicate was created.
      await projects
        .getByRole('button', { name: 'Open Project', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: opportunityTitle, exact: true }),
      ).toBeVisible();
      const linkedContracts = page.getByRole('region', {
        name: 'Linked Contracts',
        exact: true,
      });
      await expect(linkedContracts).toContainText('Illustrative Contract 1');
      await expect(linkedContracts).toContainText('Illustrative Precontract 1');
      await capture(page, testInfo, 'journey-project');
      const projectList: unknown = await apiRead(request, {
        identity: identities.ada,
        companyId,
        path: '/projects',
      });
      if (!Array.isArray(projectList)) throw new Error('Expected Projects');
      const journeyProjects = projectList
        .map((project) => object(project))
        .filter((project) => project.title === opportunityTitle);
      expect(journeyProjects).toHaveLength(1);
      projectId = text(object(journeyProjects[0]).id);
    });

    await test.step('8. prepare, approve and sign Addendum 1', async () => {
      await reopenRequest(journey);
      const parentBeforeAddendum = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: contractsPath,
          }),
        ).contract,
      );
      expect(parentBeforeAddendum.version).toMatchObject({
        versionNumber: 2,
        scopeNote: entered.offerScope,
        commercialConditions: entered.negotiatedConditions,
        termStartsOn: entered.contractTermStart,
        termEndsOn: entered.precontractTermEnd,
        specialConditions: entered.specialConditions,
        executionState: 'EXECUTED',
      });
      await contract
        .getByRole('textbox', { name: 'Change summary', exact: true })
        .fill(entered.changeSummary);
      await contract
        .getByLabel('New term end (optional)', { exact: true })
        .fill(entered.addendumTermEnd);
      await contract
        .getByRole('button', { name: 'Create Addendum', exact: true })
        .click();
      await expect(
        contract.getByRole('button', {
          name: 'Return to parent agreement',
          exact: true,
        }),
      ).toBeVisible();
      const parent = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: contractsPath,
          }),
        ).contract,
      );
      const addenda = parent.addenda;
      expect(parent.id).toBe(parentBeforeAddendum.id);
      expect(parent.version).toEqual(parentBeforeAddendum.version);
      if (!Array.isArray(addenda)) throw new Error('Expected Addenda');
      const addendumId = text(object(addenda[0]).id);
      await reopenRequest(journey);
      await expect(
        contract.getByText(entered.specialConditions, { exact: true }),
      ).toBeVisible();
      await expect(
        contract.getByRole('button', {
          name: 'Open Contract Version 2',
          exact: true,
        }),
      ).toBeDisabled();
      await reopenAddendum(journey);
      await expect(
        contract.getByRole('definition').filter({
          hasText: new RegExp(`^${entered.addendumTermEnd}$`, 'u'),
        }),
      ).toBeVisible();
      // The Addendum copies its executed parent's current identity. Its new
      // term end is in the future, so that check passes without a warning.
      await approveAndSign(
        `${contractsPath}/agreements/${addendumId}`,
        () => reopenAddendum(journey),
        [],
      );
      await expect(
        checks
          .getByRole('listitem')
          .filter({ hasText: 'Term end has not passed (UTC)' }),
      ).toContainText('PASS');
      await rememberChildAgreement(addendumId);
      await contract
        .getByRole('button', {
          name: 'Return to parent agreement',
          exact: true,
        })
        .click();
      await reopenRequest(journey);
      const parentAfterExecution = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: contractsPath,
          }),
        ).contract,
      );
      expect(parentAfterExecution.id).toBe(parentBeforeAddendum.id);
      expect(parentAfterExecution.version).toEqual(
        parentBeforeAddendum.version,
      );
      await expect(
        contract.getByText(entered.specialConditions, { exact: true }),
      ).toBeVisible();
      const listed = contract.getByRole('region', {
        name: 'Addenda',
        exact: true,
      });
      await expect(listed.getByRole('listitem').first()).toContainText(
        'Executed — simulated evidence only',
      );
      await listed
        .getByRole('button', { name: 'Open Addendum 1', exact: true })
        .click();
      await expect(
        contract.getByText(entered.changeSummary, { exact: true }),
      ).toBeVisible();
      await expect(
        contract.getByRole('definition').filter({
          hasText: new RegExp(`^${entered.addendumTermEnd}$`, 'u'),
        }),
      ).toBeVisible();
      await contract
        .getByRole('button', { name: 'Open exact Contract document' })
        .click();
      await expect(
        contract
          .frameLocator('iframe[title="Illustrative Contract document"]')
          .getByText(entered.addendumTermEnd, { exact: false }),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-addendum-executed');
    });

    await test.step('9. declare the Opportunity WON', async () => {
      await reopenRequest(journey);
      await intake.getByRole('button', { name: 'Change status' }).click();
      await selectOption(intake.getByLabel('Status change', { exact: true }), {
        label: 'Mark as won',
      });
      const changed = page.waitForResponse(
        mutation(
          'POST',
          /^\/api\/commercial-intake\/opportunities\/[^/]+\/outcome$/u,
        ),
      );
      await intake.getByRole('button', { name: 'Save status' }).click();
      expect((await changed).status()).toBe(200);
      await reopenRequest(journey);
      await expect(
        intake.locator('p').filter({ hasText: /^Status: Won · Since/u }),
      ).toBeVisible();
      await expect(
        intake
          .getByRole('list', { name: 'Status history' })
          .getByRole('listitem')
          .first(),
      ).toContainText('Open → Won');
      await capture(page, testInfo, 'journey-won');
    });

    await test.step('10. follow the case in the Activity Log and open exact versions', async () => {
      await openSection(journey, 'Activity Log');
      const activity = page.locator('.activity-log');
      const rows = activity.locator('.activity-log-list > li');
      const requestTarget = `Client Request: ${clientRequestId}`;
      const opportunityTarget = `Opportunity: ${opportunityId}`;
      const offerV1 = 'Illustrative Offer 1 · version 1';
      const offerV2 = 'Illustrative Offer 1 · version 2';
      const precontractV1 = 'Illustrative Precontract 1 · version 1';
      const contractV1 = 'Illustrative Contract 1 · version 1';
      const contractV2 = 'Illustrative Contract 1 · version 2';
      const addendumV1 = 'Illustrative Addendum 1 · version 1';
      // Every successful command of the journey records exactly the events
      // below (PRD 17.3, 18.10, 19.12, 23.6 and 24.5), each projected once
      // with its exact target. Ion's stale save (409), the denied
      // transmission (403), the Quality Check runs, the Snapshot and the
      // reloads record no commercial event; the bundle revocation and
      // re-grant record assignment events outside the commercial family.
      const commercialEvents: readonly (readonly [string, string])[] = [
        ['Ada Ionescu captured a Client Request', requestTarget],
        ['Ada Ionescu created an initial Opportunity', opportunityTarget],
        ['Ada Ionescu associated a Client with a Request', requestTarget],
        ['Ada Ionescu updated an Opportunity next action', opportunityTarget],
        [
          `Ada Ionescu changed the responsible actor of an Opportunity (${adaLabel} → ${ionLabel})`,
          opportunityTarget,
        ],
        // Ion's stale save recorded nothing; his retry after the reload did.
        ['Ion Popa updated an Opportunity next action', opportunityTarget],
        [
          `Ada Ionescu configured a Sales Stage (created: ${qualification})`,
          'Sales Stage settings',
        ],
        [
          `Ada Ionescu configured a Sales Stage (created: ${contracting})`,
          'Sales Stage settings',
        ],
        [
          `Ada Ionescu changed the Sales Stage of an Opportunity (No Sales Stage → ${qualification})`,
          opportunityTarget,
        ],
        [
          `Ada Ionescu changed the Sales Stage of an Opportunity (${qualification} → ${contracting})`,
          opportunityTarget,
        ],
        [
          'Ada Ionescu changed the status of an Opportunity (Open → Won)',
          opportunityTarget,
        ],
        ['Ada Ionescu created an illustrative Offer', offerV1],
        ['Ada Ionescu created an Offer Version', offerV1],
        ['Ada Ionescu approved an Offer Version', offerV1],
        // The denied transmission of version 1 committed nothing.
        [
          'Ada Ionescu recorded the transmission of an Offer Version',
          `${offerV1} · Simulated`,
        ],
        ['Ada Ionescu created an Offer Version', offerV2],
        ['Ada Ionescu approved an Offer Version', offerV2],
        [
          'Ada Ionescu recorded the transmission of an Offer Version',
          `${offerV2} · Simulated`,
        ],
        [
          'Ada Ionescu recorded the Client response to an Offer Version (Accepted)',
          `${offerV2} · Simulated`,
        ],
        ['Ada Ionescu created an illustrative agreement', precontractV1],
        ['Ada Ionescu created an agreement version', precontractV1],
        ['Ada Ionescu approved an agreement version', precontractV1],
        [
          'Ada Ionescu recorded the signature of an agreement version',
          `${precontractV1} · Simulated`,
        ],
        [
          'Ada Ionescu linked a Project to an agreement',
          `${precontractV1} — Created Project: ${opportunityTitle}`,
        ],
        ['Ada Ionescu created an illustrative agreement', contractV1],
        ['Ada Ionescu created an agreement version', contractV1],
        ['Ada Ionescu created an agreement version', contractV2],
        ['Ada Ionescu approved an agreement version', contractV2],
        [
          'Ada Ionescu recorded the signature of an agreement version',
          `${contractV2} · Simulated`,
        ],
        [
          'Ada Ionescu linked a Project to an agreement',
          `${contractV2} — Project: ${opportunityTitle}`,
        ],
        ['Ada Ionescu created an illustrative agreement', addendumV1],
        ['Ada Ionescu created an agreement version', addendumV1],
        ['Ada Ionescu approved an agreement version', addendumV1],
        [
          'Ada Ionescu recorded the signature of an agreement version',
          `${addendumV1} · Simulated`,
        ],
      ];
      for (const [description, target] of commercialEvents)
        await expect(activityRow(page, description, target)).toHaveCount(1);
      // Create and link Project also records the Project owner's own event
      // (PRD 19.12); it is not part of the commercial family (PRD 25.1).
      await expect(
        activityRow(
          page,
          'Ada Ionescu created a preparatory Project',
          `Project: ${opportunityTitle}`,
        ),
      ).toHaveCount(1);
      // No commercial event beyond those: every row with a Request,
      // Opportunity, Sales Stage, Offer or agreement target is one of them.
      const commercialRows = rows.filter({
        has: page.locator('span', {
          hasText:
            /^Target: (?:Client Request: |Opportunity: |Sales Stage settings$|Illustrative )/u,
        }),
      });
      await expect(commercialRows).toHaveCount(commercialEvents.length);

      // Nothing typed or priced reaches the Activity Log (PRD 17.3 and 25.2).
      // The legitimate labels are the Client label of the Client family's own
      // events, the Project title of the three Project events, the stage,
      // Company and actor labels.
      const typedTexts = [...Object.values(entered), subject, serviceName];
      const forbidden = [
        ...typedTexts,
        ...snapshotContent,
        ...typedFromReceipts,
      ];
      // Each row's content without its rendered time: a formatted server
      // time can spell a typed date or an amount on some run dates.
      const rowContent = rows.locator(':scope > div');
      for (const value of forbidden)
        await expect(rowContent.filter({ hasText: value })).toHaveCount(0);
      await expect(rows.filter({ hasText: opportunityTitle })).toHaveCount(3);
      for (const label of [clientName, companyName])
        await expect(commercialRows.filter({ hasText: label })).toHaveCount(0);
      await expectNoActivityLeak(request, {
        companyId,
        expectedCommercialEvents: commercialEvents.length,
        forbidden,
        typedTexts,
        clientTaxId: entered.clientTaxId,
        labels: { clientName, companyName, opportunityTitle },
      });
      await capture(page, testInfo, 'journey-activity');

      // The first transmission opens the superseded Offer Version 1.
      const historicalOfferRead = page.waitForResponse(
        mutation(
          'GET',
          /^\/api\/offers\/opportunities\/[^/]+\/versions\/[^/]+$/u,
        ),
      );
      await activityRow(
        page,
        'Ada Ionescu recorded the transmission of an Offer Version',
        'Illustrative Offer 1 · version 1 · Simulated',
      )
        .getByRole('button', { name: 'Open Offer Version' })
        .click();
      const offerRegion = page.getByRole('region', {
        name: 'Illustrative Offer',
        exact: true,
      });
      await expect(
        offerRegion.getByText('Historical version · read only'),
      ).toBeVisible();
      const historicalOffer = await historicalOfferRead;
      expect(historicalOffer.status()).toBe(200);
      const historicalVersion = object(
        object(object(await historicalOffer.json()).offer).version,
      );
      expect(historicalVersion.versionNumber).toBe(1);
      expect(historicalVersion.transmissionState).toBe('TRANSMITTED');
      expect(historicalVersion.clientResponseState).toBe('PENDING');
      await expect(
        offerRegion
          .locator('.offer-summary')
          .getByText(
            'Simulated transmission recorded · Client response pending',
            { exact: true },
          ),
      ).toBeVisible();
      // Version 1 keeps its own conditions, not those negotiated later.
      await expect(
        offerRegion
          .locator('.offer-summary')
          .getByText(entered.firstConditions, { exact: true }),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-activity-offer-v1');

      // The Contract creation opens the superseded Contract Version 1.
      await openSection(journey, 'Activity Log');
      await activityRow(
        page,
        'Ada Ionescu created an illustrative agreement',
        'Illustrative Contract 1 · version 1',
      )
        .getByRole('button', { name: 'Open agreement version' })
        .click();
      await expect(
        contract.getByText(
          'Historical version — preserved; no further decision or signature.',
        ),
      ).toBeVisible();
      await expect(
        contract.getByText('Illustrative reference 1 · Version 1', {
          exact: true,
        }),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-activity-contract-v1');

      // The accepted Offer Version 2 is the current one.
      await openSection(journey, 'Activity Log');
      await activityRow(
        page,
        'Ada Ionescu recorded the Client response to an Offer Version (Accepted)',
        'Illustrative Offer 1 · version 2 · Simulated',
      )
        .getByRole('button', { name: 'Open Offer Version' })
        .click();
      await expect(offerRegion.getByText('Current version')).toBeVisible();
      await expect(
        offerRegion
          .locator('.offer-summary')
          .getByText(entered.negotiatedConditions, { exact: true }),
      ).toBeVisible();

      // Every projected Offer/agreement action opens its own exact version,
      // not merely a correctly labelled row (PRD 25.3 and 25.4).
      const currentOffer = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: `/offers/opportunities/${opportunityId}`,
          }),
        ).offer,
      );
      const currentOfferVersion = object(currentOffer.version);
      expect(currentOfferVersion.versionNumber).toBe(2);
      const currentContract = object(
        object(
          await apiRead(request, {
            identity: identities.ada,
            companyId,
            path: contractsPath,
          }),
        ).contract,
      );
      const currentContractVersion = object(currentContract.version);
      expect(currentContract.kind).toBe('CONTRACT');
      expect(currentContractVersion.versionNumber).toBe(2);
      expect(childAgreements.map(({ kind }) => kind).sort()).toEqual([
        'ADDENDUM',
        'PRECONTRACT',
      ]);
      const versionTargets: ActivityVersionTarget[] = [
        {
          family: 'offer',
          label: offerV1,
          resourceId: text(currentOffer.id),
          versionId: text(currentOfferVersion.predecessorVersionId),
          versionNumber: 1,
          path: `/offers/opportunities/${opportunityId}`,
        },
        {
          family: 'offer',
          label: offerV2,
          resourceId: text(currentOffer.id),
          versionId: text(currentOfferVersion.id),
          versionNumber: 2,
          path: `/offers/opportunities/${opportunityId}`,
        },
        {
          family: 'agreement',
          kind: 'CONTRACT',
          label: contractV1,
          resourceId: text(currentContract.id),
          versionId: text(currentContractVersion.predecessorVersionId),
          versionNumber: 1,
          path: contractsPath,
        },
        {
          family: 'agreement',
          kind: 'CONTRACT',
          label: contractV2,
          resourceId: text(currentContract.id),
          versionId: text(currentContractVersion.id),
          versionNumber: 2,
          path: contractsPath,
        },
        ...childAgreements.map(({ id, kind, versionId }) => ({
          family: 'agreement' as const,
          kind,
          label: kind === 'PRECONTRACT' ? precontractV1 : addendumV1,
          resourceId: id,
          versionId,
          versionNumber: 1 as const,
          path: `${contractsPath}/agreements/${id}`,
        })),
      ];
      let linksFollowed = 0;
      for (const [description, target] of commercialEvents) {
        if (!target.startsWith('Illustrative ')) continue;
        const destination = versionTargets.find(
          ({ label }) =>
            target === label ||
            target.startsWith(`${label} · `) ||
            target.startsWith(`${label} — `),
        );
        if (!destination) throw new Error('Unexpected Activity version target');
        await openSection(journey, 'Activity Log');
        const exactPath = `/api${destination.path}/versions/${destination.versionId}`;
        const selectedVersionRead = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            new URL(response.url()).pathname === exactPath,
        );
        await activityRow(page, description, target)
          .getByRole('button', {
            name:
              destination.family === 'offer'
                ? 'Open Offer Version'
                : 'Open agreement version',
            exact: true,
          })
          .click();
        const selectedResponse = await selectedVersionRead;
        expect(selectedResponse.status(), description).toBe(200);
        const selected = object(
          object(await selectedResponse.json())[
            destination.family === 'offer' ? 'offer' : 'contract'
          ],
        );
        expect(selected.id, description).toBe(destination.resourceId);
        expect(selected.illustrativeReference, description).toBe(1);
        const selectedVersion = object(selected.version);
        expect(selectedVersion.id, description).toBe(destination.versionId);
        expect(selectedVersion.versionNumber, description).toBe(
          destination.versionNumber,
        );
        if (destination.family === 'offer') {
          await expect(
            offerRegion
              .locator('.offer-summary')
              .getByRole('term')
              .filter({ hasText: /^Version$/u })
              .locator('xpath=following-sibling::dd[1]'),
          ).toHaveText(String(destination.versionNumber));
          await expect(
            offerRegion.getByText(
              destination.versionNumber === 1
                ? 'Historical version · read only'
                : 'Current version',
              { exact: true },
            ),
          ).toBeVisible();
        } else {
          expect(selected.kind, description).toBe(destination.kind);
          await expect(
            contract.getByText(
              `Illustrative reference 1 · Version ${destination.versionNumber}`,
              { exact: true },
            ),
          ).toBeVisible();
          if (destination.kind === 'PRECONTRACT')
            await expect(
              contract.getByRole('heading', {
                name: 'Illustrative Precontract',
                exact: true,
              }),
            ).toBeVisible();
          else if (destination.kind === 'ADDENDUM')
            await expect(
              contract.getByRole('heading', {
                name: 'Illustrative Addendum 1',
                exact: true,
              }),
            ).toBeVisible();
          if (
            destination.kind === 'CONTRACT' &&
            destination.versionNumber === 1
          )
            await expect(
              contract.getByText(
                'Historical version — preserved; no further decision or signature.',
                { exact: true },
              ),
            ).toBeVisible();
        }
        linksFollowed += 1;
      }
      expect(linksFollowed).toBe(23);
      await capture(page, testInfo, 'journey-all-activity-links');
    });

    await test.step("criterion 3: another Company's user sees neither the case nor its Activity", async () => {
      const otherCompanyId = requiredEnvironment('ACCEPTANCE_OTHER_COMPANY_ID');
      const other = await membershipOf(request, identities.other);
      for (const bundle of otherCompanyBundles)
        await grant(request, {
          bundle,
          membership: other,
          companyId: otherCompanyId,
        });
      try {
        const otherPage = await openSession(browser, identities.other, page);
        sessions.push(otherPage);
        const otherJourney: Journey = {
          page: otherPage,
          narrow,
          companyName: 'BIC',
          subject,
        };
        await openSection(otherJourney, 'Client Requests');
        const otherIntake = otherPage.locator('.commercial-intake-workspace');
        await expect(
          otherIntake.getByRole('heading', { name: 'Client Requests' }).first(),
        ).toBeVisible();
        await expect(otherPage.getByText(subject)).toHaveCount(0);
        await openSection(otherJourney, 'Activity Log');
        const otherActivity = otherPage.locator('.activity-log');
        await expect(
          otherActivity.getByRole('heading', { name: 'Activity Log' }),
        ).toBeVisible();
        // The BIC history loads, yet no commercial event of the case appears.
        // (Workspace-level member provisioning is not Company activity.)
        await expect(
          otherActivity.locator('.activity-log-list > li').first(),
        ).toBeVisible();
        for (const hidden of [
          'Client Request',
          'Opportunity',
          'Sales Stage',
          'Illustrative',
          'agreement',
          companyName,
          clientName,
          opportunityTitle,
        ])
          await expect(otherActivity).not.toContainText(hidden);
        await expect(
          otherActivity.getByRole('button', {
            name: /Open (Request|Offer Version|agreement version)/u,
          }),
        ).toHaveCount(0);
        await capture(otherPage, testInfo, 'journey-other-company');
        if (narrow)
          await otherPage
            .getByRole('button', { name: 'Open navigation' })
            .click();
        const companies = await openSelect(
          otherPage.getByLabel('Active Company', { exact: true }),
        );
        await expect(
          companies.getByRole('option', { name: companyName }),
        ).toHaveCount(0);
        await otherPage.keyboard.press('Escape');

        // BIC's Project list, which the member may read, excludes the
        // journey's Project (PRD 19.16: Project link, count and reference).
        const projectsListed = otherPage.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            /^\/api\/projects$/u.test(new URL(response.url()).pathname),
        );
        await openSection(otherJourney, 'Projects');
        expect((await projectsListed).status()).toBe(200);
        const otherProjects = otherPage.locator('.project-workspace');
        await expect(
          otherProjects.getByRole('heading', { name: 'Projects', exact: true }),
        ).toBeVisible();
        await expect(otherProjects).not.toContainText(opportunityTitle);
        await expect(otherProjects).not.toContainText(clientName);

        // Direct identifiers reveal nothing either (PRD 13): every public
        // read keyed by an identifier the journey holds is denied, and BIC's
        // own lists exclude the case.
        const offerVersionId = text(
          object(
            object(
              object(
                await apiRead(request, {
                  identity: identities.ada,
                  companyId,
                  path: `/offers/opportunities/${opportunityId}`,
                }),
              ).offer,
            ).version,
          ).id,
        );
        const mainAgreement = object(
          object(
            await apiRead(request, {
              identity: identities.ada,
              companyId,
              path: contractsPath,
            }),
          ).contract,
        );
        const mainVersion = object(mainAgreement.version);
        const contractVersionId = text(mainVersion.id);
        const contractQualityRunId = text(
          object(mainVersion.latestQualityRun).id,
        );
        const ownedLists = [
          '/commercial-intake/requests?limit=25',
          '/sales-stages',
          '/projects',
        ];
        const opportunityPath = `/commercial-intake/opportunities/${opportunityId}`;
        const offerPath = `/offers/opportunities/${opportunityId}`;
        const directReads = [
          `/commercial-intake/requests/${clientRequestId}`,
          `${opportunityPath}/outcome-history`,
          `${opportunityPath}/stage-history`,
          `${opportunityPath}/eligible-responsible-actors`,
          offerPath,
          `${offerPath}/versions`,
          `${offerPath}/versions/${offerVersionId}`,
          contractsPath,
          `${contractsPath}/project-candidates`,
          `${contractsPath}/versions`,
          `${contractsPath}/versions/${contractVersionId}`,
          `${contractsPath}/versions/${contractVersionId}/representation`,
          `${contractsPath}/versions/${contractVersionId}/quality-checks`,
          `${contractsPath}/versions/${contractVersionId}/quality-checks/${contractQualityRunId}`,
          `/contracts/projects/${projectId}`,
          `/projects/${projectId}`,
          ...childAgreements.flatMap(({ id, versionId, qualityRunId }) => {
            const agreementPath = `${contractsPath}/agreements/${id}`;
            const versionPath = `${agreementPath}/versions/${versionId}`;
            return [
              agreementPath,
              `${agreementPath}/project-candidates`,
              `${agreementPath}/versions`,
              versionPath,
              `${versionPath}/representation`,
              `${versionPath}/quality-checks`,
              `${versionPath}/quality-checks/${qualityRunId}`,
            ];
          }),
        ];
        const journeyIdentifiers = [
          subject,
          opportunityTitle,
          entered.originalText,
          qualification,
          contracting,
          clientRequestId,
          opportunityId,
          offerVersionId,
          contractVersionId,
          contractQualityRunId,
          projectId,
          ...childAgreements.flatMap(({ id, versionId, qualityRunId }) => [
            id,
            versionId,
            qualityRunId,
          ]),
        ];
        for (const context of [companyId, otherCompanyId])
          for (const path of [...ownedLists, ...directReads]) {
            const response = await request.get(`${apiOrigin}/api${path}`, {
              headers: { ...identities.other, 'x-company-context-id': context },
            });
            const body = await response.text();
            for (const identifier of journeyIdentifiers)
              expect(body, `${context} ${path}`).not.toContain(identifier);
            if (context === companyId)
              // The journey Company is not a valid active Company for the
              // BIC member: the safe denial, for the list reads as well.
              expect(response.status(), `${context} ${path}`).toBe(403);
            else if (ownedLists.includes(path))
              // BIC's own lists read, without the journey case or Project.
              expect(response.status(), path).toBe(200);
            else expect(response.status(), path).toBe(404);
          }
      } finally {
        for (const bundle of otherCompanyBundles)
          await revoke(request, {
            bundle,
            membership: other,
            companyId: otherCompanyId,
          });
      }
    });
  } finally {
    for (const session of sessions) await session.context().close();
  }
});

type Journey = {
  page: Page;
  narrow: boolean;
  companyName: string;
  subject: string;
};

type ActivityVersionTarget = {
  label: string;
  resourceId: string;
  versionId: string;
  versionNumber: 1 | 2;
  path: string;
} & (
  | { family: 'offer' }
  | { family: 'agreement'; kind: 'CONTRACT' | 'PRECONTRACT' | 'ADDENDUM' }
);

/** Opens a navigation section of the active journey Company from a fresh load. */
async function openSection(journey: Journey, section: string): Promise<void> {
  const { page, narrow, companyName } = journey;
  await page.goto('/');
  const company = page.getByLabel('Active Company', { exact: true });
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(company, { label: companyName });
  await expect(company).toHaveText(companyName);
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: section, exact: true })
    .click();
}

/** Reloads from PostgreSQL and reopens the journey Request detail. */
async function reopenRequest(journey: Journey): Promise<void> {
  const { page, subject } = journey;
  await openSection(journey, 'Client Requests');
  const detailRead = page.waitForResponse(
    mutation('GET', /^\/api\/commercial-intake\/requests\/[^/]+$/u),
  );
  await page
    .locator('.commercial-intake-workspace')
    .getByRole('button')
    .filter({ has: page.getByText(subject, { exact: true }) })
    .click();
  expect((await detailRead).status()).toBe(200);
  await expect(
    page.getByText('Client Request detail', { exact: true }),
  ).toBeVisible();
}

/** Reloads, reopens the Request and selects its Precontract. */
async function reopenPrecontract(journey: Journey): Promise<void> {
  await reopenRequest(journey);
  const contract = journey.page.getByRole('region', {
    name: 'Contract',
    exact: true,
  });
  await contract
    .getByRole('region', { name: 'Precontract', exact: true })
    .getByRole('button', { name: 'Open Precontract', exact: true })
    .click();
}

/** Reloads, reopens the Request and selects Addendum 1 of its Contract. */
async function reopenAddendum(journey: Journey): Promise<void> {
  await reopenRequest(journey);
  await journey.page
    .getByRole('region', { name: 'Contract', exact: true })
    .getByRole('region', { name: 'Addenda', exact: true })
    .getByRole('button', { name: 'Open Addendum 1', exact: true })
    .click();
}

async function setStage(journey: Journey, label: string): Promise<void> {
  const { page } = journey;
  const intake = page.locator('.commercial-intake-workspace');
  await intake.getByRole('button', { name: 'Change Sales Stage' }).click();
  await selectOption(intake.getByLabel('New Sales Stage', { exact: true }), {
    label,
  });
  const changed = page.waitForResponse(
    mutation(
      'POST',
      /^\/api\/commercial-intake\/opportunities\/[^/]+\/stage$/u,
    ),
  );
  await intake.getByRole('button', { name: 'Save Sales Stage' }).click();
  expect((await changed).status()).toBe(200);
  await expect(
    intake.getByRole('alert').filter({ hasText: /^Sales Stage changed\.$/u }),
  ).toBeVisible();
}

async function expectAdjustedSnapshot(
  pricing: Locator,
  adjustmentReason: string,
): Promise<void> {
  await expect(pricing.getByText('655.50 EUR', { exact: true })).toBeVisible();
  for (const line of [
    'Original net and tax: 600.00 + 90.00 EUR',
    'Net reduction: 30.00 EUR',
    `Adjustment reason: ${adjustmentReason}`,
    'Adjusted net and tax: 570.00 + 85.50 EUR',
  ])
    await expect(pricing.getByText(line, { exact: true })).toBeVisible();
  await expect(
    pricing.locator('header').getByText('Illustrative and provisional'),
  ).toBeVisible();
}

function requestClient(intake: Locator): Locator {
  return intake
    .locator('.commercial-intake-detail dl > div')
    .filter({
      has: intake
        .page()
        .getByRole('term')
        .filter({ hasText: /^Client$/u }),
    })
    .getByRole('definition');
}

/** The Activity Log rows with exactly this description and target label. */
function activityRow(page: Page, description: string, target: string): Locator {
  return page
    .locator('.activity-log .activity-log-list > li')
    .filter({ has: page.getByText(description, { exact: true }) })
    .filter({ has: page.getByText(`Target: ${target}`, { exact: true }) });
}

/** The commercial Activity family (PRD 17.3 and 25.1). */
const commercialActivityActions: readonly string[] = [
  'client_request.created',
  'client_request.client_associated',
  'opportunity.created',
  'opportunity.next_action.updated',
  'opportunity.responsible.changed',
  'opportunity.outcome.changed',
  'opportunity.stage.changed',
  'sales_stage.configured',
  'offer.created',
  'offer_version.created',
  'offer_version.approved',
  'offer_version.rejected',
  'offer_version.transmission_recorded',
  'offer_version.client_response_recorded',
  'contract.created',
  'contract_version.created',
  'contract_version.approved',
  'contract_version.rejected',
  'contract_version.signature_recorded',
  'contract_project.linked',
];

/** The sorted keys of each commercial target reference (PRD 17.3, 25.2). */
const projectedTargetKeys: Record<string, readonly string[]> = {
  client_request: ['clientRequestId', 'companyId', 'type'],
  // The containing Request is named for a current Request reader.
  opportunity: ['clientRequestId', 'companyId', 'opportunityId', 'type'],
  sales_stage: ['companyId', 'salesStageId', 'type'],
  offer_version: [
    'clientRequestId',
    'companyId',
    'illustrativeReference',
    'offerVersionId',
    'opportunityId',
    'type',
    'versionNumber',
  ],
  contract_version: [
    'clientRequestId',
    'companyId',
    'contractId',
    'contractVersionId',
    'illustrativeReference',
    'kind',
    'opportunityId',
    'type',
    'versionNumber',
  ],
};

/** The sorted metadata keys an action projects; every other action none. */
const projectedMetadataKeys: Partial<Record<string, readonly string[]>> = {
  'opportunity.responsible.changed': ['after', 'before'],
  // A win carries no loss reason.
  'opportunity.outcome.changed': ['newStatus', 'previousStatus'],
  'opportunity.stage.changed': ['newLabel', 'previousLabel'],
  'sales_stage.configured': ['label', 'operation'],
  'offer_version.transmission_recorded': ['channel'],
  'offer_version.client_response_recorded': ['evidenceKind', 'outcome'],
  'contract_version.signature_recorded': ['evidenceKind'],
  'contract_project.linked': ['created', 'project'],
};

/**
 * The Activity read itself, behind the rendered page: the commercial events
 * carry no typed value, amount, date or label beyond the references PRD 25.2
 * allows, and no typed text reaches any event of the page.
 */
async function expectNoActivityLeak(
  request: APIRequestContext,
  {
    companyId,
    expectedCommercialEvents,
    forbidden,
    typedTexts,
    clientTaxId,
    labels,
  }: {
    companyId: string;
    expectedCommercialEvents: number;
    /** Every forbidden value, amounts and receipt-derived values included. */
    forbidden: readonly string[];
    /** The typed texts alone, which no timestamp can spell. */
    typedTexts: readonly string[];
    clientTaxId: string;
    labels: {
      clientName: string;
      companyName: string;
      opportunityTitle: string;
    };
  },
): Promise<void> {
  const events = object(
    await apiRead(request, {
      identity: identities.ada,
      companyId,
      path: '/activity-log',
    }),
  ).events;
  if (!Array.isArray(events)) throw new Error('Expected Activity events');
  const projected = events.map((event) => object(event));
  const commercial = projected.filter((event) =>
    commercialActivityActions.includes(text(event.action)),
  );
  expect(commercial).toHaveLength(expectedCommercialEvents);
  // Each commercial event projects exactly the keys its contract names
  // (PRD 17.3 and 25.2): any extra field fails before its value is scanned.
  for (const event of commercial) {
    const action = text(event.action);
    const target = object(event.target);
    const metadata = object(event.metadata);
    expect(Object.keys(event).sort(), action).toEqual([
      'action',
      'actor',
      'id',
      'metadata',
      'occurredAt',
      'target',
    ]);
    expect(Object.keys(object(event.actor)).sort(), action).toEqual([
      'displayName',
      'internalUserId',
    ]);
    expect(Object.keys(target).sort(), action).toEqual(
      projectedTargetKeys[text(target.type)],
    );
    expect(Object.keys(metadata).sort(), action).toEqual(
      projectedMetadataKeys[action] ?? [],
    );
    if (action === 'contract_project.linked')
      expect(Object.keys(object(metadata.project)).sort()).toEqual([
        'projectId',
        'projectTitle',
      ]);
  }
  // `occurredAt` is the only server instant a commercial event carries, and
  // the received time and signing dates typed from receipts coincide with it.
  // Everything else the event carries, its target included, must hold none of
  // them nor any other forbidden value (PRD 25.2: no user-entered date).
  const content = JSON.stringify(
    commercial.map((event) =>
      Object.fromEntries(
        Object.entries(event).filter(([key]) => key !== 'occurredAt'),
      ),
    ),
  );
  for (const value of [...forbidden, labels.clientName, labels.companyName])
    expect(content, value).not.toContain(value);
  // The Project title is the reference of the two Project links only.
  expect(
    commercial
      .filter((event) =>
        JSON.stringify(event).includes(labels.opportunityTitle),
      )
      .map((event) => event.action),
  ).toEqual(['contract_project.linked', 'contract_project.linked']);
  // No typed text reaches any event of the page. Outside the commercial
  // family, only the Client dossier correction's own history (the Client
  // owner's event) records the corrected IDNO. Amounts are checked on the
  // commercial events alone: other families' timestamps may spell them.
  const page = JSON.stringify(
    projected.map((event) =>
      Object.fromEntries(
        Object.entries(event).filter(([key]) => key !== 'occurredAt'),
      ),
    ),
  );
  for (const value of typedTexts.filter((value) => value !== clientTaxId))
    expect(page, value).not.toContain(value);
  expect(
    projected
      .filter((event) => JSON.stringify(event).includes(clientTaxId))
      .map((event) => event.action),
  ).toEqual(['client.corrected']);
}

/** A second browser session acting as another member through the same build. */
async function openSession(
  browser: Browser,
  identity: Identity,
  like: Page,
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: webOrigin,
    viewport: like.viewportSize(),
    reducedMotion: 'reduce',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: webOrigin,
          localStorage: [{ name: 'prisma-prim.interface-locale', value: 'en' }],
        },
      ],
    },
  });
  // The local demonstration build names one identity; the test identity
  // headers the API accepts in test mode name the member who acts here.
  await context.route('**/api/**', (route) =>
    route.continue({ headers: { ...route.request().headers(), ...identity } }),
  );
  return context.newPage();
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await expectNoHorizontalOverflow(page);
  const viewport = testInfo.project.name.endsWith('narrow')
    ? 'narrow'
    : 'desktop';
  await page.screenshot({
    path: testInfo.outputPath(`${name}-${viewport}.png`),
    fullPage: true,
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.documentWidth,
    JSON.stringify(dimensions),
  ).toBeLessThanOrEqual(dimensions.viewportWidth);
}

function mutation(method: string, pathname: RegExp) {
  return (response: Response) =>
    response.request().method() === method &&
    pathname.test(new URL(response.url()).pathname);
}

async function publishIllustrativeConfiguration(
  request: APIRequestContext,
  {
    companyId,
    suffix,
    serviceName,
  }: { companyId: string; suffix: string; serviceName: string },
): Promise<void> {
  const step = (path: string, data: unknown, key: string) =>
    command(request, {
      identity: identities.ada,
      path,
      data,
      key: `journey-${key}-${suffix}`,
      companyId,
    });
  const effectiveFrom = new Date(
    Date.now() + initialClockOffset + 60_000,
  ).toISOString();
  await step(
    '/pricing-configuration/rule-versions',
    {
      label: 'Synthetic journey rule',
      effectiveFrom,
      expectedActiveVersionNumber: null,
    },
    'rule',
  );
  const definition = object(
    object(
      await step(
        '/commercial-catalogue/service-definitions',
        {
          code: `JOURNEY-${suffix.toUpperCase()}`,
          name: serviceName,
          description: null,
        },
        'definition',
      ),
    ).definition,
  );
  const offering = object(
    object(
      await step(
        '/commercial-catalogue/offerings',
        { serviceDefinitionId: text(definition.id), commercialLabel: null },
        'offering',
      ),
    ).offering,
  );
  await step(
    `/pricing-configuration/offerings/${text(offering.id)}/tariff-versions`,
    {
      unit: 'illustrative-unit',
      unitAmount: '300.0000',
      currency: 'EUR',
      taxRatePercent: '15.00',
      taxLabel: 'Illustrative tax',
      effectiveFrom,
      expectedActiveVersionNumber: null,
    },
    'tariff',
  );
  // Both versions take effect on the synthetic server clock, not after a sleep.
  await writeClockOffset(initialClockOffset + 120_000);
}

async function approvalDate(
  request: APIRequestContext,
  { companyId, path }: { companyId: string; path: string },
): Promise<string> {
  const agreement = object(
    object(
      await apiRead(request, { identity: identities.ada, companyId, path }),
    ).contract,
  );
  return text(object(object(agreement.version).decision).decidedAt).slice(
    0,
    10,
  );
}

async function registerCompany(
  request: APIRequestContext,
  displayName: string,
  suffix: string,
): Promise<string> {
  return text(
    object(
      await command(request, {
        identity: identities.owner,
        path: '/companies',
        data: { displayName },
        key: `journey-company-${suffix}`,
      }),
    ).id,
  );
}

/**
 * The Access label of one eligible responsible actor, as the responsible
 * change records it and the Activity projection returns it (PRD 17.3).
 */
async function responsibleLabel(
  request: APIRequestContext,
  {
    companyId,
    opportunityId,
    membership,
  }: { companyId: string; opportunityId: string; membership: string },
): Promise<string> {
  const members = object(
    await apiRead(request, {
      identity: identities.ada,
      companyId,
      path: `/commercial-intake/opportunities/${opportunityId}/eligible-responsible-actors`,
    }),
  ).members;
  if (!Array.isArray(members)) throw new Error('Expected eligible members');
  const member = members
    .map((candidate) => object(candidate))
    .find((candidate) => candidate.workspaceMembershipId === membership);
  if (!member) throw new Error(`Membership ${membership} is not eligible`);
  return text(member.displayLabel);
}

async function membershipOf(
  request: APIRequestContext,
  identity: Identity,
): Promise<string> {
  const response = await request.get(`${apiOrigin}/api/access/current-actor`, {
    headers: identity,
  });
  expect(response.status()).toBe(200);
  return text(object(await response.json()).workspaceMembershipId);
}

async function grant(
  request: APIRequestContext,
  {
    bundle,
    membership,
    companyId,
  }: { bundle: Bundle; membership: string; companyId: string },
): Promise<void> {
  await command(request, {
    identity: identities.owner,
    path: `/${bundle}-assignments`,
    data: { workspaceMembershipId: membership, companyId },
    key: `journey-grant-${bundle}-${crypto.randomUUID()}`,
  });
}

async function revoke(
  request: APIRequestContext,
  {
    bundle,
    membership,
    companyId,
  }: { bundle: Bundle; membership: string; companyId: string },
): Promise<void> {
  const response = await request.delete(
    `${apiOrigin}/api/${bundle}-assignments/${membership}/${companyId}`,
    {
      headers: {
        ...identities.owner,
        'idempotency-key': `journey-revoke-${bundle}-${crypto.randomUUID()}`,
      },
    },
  );
  expect(response.status()).toBe(200);
}

async function command(
  request: APIRequestContext,
  {
    identity,
    path,
    data,
    key,
    companyId,
  }: {
    identity: Identity;
    path: string;
    data: unknown;
    key: string;
    companyId?: string;
  },
): Promise<unknown> {
  const response = await request.post(`${apiOrigin}/api${path}`, {
    headers: {
      ...identity,
      'idempotency-key': key,
      ...(companyId ? { 'x-company-context-id': companyId } : {}),
    },
    data,
  });
  const result: unknown = await response.json();
  expect(response.status(), JSON.stringify({ path, result })).toBe(201);
  return result;
}

/** A valid version command must be refused once its agreement is final. */
async function expectVersionRefused(
  request: APIRequestContext,
  {
    companyId,
    path,
    key,
    code,
    data,
  }: {
    companyId: string;
    path: string;
    key: string;
    code: 'OFFER_ACCEPTED' | 'CONTRACT_EXECUTED';
    data: unknown;
  },
): Promise<void> {
  const response = await request.post(`${apiOrigin}/api${path}`, {
    headers: {
      ...identities.ada,
      'x-company-context-id': companyId,
      'idempotency-key': key,
    },
    data,
  });
  const result: unknown = await response.json();
  expect(response.status(), JSON.stringify({ path, result })).toBe(409);
  expect(result).toMatchObject({ code });
}

async function apiRead(
  request: APIRequestContext,
  {
    identity,
    companyId,
    path,
  }: { identity: Identity; companyId: string; path: string },
): Promise<unknown> {
  const response = await request.get(`${apiOrigin}/api${path}`, {
    headers: { ...identity, 'x-company-context-id': companyId },
  });
  expect(response.status(), path).toBe(200);
  return response.json();
}

// The API reads this file synchronously while browser requests can still be
// in flight. Replace the complete JSON atomically so advancing or resetting
// the synthetic clock never exposes the empty file of a truncating write.
async function writeClockOffset(offset: number): Promise<void> {
  const path = clockFile();
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(offset));
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function clockFile(): string {
  return requiredEnvironment('ACCEPTANCE_CLOCK_OFFSET_FILE');
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected text');
  return value;
}
