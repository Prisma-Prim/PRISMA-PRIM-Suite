import { expect, test, type Page } from '@playwright/test';
import { contractMessages } from '../src/contract/contract.copy';
import { contractVersionMessages } from '../src/contract/contract-version.copy';
import {
  interfaceLocales,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../src/localization/interface-locale';
import { interfaceLocaleMessages } from '../src/localization/interface-locale.copy';
import { resolveMessage } from '../src/localization/messages';
import { preferenceKey } from '../src/production-shell/company-context-preference';
import {
  contractLocaleActor,
  contractLocaleChecksum,
  contractLocaleCommercial,
  contractLocaleCompany,
  contractLocaleHtml,
  contractLocaleIds,
  contractLocaleLiteral,
  contractLocalePath,
  contractLocaleRecord,
  contractLocaleRepresentationPath,
  contractLocaleRequest,
  contractLocaleRevokedActor,
  contractLocaleScope,
  readContractLocaleFixture,
} from '../src/test/contract-localization-fixture';

const copy = (
  locale: InterfaceLocale,
  key: (typeof contractMessages.keys)[number],
) => resolveMessage(contractMessages, locale, key);
const languageLabel = (locale: InterfaceLocale) =>
  resolveMessage(interfaceLocaleMessages, locale, 'label');

async function chooseLanguage(
  page: Page,
  current: InterfaceLocale,
  target: InterfaceLocale,
) {
  const picker = page.getByRole('combobox', {
    name: languageLabel(current),
    exact: true,
  });
  await picker.focus();
  await picker.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await picker.press('Home');
  for (let step = 0; step < interfaceLocales.indexOf(target); step += 1)
    await picker.press('ArrowDown');
  await picker.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: languageLabel(target), exact: true }),
  ).toBeFocused();
}

async function installRoutes(page: Page) {
  const state: {
    recorded: boolean;
    revoked: boolean;
    createdRecords: number;
    calls: Array<{
      method: string;
      path: string;
      company: string | undefined;
      workspace: string | undefined;
    }>;
    commands: Array<{
      path: string;
      body: string | null;
      key: string | undefined;
      company: string | undefined;
      workspace: string | undefined;
    }>;
    unexpected: string[];
  } = {
    recorded: false,
    revoked: false,
    createdRecords: 0,
    calls: [],
    commands: [],
    unexpected: [],
  };
  let releaseFirstAttempt: () => void = () => {
    throw new Error('No pending first creation attempt');
  };
  const firstReply = new Promise<void>((resolve) => {
    releaseFirstAttempt = resolve;
  });
  let firstCommandSeen: () => void = () => {
    throw new Error('Creation observer is not initialized');
  };
  const firstCommand = new Promise<void>((resolve) => {
    firstCommandSeen = resolve;
  });
  let configurationSeen: () => void = () => {
    throw new Error('Configuration observer is not initialized');
  };
  const configurationReady = new Promise<void>((resolve) => {
    configurationSeen = resolve;
  });
  let offerHistorySeen: () => void = () => {
    throw new Error('Offer history observer is not initialized');
  };
  const offerReady = new Promise<void>((resolve) => {
    offerHistorySeen = resolve;
  });
  const offerHistoryPath = `/api/offers/opportunities/${contractLocaleIds.opportunity}/versions`;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = request.headers();
    state.calls.push({
      method: request.method(),
      path,
      company: headers['x-company-context-id'],
      workspace: headers['x-workspace-context-id'],
    });
    if (request.method() === 'POST' && path === contractLocalePath) {
      state.commands.push({
        path,
        body: request.postData(),
        key: headers['idempotency-key'],
        company: headers['x-company-context-id'],
        workspace: headers['x-workspace-context-id'],
      });
      if (state.commands.length === 1) {
        state.recorded = true;
        state.createdRecords += 1;
        firstCommandSeen();
        await firstReply;
        return route.abort('failed');
      }
      if (state.commands.length === 2) {
        expect(state.commands[1]).toEqual(state.commands[0]);
        return route.fulfill({ status: 201, json: contractLocaleRecord() });
      }
      state.unexpected.push('Extra creation: ' + path);
      return route.fulfill({ status: 409 });
    }
    if (request.method() !== 'GET') {
      state.unexpected.push(request.method() + ' ' + path);
      return route.fulfill({ status: 405 });
    }
    if (state.revoked && path === contractLocaleRepresentationPath)
      return route.fulfill({
        status: 403,
        json: { message: 'Untrusted denial wording' },
      });
    if (state.revoked && path === '/api/access/current-actor')
      return route.fulfill({
        json: contractLocaleRevokedActor(
          headers['x-company-context-id'] === contractLocaleIds.company,
        ),
      });
    try {
      const value = readContractLocaleFixture({
        path,
        hasCompany:
          headers['x-company-context-id'] === contractLocaleIds.company,
        recorded: state.recorded,
      });
      await route.fulfill({ json: value });
      if (path === '/api/pricing-configuration/rule-versions')
        configurationSeen();
      if (path === offerHistoryPath) offerHistorySeen();
    } catch (error: unknown) {
      state.unexpected.push(
        error instanceof Error ? error.message : 'Unknown fixture error',
      );
      await route.fulfill({ status: 404 });
    }
  });
  return {
    state,
    firstCommand,
    releaseFirstAttempt: () => releaseFirstAttempt(),
    ready: Promise.all([configurationReady, offerReady]),
  };
}

