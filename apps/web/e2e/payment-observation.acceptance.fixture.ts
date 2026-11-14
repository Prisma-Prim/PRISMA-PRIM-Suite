import { companyContextMessages } from '../src/company/company-context.copy';
import { resolveMessage } from '../src/localization/messages';
import { randomUUID } from 'node:crypto';
import {
  expect,
  type Page,
  type Locator,
  type TestInfo,
} from '@playwright/test';
import {
  paymentApiOrigin,
  paymentIdentities,
  paymentObject,
  paymentText,
  paymentInteger,
  preparePaymentEvidenceCase,
  paymentEvidenceArtifacts,
} from './payment-evidence-source.acceptance.fixture';
import { selectOption } from './select-option';
import {
  paymentCopy,
  type PaymentLocale,
} from '../src/payment-observation/ui/payment-copy';

export async function preparePaymentObservationCase(
  page: Page,
  suffix: string,
) {
  const sourceCase = await preparePaymentEvidenceCase(
    page,
    'Observation-' + suffix,
  );
  const { companyId } = sourceCase;
  await sourceCase.grant('company-payment-recorder');
  await sourceCase.grant('company-payment-evidence-access');
  const memberships: Record<'reader' | 'confirmer' | 'reverser', string> = {
    reader: '',
    confirmer: '',
    reverser: '',
  };
  for (const name of ['reader', 'confirmer', 'reverser'] as const)
    memberships[name] = paymentText(
      (
        await sourceCase.read(
          '/access/current-actor',
          undefined,
          paymentIdentities[name],
        )
      ).workspaceMembershipId,
    );
  for (const name of ['reader', 'confirmer', 'reverser'] as const) {
    for (const bundle of name === 'reverser'
      ? ['company-context', 'company-payment-reverser']
      : [
          'company-context',
          'company-director-client',
          'company-document-registrar',
          'company-document-content-reader',
          'company-payment-evidence-access',
          ...(name === 'reader'
            ? [
                'company-payment-reader',
                'company-payment-recorder',
                'company-payment-confirmer',
              ]
            : ['company-payment-confirmer']),
        ])
      await sourceCase.grant(bundle, memberships[name]);
  }
  const document = await sourceCase.command(
    '/documents',
    {
      type: 'payment-evidence',
      clientId: sourceCase.clientId,
      payer: { kind: 'PRIMARY' },
      title: 'Fictional exact observation Source ' + suffix,
      purpose: 'Preserve synthetic evidence for a manual human declaration',
      sourceDescription: 'Fictional notice, no bank or fiscal proof',
      receivedOn: null,
    },
    companyId,
  );
  const documentId = paymentText(document.id),
    documentVersionId = paymentText(paymentObject(document.version).id);
  const uploaded = await page.request.post(
    `${paymentApiOrigin}/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-payment-observation.pdf`,
    {
      headers: {
        ...paymentIdentities.owner,
        'x-company-context-id': companyId,
        'content-type': 'application/pdf',
        'idempotency-key': randomUUID(),
      },
      data: sourceCase.pdfA,
    },
  );
  expect(uploaded.status()).toBe(201);
  const representationId = paymentText(
    paymentObject(await uploaded.json()).representationId,
  );
  const official = await page.request.post(
    `${paymentApiOrigin}/documents/${documentId}/versions/${documentVersionId}/official-designation`,
    {
      headers: {
        ...paymentIdentities.owner,
        'x-company-context-id': companyId,
        'idempotency-key': randomUUID(),
      },
      data: { expectedRevision: 2 },
    },
  );
  expect(official.status()).toBe(200);
  return {
    ...sourceCase,
    memberships,
    source: { documentId, documentVersionId, representationId },
  };
}
export type PaymentObservationCase = Awaited<
  ReturnType<typeof preparePaymentObservationCase>
