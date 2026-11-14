import { removeRoute } from './route-removal';
import {
  expect,
  test,
  type Page,
  type Response,
  type Route,
} from '@playwright/test';
import { selectOption } from './select-option';
import {
  exactPaymentDownload,
  paymentIdentities,
  paymentObject,
  paymentText,
  type PaymentIdentity,
} from './payment-evidence-source.acceptance.fixture';
import {
  createNativePayment,
  fillPaymentValues,
  openPaymentObservation,
  paymentScreenshot,
  paymentCompanyControl,
  preparePaymentObservationCase,
  supersedePaymentObservationSource,
} from './payment-observation.acceptance.fixture';
import {
  paymentCopy,
  type PaymentLocale,
} from '../src/payment-observation/ui/payment-copy';
import { resolveMessage } from '../src/localization/messages';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';

const en = paymentCopy.en;
function native(method: string, path: string) {
  return (response: Response) =>
    response.request().method() === method &&
    new URL(response.url()).pathname === '/api' + path;
}

async function expectCompanyDisabled({
  page,
  locale,
  narrow,
}: {
  page: Page;
  locale: PaymentLocale;
  narrow: boolean;
}) {
  const url = page.url();
  if (narrow)
    await page
      .getByRole('button', {
        name: resolveMessage(prismeMessages, locale, 'openNavigation'),
        exact: true,
      })
      .click();
  await expect(paymentCompanyControl(page, locale)).toBeVisible();
  await expect(paymentCompanyControl(page, locale)).toBeDisabled();
  if (narrow)
    await page
      .getByRole('button', {
        name: resolveMessage(prismeMessages, locale, 'closeNavigation'),
        exact: true,
      })
      .click();
  expect(page.url()).toBe(url);
}

