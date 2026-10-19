import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import {
  confirmationActor,
  confirmationCanonical,
  confirmationCompanies,
  confirmationFirst,
  confirmationLocaleCases,
  confirmationPair,
  confirmationReason,
  confirmationReference,
  confirmationSecond,
  type ConfirmationLocaleCase,
} from '../src/test/client-union-confirmation-localization.fixture';
import { enterClassicCompatibility } from './classic-compatibility';
import { installConfirmationLocalizationFixture } from './client-union-confirmation-localization.fixture';
import { selectOption } from './select-option';

function panel(page: Page, copy: ConfirmationLocaleCase) {
  return page.getByRole('region', { name: copy.title, exact: true });
}
function form(page: Page, copy: ConfirmationLocaleCase) {
  return panel(page, copy).getByRole('form', {
    name: copy.confirm,
    exact: true,
  });
}
async function chooseLocale({
  page,
  code,
}: {
  page: Page;
  code: InterfaceLocale;
}) {
  const control = page.locator('#interface-locale');
  await control.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Home');
  const index = ['ro', 'ru', 'fr', 'en'].indexOf(code);
  for (let position = 0; position < index; position += 1)
    await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(control).toHaveAttribute('data-value', code);
  await expect(control).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', code);
}
async function chooseSource({
  page,
  control,
  second,
}: {
  page: Page;
  control: Locator;
  second: boolean;
}) {
  await control.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press(second ? 'End' : 'Home');
  if (!second) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(control).toHaveAttribute(
    'data-value',
    second ? confirmationSecond.id : confirmationFirst.id,
  );
  await expect(control).toBeFocused();
}
async function openComparison({
  page,
  copy,
}: {
  page: Page;
  copy: ConfirmationLocaleCase;
}) {
  const open = page
    .getByRole('button', { name: copy.openDossier, exact: true })
    .first();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(copy.legalEmpty, { exact: true })).toBeVisible();
  const review = panel(page, copy).getByRole('button', {
    name: copy.review,
    exact: true,
  });
  await review.focus();
  await page.keyboard.press('Enter');
  const heading = panel(page, copy).getByRole('heading', {
    name: copy.compare,
    exact: true,
  });
  await expect(heading).toBeFocused();
  return form(page, copy);
}
async function chooseMixed({
  page,
  copy,
}: {
  page: Page;
  copy: ConfirmationLocaleCase;
}) {
  const currentForm = form(page, copy);
  await chooseSource({
    page,
    control: currentForm.getByRole('combobox', {
      name: copy.canonical,
      exact: true,
    }),
    second: true,
  });
  for (const [index, label] of copy.fields.entries())
    await chooseSource({
      page,
      control: currentForm.getByRole('combobox', { name: label, exact: true }),
      second: index % 2 !== 0,
    });
  await currentForm
    .getByRole('textbox', { name: copy.reason, exact: true })
    .fill(confirmationReason);
  for (const checkbox of await currentForm.getByRole('checkbox').all()) {
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
  }
}
async function navigate({
  page,
  copy,
  section,
}: {
  page: Page;
  copy: ConfirmationLocaleCase;
  section: 'activity' | 'clients';
}) {
  const menu = page.getByRole('button', { name: copy.openMenu, exact: true });
  if (await menu.isVisible()) await menu.click();
  const link = page
    .getByRole('navigation', { name: copy.navigation })
    .getByRole('link', { name: copy[section], exact: true });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(`#${section}`)).toBeVisible();
}
async function chooseCompany({
  page,
  copy,
  companyId,
}: {
  page: Page;
  copy: ConfirmationLocaleCase;
  companyId: string;
}) {
  const menu = page.getByRole('button', { name: copy.openMenu, exact: true });
  const narrow = await menu.isVisible();
  if (narrow) await menu.click();
  await selectOption(page.locator('#active-company-context'), companyId);
  await expect(page.locator('#active-company-context')).toHaveAttribute(
    'data-value',
    companyId,
  );
  if (narrow) {
    await page.locator('#active-company-context').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#primary-navigation')).toHaveAttribute(
      'data-open',
      'false',
    );
  }
}
async function capture({
  page,
  info,
  name,
  focus,
  fullPage = false,
}: {
  page: Page;
  info: TestInfo;
  name: string;
  focus: Locator;
  fullPage?: boolean;
}) {
  await focus.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '.client-union button, .client-union input, .client-union textarea',
        ),
      )
        .filter(
          (node) =>
            node.getClientRects().length > 0 && !node.closest('[hidden]'),
        )
        .map((node) => node.getBoundingClientRect())
        .every((rect) => rect.left >= 0 && rect.right <= window.innerWidth),
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath(`${name}-viewport.png`) });
  if (fullPage) {
    // Reset immediately before full capture so a fixed skip link cannot retain a scrolled artifact.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`${name}-full.png`),
      fullPage: true,
    });
  }
}
async function expectSavedComparison({
  page,
  copy,
}: {
  page: Page;
  copy: ConfirmationLocaleCase;
}) {
  const comparison = panel(page, copy).getByRole('region', {
    name: copy.compare,
    exact: true,
  });
  const articles = comparison.getByRole('article');
  await expect(articles).toHaveCount(2);
  await expect(articles.nth(0)).toHaveAccessibleName(
    `${copy.source} 1 · ${confirmationFirst.displayName}`,
  );
  await expect(articles.nth(1)).toHaveAccessibleName(
    `${copy.source} 2 · ${confirmationSecond.displayName}`,
  );
  await expect(articles.nth(0)).toContainText(copy.version);
  expect(
    await articles.nth(0).locator('.client-union-values dd').allTextContents(),
  ).toEqual([
    confirmationFirst.displayName,
    '  UNION-716 / ИД  ',
    copy.absent,
    '+373 (22) 071-600',
    copy.absent,
    'Consultanță / консалтинг',
  ]);
  expect(await articles.nth(0).locator('li strong').allTextContents()).toEqual([
    'Ana / Анна',
  ]);
  expect(await articles.nth(1).locator('li strong').allTextContents()).toEqual([
    'Ana / Анна',
    'Boris / Борис',
  ]);
  expect(await articles.nth(0).locator('li dd').allTextContents()).toEqual([
    '+373 (60) 071-601',
    'ana+first@example.test',
    '  Director / директор  ',
    copy.roles,
    '  Email întâi / сначала email\nDupă 14:00.  ',
  ]);
  for (const caption of copy.contacts)
    await expect(
      articles.nth(0).getByText(caption, { exact: true }),
    ).toBeVisible();
  await expect(
    comparison.getByText(copy.contactSource, { exact: true }),
  ).toBeVisible();
  await expect(comparison.getByText(copy.count, { exact: true })).toBeVisible();
  expect(
    await comparison
      .getByRole('region', { name: copy.companies })
      .getByRole('listitem')
      .allTextContents(),
  ).toEqual(confirmationCompanies.map(({ displayName }) => displayName));
  await expect(comparison.locator('time')).toHaveCount(0);
  await expect(comparison).not.toContainText(confirmationFirst.id);
  await expect(comparison).not.toContainText(confirmationReference);
}

