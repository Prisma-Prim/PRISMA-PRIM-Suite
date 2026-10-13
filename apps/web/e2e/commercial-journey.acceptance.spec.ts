import { readFile, writeFile } from 'node:fs/promises';
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
// "Every bundle in BIC only" for the isolation proof (PRD 18.14 and 19.16).
const otherCompanyBundles: readonly Bundle[] = [
  'company-commercial-intake',
  'company-offer-preparer',
  'company-contract-preparer',
  'company-commercial-activity-reader',
];

let initialClockOffset = 0;
test.beforeEach(async () => {
  const value: unknown = JSON.parse(await readFile(clockFile(), 'utf8'));
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Invalid synthetic acceptance clock');
  initialClockOffset = value;
});
test.afterEach(async () => {
  await writeFile(clockFile(), JSON.stringify(initialClockOffset));
});

test('follows one commercial case from Request to signed agreement, Project and Activity', async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.setTimeout(600_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Commercial Journey ${suffix}`;
  const clientName = `Synthetic Journey Client ${suffix}`;
  const subject = `Journey audit request ${suffix}`;
  const originalText = `Exact synthetic source of the ${suffix} commercial journey.`;
  const opportunityTitle = `Certify the ${suffix} journey site`;
  const serviceName = `Illustrative journey audit ${suffix}`;
  const qualification = `Calificare ${suffix}`;
  const contracting = `Contractare ${suffix}`;

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
  let opportunityId = '';
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
      await intake.getByLabel('Original request text').fill(originalText);
      await intake.getByLabel('Subject').fill(subject);
      await intake.getByLabel('Opportunity title').fill(opportunityTitle);
      await intake.getByLabel('Next action').fill('Arrange the scoping call');
      const captured = page.waitForResponse(
        mutation('POST', /^\/api\/commercial-intake\/requests$/u),
      );
      await intake.getByRole('button', { name: 'Capture Request' }).click();
      const capturedResponse = await captured;
      expect(capturedResponse.status()).toBe(201);
      opportunityId = text(
        object(object(await capturedResponse.json()).initialOpportunity).id,
      );

      await reopenRequest(journey);
      await expect(
        intake.getByText(originalText, { exact: true }),
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
      await intake
        .getByLabel('Next action')
        .fill('Confirm the audit scope with the Client');
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
        intake.getByText(
          'Next action: Confirm the audit scope with the Client',
          {
            exact: true,
          },
        ),
      ).toBeVisible();
      await expect(
        intake.getByText('Version: 2', { exact: true }),
      ).toBeVisible();

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
      await ionIntake
        .getByLabel('Next action')
        .fill('Send the audit questionnaire');
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
      await ionIntake
        .getByLabel('Next action')
        .fill('Send the audit questionnaire');
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
        ionIntake.getByText('Next action: Send the audit questionnaire', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        ionIntake.getByText('Version: 5', { exact: true }),
      ).toBeVisible();
      await reopenRequest(journey);
      await expect(
        intake.getByText('Next action: Send the audit questionnaire', {
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
      await line.getByLabel('Net reduction', { exact: true }).fill('30.00');
      const reason = line.getByRole('textbox', {
        name: 'Adjustment reason',
        exact: true,
      });
      await reason.fill('   ');
      await pricing.getByRole('button', { name: 'Calculate and save' }).click();
      await expect(pricing.getByRole('alert')).toHaveText(
        'Correct the highlighted values and try again.',
      );
      await reason.fill('Synthetic loyalty reduction');
      const calculated = page.waitForResponse(
        mutation('POST', /^\/api\/pricing\/opportunities\/[^/]+\/snapshots$/u),
      );
      await pricing.getByRole('button', { name: 'Calculate and save' }).click();
      expect((await calculated).status()).toBe(201);
      await expectAdjustedSnapshot(pricing);

      await reopenRequest(journey);
      await pricing
        .getByRole('button', { name: /Reopen snapshot: 655\.50 EUR/u })
        .click();
      await expectAdjustedSnapshot(pricing);
      await expect(
        pricing.getByText('2 × 300.0000 EUR/illustrative-unit'),
      ).toBeVisible();
      await capture(page, testInfo, 'journey-snapshot');
    });

    const offer = page.locator('.offer-panel');
    const summary = offer.locator('.offer-summary');
    await test.step('5a. prepare Offer v1 and run its Quality Checks', async () => {
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
        .fill(`Synthetic audit scope ${suffix}`);
      await offer
        .getByRole('textbox', { name: 'Commercial conditions', exact: true })
        .fill('Synthetic first conditions');
      const prepared = page.waitForResponse(
        mutation('POST', /^\/api\/offers\/opportunities\/[^/]+$/u),
      );
      await offer.getByRole('button', { name: 'Prepare version 1' }).click();
      expect((await prepared).status()).toBe(201);

      await reopenRequest(journey);
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
      await expect(page.getByText(originalText, { exact: true })).toBeVisible();
      await expect(unavailable).toBeVisible();
      await expect(summary).toHaveCount(0);
      await expect(page.getByText('Approved internally')).toHaveCount(0);
      await openSection(journey, 'Activity Log');
      const activity = page.locator('.activity-log');
      await expect(
        activityRow(
          page,
          'Ada Ionescu captured a Client Request',
          'Client Request',
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
        .fill('Synthetic negotiated conditions');
      const created = page.waitForResponse(mutation('POST', /\/versions$/u));
      await offer
        .getByRole('button', { name: 'Create new version', exact: true })
        .click();
      expect((await created).status()).toBe(201);
      await reopenRequest(journey);
      await expect(
        offer.getByText('Current value: Synthetic negotiated conditions', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        summary.getByText('Draft — not approved', { exact: true }),
      ).toBeVisible();

      await offer
        .getByRole('button', { name: 'Run Quality Checks', exact: true })
        .click();
      await expect(
        offer.getByText('Checks completed with warnings.', { exact: true }),
      ).toBeVisible();
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
        .fill(`IDNO-JOURNEY-${suffix.toUpperCase()}`);
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

    async function approveAndSign(agreementPath: string): Promise<void> {
      await expect(
        checks.getByText('No Contract Quality Check run yet.', { exact: true }),
      ).toBeVisible();
      await checks
        .getByRole('button', {
          name: 'Run Contract Quality Checks',
          exact: true,
        })
        .click();
      // The recorded IDNO clears the only blocking agreement check.
      await expect(
        checks
          .getByRole('listitem')
          .filter({ hasText: 'IDNO / tax code is recorded' }),
      ).toContainText('PASS');
      for (const box of await decision.getByRole('checkbox').all())
        await box.check();
      await decision
        .getByRole('button', {
          name: 'Approve exact Contract Version',
          exact: true,
        })
        .click();
      await expect(
        decision.getByText('Approved internally', { exact: true }),
      ).toBeVisible();
      const signedOn = await approvalDate(request, {
        companyId,
        path: agreementPath,
      });
      await signatures
        .getByLabel('Provider signatory label', { exact: true })
        .fill('Synthetic provider signatory');
      await signatures
        .getByLabel('Client signatory label', { exact: true })
        .fill('Synthetic Client signatory');
      await signatures
        .getByLabel('Provider signing date', { exact: true })
        .fill(signedOn);
      await signatures
        .getByLabel('Client signing date', { exact: true })
        .fill(signedOn);
      for (const box of await signatures.getByRole('checkbox').all())
        await box.check();
      await signatures
        .getByRole('button', {
          name: 'Record both simulated signatures',
          exact: true,
        })
        .click();
      await expect(
        signatures.getByText('Executed — simulated evidence only', {
          exact: true,
        }),
      ).toBeVisible();
    }

    const contractsPath = `/contracts/opportunities/${opportunityId}`;
    await test.step('6. prepare, approve and sign the Precontract, then create its Project', async () => {
      const editor = contract.getByRole('region', {
        name: 'Create Precontract',
        exact: true,
      });
      await editor
        .getByRole('textbox', { name: 'Preliminary work scope', exact: true })
        .fill('Synthetic site survey before the Contract');
      await editor
        .getByRole('textbox', {
          name: 'Preliminary financial conditions',
          exact: true,
        })
        .fill('Synthetic advance capped at cost');
      await editor
        .getByRole('textbox', {
          name: 'Limits until the Contract',
          exact: true,
        })
        .fill('Synthetic limit: survey only');
      await editor
        .getByLabel('Precontract term end', { exact: true })
        .fill('2099-12-31');
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
      await approveAndSign(`${contractsPath}/agreements/${precontractId}`);
      await reopenPrecontract(journey);
      await expect(
        signatures.getByText('Executed — simulated evidence only', {
          exact: true,
        }),
      ).toBeVisible();

      const creation = projects.getByRole('region', {
        name: 'Create a preparatory Project',
        exact: true,
      });
      await expect(
        creation.getByRole('textbox', { name: 'New Project title' }),
      ).toHaveValue(opportunityTitle);
      await creation.getByRole('checkbox').check();
      await creation
        .getByRole('button', { name: 'Create and link Project', exact: true })
        .click();
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

      const revisions = contract.getByRole('region', {
        name: 'Revise Contract before signature',
        exact: true,
      });
      await revisions.getByLabel('Revised term start').fill('2026-11-02');
      await revisions.getByLabel('Revised term end').fill('2099-12-31');
      await revisions
        .getByLabel('Revised special conditions')
        .fill('Synthetic special conditions agreed in negotiation');
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
      await approveAndSign(`${contractsPath}/agreements/${mainContractId}`);
      await reopenRequest(journey);
      await expect(
        signatures.getByText('Executed — simulated evidence only', {
          exact: true,
        }),
      ).toBeVisible();

      const candidate = projects.getByRole('radio', {
        name: new RegExp(opportunityTitle, 'u'),
      });
      await expect(candidate).toHaveCount(1);
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
      await reopenRequest(journey);
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
      expect(
        projectList.filter(
          (project) => object(project).title === opportunityTitle,
        ),
      ).toHaveLength(1);
    });

    await test.step('8. prepare, approve and sign Addendum 1', async () => {
      await reopenRequest(journey);
      await contract
        .getByRole('textbox', { name: 'Change summary', exact: true })
        .fill(`Synthetic extension of the audit scope ${suffix}`);
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
      if (!Array.isArray(addenda)) throw new Error('Expected Addenda');
      await approveAndSign(
        `${contractsPath}/agreements/${text(object(addenda[0]).id)}`,
      );
      await contract
        .getByRole('button', {
          name: 'Return to parent agreement',
          exact: true,
        })
        .click();
      await reopenRequest(journey);
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
        contract.getByText(`Synthetic extension of the audit scope ${suffix}`, {
          exact: true,
        }),
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
      for (const [description, target] of [
        ['Ada Ionescu captured a Client Request', 'Client Request'],
        ['Ada Ionescu created an initial Opportunity', ''],
        ['Ada Ionescu associated a Client with a Request', 'Client Request'],
        ['Ada Ionescu changed the responsible actor of an Opportunity', ''],
        ['Ion Popa updated an Opportunity next action', ''],
        [
          `Ada Ionescu changed the Sales Stage of an Opportunity (${qualification} → ${contracting})`,
          '',
        ],
        [`Ada Ionescu configured a Sales Stage (created: ${contracting})`, ''],
        ['Ada Ionescu changed the status of an Opportunity (Open → Won)', ''],
        [
          'Ada Ionescu created an illustrative Offer',
          'Illustrative Offer 1 · version 1',
        ],
        [
          'Ada Ionescu recorded the transmission of an Offer Version',
          'Illustrative Offer 1 · version 1 · Simulated',
        ],
        [
          'Ada Ionescu recorded the Client response to an Offer Version (Accepted)',
          'Illustrative Offer 1 · version 2 · Simulated',
        ],
        [
          'Ada Ionescu created an illustrative agreement',
          'Illustrative Precontract 1 · version 1',
        ],
        [
          'Ada Ionescu created an illustrative agreement',
          'Illustrative Contract 1 · version 1',
        ],
        [
          'Ada Ionescu recorded the signature of an agreement version',
          'Illustrative Contract 1 · version 2 · Simulated',
        ],
        [
          'Ada Ionescu linked a Project to an agreement',
          `Illustrative Contract 1 · version 2 — Project: ${opportunityTitle}`,
        ],
        [
          'Ada Ionescu recorded the signature of an agreement version',
          'Illustrative Addendum 1 · version 1 · Simulated',
        ],
      ] as const)
        await expect(activityRow(page, description, target)).toHaveCount(1);
      const activity = page.locator('.activity-log');
      await expect(activity).not.toContainText(originalText);
      await expect(activity).not.toContainText(
        'Synthetic negotiated conditions',
      );
      await expect(activity).not.toContainText('Synthetic provider signatory');
      await capture(page, testInfo, 'journey-activity');

      // The first transmission opens the superseded Offer Version 1.
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
      // Version 1 keeps its own conditions, not those negotiated later.
      await expect(
        offerRegion
          .locator('.offer-summary')
          .getByText('Synthetic first conditions', { exact: true }),
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
          .getByText('Synthetic negotiated conditions', { exact: true }),
      ).toBeVisible();
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

        // Direct identifiers reveal nothing either.
        for (const context of [companyId, otherCompanyId])
          for (const path of [
            `/commercial-intake/requests?limit=25`,
            `/offers/opportunities/${opportunityId}`,
            `/contracts/opportunities/${opportunityId}`,
          ]) {
            const response = await request.get(`${apiOrigin}/api${path}`, {
              headers: { ...identities.other, 'x-company-context-id': context },
            });
            const body = await response.text();
            expect(body).not.toContain(subject);
            expect(body).not.toContain(opportunityTitle);
            if (!path.startsWith('/commercial-intake'))
              expect([403, 404]).toContain(response.status());
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
  await page
    .locator('.commercial-intake-workspace')
    .getByRole('button')
    .filter({ has: page.getByText(subject, { exact: true }) })
    .click();
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

async function expectAdjustedSnapshot(pricing: Locator): Promise<void> {
  await expect(pricing.getByText('655.50 EUR', { exact: true })).toBeVisible();
  for (const line of [
    'Original net and tax: 600.00 + 90.00 EUR',
    'Net reduction: 30.00 EUR',
    'Adjustment reason: Synthetic loyalty reduction',
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

function activityRow(page: Page, description: string, target: string): Locator {
  return page
    .locator('.activity-log .activity-log-list > li')
    .filter({ hasText: description })
    .filter({ hasText: `Target: ${target}` });
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
  await writeFile(clockFile(), JSON.stringify(initialClockOffset + 120_000));
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
