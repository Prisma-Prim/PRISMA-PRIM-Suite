import { expectSelectAppearance } from './select-appearance';
import { enterClassicCompatibility } from './classic-compatibility';
import { expectValue, openSelect, selectOption } from './select-option';
import {
  expect,
  test,
  type FrameLocator,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';
import { createHash } from 'node:crypto';

import { canonicalDateTimeLocalValue } from '../src/pricing-configuration/datetime-local-test-helper';

const apiOrigin = 'http://127.0.0.1:4174';
const apiAdministratorHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const otherCompanyHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'other-company-member',
  'x-test-display-name': 'Other Company Member',
  'x-test-email': 'other-company-member@example.test',
};
// Member M, the browser identity, records the synthetic offerings.
const primaryMemberHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const marker = 'Illustrative configuration: provisional records';
const tariffMarker = 'Illustrative tariffs: provisional records';

test('fills canonical local datetimes without changing their intended instants', async ({
  page,
}) => {
  await page.setContent(
    '<label>Effective from <input type="datetime-local" step="1"></label>',
  );
  const field = page.getByLabel('Effective from', { exact: true });

  for (const example of [
    {
      input: '2026-09-26T11:34:00',
      canonical: '2026-09-26T11:34',
    },
    {
      input: '2026-09-26T11:34:27',
      canonical: '2026-09-26T11:34:27',
    },
  ]) {
    const intendedEpoch = await page.evaluate(
      (localDateTime) => new Date(localDateTime).getTime(),
      example.input,
    );

    await fillDateTimeLocal(field, example.input);

    await expectValue(field, example.canonical);
    expect(
      await field.evaluate((element) => {
        if (!(element instanceof HTMLInputElement))
          throw new Error('Expected a datetime-local input.');
        return new Date(element.value).getTime();
      }),
    ).toBe(intendedEpoch);
  }
});