test('records literal observations, keeps the immutable uncertain command across four locales, independently confirms and reverses with copied facts and lineage', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow'),
    ready = await preparePaymentObservationCase(page, info.project.name);
  let identity: PaymentIdentity = paymentIdentities.reader;
  await page.route('**/api/**', (route) =>
    route.fallback({ headers: { ...route.request().headers(), ...identity } }),
  );
  let workspace = await openPaymentObservation(page, ready, narrow);
  await workspace
    .getByRole('button', { name: en.newObservation, exact: true })
    .click();
  await workspace
    .getByRole('button', { name: en.selectSource + ' 1', exact: true })
    .click();
  let panel = workspace.locator('.payment-observation-panel');
  await fillPaymentValues(panel, 'en', '1255.005');
  const literal = await panel
    .getByRole('textbox', { name: en.observationBasis, exact: true })
    .inputValue();
  const bodies: { body: string; key: string }[] = [];
  let reads = 0;
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/payments') && request.method() === 'GET') reads++;
    if (path === '/api/payments' && request.method() === 'POST')
      bodies.push({
        body: request.postData() ?? '',
        key: request.headers()['idempotency-key'] ?? '',
      });
  });
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: en.create, exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText(en.invalid);
  expect(bodies).toHaveLength(0);
  const baselineReads = reads;
  for (const locale of ['ro', 'ru', 'fr', 'en'] as const) {
    await selectOption(page.locator('#interface-locale'), { value: locale });
    const copy = paymentCopy[locale];
    await expect(panel.getByLabel(copy.amount, { exact: true })).toHaveValue(
      '1255.005',
    );
    await expect(
      panel.getByRole('textbox', {
        name: copy.observationBasis,
        exact: true,
      }),
    ).toHaveValue(literal);
    await panel.getByLabel(copy.amount, { exact: true }).focus();
    await expect(panel.getByLabel(copy.amount, { exact: true })).toBeFocused();
    await paymentScreenshot(page, info, `${locale}-invalid-literal-draft`);
  }
  expect(reads).toBe(baselineReads);
  expect(bodies).toHaveLength(0);
  await panel.getByLabel(en.amount, { exact: true }).fill('1255.00');
  let firstReceipt: unknown;
  let dropped = false;
  const dropCommitted = async (route: Route) => {
    if (route.request().method() !== 'POST' || dropped) return route.fallback();
    dropped = true;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    firstReceipt = await response.json();
    await route.abort('connectionfailed');
  };
  await page.route('**/api/payments', dropCommitted);
  await panel.getByRole('button', { name: en.create, exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText(en.uncertain);
  await expectCompanyDisabled({ page, locale: 'en', narrow });
  await expect(
    workspace.getByRole('button', { name: en.newObservation, exact: true }),
  ).toBeDisabled();
  const pendingReads = reads;
  for (const locale of ['ro', 'ru', 'fr', 'en'] as const) {
    await selectOption(page.locator('#interface-locale'), { value: locale });
    await expect(
      panel.getByRole('button', {
        name: paymentCopy[locale].retrySame,
        exact: true,
      }),
    ).toBeVisible();
    await expectCompanyDisabled({ page, locale, narrow });
  }
  expect(bodies).toHaveLength(1);
  expect(reads).toBe(pendingReads);
  await removeRoute(page, '**/api/payments', dropCommitted);
  const retry = page.waitForResponse(native('POST', '/payments'));
  await panel.getByRole('button', { name: en.retrySame, exact: true }).click();
  expect(await (await retry).json()).toEqual(firstReceipt);
  await expect(panel).toHaveCount(0);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  const id = paymentText(paymentObject(firstReceipt).paymentId);
  await expect(
    workspace.getByText(ready.primaryParty.legalName, { exact: true }).first(),
  ).toBeVisible();
  await exactPaymentDownload(
    page,
    workspace.getByRole('button', { name: en.download, exact: true }),
    ready.pdfA,
  );
  await supersedePaymentObservationSource(page, ready);
  await workspace.getByRole('button', { name: en.source, exact: true }).click();
  const nativeSource = page.locator('.payment-evidence-source').first();
  await expect(
    nativeSource.getByRole('heading', { name: 'Version 1 · Superseded' }),
  ).toBeVisible();
  await expect(
    nativeSource.getByRole('button', { name: 'Version 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    nativeSource.getByRole('button', { name: 'Version 2', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await exactPaymentDownload(
    page,
    nativeSource.getByRole('button', {
      name: 'Download Version 1 PDF',
      exact: true,
    }),
    ready.pdfA,
  );
  await paymentScreenshot(
    page,
    info,
    'native-exact-superseded-source-with-official-successor',
  );
  await page.goto('/#payments');
  await workspace.getByRole('button', { name: en.reload, exact: true }).click();
  await workspace
    .getByRole('button', { name: en.correct, exact: true })
    .click();
  panel = workspace.locator('.payment-observation-panel');
  await panel.getByLabel(en.amount, { exact: true }).fill('1255.50');
  await panel
    .getByRole('textbox', { name: en.reason, exact: true })
    .fill('  Literal correction Ș Ю 😀  ');
  const corrected = page.waitForResponse(
    native('POST', `/payments/${id}/commands`),
  );
  await panel.getByRole('button', { name: en.correct, exact: true }).click();
  expect((await corrected).status()).toBe(201);
  await expect(panel).toHaveCount(0);
  await expect(
    workspace.getByRole('button', { name: en.confirm, exact: true }),
  ).toHaveCount(0);
  const correctedDetail = await ready.read(
    `/payments/${id}`,
    ready.companyId,
    paymentIdentities.reader,
  );
  expect(paymentObject(correctedDetail.payment)).toMatchObject({
    revision: 2,
    state: 'DRAFT',
    values: { amountMinor: '125550' },
  });
  identity = paymentIdentities.confirmer;
  await page.reload();
  workspace = await openPaymentObservation(page, ready, narrow);
  await workspace
    .getByRole('button', {
      name: en.values + ' · ' + en.revision + ' 2',
      exact: true,
    })
    .click();
  await expect(
    workspace.getByRole('button', { name: en.newObservation, exact: true }),
  ).toHaveCount(0);
  await workspace
    .getByRole('button', { name: en.confirm, exact: true })
    .click();
  panel = workspace.locator('.payment-observation-panel');
  await panel
    .getByRole('textbox', { name: en.confirmationNote, exact: true })
    .fill('  Independent native human review Ș Ю 😀  ');
  await panel.getByRole('checkbox').check();
  const confirmed = page.waitForResponse(
    native('POST', `/payments/${id}/commands`),
  );
  await panel.getByRole('button', { name: en.confirm, exact: true }).click();
  expect((await confirmed).status()).toBe(201);
  await expect(panel).toHaveCount(0);
  const confirmedDetail = await ready.read(
      `/payments/${id}`,
      ready.companyId,
      paymentIdentities.confirmer,
    ),
    confirmation = paymentObject(confirmedDetail.payment).confirmation;
  identity = paymentIdentities.reverser;
  await page.reload();
  workspace = await openPaymentObservation(page, ready, narrow);
  await workspace
    .getByRole('button', {
      name: en.values + ' · ' + en.revision + ' 3',
      exact: true,
    })
    .click();
  await expect(
    workspace.getByRole('button', { name: en.download, exact: true }),
  ).toHaveCount(0);
  await expect(
    workspace.getByText(ready.primaryParty.legalName, { exact: true }).first(),
  ).toBeVisible();
  await workspace
    .getByRole('button', { name: en.reverse, exact: true })
    .click();
  panel = workspace.locator('.payment-observation-panel');
  await panel
    .getByRole('textbox', { name: en.reason, exact: true })
    .fill('  Human reversal, no bank refund Ș Ю 😀  ');
  const reversed = page.waitForResponse(
    native('POST', `/payments/${id}/commands`),
  );
  await panel.getByRole('button', { name: en.reverse, exact: true }).click();
  expect((await reversed).status()).toBe(201);
  await expect(panel).toHaveCount(0);
  expect(
    paymentObject(
      (
        await ready.read(
          `/payments/${id}`,
          ready.companyId,
          paymentIdentities.reverser,
        )
      ).payment,
    ),
  ).toMatchObject({
    revision: 4,
    state: 'REVERSED',
    confirmation,
    values: { amountMinor: '125550' },
  });
  await paymentScreenshot(
    page,
    info,
    'native-source-free-reversal-preserved-confirmation',
  );
  identity = paymentIdentities.reader;
  await page.reload();
  workspace = await openPaymentObservation(page, ready, narrow);
  await workspace
    .getByRole('button', {
      name: en.values + ' · ' + en.revision + ' 4',
      exact: true,
    })
    .click();
  await workspace
    .getByRole('button', { name: en.replace, exact: true })
    .click();
  await workspace
    .getByRole('button', { name: en.selectSource + ' 1', exact: true })
    .click();
  panel = workspace.locator('.payment-observation-panel');
  await fillPaymentValues(panel, 'en', '1255.75');
  await panel.getByRole('checkbox').check();
  const replacement = page.waitForResponse(native('POST', '/payments'));
  await panel.getByRole('button', { name: en.create, exact: true }).click();
  const replacementReceipt = paymentObject(await (await replacement).json());
  await expect(panel).toHaveCount(0);
  const successorId = paymentText(replacementReceipt.paymentId);
  expect(successorId).not.toBe(id);
  expect(
    paymentObject(
      (
        await ready.read(
          `/payments/${successorId}`,
          ready.companyId,
          paymentIdentities.reader,
        )
      ).payment,
    ),
  ).toMatchObject({ revision: 1, state: 'DRAFT', replacesClosedPaymentId: id });
  await workspace
    .getByRole('button', { name: en.replacesClosedPayment, exact: true })
    .click();
  await expect(
    workspace.getByRole('button', { name: en.replacementPayment, exact: true }),
  ).toBeVisible();
  await paymentScreenshot(page, info, 'native-lineage-and-complete-history');
  expect(await page.evaluate(() => window.location.href)).not.toContain(id);
  expect(
    await page.evaluate(() => JSON.stringify(window.history.state)),
  ).not.toContain(id);
});

test('requires a deliberate validated conflict reload and keeps a confirmed mutation as read-only retry after failed refresh', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow'),
    ready = await preparePaymentObservationCase(
      page,
      'Recovery-' + info.project.name,
    ),
    root = await createNativePayment(ready);
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: { ...route.request().headers(), ...paymentIdentities.reader },
    }),
  );
  const workspace = await openPaymentObservation(page, ready, narrow);
  await workspace
    .getByRole('button', {
      name: en.values + ' · ' + en.revision + ' 1',
      exact: true,
    })
    .click();
  await workspace
    .getByRole('button', { name: en.correct, exact: true })
    .click();
  const panel = workspace.locator('.payment-observation-panel');
  await panel.getByLabel(en.amount, { exact: true }).fill('2000.50');
  await panel
    .getByRole('textbox', { name: en.reason, exact: true })
    .fill('Literal stale draft correction');
  await ready.command(
    `/payments/${root.id}/commands`,
    {
      action: 'CORRECT_DRAFT',
      expectedRevision: 1,
      values: {
        amountMinor: '125575',
        currency: 'MDL',
        effectiveOn: '2026-01-15',
        method: 'A later editor',
        externalReference: null,
        observationBasis: 'Native concurrent material edit',
      },
      reason: 'A different native editor advanced the head',
    },
    ready.companyId,
  );
  const sent: { body: string; key: string }[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === `/api/payments/${root.id}/commands` &&
      request.method() === 'POST'
    )
      sent.push({
        body: request.postData() ?? '',
        key: request.headers()['idempotency-key'] ?? '',
      });
  });
  const stale = page.waitForResponse(
    native('POST', `/payments/${root.id}/commands`),
  );
  await panel.getByRole('button', { name: en.correct, exact: true }).click();
  expect((await stale).status()).toBe(409);
  await expect(panel.getByRole('alert')).toHaveText(en.conflict);
  await expect(
    panel.getByRole('button', { name: en.close, exact: true }),
  ).toHaveCount(0);
  await expect(
    workspace.getByRole('button', { name: en.back, exact: true }),
  ).toBeDisabled();
  await expect(
    workspace.getByRole('button', { name: en.newObservation, exact: true }),
  ).toBeDisabled();
  expect(sent).toHaveLength(1);
  let refuseRead = true;
  const failRead = (route: Route) =>
    route.request().method() === 'GET' && refuseRead
      ? route.abort('connectionfailed')
      : route.fallback();
  await page.route(`**/api/payments/${root.id}`, failRead);
  await panel.getByRole('button', { name: en.reload, exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText(en.conflict);
  expect(sent).toHaveLength(1);
  refuseRead = false;
  await panel.getByRole('button', { name: en.reload, exact: true }).click();
  await expect(panel.getByLabel(en.amount, { exact: true })).toBeEnabled();
  expect(sent).toHaveLength(1);
  await paymentScreenshot(
    page,
    info,
    'native-conflict-deliberate-current-reload',
  );
  await panel.getByLabel(en.amount, { exact: true }).fill('2001.00');
  await panel
    .getByRole('textbox', { name: en.reason, exact: true })
    .fill('New deliberate intention after reviewing current revision');
  let saved = false;
  const failOnlyRefresh = async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    saved = true;
    refuseRead = true;
    await route.fulfill({ response });
  };
  await page.route(`**/api/payments/${root.id}/commands`, failOnlyRefresh);
  await panel.getByRole('button', { name: en.correct, exact: true }).click();
  await expect(
    panel.getByText(en.refreshFailed, { exact: true }),
  ).toBeVisible();
  expect(saved).toBe(true);
  expect(sent).toHaveLength(2);
  expect(sent[1]?.key).not.toBe(sent[0]?.key);
  expect(JSON.parse(sent[1]?.body ?? '{}')).toMatchObject({
    expectedRevision: 2,
    values: { amountMinor: '200100' },
  });
  await paymentScreenshot(
    page,
    info,
    'native-confirmed-command-failed-refresh',
  );
  refuseRead = false;
  await panel.getByRole('button', { name: en.retryRead, exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(sent).toHaveLength(2);
  expect(
    paymentObject(
      (
        await ready.read(
          `/payments/${root.id}`,
          ready.companyId,
          paymentIdentities.reader,
        )
      ).payment,
    ),
  ).toMatchObject({ revision: 3, values: { amountMinor: '200100' } });
  await removeRoute(
    page,
    `**/api/payments/${root.id}/commands`,
    failOnlyRefresh,
  );
  await removeRoute(page, `**/api/payments/${root.id}`, failRead);
});