async function openRequest(page: Page) {
  const requestSubject = contractLocaleRequest.subject;
  if (requestSubject === null)
    throw new Error('The synthetic Contract Request requires its subject.');
  await page
    .getByRole('button')
    .filter({
      has: page.getByText(requestSubject, { exact: true }),
    })
    .click();
}
async function assertOverflow(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport)
    throw new Error('The named desktop/narrow viewport is required');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewport.width);
}

// Four locales run in the existing desktop1440/narrow390 projects: eight real App journeys.
// Authored during a LIGHT lease; no run, screenshot or pass is claimed yet.
for (const locale of interfaceLocales) {
  test(`creates, exactly retries and reopens the immutable Accepted-Offer Contract in ${locale}`, async ({
    page,
  }, testInfo) => {
    const observed = await installRoutes(page);
    await page.addInitScript(
      ({ localeKey, companyKey, companyId, workspaceId }) => {
        if (localStorage.getItem(localeKey) === null)
          localStorage.setItem(localeKey, 'en');
        localStorage.setItem(companyKey, companyId);
        sessionStorage.setItem('prisma-workspace-context', workspaceId);
      },
      {
        localeKey: interfaceLocaleStorageKey,
        companyKey: preferenceKey(contractLocaleActor(false)),
        companyId: contractLocaleIds.company,
        workspaceId: contractLocaleIds.workspace,
      },
    );
    await page.goto('/?frame=prisme#requests');
    await openRequest(page);
    const panel = page.locator('.contract-panel');
    const conditions = panel.getByRole('textbox', {
      name: 'Special conditions',
      exact: true,
    });
    await expect(conditions).toBeEnabled();
    // Actual readiness of both independently mounted owners, with complete Pricing User reads.
    await observed.ready;
    await expect(
      page
        .locator('.offer-panel')
        .getByText(contractLocaleScope, { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.pricing-snapshot-panel').getByRole('checkbox', {
        name: 'Service {original} — Услуга',
        exact: true,
      }),
    ).toBeEnabled();
    await conditions.fill(contractLocaleLiteral);
    await panel.getByLabel('Term start', { exact: true }).fill('2028-02-29');
    await panel.getByLabel('Term end', { exact: true }).fill('2028-03-01');
    const originalConditions = await conditions.elementHandle();
    if (!originalConditions)
      throw new Error('The original controlled textarea is missing');
    const beforeDraftChoice = observed.state.calls.length;
    await chooseLanguage(page, 'en', locale);
    const localizedConditions = panel.getByRole('textbox', {
      name: copy(locale, 'conditions'),
      exact: true,
    });
    expect(
      await localizedConditions.evaluate(
        (element, original) => element === original,
        originalConditions,
      ),
    ).toBe(true);
    await expect(localizedConditions).toHaveValue(contractLocaleLiteral);
    await expect(
      panel.getByLabel(copy(locale, 'start'), { exact: true }),
    ).toHaveValue('2028-02-29');
    await expect(
      panel.getByLabel(copy(locale, 'end'), { exact: true }),
    ).toHaveValue('2028-03-01');
    expect(observed.state.calls).toHaveLength(beforeDraftChoice);
    await panel
      .getByRole('button', { name: copy(locale, 'create'), exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await observed.firstCommand;
    await expect(
      panel.getByRole('button', { name: copy(locale, 'running'), exact: true }),
    ).toBeDisabled();
    const alternate: InterfaceLocale = locale === 'fr' ? 'ru' : 'fr';
    const beforePendingChoice = observed.state.calls.length;
    await chooseLanguage(page, locale, alternate);
    await expect(
      panel.getByRole('textbox', {
        name: copy(alternate, 'conditions'),
        exact: true,
      }),
    ).toHaveValue(contractLocaleLiteral);
    await expect(
      panel.getByRole('textbox', {
        name: copy(alternate, 'conditions'),
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      panel.getByRole('button', {
        name: copy(alternate, 'running'),
        exact: true,
      }),
    ).toBeDisabled();
    expect(observed.state.calls).toHaveLength(beforePendingChoice);
    observed.releaseFirstAttempt();
    await expect(panel.getByRole('alert')).toHaveText(
      copy(alternate, 'uncertain'),
    );
    const beforeUncertainChoice = observed.state.calls.length;
    await chooseLanguage(page, alternate, locale);
    await expect(panel.getByRole('alert')).toHaveText(
      copy(locale, 'uncertain'),
    );
    await expect(
      panel.getByRole('textbox', {
        name: copy(locale, 'conditions'),
        exact: true,
      }),
    ).toHaveValue(contractLocaleLiteral);
    expect(observed.state.calls).toHaveLength(beforeUncertainChoice);
    await panel
      .getByRole('button', { name: copy(locale, 'retry'), exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      panel.getByRole('status').filter({ hasText: copy(locale, 'success') }),
    ).toHaveText(copy(locale, 'success'));
    const versionName =
      resolveMessage(contractVersionMessages, locale, 'version') + ' 1';
    await expect(
      panel.getByRole('button', { name: versionName, exact: true }),
    ).toBeVisible();
    expect(observed.state.commands).toHaveLength(2);
    expect(observed.state.commands[1]).toEqual(observed.state.commands[0]);
    expect(observed.state.commands[0]).toEqual({
      path: contractLocalePath,
      body: JSON.stringify({
        acceptedOfferVersionId: 'accepted-offer-version-657',
        termStartsOn: '2028-02-29',
        termEndsOn: '2028-03-01',
        specialConditions: contractLocaleLiteral,
      }),
      key: expect.any(String),
      company: contractLocaleIds.company,
      workspace: contractLocaleIds.workspace,
    });
    expect(observed.state.commands[0]?.key).toBeTruthy();
    expect(observed.state.createdRecords).toBe(1);
    await expect(
      panel.getByText(contractLocaleScope, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(contractLocaleCommercial, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('cell', {
        name: locale === 'en' ? '2.500' : '2,500',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByText(locale === 'en' ? /345\.00 EUR/u : /345,00 EUR/u),
    ).toBeVisible();
    await assertOverflow(page);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `contract-${locale}-${testInfo.project.name}-recorded.png`,
      ),
      fullPage: true,
    });
    const open = panel.getByRole('button', {
      name: copy(locale, 'openDocument'),
      exact: true,
    });
    await open.focus();
    await page.keyboard.press('Enter');
    const frame = panel.locator('iframe');
    await expect(frame).toHaveAttribute('srcdoc', contractLocaleHtml);
    await expect(frame).toHaveAttribute('sandbox', '');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    await expect(frame).toHaveAttribute('title', copy(locale, 'document'));
    await expect(panel.locator('.contract-representation code')).toHaveText(
      contractLocaleChecksum,
    );
    const originalFrame = await frame.elementHandle();
    if (!originalFrame)
      throw new Error('The opened exact representation is missing');
    const beforeOpenChoice = observed.state.calls.length;
    await chooseLanguage(page, locale, alternate);
    await expect(frame).toHaveAttribute('title', copy(alternate, 'document'));
    await expect(frame).toHaveAttribute('srcdoc', contractLocaleHtml);
    await chooseLanguage(page, alternate, locale);
    expect(
      await frame.evaluate(
        (element, original) => element === original,
        originalFrame,
      ),
    ).toBe(true);
    expect(observed.state.calls).toHaveLength(beforeOpenChoice);
    const reloadReply = page.waitForResponse(
      (reply) =>
        new URL(reply.url()).pathname === contractLocaleRepresentationPath &&
        reply.request().method() === 'GET',
    );
    await panel
      .getByRole('button', {
        name: copy(locale, 'reloadDocument'),
        exact: true,
      })
      .focus();
    await page.keyboard.press('Enter');
    await reloadReply;
    await expect(frame).toHaveAttribute('srcdoc', contractLocaleHtml);
    await frame.scrollIntoViewIfNeeded();
    const represented = page.frameLocator('.contract-panel iframe');
    await expect(
      represented.getByRole('heading', {
        name: 'Illustrative Contract — original bytes',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      represented.getByText('2028-02-29 / 2028-03-01 / 345.00 EUR', {
        exact: true,
      }),
    ).toBeVisible();
    expect(await represented.locator('pre').textContent()).toBe(
      contractLocaleLiteral,
    );
    await assertOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `contract-${locale}-${testInfo.project.name}-representation.png`,
      ),
    });
    expect(
      observed.state.calls.filter(
        (call) => call.path === contractLocaleRepresentationPath,
      ),
    ).toHaveLength(2);
    await page.reload();
    await openRequest(page);
    await expect(
      panel.getByText(contractLocaleScope, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', {
        name: copy(locale, 'openDocument'),
        exact: true,
      }),
    ).toBeEnabled();
    await expect(panel.locator('iframe')).toHaveCount(0);
    await panel
      .getByRole('button', { name: copy(locale, 'openDocument'), exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(frame).toHaveAttribute('srcdoc', contractLocaleHtml);
    await expect(panel.locator('.contract-representation code')).toHaveText(
      contractLocaleChecksum,
    );
    await frame.scrollIntoViewIfNeeded();
    await expect(
      page.frameLocator('.contract-panel iframe').getByRole('heading', {
        name: 'Illustrative Contract — original bytes',
        exact: true,
      }),
    ).toBeVisible();
    await assertOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `contract-${locale}-${testInfo.project.name}-reopened.png`,
      ),
    });
    expect(observed.state.commands).toHaveLength(2);
    expect(observed.state.createdRecords).toBe(1);
    expect(
      observed.state.calls.filter(
        (call) => call.path === contractLocaleRepresentationPath,
      ),
    ).toHaveLength(3);
    for (const call of observed.state.calls.filter((call) =>
      call.path.startsWith(contractLocalePath),
    )) {
      expect(call.company).toBe(contractLocaleIds.company);
      expect(call.workspace).toBe(contractLocaleIds.workspace);
    }
    const beforeDenialActorReads = observed.state.calls.filter(
      (call) => call.path === '/api/access/current-actor',
    ).length;
    observed.state.revoked = true;
    await panel
      .getByRole('button', {
        name: copy(locale, 'reloadDocument'),
        exact: true,
      })
      .focus();
    await page.keyboard.press('Enter');
    await expect(panel).toHaveCount(0);
    await expect(page.locator('.contract-panel iframe')).toHaveCount(0);
    await expect(
      page.getByText(contractLocaleChecksum, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Untrusted denial wording', { exact: true }),
    ).toHaveCount(0);
    expect(
      observed.state.calls.filter(
        (call) => call.path === '/api/access/current-actor',
      ),
    ).toHaveLength(beforeDenialActorReads + 1);
    expect(
      observed.state.calls.filter(
        (call) => call.path === contractLocaleRepresentationPath,
      ),
    ).toHaveLength(4);
    expect(
      observed.state.calls.filter((call) => call.method !== 'GET'),
    ).toHaveLength(2);
    expect(observed.state.unexpected).toEqual([]);
    await expect(page.getByRole('banner')).toContainText(
      contractLocaleCompany.displayName,
    );
  });
}
