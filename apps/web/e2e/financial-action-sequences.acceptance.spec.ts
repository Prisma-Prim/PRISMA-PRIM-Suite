import { type Route } from '@playwright/test';
import { expect, test, expectApiFailure } from './ui-chaos.fixture';
import { removeRoute } from './route-removal';
import { selectOption } from './select-option';
import {
  paymentIdentities,
  paymentObject,
  paymentText,
} from './payment-evidence-source.acceptance.fixture';
import {
  fillPaymentValues,
  openPaymentObservation,
  paymentCompanyControl,
  paymentScreenshot,
  preparePaymentObservationCase,
} from './payment-observation.acceptance.fixture';
import { paymentCopy } from '../src/payment-observation/ui/payment-copy';
import { resolveMessage } from '../src/localization/messages';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import { runBrowserSequences } from './browser-sequences.fixture';
import { paymentSequenceAdapter } from './payment-browser-sequences.fixture';
import { invoiceSequenceAdapter } from './invoice-browser-sequences.fixture';

test('retains one native Payment outcome through lost reply, locale change and immediate repeated retry', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const ready = await preparePaymentObservationCase(
    page,
    'Sequence-' + info.project.name,
  );
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: { ...route.request().headers(), ...paymentIdentities.reader },
    }),
  );
  const workspace = await openPaymentObservation(
    page,
    ready,
    info.project.name.endsWith('narrow'),
  );
  await workspace
    .getByRole('button', { name: paymentCopy.en.newObservation, exact: true })
    .click();
  await workspace
    .getByRole('button', {
      name: paymentCopy.en.selectSource + ' 1',
      exact: true,
    })
    .click();
  const panel = workspace.locator('.payment-observation-panel');
  await fillPaymentValues(panel, 'en', '1255.00');
  const literal = await panel
    .getByRole('textbox', {
      name: paymentCopy.en.observationBasis,
      exact: true,
    })
    .inputValue();
  await panel.getByRole('checkbox').check();

  const sent: { body: string; key: string }[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/payments'
    )
      sent.push({
        body: request.postData() ?? '',
        key: request.headers()['idempotency-key'] ?? '',
      });
  });
  let receipt: unknown;
  let dropped = false;
  const dropCommitted = async (route: Route) => {
    if (route.request().method() !== 'POST' || dropped) return route.fallback();
    dropped = true;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    receipt = await response.json();
    expectApiFailure({
      page,
      request: route.request(),
      reason:
        'Native create committed; its first receipt is deliberately lost.',
    });
    await route.abort('connectionfailed');
  };
  await page.route('**/api/payments', dropCommitted);
  await panel
    .getByRole('button', { name: paymentCopy.en.create, exact: true })
    .click();
  await expect(panel.getByRole('alert')).toHaveText(paymentCopy.en.uncertain);
  await selectOption(page.locator('#interface-locale'), { value: 'fr' });
  await expect(
    panel.getByRole('textbox', {
      name: paymentCopy.fr.observationBasis,
      exact: true,
    }),
  ).toHaveValue(literal);
  const narrow = info.project.name.endsWith('narrow');
  if (narrow)
    await page
      .getByRole('button', {
        name: resolveMessage(prismeMessages, 'fr', 'openNavigation'),
        exact: true,
      })
      .click();
  await expect(paymentCompanyControl(page, 'fr')).toBeVisible();
  await expect(paymentCompanyControl(page, 'fr')).toBeDisabled();
  if (narrow)
    await page
      .getByRole('button', {
        name: resolveMessage(prismeMessages, 'fr', 'closeNavigation'),
        exact: true,
      })
      .click();
  expect(sent).toHaveLength(1);
  await removeRoute(page, '**/api/payments', dropCommitted);

  const replay = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/payments',
  );
  await panel
    .getByRole('button', { name: paymentCopy.fr.retrySame, exact: true })
    .evaluate((button) => {
      if (!(button instanceof HTMLButtonElement))
        throw new Error('Expected retry button');
      button.click();
      button.click();
    });
  expect(await (await replay).json()).toEqual(receipt);
  await expect(panel).toHaveCount(0);
  expect(sent).toHaveLength(2);
  const [original, retried] = sent;
  if (!original || !retried)
    throw new Error('Expected original and replay requests');
  expect(original.key).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(retried).toEqual(original);
  const id = paymentText(paymentObject(receipt).paymentId);
  const current = await ready.read(
    '/payments/' + id,
    ready.companyId,
    paymentIdentities.reader,
  );
  expect(current).toMatchObject({
    payment: {
      id,
      revision: 1,
      state: 'DRAFT',
      values: {
        amountMinor: '125500',
        currency: 'MDL',
        effectiveOn: '2026-01-15',
        method: '  Manual notice <literal> Ș Ю 😀  ',
        observationBasis:
          '  Human declaration <script>literalObservation()</script> Ș Ю 😀  ',
      },
    },
    liveSource: {
      documentId: ready.source.documentId,
      documentVersionId: ready.source.documentVersionId,
      content: { representationId: ready.source.representationId },
    },
  });
  const inventory = await ready.read(
    '/payments',
    ready.companyId,
    paymentIdentities.reader,
  );
  expect(inventory.items).toHaveLength(1);
  await paymentScreenshot(page, info, 'sequence-payment-conserved-replay');
});

test.describe('generated financial sequences', () => {
  test.use({ chaosOwner: 'sequence' });
  test('explores generated native Payment action sequences', async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await runBrowserSequences({ page, info, adapter: paymentSequenceAdapter });
  });
  test('explores generated native Invoice Record action sequences', async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await runBrowserSequences({ page, info, adapter: invoiceSequenceAdapter });
  });
});
