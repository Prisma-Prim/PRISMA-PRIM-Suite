import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { contractDecisionMessages } from '../src/contract/contract-decision.copy';
import { resolveMessage } from '../src/localization/messages';
import {
  interfaceLocales,
  interfaceLocaleStorageKey,
} from '../src/localization/interface-locale';
import { preferenceKey } from '../src/production-shell/company-context-preference';
import {
  contractLocaleActor,
  contractLocaleHtml,
  contractLocaleIds,
  contractLocaleLiteral,
  contractLocalePath,
  contractLocaleRepresentation,
  contractLocaleRepresentationPath,
  contractLocaleRequest,
  readContractLocaleFixture,
} from '../src/test/contract-localization-fixture';
import {
  contractQualityLocales,
  contractQualityRun,
  literalDecisionReason,
  pendingQualityContract,
  qualityActor,
  qualityPath,
} from '../src/test/contract-quality-localization-fixture';

// Quality keeps UTC even when the browser uses a different local time.
test.use({ timezoneId: 'America/New_York' });
type Locale = (typeof contractQualityLocales)[number];
const qualityHtml = contractLocaleHtml.replace('345.00 EUR', '333.50 EUR');
const qualityChecksum = createHash('sha256').update(qualityHtml).digest('hex');

function gate() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return {
    promise,
    release() {
      if (!resolve) throw new Error('Missing synthetic Quality response gate');
      resolve();
    },
  };
}

async function chooseLanguage(page: Page, current: Locale, target: Locale) {
  const picker = page.getByRole('combobox', {
    name: current.language,
    exact: true,
  });
  await picker.focus();
  await picker.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await picker.press('Home');
  for (let step = 0; step < interfaceLocales.indexOf(target.code); step += 1)
    await picker.press('ArrowDown');
  await picker.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: target.language, exact: true }),
  ).toBeFocused();
}