>;
/** Native official successor; the observation deliberately keeps its original tuple. */
export async function supersedePaymentObservationSource(
  page: Page,
  ready: PaymentObservationCase,
) {
  const documentId = ready.source.documentId;
  const drafted = await ready.command(
    `/documents/${documentId}/versions`,
    { expectedRevision: 3 },
    ready.companyId,
  );
  const versionId = paymentText(drafted.versionId);
  const uploaded = await page.request.post(
    `${paymentApiOrigin}/documents/${documentId}/versions/${versionId}/content?expectedRevision=4&fileName=fictional-successor.pdf`,
    {
      headers: {
        ...paymentIdentities.owner,
        'x-company-context-id': ready.companyId,
        'content-type': 'application/pdf',
        'idempotency-key': randomUUID(),
      },
      data: ready.pdfB,
    },
  );
  expect(uploaded.status()).toBe(201);
  const official = await page.request.post(
    `${paymentApiOrigin}/documents/${documentId}/versions/${versionId}/official-designation`,
    {
      headers: {
        ...paymentIdentities.owner,
        'x-company-context-id': ready.companyId,
        'idempotency-key': randomUUID(),
      },
      data: { expectedRevision: 5 },
    },
  );
  expect(official.status()).toBe(200);
  return versionId;
}
export function paymentCompanyControl(
  page: Page,
  locale: PaymentLocale = 'en',
) {
  return page.getByRole('combobox', {
    name: resolveMessage(companyContextMessages, locale, 'activeCompany'),
    exact: true,
  });
}
export async function openPaymentObservation(
  page: Page,
  ready: PaymentObservationCase,
  narrow: boolean,
) {
  await page.goto('/#payments');
  await expect(page.getByRole('banner')).toBeVisible();
  if (narrow)
    await page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click();
  await selectOption(paymentCompanyControl(page), {
    value: ready.companyId,
  });
  if (narrow)
    await page
      .getByRole('button', { name: 'Close navigation', exact: true })
      .click();
  await page.goto('/#payments');
  const workspace = page.locator('.payment-observation').first();
  await expect(workspace).toBeVisible();
  return workspace;
}
export async function fillPaymentValues(
  panel: Locator,
  locale: PaymentLocale,
  amount: string,
) {
  const copy = paymentCopy[locale];
  await panel.getByLabel(copy.amount, { exact: true }).fill(amount);
  await selectOption(panel.getByLabel(copy.currency, { exact: true }), {
    value: 'MDL',
  });
  await panel.getByLabel(copy.effectiveOn, { exact: true }).fill('2026-01-15');
  await panel
    .getByLabel(copy.method, { exact: true })
    .fill('  Manual notice <literal> Ș Ю 😀  ');
  await panel
    .getByLabel(copy.externalReference, { exact: true })
    .fill('  FICT-OBS-1047  ');
  await panel
    .getByRole('textbox', { name: copy.observationBasis, exact: true })
    .fill('  Human declaration <script>literalObservation()</script> Ș Ю 😀  ');
}
const originalArtifacts = new WeakMap<
  TestInfo,
  ReturnType<typeof paymentEvidenceArtifacts>
>();
export async function paymentScreenshot(
  page: Page,
  info: TestInfo,
  name: string,
) {
  let artifacts = originalArtifacts.get(info);
  if (!artifacts) {
    artifacts = paymentEvidenceArtifacts(info);
    originalArtifacts.set(info, artifacts);
  }
  await artifacts.screenshot(page, name, { fullPage: false });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
export async function createNativePayment(
  ready: PaymentObservationCase,
  amountMinor = '125500',
) {
  const result = await ready.command(
    '/payments',
    {
      source: ready.source,
      values: {
        amountMinor,
        currency: 'MDL',
        effectiveOn: '2026-01-15',
        method: 'Manual native preparation',
        externalReference: null,
        observationBasis: 'Fictional declaration',
      },
      acknowledgeObservedDeclaration: true,
      replacesClosedPaymentId: null,
    },
    ready.companyId,
    paymentIdentities.reader,
  );
  return {
    id: paymentText(result.paymentId),
    revision: paymentInteger(result.revision),
  };
}