test('publishes illustrative Pricing Rule and Tariff Versions through the real API and PostgreSQL', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  // Each viewport configures its own synthetic Company so both runs start
  // from an empty rule scope in the shared acceptance database.
  const companyName = `Pricing ${suffix} ${crypto.randomUUID().slice(0, 8)}`;
  const membershipId = requiredEnvironment('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
  const companyId = await createCompany(page, companyName);
  await changeAssignment(page, {
    operation: 'grant',
    bundle: 'company-context',
    workspaceMembershipId: membershipId,
    companyId,
  });
  // 1. The administrator grants Company Pricing Configuration v1 to member M.
  await changeAssignment(page, {
    operation: 'grant',
    bundle: 'company-pricing-configuration',
    workspaceMembershipId: membershipId,
    companyId,
  });
  // Tariffs need offerings: M also records two synthetic ones.
  await changeAssignment(page, {
    operation: 'grant',
    bundle: 'company-service-catalogue',
    workspaceMembershipId: membershipId,
    companyId,
  });
  try {
    const offeringA = await createOffering(page, companyId, `A-${suffix}`);
    const offeringB = await createOffering(page, companyId, `B-${suffix}`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const companySelect = page.getByLabel('Active Company', { exact: true });
    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });
    await selectCompany(page, companySelect, companyName, narrow);
    await navigate(page, navigation, 'Pricing Configuration', narrow);
    const configuration = page.locator('.pricing-configuration');
    await expect(
      configuration.getByText(marker, { exact: true }),
    ).toBeVisible();
    const zone = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    await expect(
      configuration.getByText(
        `Instants are entered and shown in your browser time zone: ${zone}.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(configuration.getByText(/^No current version/u)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`pricing-configuration-empty-${suffix}.png`),
      fullPage: true,
    });

    // 2. M publishes rule A a short time ahead: no version is current yet.
    await configuration
      .getByRole('button', { name: 'Publish version' })
      .click();
    await expect(configuration.getByRole('alert')).toContainText(
      'Enter a label of 1 to 120 characters',
    );
    const startA = await localDateTime(page, 60_000);
    await fillDraft(page, zone, 'Illustrative rule A', startA.local);
    await expectValue(
      configuration.getByLabel('Label', { exact: true }),
      'Illustrative rule A',
    );
    expect(await publish(page)).toBe(201);
    await expect(
      configuration.getByText('Version 1 published.', { exact: true }),
    ).toBeVisible();
    await expect(configuration.getByText(/^No current version/u)).toBeVisible();
    await expect(
      configuration.getByText(
        'Head: version 1. A new publication follows this version.',
        { exact: true },
      ),
    ).toBeVisible();
    const versions = configuration.getByRole('list', {
      name: 'Pricing Rule Versions',
    });
    await expect(versions.getByRole('listitem')).toHaveCount(1);
    await expect(versions.getByRole('listitem').first()).toContainText(
      'Scheduled',
    );

    // A second tab opened now still displays head 1.
    const secondTab = await page.context().newPage();
    await secondTab.goto('/#pricing');
    const secondConfiguration = secondTab.locator('.pricing-configuration');
    await expect(
      secondConfiguration.getByText(
        'The new version will follow head version 1.',
        { exact: true },
      ),
    ).toBeVisible();

    // 3. M publishes v2 with expected head 1 and a later start.
    const startB = await localDateTime(page, 2 * 60 * 60 * 1000);
    await fillDraft(page, zone, 'Illustrative rule B', startB.local);
    expect(await publish(page)).toBe(201);
    await expect(
      configuration.getByText('Version 2 published.', { exact: true }),
    ).toBeVisible();
    await expect(versions.getByRole('listitem')).toHaveCount(2);
    await expect(
      configuration.getByText(
        'Head: version 2. A new publication follows this version.',
        { exact: true },
      ),
    ).toBeVisible();
    const scheduled = configuration.getByRole('list', {
      name: 'Scheduled successors',
    });
    await expect(scheduled.getByRole('listitem')).toHaveCount(2);
    await expect(scheduled.getByRole('listitem').nth(0)).toContainText(
      'Version 1',
    );
    await expect(scheduled.getByRole('listitem').nth(1)).toContainText(
      'Takes over from',
    );

    // 4. The second tab still expecting head 1 gets a stale conflict.
    const startC = await localDateTime(secondTab, 3 * 60 * 60 * 1000);
    await fillDraft(secondTab, zone, 'Second tab rule', startC.local);
    expect(await publish(secondTab)).toBe(409);
    await expect(secondConfiguration.getByRole('alert')).toHaveText(
      'The configuration changed: version 2 is now the head. Reload before publishing again.',
    );
    await secondConfiguration
      .getByRole('button', { name: 'Reload Pricing Rule Versions' })
      .click();
    await expect(
      secondConfiguration.getByText(
        'The new version will follow head version 2.',
        { exact: true },
      ),
    ).toBeVisible();
    await expectValue(
      secondConfiguration.getByLabel('Label', { exact: true }),
      'Second tab rule',
    );
    await secondTab.close();

    // 5. Resubmitting v2's content unchanged allocates no version.
    await fillDraft(page, zone, 'Illustrative rule B', startB.local);
    expect(await publish(page)).toBe(201);
    await expect(
      configuration.getByText(
        'Version 2 already has this content. Nothing changed.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(versions.getByRole('listitem')).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`pricing-configuration-${suffix}.png`),
      fullPage: true,
    });

    // Tariff Versions, one offering at a time, in the same section.
    // 8. M chooses offering A: nothing is published for it yet.
    const tariffs = page.locator('.tariff-versions');
    await expect(
      tariffs.getByText(tariffMarker, { exact: true }),
    ).toBeVisible();
    await chooseOffering(page, offeringA);
    await expectSelectAppearance(
      tariffs.getByRole('combobox', {
        name: 'Company Service Offering',
        exact: true,
      }),
    );
    await expectSelectAppearance(
      tariffs.getByLabel('Currency', { exact: true }),
    );
    await expect(tariffs.getByText(/^No current version/u)).toBeVisible();
    await expect(
      tariffs.getByText(
        'No Tariff Version has been published for this offering yet.',
        { exact: true },
      ),
    ).toBeVisible();

    // 9. M publishes tariff v1 a short time ahead: none is current yet.
    await tariffs
      .getByRole('button', { name: 'Publish Tariff Version' })
      .click();
    await expect(tariffs.getByRole('alert')).toContainText(
      'Enter a unit of 1 to 24 characters.',
    );
    const tariffStartA = await localDateTime(page, 60_000);
    await fillTariffDraft(page, zone, {
      unitAmount: '123.4500',
      effectiveFrom: tariffStartA.local,
    });
    expect(await publishTariff(page, offeringA.id)).toBe(201);
    await expect(
      tariffs.getByText('Tariff Version 1 published.', { exact: true }),
    ).toBeVisible();
    await expect(tariffs.getByText(/^No current version/u)).toBeVisible();
    await expect(
      tariffs.getByText(
        'Head: version 1. A new publication follows this version.',
        { exact: true },
      ),
    ).toBeVisible();
    const tariffVersions = tariffs.getByRole('list', {
      name: 'Tariff Versions',
    });
    await expect(tariffVersions.getByRole('listitem')).toHaveCount(1);
    const firstTariff = tariffVersions.getByRole('listitem').first();
    for (const text of [
      'Scheduled',
      '123.4500 EUR per illustrative-unit',
      'Tax 12.34% (Illustrative tax), no fiscal validity',
      'Illustrative',
      'Provisional',
    ])
      await expect(firstTariff).toContainText(text);

    // A second tab opened now still displays head 1 of offering A.
    const tariffTab = await page.context().newPage();
    await tariffTab.goto('/#pricing');
    const secondTariffs = tariffTab.locator('.tariff-versions');
    await chooseOffering(tariffTab, offeringA);
    await expect(
      secondTariffs.getByText(
        'The new version will follow head version 1 of this offering.',
        { exact: true },
      ),
    ).toBeVisible();

    // 10. M publishes tariff v2 with expected head 1 and a later start.
    const tariffStartB = await localDateTime(page, 2 * 60 * 60 * 1000);
    await fillTariffDraft(page, zone, {
      unitAmount: '123.4500',
      currency: 'RON',
      effectiveFrom: tariffStartB.local,
    });
    expect(await publishTariff(page, offeringA.id)).toBe(201);
    await expect(
      tariffs.getByText('Tariff Version 2 published.', { exact: true }),
    ).toBeVisible();
    await expect(tariffVersions.getByRole('listitem')).toHaveCount(2);
    await expect(tariffVersions.getByRole('listitem').first()).toContainText(
      '123.4500 RON per illustrative-unit',
    );

    // 11. The second tab still expecting head 1 gets a stale conflict.
    const tariffStartC = await localDateTime(tariffTab, 3 * 60 * 60 * 1000);
    await fillTariffDraft(tariffTab, zone, {
      unitAmount: '99',
      effectiveFrom: tariffStartC.local,
    });
    expect(await publishTariff(tariffTab, offeringA.id)).toBe(409);
    await expect(secondTariffs.getByRole('alert')).toHaveText(
      'The offering changed: version 2 is now the head. Reload before publishing again.',
    );
    await secondTariffs
      .getByRole('button', { name: 'Reload Tariff Versions' })
      .click();
    await expect(
      secondTariffs.getByText(
        'The new version will follow head version 2 of this offering.',
        { exact: true },
      ),
    ).toBeVisible();
    await expectValue(
      secondTariffs.getByLabel('Unit amount', { exact: true }),
      '99',
    );
    await tariffTab.close();

    // 12. Resubmitting v2's content with 123.45 changes nothing: amounts
    // compare by numeric value.
    await fillTariffDraft(page, zone, {
      unitAmount: '123.45',
      currency: 'RON',
      effectiveFrom: tariffStartB.local,
    });
    expect(await publishTariff(page, offeringA.id)).toBe(201);
    await expect(
      tariffs.getByText(
        'Tariff Version 2 already has this content. Nothing changed.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(tariffVersions.getByRole('listitem')).toHaveCount(2);

    // 13. Offering B still has no version.
    await chooseOffering(page, offeringB);
    await expect(
      tariffs.getByText(
        'No Tariff Version has been published for this offering yet.',
        { exact: true },
      ),
    ).toBeVisible();
    await chooseOffering(page, offeringA);
    await expect(tariffVersions.getByRole('listitem')).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    await tariffs.screenshot({
      path: testInfo.outputPath(`tariff-versions-${suffix}.png`),
    });

    // 6. After v1's start, a reload shows v1 current and v2 scheduled.
    await page.waitForTimeout(
      Math.max(
        0,
        Math.max(startA.epoch, tariffStartA.epoch) - Date.now() + 1_500,
      ),
    );
    await configuration
      .getByRole('button', { name: 'Reload Pricing Rule Versions' })
      .click();
    const current = configuration.getByRole('region', {
      name: 'Current Pricing Rule Version',
    });
    await expect(current).toContainText('Version 1');
    await expect(current.locator('.pricing-configuration-state')).toHaveText(
      'Current',
    );
    await expect(scheduled.getByRole('listitem')).toHaveCount(1);
    await expect(scheduled.getByRole('listitem').first()).toContainText(
      'Version 2',
    );
    await page.screenshot({
      path: testInfo.outputPath(`pricing-configuration-current-${suffix}.png`),
      fullPage: true,
    });

    // 14. After tariff v1's start, a reload shows it current and v2 scheduled.
    await tariffs
      .getByRole('button', { name: 'Reload Tariff Versions' })
      .click();
    const currentTariff = tariffs.getByRole('region', {
      name: 'Current Tariff Version',
    });
    await expect(currentTariff).toContainText('Version 1');
    await expect(currentTariff).toContainText(
      '123.4500 EUR per illustrative-unit',
    );
    await expect(currentTariff.locator('.tariff-versions-state')).toHaveText(
      'Current',
    );
    const scheduledTariffs = tariffs.getByRole('list', {
      name: 'Scheduled Tariff successors',
    });
    await expect(scheduledTariffs.getByRole('listitem')).toHaveCount(1);
    await expect(scheduledTariffs.getByRole('listitem').first()).toContainText(
      'Version 2',
    );
    await tariffs.screenshot({
      path: testInfo.outputPath(`tariff-versions-current-${suffix}.png`),
    });

    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await enterClassicCompatibility(page);
    await expect(
      configuration.getByText(marker, { exact: true }),
    ).toBeVisible();
    await expect(
      tariffs.getByText(tariffMarker, { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Try Prisme' }).click();

    // 7. A Catalogue-only member sees no configuration screen, and a member of
    // another Company sees nothing of this one.
    await selectCompany(page, companySelect, 'PRISMA-PRIM', narrow);
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      navigation.getByRole('link', { name: 'Service Catalogue', exact: true }),
    ).toHaveCount(1);
    await expect(
      navigation.getByRole('link', {
        name: 'Pricing Configuration',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.locator('.tariff-versions')).toHaveCount(0);
    for (const otherCompanyId of [
      companyId,
      requiredEnvironment('ACCEPTANCE_OTHER_COMPANY_ID'),
    ]) {
      for (const path of [
        '/pricing-configuration/rule-versions',
        `/pricing-configuration/offerings/${offeringA.id}/tariff-scope`,
        `/pricing-configuration/offerings/${offeringA.id}/tariff-versions`,
      ]) {
        const denied = await page.request.get(`${apiOrigin}/api${path}`, {
          headers: {
            ...otherCompanyHeaders,
            'x-company-context-id': otherCompanyId,
          },
        });
        expect(denied.status()).toBe(403);
        const text = await denied.text();
        expect(text).not.toContain('Illustrative rule');
        expect(text).not.toContain('123.4500');
      }
    }
  } finally {
    await changeAssignment(page, {
      operation: 'revoke',
      bundle: 'company-service-catalogue',
      workspaceMembershipId: membershipId,
      companyId,
    });
    await changeAssignment(page, {
      operation: 'revoke',
      bundle: 'company-pricing-configuration',
      workspaceMembershipId: membershipId,
      companyId,
    });
    await changeAssignment(page, {
      operation: 'revoke',
      bundle: 'company-context',
      workspaceMembershipId: membershipId,
      companyId,
    });
  }
});

test('shows Pricing Configuration read-only to a Company Pricing User', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const companyName = `Pricing user ${suffix} ${crypto.randomUUID().slice(0, 8)}`;
  const target = {
    workspaceMembershipId: requiredEnvironment(
      'ACCEPTANCE_PRIMARY_MEMBERSHIP_ID',
    ),
    companyId: await createCompany(page, companyName),
  };
  const granted = new Set<
    'company-context' | 'company-pricing-configuration' | 'company-pricing-user'
  >();
  try {
    for (const bundle of [
      'company-context',
      'company-pricing-configuration',
    ] as const) {
      await changeAssignment(page, { operation: 'grant', bundle, ...target });
      granted.add(bundle);
    }
    // 1. M publishes rule v1, current shortly, and a scheduled v2.
    const startA = Math.ceil((Date.now() + 5_000) / 1_000) * 1_000;
    expect(
      await publishThroughApi(page, target.companyId, {
        label: 'Illustrative rule A',
        effectiveFrom: new Date(startA).toISOString(),
        expectedActiveVersionNumber: null,
      }),
    ).toBe(201);
    expect(
      await publishThroughApi(page, target.companyId, {
        label: 'Illustrative rule B',
        effectiveFrom: new Date(startA + 2 * 60 * 60 * 1_000).toISOString(),
        expectedActiveVersionNumber: 1,
      }),
    ).toBe(201);

    // 2. Configuration is revoked and Company Pricing User is granted.
    await changeAssignment(page, {
      operation: 'revoke',
      bundle: 'company-pricing-configuration',
      ...target,
    });
    await changeAssignment(page, {
      operation: 'grant',
      bundle: 'company-pricing-user',
      ...target,
    });
    granted.add('company-pricing-user');
    const offerings = await page.request.get(
      `${apiOrigin}/api/commercial-catalogue/offerings`,
      {
        headers: {
          ...primaryMemberHeaders,
          'x-company-context-id': target.companyId,
        },
      },
    );
    expect(offerings.status()).toBe(200);
    expect(
      await publishThroughApi(page, target.companyId, {
        label: 'Pricing user rule',
        effectiveFrom: new Date(startA + 3 * 60 * 60 * 1_000).toISOString(),
        expectedActiveVersionNumber: 2,
      }),
    ).toBe(403);

    // 3. Once v1 has started, M sees the configuration read-only.
    await page.waitForTimeout(Math.max(0, startA - Date.now() + 1_500));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const companySelect = page.getByLabel('Active Company', { exact: true });
    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });
    await selectCompany(page, companySelect, companyName, narrow);
    await navigate(page, navigation, 'Pricing Configuration', narrow);
    const configuration = page.locator('.pricing-configuration');
    await expect(
      configuration.getByText(marker, { exact: true }),
    ).toBeVisible();
    const current = configuration.getByRole('region', {
      name: 'Current Pricing Rule Version',
    });
    await expect(current).toContainText('Version 1');
    await expect(current).toContainText('Illustrative rule A');
    await expect(current.locator('.pricing-configuration-state')).toHaveText(
      'Current',
    );
    const scheduled = configuration.getByRole('list', {
      name: 'Scheduled successors',
    });
    await expect(scheduled.getByRole('listitem')).toHaveCount(1);
    await expect(scheduled.getByRole('listitem').first()).toContainText(
      'Version 2',
    );
    await expect(
      configuration.getByText(
        'Head: version 2. A new publication follows this version.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      configuration
        .getByRole('list', { name: 'Pricing Rule Versions' })
        .getByRole('listitem'),
    ).toHaveCount(2);
    await expect(
      configuration.getByRole('button', { name: 'Publish version' }),
    ).toHaveCount(0);
    await expect(
      configuration.getByLabel('Label', { exact: true }),
    ).toHaveCount(0);
    // The read-only screen stays operable from the keyboard.
    const reload = configuration.getByRole('button', {
      name: 'Reload Pricing Rule Versions',
    });
    await reload.focus();
    await expect(reload).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(current).toContainText('Illustrative rule A');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`pricing-user-read-only-${suffix}.png`),
      fullPage: true,
    });

    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await enterClassicCompatibility(page);
    await expect(
      configuration.getByText(marker, { exact: true }),
    ).toBeVisible();
    await expect(
      configuration.getByRole('button', { name: 'Publish version' }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`pricing-user-read-only-classic-${suffix}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Try Prisme' }).click();

    // 4. Pricing User is revoked: after a reload no section remains.
    await changeAssignment(page, {
      operation: 'revoke',
      bundle: 'company-pricing-user',
      ...target,
    });
    await page.reload();
    await selectCompany(page, companySelect, companyName, narrow);
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      navigation.getByRole('link', {
        name: 'Pricing Configuration',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.locator('.pricing-configuration')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`pricing-user-revoked-${suffix}.png`),
      fullPage: true,
    });
    const refused = await page.request.get(
      `${apiOrigin}/api/pricing-configuration/rule-scope`,
      {
        headers: {
          ...primaryMemberHeaders,
          'x-company-context-id': target.companyId,
        },
      },
    );
    expect(refused.status()).toBe(403);
  } finally {
    // Revoking an assignment that is already revoked is an idempotent no-op.
    for (const bundle of [...granted].reverse())
      await changeAssignment(page, { operation: 'revoke', bundle, ...target });
  }
});