for (const copy of Object.values(confirmationLocaleCases)) {
  test(`preserves mixed second-canonical intent and late exact retry with localized completion in ${copy.code}`, async ({
    page,
  }, info) => {
    const state = await installConfirmationLocalizationFixture({ page });
    await page.goto('/?frame=prisme#clients');
    const english = confirmationLocaleCases.en;
    let currentForm = await openComparison({ page, copy: english });
    for (const control of await currentForm.getByRole('combobox').all())
      await expect(control).toHaveAttribute('data-value', '');
    await chooseMixed({ page, copy: english });
    const formNode = await currentForm.elementHandle();
    const reasonNode = await currentForm.getByRole('textbox').elementHandle();
    const canonicalNode = await currentForm
      .getByRole('combobox', { name: english.canonical, exact: true })
      .elementHandle();
    if (!formNode || !reasonNode || !canonicalNode)
      throw new Error('Expected mounted comparison controls');
    const requests = state.apiRequests.slice();
    await chooseLocale({ page, code: copy.code });
    expect(state.apiRequests).toEqual(requests);
    currentForm = form(page, copy);
    expect(
      await currentForm.evaluate(
        (node, original) => node === original,
        formNode,
      ),
    ).toBe(true);
    expect(
      await currentForm
        .getByRole('textbox')
        .evaluate((node, original) => node === original, reasonNode),
    ).toBe(true);
    expect(
      await currentForm
        .getByRole('combobox', { name: copy.canonical, exact: true })
        .evaluate((node, original) => node === original, canonicalNode),
    ).toBe(true);
    await expectSavedComparison({ page, copy });
    await expect(
      currentForm.getByText(copy.retained, { exact: true }),
    ).toHaveCount(3);
    await expect(currentForm.getByRole('textbox')).toHaveValue(
      confirmationReason,
    );
    for (const checkbox of await currentForm.getByRole('checkbox').all())
      await expect(checkbox).toBeChecked();
    await capture({
      page,
      info,
      name: `${copy.code}-mixed-sources`,
      focus: panel(page, copy).getByRole('heading', { name: copy.compare }),
      fullPage: true,
    });

    let releaseUncertain: (() => Promise<void>) | undefined;
    state.confirmReply = (route) => {
      releaseUncertain = () => route.fulfill({ status: 503, json: {} });
    };
    await currentForm
      .getByRole('button', { name: copy.confirm, exact: true })
      .click();
    await expect.poll(() => state.commands.length).toBe(1);
    await expect(
      currentForm.getByRole('button', { name: copy.pending }),
    ).toBeDisabled();
    const alternate =
      copy.code === 'ro'
        ? confirmationLocaleCases.fr
        : confirmationLocaleCases.ro;
    const pendingRequests = state.apiRequests.slice();
    await chooseLocale({ page, code: alternate.code });
    expect(state.apiRequests).toEqual(pendingRequests);
    await expect(
      form(page, alternate).getByRole('button', { name: alternate.pending }),
    ).toBeDisabled();
    if (!releaseUncertain)
      throw new Error('Expected a received pending confirmation');
    await releaseUncertain();
    await expect(form(page, alternate).getByRole('alert')).toContainText(
      alternate.uncertain,
    );
    await chooseLocale({ page, code: copy.code });
    expect(state.apiRequests).toEqual(pendingRequests);
    currentForm = form(page, copy);
    await expect(currentForm.getByRole('alert')).toContainText(copy.error);
    await expect(currentForm.getByRole('alert')).toContainText(copy.uncertain);
    await navigate({ page, copy, section: 'activity' });
    await expect(panel(page, copy)).toBeHidden();
    await navigate({ page, copy, section: 'clients' });
    await enterClassicCompatibility(page, copy.optIn);
    const frameRequests = [...pendingRequests, 'GET /api/operational-home'];
    await expect.poll(() => state.apiRequests).toEqual(frameRequests);
    await page.getByRole('button', { name: copy.optIn, exact: true }).click();
    await expect(page.locator('.prisme-shell')).toBeVisible();
    expect(state.apiRequests).toEqual(frameRequests);
    expect(
      await currentForm.evaluate(
        (node, original) => node === original,
        formNode,
      ),
    ).toBe(true);
    await expect(currentForm.getByRole('textbox')).toHaveValue(
      confirmationReason,
    );
    await capture({
      page,
      info,
      name: `${copy.code}-uncertain`,
      focus: currentForm.getByRole('alert'),
    });

    let releaseSuccess: (() => Promise<void>) | undefined;
    state.confirmReply = (route) => {
      releaseSuccess = () =>
        route.fulfill({
          status: 201,
          json: {
            outcome: 'united',
            canonicalClientId: confirmationSecond.id,
            projectionReference: 'projection-716',
          },
        });
    };
    await currentForm
      .getByRole('button', { name: copy.confirm, exact: true })
      .click();
    await expect.poll(() => state.commands.length).toBe(2);
    expect(state.commands[1]).toEqual(state.commands[0]);
    const command = state.commands[0];
    if (!command || !command.body)
      throw new Error('Expected an explicit serialized command');
    expect(command.path).toBe('/api/client-union-reviews/review-716/confirm');
    expect(command.method).toBe('POST');
    expect(command.company).toBe(confirmationCompanies[0].id);
    expect(command.key).toBeTruthy();
    expect(JSON.parse(command.body)).toEqual({
      canonicalClientId: confirmationSecond.id,
      fields: {
        displayName: confirmationFirst.id,
        taxId: confirmationSecond.id,
        address: confirmationFirst.id,
        telephone: confirmationSecond.id,
        generalEmail: confirmationFirst.id,
        businessActivity: confirmationSecond.id,
      },
      reason: confirmationReason,
      reviewedDifferences: true,
      companyIds: ['company-a-716', 'company-b-716'],
    });
    const retryRequests = state.apiRequests.slice();
    await chooseLocale({ page, code: alternate.code });
    expect(state.apiRequests).toEqual(retryRequests);
    state.united = true;
    if (!releaseSuccess) throw new Error('Expected received explicit retry');
    await releaseSuccess();
    await expect(
      page.getByText(alternate.saved, { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', {
          name: confirmationCanonical.displayName,
          exact: true,
        })
        .getByRole('heading', {
          name: confirmationCanonical.displayName,
          exact: true,
        }),
    ).toBeVisible();
    await expect
      .poll(() => state.dossierReads.at(-1))
      .toBe(confirmationSecond.id);
    await expect(form(page, alternate)).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: alternate.legalTitle, exact: true })
        .getByText(alternate.legalEmpty, { exact: true }),
    ).toBeVisible();
    const completedRequests = state.apiRequests.slice();
    await chooseLocale({ page, code: copy.code });
    expect(state.apiRequests).toEqual(completedRequests);
    await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
    expect(state.clientReads).toBeGreaterThan(1);
    expect(state.activityReads).toBeGreaterThan(1);
    expect(state.unexpectedRequests).toEqual([]);
    await capture({
      page,
      info,
      name: `${copy.code}-canonical-completion`,
      focus: page.getByText(copy.saved, { exact: true }),
      fullPage: true,
    });
  });

  test(`retains localized validation, preserves all 51 Contacts and safely refuses stale reviews in ${copy.code}`, async ({
    page,
  }, info) => {
    const state = await installConfirmationLocalizationFixture({ page });
    await page.addInitScript(
      (code) => localStorage.setItem('prisma-prim.interface-locale', code),
      copy.code,
    );
    await page.goto('/?frame=prisme#clients');
    let currentForm = await openComparison({ page, copy });
    await currentForm
      .getByRole('button', { name: copy.confirm, exact: true })
      .click();
    await expect(currentForm.getByRole('alert')).toHaveText(copy.incomplete);
    await expect(currentForm.getByRole('textbox')).toHaveAccessibleDescription(
      copy.incomplete,
    );
    const reason = currentForm.getByRole('textbox');
    await expect(reason).toHaveAttribute('maxlength', '2000');
    for (const control of await currentForm.getByRole('combobox').all()) {
      await expect(control).toHaveAttribute('data-value', '');
      await expect(control).toHaveAttribute('aria-invalid', 'true');
    }
    const attemptedNode = await reason.elementHandle();
    if (!attemptedNode) throw new Error('Expected attempted reason field');
    const requests = state.apiRequests.slice();
    await chooseLocale({ page, code: copy.code === 'ro' ? 'en' : 'ro' });
    await chooseLocale({ page, code: copy.code });
    expect(state.apiRequests).toEqual(requests);
    expect(
      await reason.evaluate(
        (node, original) => node === original,
        attemptedNode,
      ),
    ).toBe(true);
    await expect(reason).toHaveAttribute('aria-invalid', 'true');
    await capture({
      page,
      info,
      name: `${copy.code}-required-validation`,
      focus: reason,
    });
    await panel(page, copy).getByRole('button', { name: copy.close }).click();
    state.comparison = {
      ...confirmationPair,
      clients: [
        {
          ...confirmationFirst,
          contacts: Array.from({ length: 51 }, (_, index) => ({
            name: `Literal Contact ${index + 1}`,
          })),
        },
        { ...confirmationSecond, contacts: [] },
      ],
    };
    await panel(page, copy).getByRole('button', { name: copy.review }).click();
    currentForm = form(page, copy);
    await expect(panel(page, copy).getByRole('alert')).toHaveText(
      copy.capacity,
    );
    await expect(
      currentForm.getByRole('button', { name: copy.confirm }),
    ).toBeDisabled();
    await expect(
      panel(page, copy)
        .getByRole('listitem')
        .filter({ has: page.locator('strong') }),
    ).toHaveCount(51);
    for (const control of await currentForm.getByRole('combobox').all())
      await expect(control).toBeDisabled();
    expect(state.commands).toHaveLength(0);
    await capture({
      page,
      info,
      name: `${copy.code}-capacity-51`,
      focus: panel(page, copy).getByRole('alert'),
    });
    await panel(page, copy).getByRole('button', { name: copy.close }).click();
    state.comparison = confirmationPair;
    for (const status of [409, 404, 403]) {
      state.reviewReply = (route) =>
        route.fulfill({
          status,
          json: { message: 'PRIVATE hidden candidate' },
        });
      await panel(page, copy)
        .getByRole('button', { name: copy.review })
        .click();
      await expect(panel(page, copy).getByRole('alert')).toHaveText(
        copy.unavailable,
      );
      await expect(form(page, copy)).toHaveCount(0);
      await expect(panel(page, copy)).not.toContainText('PRIVATE');
      await expect(panel(page, copy)).not.toContainText(
        confirmationSecond.displayName,
      );
    }
    await capture({
      page,
      info,
      name: `${copy.code}-safe-refusal`,
      focus: panel(page, copy).getByRole('alert'),
    });
    expect(state.commands).toHaveLength(0);
    expect(state.unexpectedRequests).toEqual([]);
  });

  test(`suppresses hidden focus and late work after actual authority retirement in ${copy.code}`, async ({
    page,
  }, info) => {
    const state = await installConfirmationLocalizationFixture({ page });
    await page.addInitScript(
      (code) => localStorage.setItem('prisma-prim.interface-locale', code),
      copy.code,
    );
    await page.goto('/?frame=prisme#clients');
    await page
      .getByRole('button', { name: copy.openDossier, exact: true })
      .first()
      .click();
    await expect(
      page.getByText(copy.legalEmpty, { exact: true }),
    ).toBeVisible();
    let releaseReview: (() => Promise<void>) | undefined;
    state.reviewReply = (route) => {
      releaseReview = () =>
        route.fulfill({ status: 201, json: confirmationPair });
    };
    const review = panel(page, copy).getByRole('button', { name: copy.review });
    await review.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => state.reviewReads).toBe(1);
    await navigate({ page, copy, section: 'activity' });
    const activeControl = page.locator('#interface-locale');
    await activeControl.focus();
    await expect(activeControl).toBeFocused();
    const hiddenRequests = state.apiRequests.slice();
    if (!releaseReview) throw new Error('Expected pending background review');
    await releaseReview();
    await expect(
      page.getByRole('form', {
        name: copy.confirm,
        exact: true,
        includeHidden: true,
      }),
    ).toHaveCount(1);
    await expect(panel(page, copy)).toBeHidden();
    await expect(activeControl).toBeFocused();
    expect(state.apiRequests).toEqual(hiddenRequests);
    await navigate({ page, copy, section: 'clients' });
    await expect(form(page, copy)).toBeVisible();
    await expect(
      panel(page, copy).getByRole('heading', { name: copy.compare }),
    ).not.toBeFocused();
    await panel(page, copy).getByRole('button', { name: copy.close }).click();
    state.reviewReply = undefined;
    await panel(page, copy).getByRole('button', { name: copy.review }).click();
    await chooseMixed({ page, copy });

    // The server revokes the submitted captured-v2 authority before this command.
    const legacyActor = {
      ...confirmationActor,
      activeCompany: {
        ...confirmationCompanies[0],
        clientPermissions: ['client.read'],
        clientPermissionAssignmentId: 'replacement-v1-716',
        clientPermissionSetVersion: 'v1',
      },
    } satisfies typeof confirmationActor;
    state.actor = legacyActor;
    state.confirmReply = (route) =>
      route.fulfill({ status: 403, json: { message: 'PRIVATE' } });
    await form(page, copy).getByRole('button', { name: copy.confirm }).click();
    await expect(form(page, copy)).toHaveCount(0);
    await expect(
      panel(page, copy).getByRole('button', { name: copy.review }),
    ).toHaveCount(0);
    await expect(page.getByText(copy.saved, { exact: true })).toHaveCount(0);
    await expect(panel(page, copy)).not.toContainText('PRIVATE');
    expect(state.commands).toHaveLength(1);
    expect(state.united).toBe(false);
    await capture({
      page,
      info,
      name: `${copy.code}-captured-version-retirement`,
      focus: panel(page, copy),
    });

    // Company B independently returns current captured-v2 resolver authority.
    const resolverCompany = confirmationActor.activeCompany;
    if (!resolverCompany)
      throw new Error('Expected the configured resolver Company');
    state.actor = {
      ...confirmationActor,
      activeCompany: {
        ...resolverCompany,
        ...confirmationCompanies[1],
        clientPermissionAssignmentId: 'fresh-v2-company-b-716',
        clientPermissionSetVersion: 'v2',
      },
    };
    state.comparison = {
      ...confirmationPair,
      reviewReference: 'fresh-company-b-716',
    };
    await chooseCompany({ page, copy, companyId: confirmationCompanies[1].id });
    await page
      .getByRole('button', { name: copy.openDossier, exact: true })
      .first()
      .click();
    await expect(
      page.getByText(copy.legalEmpty, { exact: true }),
    ).toBeVisible();
    await panel(page, copy).getByRole('button', { name: copy.review }).click();
    for (const control of await form(page, copy).getByRole('combobox').all())
      await expect(control).toHaveAttribute('data-value', '');
    await expect(form(page, copy).getByRole('textbox')).toHaveValue('');
    await chooseMixed({ page, copy });
    let releaseCommand: (() => Promise<void>) | undefined;
    state.confirmReply = (route) => {
      releaseCommand = () =>
        route.fulfill({
          status: 201,
          json: {
            outcome: 'united',
            canonicalClientId: confirmationSecond.id,
            projectionReference: 'projection-716',
          },
        });
    };
    await form(page, copy).getByRole('button', { name: copy.confirm }).click();
    await expect.poll(() => state.commands.length).toBe(2);
    expect(state.commands[0]?.company).toBe(confirmationCompanies[0].id);
    expect(state.commands[1]?.company).toBe(confirmationCompanies[1].id);
    expect(state.commands[1]?.path).toBe(
      '/api/client-union-reviews/fresh-company-b-716/confirm',
    );
    expect(state.commands[1]?.key).not.toBe(state.commands[0]?.key);
    expect(state.commands[1]?.body).toBe(state.commands[0]?.body);
    state.actor = legacyActor;
    await chooseCompany({ page, copy, companyId: confirmationCompanies[0].id });
    await expect(
      page.getByRole('button', { name: copy.openDossier, exact: true }).first(),
    ).toBeVisible();
    await expect(form(page, copy)).toHaveCount(0);
    await expect(page.locator('#client-dossier-title')).toHaveCount(0);
    if (!releaseCommand)
      throw new Error('Expected pending old-Company confirmation');
    const retiredRequests = state.apiRequests.slice();
    state.united = true;
    await releaseCommand();
    await expect(page.getByText(copy.saved, { exact: true })).toHaveCount(0);
    await expect(page.locator('#client-dossier-title')).toHaveCount(0);
    expect(state.apiRequests).toEqual(retiredRequests);
    expect(state.unexpectedRequests).toEqual([]);
    await capture({
      page,
      info,
      name: `${copy.code}-company-retirement`,
      focus: panel(page, copy),
    });
  });
}
