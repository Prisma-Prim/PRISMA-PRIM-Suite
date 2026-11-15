import { randomUUID } from 'node:crypto';
import type { Request, Route } from '@playwright/test';
import { expect, test, expectApiFailure } from './ui-chaos.fixture';
import { removeRoute } from './route-removal';
import { expectValue, selectOption } from './select-option';
import { resolveMessage } from '../src/localization/messages';
import { companyAssignmentMessages } from '../src/access/company-assignment-localization.copy';
import { companyContextMessages } from '../src/company/company-context.copy';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import { runBrowserSequences } from './browser-sequences.fixture';
import {
  accessSequenceAdapter,
  companyContextSequenceAdapter,
} from './access-browser-sequences.fixture';

import {
  accessApiOrigin as apiOrigin,
  accessIdentities,
  accessObject as record,
  prepareAccessSequenceCase,
} from './access-sequence-source.fixture';
const owner = accessIdentities.administrator;
const reader = accessIdentities.member;

test('retains a native Workspace access intent through lost reply, locale and Company changes', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const suffix = `${info.project.name}-${randomUUID()}`;
  const ready = await prepareAccessSequenceCase(page, suffix);
  const a = ready.companies.a.id;
  const b = ready.companies.b.id;
  const membershipId = ready.membershipId;
  const identify = (route: Route) =>
    route.fallback({ headers: { ...route.request().headers(), ...owner } });
  await page.route('**/api/**', identify);
  const sent: { body: string; key: string }[] = [];
  const observe = (request: Request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/company-context-assignments'
    )
      sent.push({
        body: request.postData() ?? '',
        key: request.headers()['idempotency-key'] ?? '',
      });
  };
  page.on('request', observe);
  let receipt: unknown;
  let dropped = false;
  const drop = async (route: Route) => {
    if (route.request().method() !== 'POST' || dropped) return route.fallback();
    dropped = true;
    const response = await route.fetch({
      headers: { ...route.request().headers(), ...owner },
    });
    expect(response.status()).toBe(201);
    receipt = await response.json();
    expectApiFailure({
      page,
      request: route.request(),
      reason:
        'Native Company-context grant committed; its first receipt is deliberately lost.',
    });
    await route.abort('connectionfailed');
  };
  try {
    await page.goto('/#access');
    const administration = page.locator('.company-access');
    await selectOption(administration.getByLabel('Workspace member'), {
      value: membershipId,
    });
    await selectOption(administration.getByLabel('Company', { exact: true }), {
      value: a,
    });
    await selectOption(administration.getByLabel('Access bundle'), {
      value: 'company-context',
    });
    await page.route('**/api/company-context-assignments', drop);
    await administration
      .getByRole('button', { name: 'Grant access', exact: true })
      .click();
    await expect(administration.getByRole('alert')).toHaveText(
      resolveMessage(companyAssignmentMessages, 'en', 'error'),
    );
    expect(sent).toHaveLength(1);
    await removeRoute(page, '**/api/company-context-assignments', drop);
    await selectOption(page.locator('#interface-locale'), { value: 'fr' });
    const memberControl = administration.getByLabel(
      resolveMessage(companyAssignmentMessages, 'fr', 'workspaceMemberLabel'),
    );
    const companyControl = administration.getByLabel(
      resolveMessage(companyAssignmentMessages, 'fr', 'companyLabel'),
      { exact: true },
    );
    await expectValue(memberControl, membershipId);
    await expectValue(companyControl, a);
    for (const companyId of [a, b, a]) {
      if (info.project.name.endsWith('narrow'))
        await page
          .getByRole('button', {
            name: resolveMessage(prismeMessages, 'fr', 'openNavigation'),
            exact: true,
          })
          .click();
      const active = page.getByLabel(
        resolveMessage(companyContextMessages, 'fr', 'activeCompany'),
        { exact: true },
      );
      await selectOption(active, { value: companyId });
      await expect(active).toBeEnabled();
      await expectValue(active, companyId);
      if (info.project.name.endsWith('narrow'))
        await page
          .getByRole('button', {
            name: resolveMessage(prismeMessages, 'fr', 'closeNavigation'),
            exact: true,
          })
          .click();
    }
    await expectValue(memberControl, membershipId);
    await expectValue(companyControl, a);
    const replay = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/company-context-assignments',
    );
    await administration
      .getByRole('button', {
        name: resolveMessage(companyAssignmentMessages, 'fr', 'grant'),
        exact: true,
      })
      .evaluate((button) => {
        if (!(button instanceof HTMLButtonElement))
          throw new Error('Expected an Access grant button.');
        button.click();
        button.click();
      });
    expect(await (await replay).json()).toEqual(receipt);
    await expect(
      administration.getByText(
        resolveMessage(companyAssignmentMessages, 'fr', 'granted'),
        { exact: true },
      ),
    ).toBeVisible();
    expect(sent).toHaveLength(2);
    const [original, retried] = sent;
    if (!original || !retried)
      throw new Error('Expected one original grant and its exact retry.');
    expect(original.key).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(original.body).toBe(
      JSON.stringify({ workspaceMembershipId: membershipId, companyId: a }),
    );
    expect(retried).toEqual(original);
    const state = await page.request.get(
      apiOrigin + '/company-context-assignments/administration',
      { headers: owner },
    );
    expect(state.status()).toBe(200);
    const assignments = record(await state.json()).assignments;
    if (!Array.isArray(assignments))
      throw new Error('Expected canonical assignments.');
    const current = assignments
      .map(record)
      .filter(
        (entry) =>
          entry.active === true &&
          entry.bundle === 'Company Context Access' &&
          entry.workspaceMembershipId === membershipId &&
          entry.companyId === a,
      );
    expect(current).toHaveLength(1);
    const authorized = await page.request.get(
      apiOrigin + '/access/current-actor',
      { headers: { ...reader, 'x-company-context-id': a } },
    );
    expect(authorized.status()).toBe(200);
    expect(record(record(await authorized.json()).activeCompany).id).toBe(a);
    const isolated = await page.request.get(
      apiOrigin + '/access/current-actor',
      { headers: { ...reader, 'x-company-context-id': b } },
    );
    expect(isolated.status()).toBe(403);
    await page.screenshot({
      path: info.outputPath(`access-retained-intent-${info.project.name}.png`),
      fullPage: true,
    });
  } finally {
    page.off('request', observe);
    if (!page.isClosed()) {
      await removeRoute(page, '**/api/company-context-assignments', drop);
      await removeRoute(page, '**/api/**', identify);
    }
  }
});

test.describe('generated Access sequences', () => {
  test.use({ chaosOwner: 'sequence' });
  test('explores generated native Workspace Access action sequences', async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    await runBrowserSequences({ page, info, adapter: accessSequenceAdapter });
  });
  test('explores generated native Company context action sequences', async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    await runBrowserSequences({
      page,
      info,
      adapter: companyContextSequenceAdapter,
    });
  });
});