test.describe('Pricing Snapshot and Offer journey', () => {
  const assignments = new Map<
    Parameters<typeof changeAssignment>[1]['bundle'],
    { workspaceMembershipId: string; companyId: string }
  >();

  // Playwright runs afterEach in its teardown budget, even when the journey
  // exhausts its deadline. Keep the original failure and attempt every revoke.
  test.afterEach(async ({ request }) => {
    const failures: unknown[] = [];
    for (const [bundle, target] of [...assignments].reverse()) {
      try {
        await changeAssignment(
          { request },
          { operation: 'revoke', bundle, ...target },
        );
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    assignments.clear();
    if (failures.length > 0)
      throw new AggregateError(
        failures,
        'Pricing Snapshot fixture assignments could not all be revoked.',
      );
  });

  test('applies, reloads and reopens an immutable Pricing Snapshot adjustment on an Opportunity', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const narrow = testInfo.project.name.endsWith('narrow');
    const suffix = narrow ? 'narrow' : 'desktop';
    const companyName = `Pricing snapshot ${suffix} ${crypto.randomUUID().slice(0, 8)}`;
    const target = {
      workspaceMembershipId: requiredEnvironment(
        'ACCEPTANCE_PRIMARY_MEMBERSHIP_ID',
      ),
      companyId: await createCompany(page, companyName),
    };
    const bundles = [
      'company-context',
      'company-service-catalogue',
      'company-pricing-configuration',
      'company-commercial-intake',
      'company-pricing-user',
      'company-director-client',
      'company-offer-preparer',
      'company-pricing-adjustment',
    ] as const;

    for (const bundle of bundles) {
      assignments.set(bundle, target);
      await changeAssignment(page, { operation: 'grant', bundle, ...target });
    }
    const offeringA = await createOffering(
      page,
      target.companyId,
      `SNAP-A-${suffix}`,
    );
    const offeringB = await createOffering(
      page,
      target.companyId,
      `SNAP-B-${suffix}`,
    );
    const effectiveFrom = new Date(
      Math.ceil((Date.now() + 5_000) / 1_000) * 1_000,
    ).toISOString();
    expect(
      await publishThroughApi(page, target.companyId, {
        label: 'Illustrative snapshot rule',
        effectiveFrom,
        expectedActiveVersionNumber: null,
      }),
    ).toBe(201);
    await publishTariffThroughApi(page, target.companyId, offeringA.id, {
      unitAmount: '123.4500',
      taxRatePercent: '12.34',
      effectiveFrom,
    });
    await publishTariffThroughApi(page, target.companyId, offeringB.id, {
      unitAmount: '0.0050',
      taxRatePercent: '0',
      effectiveFrom,
    });
    const clientDisplayName = `Synthetic Offer Recipient ${suffix}`;
    const clientId = await createClient(
      page,
      target.companyId,
      clientDisplayName,
    );
    const request = await createCommercialRequest(
      page,
      target.companyId,
      suffix,
      undefined,
    );
    // The Pricing User bundle is sufficient for configuration reads. The
    // separate Intake bundle remains the sole owner of Opportunity visibility.
    for (const bundle of [
      'company-pricing-configuration',
      'company-service-catalogue',
    ] as const) {
      await changeAssignment(page, { operation: 'revoke', bundle, ...target });
      assignments.delete(bundle);
    }
    await page.waitForTimeout(
      Math.max(0, new Date(effectiveFrom).getTime() - Date.now() + 1_500),
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const companySelect = page.getByLabel('Active Company', { exact: true });
    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });
    await selectCompany(page, companySelect, companyName, narrow);
    await navigate(page, navigation, 'Client Requests', narrow);
    const requests = page.locator('.commercial-intake-workspace');
    await requests
      .getByRole('button', { name: new RegExp(request.subject, 'u') })
      .click();
    await expect(
      requests.getByText('No Client associated', { exact: true }),
    ).toBeVisible();
    await requests
      .getByLabel('Search Clients by name', { exact: true })
      .fill(clientDisplayName);
    await requests.getByRole('button', { name: 'Search Clients' }).click();
    await selectOption(
      requests.getByLabel('Existing Client', { exact: true }),
      clientId,
    );
    const associationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/api\/commercial-intake\/requests\/[^/]+\/client-association$/u.test(
          new URL(response.url()).pathname,
        ),
    );
    await requests
      .getByRole('button', { name: 'Confirm Client association' })
      .click();
    expect((await associationResponse).status()).toBe(200);
    await expect(requests.locator(':scope > [role="alert"]')).toHaveText(
      'Client associated.',
    );
    const panel = requests.locator('.pricing-snapshot-panel');
    await expect(
      panel.getByText('Illustrative pricing', { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText('Pricing Rule Version: 1')).toBeVisible();
    const offeringALabel = offeringA.label.split(' (').at(0);
    const offeringBLabel = offeringB.label.split(' (').at(0);
    if (!offeringALabel || !offeringBLabel)
      throw new Error('Expected non-empty offering labels.');
    await panel.getByLabel(offeringALabel, { exact: true }).check();
    await panel.getByLabel(offeringBLabel, { exact: true }).check();
    // Catalogue order is newest first; quantities belong to offering identity.
    await panel
      .getByRole('group')
      .filter({ has: page.getByLabel(offeringALabel, { exact: true }) })
      .getByLabel('Quantity', { exact: true })
      .fill('2.5');
    await panel
      .getByRole('group')
      .filter({ has: page.getByLabel(offeringBLabel, { exact: true }) })
      .getByLabel('Quantity', { exact: true })
      .fill('1');
    const adjustedOffering = panel
      .getByRole('group')
      .filter({ has: page.getByLabel(offeringALabel, { exact: true }) });
    // The enclosing label also contains textarea text; match the accessible name.
    const adjustmentReason = adjustedOffering.getByRole('textbox', {
      name: 'Adjustment reason',
      exact: true,
    });
    await adjustedOffering
      .getByLabel('Apply a fixed net discount', { exact: true })
      .check();
    await adjustedOffering
      .getByLabel('Net reduction', { exact: true })
      .fill('0.00');
    await adjustmentReason.fill('   ');
    await panel.getByRole('button', { name: 'Calculate and save' }).click();
    await expect(panel.getByRole('alert')).toHaveText(
      'Correct the highlighted values and try again.',
    );
    await expect(
      adjustedOffering.getByLabel('Net reduction', { exact: true }),
    ).toHaveValue('0.00');
    await expect(adjustmentReason).toHaveValue('   ');
    await adjustedOffering
      .getByLabel('Net reduction', { exact: true })
      .fill('8.63');
    const exactReason = '\u{1F642}'.repeat(500);
    await adjustmentReason.fill(exactReason + '\u{1F642}');
    await panel.getByRole('button', { name: 'Calculate and save' }).click();
    await expect(panel.getByRole('alert')).toHaveText(
      'Correct the highlighted values and try again.',
    );
    await expect(adjustmentReason).toHaveValue(exactReason + '\u{1F642}');
    await adjustmentReason.fill(exactReason);
    await expect(adjustmentReason).toHaveValue(exactReason);
    const attempts: Array<{ body: string | null; key: string | null }> = [];
    let loseFirstResponse = true;
    const snapshotCommand = `**/api/pricing/opportunities/${request.opportunityId}/snapshots`;
    await page.route(snapshotCommand, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push({
        body: route.request().postData(),
        key: await route.request().headerValue('idempotency-key'),
      });
      if (!loseFirstResponse) return route.continue();
      loseFirstResponse = false;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('connectionfailed');
    });
    await panel.getByRole('button', { name: 'Calculate and save' }).focus();
    await expect(
      panel.getByRole('button', { name: 'Calculate and save' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('alert')).toContainText(
      'The outcome is uncertain',
    );
    await expect(
      adjustedOffering.getByLabel('Net reduction', { exact: true }),
    ).toBeDisabled();
    await expect(
      adjustedOffering.getByLabel('Net reduction', { exact: true }),
    ).toHaveValue('8.63');
    await expect(adjustmentReason).toBeVisible();
    await expect(adjustmentReason).toBeDisabled();
    await expect(adjustmentReason).toHaveValue(exactReason);
    await panel
      .getByRole('button', { name: 'Retry the same calculation' })
      .click();
    await expect(panel.getByText('300.01 EUR', { exact: true })).toBeVisible();
    await expect(panel.getByText('37.02 EUR', { exact: true })).toBeVisible();
    await expect(panel.getByText('337.03 EUR', { exact: true })).toBeVisible();
    await expect(
      panel.getByText('Original net and tax: 308.63 + 38.08 EUR', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByText('Net reduction: 8.63 EUR', { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText('Adjustment reason: ' + exactReason, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByText('Adjusted net and tax: 300.00 + 37.02 EUR', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByText(
        `Calculated by Workspace Membership: ${target.workspaceMembershipId}`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      panel.locator('header').getByText('Illustrative and provisional'),
    ).toBeVisible();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    await page.unroute(snapshotCommand);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`pricing-adjustment-created-${suffix}.png`),
      fullPage: true,
    });

    // A successful calculation clears the draft. Start a complete new
    // unadjusted calculation before preparing the illustrative Offer.
    await panel.getByLabel(offeringALabel, { exact: true }).check();
    await adjustedOffering.getByLabel('Quantity', { exact: true }).fill('2.5');
    await panel.getByLabel(offeringBLabel, { exact: true }).check();
    await panel
      .getByRole('group')
      .filter({ has: page.getByLabel(offeringBLabel, { exact: true }) })
      .getByLabel('Quantity', { exact: true })
      .fill('1');
    await expect(
      adjustedOffering.getByLabel('Apply a fixed net discount', {
        exact: true,
      }),
    ).not.toBeChecked();
    const ordinarySnapshotResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response
          .url()
          .includes(
            `/api/pricing/opportunities/${request.opportunityId}/snapshots`,
          ),
    );
    await panel.getByRole('button', { name: 'Calculate and save' }).click();
    expect((await ordinarySnapshotResponse).status()).toBe(201);

    await page.reload();
    await selectCompany(page, companySelect, companyName, narrow);
    await navigate(page, navigation, 'Client Requests', narrow);
    await page
      .locator('.commercial-intake-workspace')
      .getByRole('button', { name: new RegExp(request.subject, 'u') })
      .click();
    const reloadedPanel = page.locator('.pricing-snapshot-panel');
    await reloadedPanel
      .getByRole('button', { name: /Reopen snapshot: 337\.03 EUR/u })
      .click();
    await expect(
      reloadedPanel.getByText('300.01 EUR', { exact: true }),
    ).toBeVisible();
    await expect(
      reloadedPanel.getByText('37.02 EUR', { exact: true }),
    ).toBeVisible();
    await expect(
      reloadedPanel.getByText('337.03 EUR', { exact: true }),
    ).toBeVisible();
    await expect(
      reloadedPanel.getByText(
        `Calculated by Workspace Membership: ${target.workspaceMembershipId}`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      reloadedPanel.getByText('2.5 × 123.4500 EUR/illustrative-unit'),
    ).toBeVisible();
    await expect(
      reloadedPanel.getByText('1 × 0.0050 EUR/illustrative-unit'),
    ).toBeVisible();
    await expect(
      reloadedPanel.getByText('Adjustment reason: ' + exactReason, {
        exact: true,
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`pricing-adjustment-reopened-${suffix}.png`),
      fullPage: true,
    });

    const offer = page.locator('.offer-panel');
    await expect(
      offer.getByText('Illustrative Offer', { exact: true }),
    ).toBeVisible();
    const snapshotSelect = offer.getByRole('combobox', {
      name: 'Pricing Snapshot',
      exact: true,
    });
    const snapshotOptions = (await openSelect(snapshotSelect)).getByRole(
      'option',
    );
    const adjustedSnapshotValue = await snapshotOptions
      .filter({ hasText: '337.03 EUR' })
      .first()
      .getAttribute('data-value');
    const ordinarySnapshotValue = await snapshotOptions
      .filter({ hasNotText: '337.03 EUR' })
      .first()
      .getAttribute('data-value');
    if (!adjustedSnapshotValue || !ordinarySnapshotValue)
      throw new Error('Expected adjusted and unadjusted Snapshot options.');
    await page.keyboard.press('Escape');
    await selectOption(snapshotSelect, adjustedSnapshotValue);
    await offer.getByRole('button', { name: 'Prepare version 1' }).focus();
    await expect(
      offer.getByRole('button', { name: 'Prepare version 1' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(offer.getByRole('alert')).toHaveText(
      'The selected Pricing Snapshot contains an adjustment and cannot be used for Offer version 1.',
    );
    await expect(offer.getByText('Illustrative reference')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`offer-adjustment-rejected-${suffix}.png`),
      fullPage: true,
    });

    await selectOption(snapshotSelect, ordinarySnapshotValue);
    const longScopeNote =
      'Scope <illustrative> & "quoted" — ' + 'long scope detail · '.repeat(60);
    const longCommercialConditions =
      'Commercial conditions remain illustrative — ' +
      'long illustrative condition · '.repeat(100);
    await offer.getByLabel('Scope note', { exact: true }).fill(longScopeNote);
    await offer
      .getByLabel('Commercial conditions', { exact: true })
      .fill(longCommercialConditions);
    await offer.getByRole('button', { name: 'Prepare version 1' }).focus();
    await expect(
      offer.getByRole('button', { name: 'Prepare version 1' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    const createdOffer = offer.locator('.offer-summary');
    await expect(
      createdOffer.getByText('Illustrative and provisional', { exact: true }),
    ).toBeVisible();
    await expect(
      createdOffer.getByText(`Synthetic Offer Recipient ${suffix}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      createdOffer.getByText('Pending · not transmitted · no Client response', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      createdOffer.getByText('Draft — not approved', { exact: true }),
    ).toBeVisible();
    await expect(
      createdOffer.getByText('OFFER_ILLUSTRATIVE v1', { exact: true }),
    ).toBeVisible();
    const createdChecksum = await createdOffer
      .locator('.offer-representation code')
      .textContent();
    expect(createdChecksum).toMatch(/^[0-9a-f]{64}$/u);
    const createdFrameElement = createdOffer.getByTitle(
      'Illustrative Offer representation',
    );
    await expect(createdFrameElement).toHaveAttribute('sandbox', '');
    expect(await createdFrameElement.getAttribute('allow')).toBeNull();
    const createdHtml = await createdFrameElement.getAttribute('srcdoc');
    if (!createdHtml || !createdChecksum)
      throw new Error('Expected the exact created Offer representation.');
    expect(createHash('sha256').update(createdHtml, 'utf8').digest('hex')).toBe(
      createdChecksum,
    );
    expect(createdHtml).not.toMatch(
      /Draft — not approved|PENDING|NOT_TRANSMITTED|>NONE</u,
    );
    const createdFrame = createdOffer.frameLocator(
      'iframe[title="Illustrative Offer representation"]',
    );
    await expect(
      createdFrame.getByText(
        'Provisional illustrative document — cannot be accepted — no legal effect — no official number',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      createdFrame.getByText(`Synthetic Offer Recipient ${suffix}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(createdFrame.locator('body')).toContainText(longScopeNote);
    await expect(createdFrame.locator('body')).toContainText(
      longCommercialConditions,
    );
    await expect(createdFrame.locator('script')).toHaveCount(0);
    await expectNoFrameHorizontalOverflow(createdFrame);
    await expectNoHorizontalOverflow(page);
    await captureOfferRepresentation({
      page,
      frameElement: createdFrameElement,
      frame: createdFrame,
      viewportScreenshotPath: testInfo.outputPath(
        `offer-representation-created-${suffix}.png`,
      ),
      documentScreenshotPath: testInfo.outputPath(
        `offer-document-created-${suffix}.png`,
      ),
    });

    const quality = offer.locator('.offer-quality');
    await expect(
      quality.getByText('No Quality Check run yet.', { exact: true }),
    ).toBeVisible();
    await quality.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`offer-quality-empty-${suffix}.png`),
      fullPage: true,
    });
    const qualityResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/quality-checks'),
    );
    const checkButton = quality.getByRole('button', {
      name: 'Run Quality Checks',
      exact: true,
    });
    await checkButton.focus();
    await expect(checkButton).toBeFocused();
    await page.keyboard.press('Enter');
    const checked = await qualityResponse;
    expect(checked.status()).toBe(201);
    const storedRun: unknown = await checked.json();
    expect(storedRun).toMatchObject({
      ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
      ruleSetVersion: 1,
      actorWorkspaceMembershipId: target.workspaceMembershipId,
    });
    await expect(
      quality.getByText('Checks completed with warnings.', { exact: true }),
    ).toBeVisible();
    await expect(quality.locator('li')).toHaveCount(8);
    await expect(
      quality.locator('li').filter({ hasText: 'Recipient tax ID recorded' }),
    ).toContainText('WARNING');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`offer-quality-warning-${suffix}.png`),
      fullPage: true,
    });

    // A permitted Client correction changes only live identity. Offer's recorded
    // copy and representation remain byte-identical; the new run records a warning.
    const clientHeaders = {
      ...primaryMemberHeaders,
      'x-company-context-id': target.companyId,
    };
    const clientRead = await page.request.get(
      `${apiOrigin}/api/clients/${clientId}`,
      { headers: clientHeaders },
    );
    expect(clientRead.status()).toBe(200);
    const liveClient: unknown = await clientRead.json();
    if (
      typeof liveClient !== 'object' ||
      liveClient === null ||
      !('version' in liveClient) ||
      typeof liveClient.version !== 'number'
    )
      throw new Error('Expected current Client version.');
    const corrected = await page.request.patch(
      `${apiOrigin}/api/clients/${clientId}`,
      {
        headers: {
          ...clientHeaders,
          'idempotency-key': `quality-client-correction-${crypto.randomUUID()}`,
        },
        data: {
          expectedVersion: liveClient.version,
          displayName: `${clientDisplayName} corrected`,
        },
      },
    );
    expect(corrected.status()).toBe(200);
    await checkButton.click();
    await expect(
      quality.locator('li').filter({ hasText: 'Recipient identity current' }),
    ).toContainText('WARNING');
    await expect(createdFrameElement).toHaveAttribute('srcdoc', createdHtml);
    await expect(
      createdOffer.getByText(clientDisplayName, { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`offer-quality-identity-warning-${suffix}.png`),
      fullPage: true,
    });

    await page.reload();
    await selectCompany(page, companySelect, companyName, narrow);
    await navigate(page, navigation, 'Client Requests', narrow);
    await page
      .locator('.commercial-intake-workspace')
      .getByRole('button', { name: new RegExp(request.subject, 'u') })
      .click();
    const reopenedOffer = page.locator('.offer-panel .offer-summary');
    const reopenedQuality = page.locator('.offer-panel .offer-quality');
    await expect(
      reopenedQuality.getByText('Checks completed with warnings.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      reopenedQuality
        .locator('li')
        .filter({ hasText: 'Recipient identity current' }),
    ).toContainText('WARNING');
    await expectNoHorizontalOverflow(page);
    await reopenedQuality.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`offer-quality-reopened-${suffix}.png`),
      fullPage: true,
    });
    await expect(
      reopenedOffer.getByText('Illustrative reference', { exact: true }),
    ).toBeVisible();
    await expect(
      reopenedOffer.getByText('Illustrative and provisional', { exact: true }),
    ).toBeVisible();
    await expect(
      reopenedOffer.getByText(
        'Pending · not transmitted · no Client response',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      reopenedOffer.getByText('Draft — not approved', { exact: true }),
    ).toBeVisible();
    await expect(
      reopenedOffer.getByText('OFFER_ILLUSTRATIVE v1', { exact: true }),
    ).toBeVisible();
    const reopenedChecksum = await reopenedOffer
      .locator('.offer-representation code')
      .textContent();
    const reopenedFrameElement = reopenedOffer.getByTitle(
      'Illustrative Offer representation',
    );
    await expect(reopenedFrameElement).toHaveAttribute('sandbox', '');
    expect(await reopenedFrameElement.getAttribute('allow')).toBeNull();
    const reopenedHtml = await reopenedFrameElement.getAttribute('srcdoc');
    expect(reopenedChecksum).toBe(createdChecksum);
    expect(reopenedHtml).toBe(createdHtml);
    const reopenedFrame = reopenedOffer.frameLocator(
      'iframe[title="Illustrative Offer representation"]',
    );
    await expect(reopenedFrame.locator('body')).toContainText(longScopeNote);
    await expect(reopenedFrame.locator('body')).toContainText(
      longCommercialConditions,
    );
    await expectNoFrameHorizontalOverflow(reopenedFrame);
    await expectNoHorizontalOverflow(page);
    await captureOfferRepresentation({
      page,
      frameElement: reopenedFrameElement,
      frame: reopenedFrame,
      viewportScreenshotPath: testInfo.outputPath(
        `offer-representation-reopened-${suffix}.png`,
      ),
      documentScreenshotPath: testInfo.outputPath(
        `offer-document-reopened-${suffix}.png`,
      ),
    });
    await requests.getByRole('button', { name: 'Open Client dossier' }).click();
    await expect(page.locator('#clients')).toBeFocused();
    await expect(
      page.locator('.client-dossier-detail').getByRole('heading', {
        name: `${clientDisplayName} corrected`,
        exact: true,
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `pricing-associated-client-dossier-${suffix}.png`,
      ),
      fullPage: true,
    });
  });
});

async function publishThroughApi(
  page: Page,
  companyId: string,
  data: {
    label: string;
    effectiveFrom: string;
    expectedActiveVersionNumber: number | null;
  },
): Promise<number> {
  const response = await page.request.post(
    `${apiOrigin}/api/pricing-configuration/rule-versions`,
    {
      headers: {
        ...primaryMemberHeaders,
        'content-type': 'application/json',
        'idempotency-key': `acceptance-pricing-user-${crypto.randomUUID()}`,
        'x-company-context-id': companyId,
      },
      data,
    },
  );
  return response.status();
}

async function publishTariffThroughApi(
  page: Page,
  companyId: string,
  offeringId: string,
  values: {
    unitAmount: string;
    taxRatePercent: string;
    effectiveFrom: string;
  },
): Promise<void> {
  const response = await page.request.post(
    `${apiOrigin}/api/pricing-configuration/offerings/${offeringId}/tariff-versions`,
    {
      headers: {
        ...primaryMemberHeaders,
        'content-type': 'application/json',
        'idempotency-key': `acceptance-tariff-${crypto.randomUUID()}`,
        'x-company-context-id': companyId,
      },
      data: {
        unit: 'illustrative-unit',
        unitAmount: values.unitAmount,
        currency: 'EUR',
        taxRatePercent: values.taxRatePercent,
        taxLabel: 'Illustrative tax',
        effectiveFrom: values.effectiveFrom,
        expectedActiveVersionNumber: null,
      },
    },
  );
  expect(response.status()).toBe(201);
}

async function createCommercialRequest(
  page: Page,
  companyId: string,
  suffix: string,
  clientAccountId?: string,
): Promise<{ subject: string; opportunityId: string }> {
  const subject = `Illustrative snapshot request ${suffix}`;
  const response = await page.request.post(
    `${apiOrigin}/api/commercial-intake/requests`,
    {
      headers: {
        ...primaryMemberHeaders,
        'content-type': 'application/json',
        'idempotency-key': `acceptance-request-${crypto.randomUUID()}`,
        'x-company-context-id': companyId,
      },
      data: {
        originalText:
          'Synthetic request for the Pricing Snapshot acceptance proof.',
        sourceLabel: 'Synthetic browser proof',
        subject,
        ...(clientAccountId ? { clientAccountId } : {}),
        opportunity: {
          title: `Illustrative Opportunity ${suffix}`,
          scope: 'Synthetic scope',
          nextAction: 'Review the illustrative calculation',
        },
      },
    },
  );
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('initialOpportunity' in body) ||
    typeof body.initialOpportunity !== 'object' ||
    body.initialOpportunity === null ||
    !('id' in body.initialOpportunity) ||
    typeof body.initialOpportunity.id !== 'string'
  )
    throw new Error('Expected the created Opportunity id.');
  return { subject, opportunityId: body.initialOpportunity.id };
}

async function createClient(
  page: Page,
  companyId: string,
  displayName: string,
): Promise<string> {
  const response = await page.request.post(`${apiOrigin}/api/clients`, {
    headers: {
      ...primaryMemberHeaders,
      'content-type': 'application/json',
      'idempotency-key': `acceptance-offer-client-${crypto.randomUUID()}`,
      'x-company-context-id': companyId,
    },
    data: {
      displayName,
      taxId: null,
      address: '1 Synthetic Offer Street',
    },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('id' in body) ||
    typeof body.id !== 'string'
  )
    throw new Error('Expected the created Client id.');
  return body.id;
}

async function createCompany(page: Page, displayName: string): Promise<string> {
  const response = await page.request.post(`${apiOrigin}/api/companies`, {
    headers: {
      ...apiAdministratorHeaders,
      'content-type': 'application/json',
      'idempotency-key': `acceptance-pricing-company-${crypto.randomUUID()}`,
    },
    data: { displayName },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('id' in body) ||
    typeof body.id !== 'string'
  )
    throw new Error('Expected the registered Company id.');
  return body.id;
}

async function changeAssignment(
  page: Pick<Page, 'request'>,
  {
    operation,
    bundle,
    workspaceMembershipId,
    companyId,
  }: {
    operation: 'grant' | 'revoke';
    bundle:
      | 'company-context'
      | 'company-commercial-intake'
      | 'company-pricing-configuration'
      | 'company-pricing-user'
      | 'company-service-catalogue'
      | 'company-director-client'
      | 'company-offer-preparer'
      | 'company-pricing-adjustment';
    workspaceMembershipId: string;
    companyId: string;
  },
): Promise<void> {
  const key = `acceptance-${operation}-${bundle}-${crypto.randomUUID()}`;
  const response =
    operation === 'grant'
      ? await page.request.post(`${apiOrigin}/api/${bundle}-assignments`, {
          headers: {
            ...apiAdministratorHeaders,
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          data: { workspaceMembershipId, companyId },
        })
      : await page.request.delete(
          `${apiOrigin}/api/${bundle}-assignments/${workspaceMembershipId}/${companyId}`,
          { headers: { ...apiAdministratorHeaders, 'idempotency-key': key } },
        );
  expect(response.status()).toBe(operation === 'grant' ? 201 : 200);
}

type SyntheticOffering = { id: string; label: string };

// Records a synthetic Service Definition and the Company's offering of it as
// member M, and returns the offering with its option label in the panel.
async function createOffering(
  page: Page,
  companyId: string,
  name: string,
): Promise<SyntheticOffering> {
  const unique = crypto.randomUUID().slice(0, 8).toUpperCase();
  const code = `TARIFF-${name.toUpperCase()}-${unique}`;
  const serviceName = `Illustrative service ${name} ${unique}`;
  const headers = {
    ...primaryMemberHeaders,
    'content-type': 'application/json',
    'x-company-context-id': companyId,
  };
  const definition = await page.request.post(
    `${apiOrigin}/api/commercial-catalogue/service-definitions`,
    {
      headers: { ...headers, 'idempotency-key': `acceptance-${code}` },
      data: { code, name: serviceName },
    },
  );
  expect(definition.status()).toBe(201);
  const definitionId = nestedId(await definition.json(), 'definition');
  const offering = await page.request.post(
    `${apiOrigin}/api/commercial-catalogue/offerings`,
    {
      headers: { ...headers, 'idempotency-key': `acceptance-offering-${code}` },
      data: { serviceDefinitionId: definitionId },
    },
  );
  expect(offering.status()).toBe(201);
  return {
    id: nestedId(await offering.json(), 'offering'),
    label: `${serviceName} (${code})`,
  };
}

function nestedId(body: unknown, field: string): string {
  if (typeof body !== 'object' || body === null || !(field in body))
    throw new Error(`Expected the recorded ${field}.`);
  const record: unknown = Object.fromEntries(Object.entries(body))[field];
  if (
    typeof record !== 'object' ||
    record === null ||
    !('id' in record) ||
    typeof record.id !== 'string'
  )
    throw new Error(`Expected the recorded ${field} id.`);
  return record.id;
}

async function chooseOffering(
  page: Page,
  offering: SyntheticOffering,
): Promise<void> {
  const select = page
    .locator('.tariff-versions')
    .getByLabel('Company Service Offering', { exact: true });
  await selectOption(select, { label: offering.label });
  await expect(select).toHaveText(offering.label);
}

async function fillTariffDraft(
  page: Page,
  zone: string,
  draft: { unitAmount: string; currency?: string; effectiveFrom: string },
): Promise<void> {
  const tariffs = page.locator('.tariff-versions');
  await tariffs.getByLabel('Unit', { exact: true }).fill('illustrative-unit');
  await tariffs
    .getByLabel('Unit amount', { exact: true })
    .fill(draft.unitAmount);
  await selectOption(
    tariffs.getByLabel('Currency', { exact: true }),
    draft.currency ?? 'EUR',
  );
  await tariffs.getByLabel('Tax rate percent', { exact: true }).fill('12.34');
  await tariffs
    .getByLabel('Tax label', { exact: true })
    .fill('Illustrative tax');
  await fillDateTimeLocal(
    tariffs.getByLabel(`Effective from (${zone})`, { exact: true }),
    draft.effectiveFrom,
  );
}

async function publishTariff(page: Page, offeringId: string): Promise<number> {
  const response = page.waitForResponse(
    mutationResponse(
      'POST',
      `/api/pricing-configuration/offerings/${offeringId}/tariff-versions`,
    ),
  );
  await page
    .locator('.tariff-versions')
    .getByRole('button', { name: 'Publish Tariff Version' })
    .click();
  return (await response).status();
}

// A datetime-local value names a wall-clock time in the browser time zone.
async function localDateTime(
  page: Page,
  offsetMilliseconds: number,
): Promise<{ local: string; epoch: number }> {
  return page.evaluate((offset) => {
    const instant = new Date(Date.now() + offset);
    instant.setMilliseconds(0);
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
      local: `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}`,
      epoch: instant.getTime(),
    };
  }, offsetMilliseconds);
}

async function fillDraft(
  page: Page,
  zone: string,
  label: string,
  effectiveFrom: string,
): Promise<void> {
  const configuration = page.locator('.pricing-configuration');
  await configuration.getByLabel('Label', { exact: true }).fill(label);
  await fillDateTimeLocal(
    configuration.getByLabel(`Effective from (${zone})`, { exact: true }),
    effectiveFrom,
  );
}

async function fillDateTimeLocal(field: Locator, value: string): Promise<void> {
  await field.fill(canonicalDateTimeLocalValue(value));
}

async function publish(page: Page): Promise<number> {
  const response = page.waitForResponse(
    mutationResponse('POST', '/api/pricing-configuration/rule-versions'),
  );
  await page
    .locator('.pricing-configuration')
    .getByRole('button', { name: 'Publish version' })
    .click();
  return (await response).status();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function selectCompany(
  page: Page,
  company: ReturnType<Page['getByLabel']>,
  label: string,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(company, { label });
  await expect(company).toHaveText(label);
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
}

async function navigate(
  page: Page,
  navigation: ReturnType<Page['getByRole']>,
  label: string,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await navigation.getByRole('link', { name: label, exact: true }).click();
}

function mutationResponse(method: string, pathname: string) {
  return (response: Response) =>
    response.request().method() === method &&
    new URL(response.url()).pathname === pathname;
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

async function expectNoFrameHorizontalOverflow(
  frame: FrameLocator,
): Promise<void> {
  const dimensions = await frame.locator('html').evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.documentWidth,
    JSON.stringify(dimensions),
  ).toBeLessThanOrEqual(dimensions.viewportWidth);
}

async function captureOfferRepresentation({
  page,
  frameElement,
  frame,
  viewportScreenshotPath,
  documentScreenshotPath,
}: {
  page: Page;
  frameElement: Locator;
  frame: FrameLocator;
  viewportScreenshotPath: string;
  documentScreenshotPath: string;
}): Promise<void> {
  await frameElement.scrollIntoViewIfNeeded();
  const heading = frame.getByRole('heading', {
    name: 'Illustrative Offer',
    exact: true,
  });
  await heading.scrollIntoViewIfNeeded();
  await expect(frameElement).toBeInViewport({ ratio: 1 });
  await expect(heading).toBeInViewport({ ratio: 1 });
  await expect(
    frame.getByText(
      'Provisional illustrative document — cannot be accepted — no legal effect — no official number',
      { exact: true },
    ),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: viewportScreenshotPath, fullPage: false });
  await frameElement.screenshot({ path: documentScreenshotPath });
}