async function installRoutes(page: Page, readOnly = false) {
  const old = contractQualityRun();
  const current = contractQualityRun({
    id: 'new-run-706',
    ruleSetVersion: 2,
    evaluatedAt: '2026-10-08T23:30:00.000Z',
  });
  let latest = old;
  const pending = gate();
  const state: {
    retired: boolean;
    calls: string[];
    attempts: Array<{
      path: string;
      body: string | null;
      key: string | undefined;
      company: string | undefined;
      workspace: string | undefined;
    }>;
    unexpected: string[];
    reopened: string[];
    cursors: string[];
  } = {
    retired: false,
    calls: [],
    attempts: [],
    unexpected: [],
    reopened: [],
    cursors: [],
  };
  let versionsReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    versionsReady = resolve;
  });
  page.on('close', () => pending.release());
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const headers = request.headers();
    state.calls.push(`${request.method()} ${path}${url.search}`);
    if (path === '/api/access/current-actor') {
      const actor = qualityActor(readOnly ? 'reader' : 'approver');
      const { activeCompany, ...base } = actor;
      return route.fulfill({
        json:
          headers['x-company-context-id'] === contractLocaleIds.company
            ? {
                ...base,
                activeCompany: {
                  ...activeCompany,
                  ...(state.retired
                    ? {
                        contractPermissions: [],
                        contractApproverAssignmentId: undefined,
                        contractApproverPermissionSetVersion: undefined,
                        contractPermissionAssignmentId: undefined,
                        contractPermissionSetVersion: undefined,
                      }
                    : {}),
                },
              }
            : base,
      });
    }
    if (path === contractLocalePath)
      return route.fulfill({
        json: {
          contract: pendingQualityContract({
            bindingVersion: 2,
            latestRun: latest,
          }),
        },
      });
    if (path === contractLocaleRepresentationPath)
      return route.fulfill({
        json: {
          ...contractLocaleRepresentation,
          html: qualityHtml,
          sha256: qualityChecksum,
        },
      });
    if (path.startsWith(qualityPath)) {
      if (state.retired)
        return route.fulfill({
          status: 403,
          json: { message: 'Hidden untrusted denial' },
        });
      if (request.method() === 'POST') {
        state.attempts.push({
          path,
          body: request.postData(),
          key: headers['idempotency-key'],
          company: headers['x-company-context-id'],
          workspace: headers['x-workspace-context-id'],
        });
        latest = current;
        if (state.attempts.length === 1) {
          await pending.promise;
          return route.abort('failed');
        }
        expect(state.attempts).toHaveLength(2);
        expect(state.attempts[1]).toEqual(state.attempts[0]);
        return route.fulfill({ status: 201, json: current });
      }
      if (path === `${qualityPath}/${old.id}`) {
        state.reopened.push(path);
        return route.fulfill({ json: old });
      }
      if (url.searchParams.has('cursor')) {
        state.cursors.push(url.searchParams.get('cursor') ?? '');
        expect(url.searchParams.get('cursor')).toBe(current.id);
        return route.fulfill({ json: { items: [old], nextCursor: null } });
      }
      return route.fulfill({
        json: {
          items: [latest],
          nextCursor: latest.id === current.id ? current.id : null,
        },
      });
    }
    if (path === `${contractLocalePath}/versions`) {
      await route.fulfill({
        json: {
          items: [{ id: contractLocaleIds.version, versionNumber: 1 }],
          nextCursor: null,
        },
      });
      if (!versionsReady) throw new Error('Missing Version-history observer');
      versionsReady();
      return;
    }
    try {
      return await route.fulfill({
        json: readContractLocaleFixture({
          path,
          hasCompany:
            headers['x-company-context-id'] === contractLocaleIds.company,
          recorded: true,
        }),
      });
    } catch (error: unknown) {
      state.unexpected.push(
        error instanceof Error ? error.message : 'Unknown fixture HTTP read',
      );
      return route.fulfill({ status: 404 });
    }
  });
  await page.addInitScript(
    ({ localeKey, companyKey, companyId, workspaceId }) => {
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
  return { state, pending, old, current, ready };
}

async function openRequest(page: Page) {
  await page.goto('/?frame=prisme#requests');
  const subject = contractLocaleRequest.subject;
  if (!subject) throw new Error('Missing synthetic Request subject');
  await page
    .getByRole('button')
    .filter({ has: page.getByText(subject, { exact: true }) })
    .click();
}

for (const locale of contractQualityLocales) {
  test(`retains exact pending checks, decision work and older UTC evidence in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    const observed = await installRoutes(page);
    await openRequest(page);
    await observed.ready;
    const checks = page.locator('.contract-quality');
    await expect(
      checks.getByRole('heading', { name: 'Contract Quality Checks' }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Open exact Contract document',
        exact: true,
      })
      .click();
    const frame = page.locator('.contract-panel iframe');
    await expect(frame).toHaveAttribute('srcdoc', qualityHtml);
    await expect(
      page.getByText(qualityChecksum, { exact: true }),
    ).toBeVisible();
    const originalFrame = await frame.elementHandle();
    if (!originalFrame) throw new Error('Exact document iframe is absent');
    const run = checks.getByRole('button', {
      name: 'Run Contract Quality Checks',
      exact: true,
    });
    const originalRun = await run.elementHandle();
    if (!originalRun) throw new Error('Run control is absent');
    await run.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => observed.state.attempts.length).toBe(1);
    const before = observed.state.calls.length;
    const english = contractQualityLocales[3];
    await chooseLanguage(page, english, locale);
    await expect(
      checks.getByRole('button', { name: locale.running, exact: true }),
    ).toBeDisabled();
    expect(observed.state.calls).toHaveLength(before);
    expect(await originalRun.evaluate((node) => node.isConnected)).toBe(true);
    expect(await originalFrame.evaluate((node) => node.isConnected)).toBe(true);
    await expect(frame).toHaveAttribute('srcdoc', qualityHtml);
    observed.pending.release();
    await expect(checks.getByRole('alert')).toHaveText(locale.uncertain);
    await checks
      .getByRole('button', { name: locale.retry, exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      checks.getByText(locale.warnings, { exact: true }),
    ).toBeVisible();
    await expect.poll(() => observed.state.attempts.length).toBe(2);
    expect(observed.state.attempts[1]).toEqual(observed.state.attempts[0]);
    expect(observed.state.attempts[0]).toEqual({
      path: qualityPath,
      body: '{}',
      key: expect.any(String),
      company: contractLocaleIds.company,
      workspace: contractLocaleIds.workspace,
    });
    expect(observed.state.attempts[0]?.key).not.toBe('');
    await expect(checks.locator('dl time')).toHaveAttribute(
      'datetime',
      observed.current.evaluatedAt,
    );
    await expect(
      checks.getByText('CONTRACT_QUALITY_ILLUSTRATIVE v2', { exact: true }),
    ).toBeVisible();
    await expect(
      checks.getByText(contractLocaleIds.version, { exact: true }),
    ).toBeVisible();
    const decision = page.locator('.contract-decision');
    const dc = (key: (typeof contractDecisionMessages.keys)[number]) =>
      resolveMessage(contractDecisionMessages, locale.code, key);
    const warning = decision.getByRole('checkbox', {
      name: `${dc('acknowledge')}: ${locale.added}`,
      exact: true,
    });
    await warning.check();
    const reason = decision.getByRole('textbox', {
      name: dc('reason'),
      exact: true,
    });
    await reason.fill(literalDecisionReason);
    const originalReason = await reason.elementHandle();
    if (!originalReason) throw new Error('Decision draft is absent');
    const callsWithDraft = observed.state.calls.length;
    const other = locale.code === 'ro' ? english : contractQualityLocales[0];
    await chooseLanguage(page, locale, other);
    await expect(decision.getByRole('checkbox')).toBeChecked();
    await expect(decision.getByRole('textbox')).toHaveValue(
      literalDecisionReason,
    );
    expect(await originalReason.evaluate((node) => node.isConnected)).toBe(
      true,
    );
    await chooseLanguage(page, other, locale);
    expect(observed.state.calls).toHaveLength(callsWithDraft);
    await expect(warning).toBeChecked();
    await expect(reason).toHaveValue(literalDecisionReason);
    await expect(frame).toHaveAttribute('srcdoc', qualityHtml);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(
        `contract-quality-${locale.code}-${testInfo.project.name}.png`,
      ),
    });
    await checks
      .getByRole('button', { name: locale.history, exact: true })
      .click();
    const older = checks.getByRole('button', {
      name: locale.next,
      exact: true,
    });
    await expect(older).toBeEnabled();
    const historyCalls = observed.state.calls.length;
    await chooseLanguage(page, locale, other);
    await chooseLanguage(page, other, locale);
    expect(observed.state.calls).toHaveLength(historyCalls);
    await older.focus();
    await page.keyboard.press('Enter');
    const oldAction = checks.getByRole('button', {
      name: `${locale.reopen} · ${locale.utc} (UTC)`,
      exact: true,
    });
    await expect(oldAction).toBeVisible();
    expect(observed.state.cursors).toEqual(['new-run-706']);
    await oldAction.focus();
    await page.keyboard.press('Enter');
    await expect(checks.locator('dl time')).toHaveText(locale.utc);
    await expect(checks.locator('dl time')).toHaveAttribute(
      'datetime',
      observed.old.evaluatedAt,
    );
    await expect(
      checks.getByText('CONTRACT_QUALITY_ILLUSTRATIVE v1', { exact: true }),
    ).toBeVisible();
    expect(observed.state.reopened).toEqual([
      `${qualityPath}/recorded-run-706`,
    ]);
    await expect(page.locator('.contract-panel')).toContainText(
      contractLocaleLiteral.trim(),
    );
    await expect(frame).toHaveAttribute('srcdoc', qualityHtml);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(
        `contract-quality-history-${locale.code}-${testInfo.project.name}.png`,
      ),
    });
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
    observed.state.retired = true;
    await checks
      .getByRole('button', { name: locale.history, exact: true })
      .click();
    await expect(page.locator('.contract-quality')).toHaveCount(0);
    await expect(
      page.getByText('Hidden untrusted denial', { exact: true }),
    ).toHaveCount(0);
    expect(observed.state.attempts).toHaveLength(2);
    expect(observed.state.unexpected).toEqual([]);
  });

  test(`permits recorded-history reading without Run or Decision in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    const observed = await installRoutes(page, true);
    await openRequest(page);
    await observed.ready;
    await chooseLanguage(page, contractQualityLocales[3], locale);
    const checks = page.getByRole('region', {
      name: locale.title,
      exact: true,
    });
    await expect(
      checks.getByRole('button', { name: locale.run, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('.contract-decision input, .contract-decision textarea'),
    ).toHaveCount(0);
    await checks
      .getByRole('button', { name: locale.history, exact: true })
      .click();
    await checks
      .getByRole('button', {
        name: `${locale.reopen} · ${locale.utc} (UTC)`,
        exact: true,
      })
      .click();
    await expect(checks.locator('dl time')).toHaveText(locale.utc);
    await expect(checks.locator('dl time')).toHaveAttribute(
      'datetime',
      observed.old.evaluatedAt,
    );
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(
        `contract-quality-reader-${locale.code}-${testInfo.project.name}.png`,
      ),
    });
    expect(observed.state.attempts).toEqual([]);
    expect(observed.state.unexpected).toEqual([]);
  });
}
