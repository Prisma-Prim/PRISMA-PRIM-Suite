import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type Locator,
  type Page,
  type Response,
  type Route,
} from '@playwright/test';
import { selectOption } from './select-option';
import {
  administerPaymentRoles,
  exactPaymentDownload,
  openPaymentEvidence,
  paymentApiOrigin,
  paymentEvidenceArtifacts,
  paymentIdentities,
  paymentInteger,
  paymentObject,
  paymentText,
  preparePaymentEvidenceCase,
  type PaymentEvidenceCase,
  type PaymentIdentity,
} from './payment-evidence-source.acceptance.fixture';

const declaredSource =
  'Fictional manual notice\n<script>literalPaymentEvidence()</script> Ș Я é ' +
  'human-declared source '.repeat(7).trimEnd();
const payerUnavailable =
  'The frozen payer is unavailable with your current access.';

function nativeResponse(method: string, path: string) {
  return (response: Response) =>
    response.request().method() === method &&
    new URL(response.url()).pathname === '/api' + path;
}

async function fillRegistration(
  source: Locator,
  ready: PaymentEvidenceCase,
  kind: 'PRIMARY' | 'ADDITIONAL',
  title: string,
  receivedOn: string,
) {
  const form = source.getByRole('form', {
    name: 'Register payment evidence',
    exact: true,
  });
  await selectOption(form.getByLabel('Original Client', { exact: true }), {
    value: ready.clientId,
  });
  await expect(form.getByLabel('Exact payer', { exact: true })).toBeEnabled();
  await selectOption(form.getByLabel('Exact payer', { exact: true }), {
    value: kind === 'PRIMARY' ? 'PRIMARY' : ready.legalEntityId,
  });
  await form.getByLabel('Title', { exact: true }).fill(title);
  await form
    .getByLabel('Purpose', { exact: true })
    .fill(
      'Preserve fictional human-declared evidence; no Payment is recorded.',
    );
  await form
    .getByLabel('Declared source', { exact: true })
    .fill(declaredSource);
  await form.getByLabel('Received on', { exact: true }).fill(receivedOn);
  return form;
}

async function uploadPdf(
  page: Page,
  source: Locator,
  documentId: string,
  versionId: string,
  name: string,
  bytes: Buffer,
) {
  const upload = source.locator('.payment-evidence-pdf-upload');
  await upload
    .getByLabel('Choose the PDF file', { exact: true })
    .setInputFiles({
      name,
      mimeType: 'application/pdf',
      buffer: bytes,
    });
  const pending = page.waitForResponse(
    nativeResponse(
      'POST',
      `/documents/${documentId}/versions/${versionId}/content`,
    ),
  );
  await upload
    .getByRole('button', { name: 'Preserve PDF', exact: true })
    .click();
  const response = await pending;
  expect(response.status()).toBe(201);
  await expect(
    source
      .locator('.payment-evidence-pdf-read')
      .getByText(name, { exact: true }),
  ).toBeVisible();
  return {
    receipt: paymentObject(await response.json()),
    url: response.url(),
    key: paymentText(response.request().headers()['idempotency-key']),
  };
}

async function changeFrame(page: Page, frame: 'classic' | 'prisme') {
  // The same legacy URL transition as classic-compatibility.ts, without reload.
  await page.evaluate((next) => {
    const url = new URL(window.location.href);
    if (next === 'classic') url.searchParams.set('frame', 'classic');
    else url.searchParams.delete('frame');
    window.history.pushState(window.history.state, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, frame);
  if (frame === 'prisme')
    await expect(page.locator('.prisme-shell')).toBeVisible();
  else
    await expect(page.locator('.production-shell')).not.toHaveClass(
      /prisme-shell/u,
    );
}

async function expectProtectedSourceNavigation(
  page: Page,
  source: Locator,
  narrow: boolean,
) {
  await expect(
    page.getByLabel('Active Company', { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Other Documents', exact: true }),
  ).toBeDisabled();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Clients', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe('#documents');
  await expect(source).toBeVisible();
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.evaluate(() => {
    const next = new URL(window.location.href);
    next.hash = 'clients';
    window.history.pushState(window.history.state, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe('#documents');
  await expect(source).toBeVisible();
}

for (const kind of ['PRIMARY', 'ADDITIONAL'] as const) {
  test(`preserves the ${kind} payer source and native PDF Version history without commercial prerequisites`, async ({
    page,
  }, info) => {
    // Same bounded budget as the comparable native external Source journey.
    test.setTimeout(180_000);
    const narrow = info.project.name.endsWith('narrow');
    const suffix = `${kind}-${narrow ? 'Narrow' : 'Desktop'}`;
    let identity: PaymentIdentity = paymentIdentities.owner;
    await page.route('**/api/**', (route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...identity },
      }),
    );
    const ready = await preparePaymentEvidenceCase(page, suffix);
    const artifacts = paymentEvidenceArtifacts(info);
    await administerPaymentRoles(page, ready);
    // Recorder is itself a useful read alternative; none of the other three is required.
    for (const role of ['reader', 'confirmer', 'reverser'])
      await ready.revoke(`company-payment-${role}`);
    let source = await openPaymentEvidence(page, ready, narrow);
    const title = `Fictional evidence ${suffix} <literal>`;
    const correctedTitle = `${title} corrected`;
    const receivedOn = kind === 'PRIMARY' ? '' : '2026-01-15';
    const expectedParty =
      kind === 'PRIMARY' ? ready.primaryParty : ready.additionalParty;
    const form = await fillRegistration(source, ready, kind, title, receivedOn);
    const registered = page.waitForResponse(
      nativeResponse('POST', '/documents'),
    );
    await form
      .getByRole('button', { name: 'Preserve evidence source', exact: true })
      .click();
    const response = await registered;
    expect(response.status()).toBe(201);
    const saved = paymentObject(await response.json());
    const documentId = paymentText(saved.id);
    const firstVersionId = paymentText(paymentObject(saved.version).id);
    const immutableSource = paymentObject(saved.paymentEvidenceSource);
    expect(immutableSource).toMatchObject({
      format: 'PAYMENT_EVIDENCE_SOURCE/1',
      receivingCompanyLabel: ready.companyName,
      sourceDescription: declaredSource,
      receivedOn: receivedOn || null,
      payer: { kind: 'AVAILABLE', party: expectedParty },
    });
    expect(saved).not.toHaveProperty('projectAssociation');
    expect(paymentObject(saved.version).representation).toBeNull();
    await expect(
      source.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      source.getByText(declaredSource, { exact: true }),
    ).toBeVisible();
    await expect(
      source
        .getByRole('region', { name: 'Exact payer', exact: true })
        .getByText(paymentText(expectedParty.legalName), { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => 'literalPaymentEvidence' in window)).toBe(
      false,
    );
    await expect(
      source.getByRole('button', { name: 'Add reference', exact: true }),
    ).toHaveCount(0);

    await source
      .getByRole('button', { name: 'Correct draft metadata', exact: true })
      .click();
    const correction = source.locator('form').filter({
      has: page.getByRole('button', {
        name: 'Save metadata correction',
        exact: true,
      }),
    });
    await correction.getByLabel('Title', { exact: true }).fill(correctedTitle);
    await correction
      .getByLabel('Purpose', { exact: true })
      .fill('Corrected literal purpose Ș Я é');
    const detailPath = `/documents/${documentId}`;
    const detailRoute = '**/api' + detailPath;
    let correctionPatches = 0;
    let correctionCommitted = false;
    let failedDetailReads = 0;
    const observeCorrection = (response: Response) => {
      if (
        nativeResponse('PATCH', detailPath)(response) &&
        response.status() === 200
      )
        correctionCommitted = true;
    };
    const failCommittedRefresh = async (route: Route) => {
      if (route.request().method() === 'PATCH') correctionPatches += 1;
      if (
        route.request().method() === 'GET' &&
        correctionCommitted &&
        failedDetailReads === 0
      ) {
        failedDetailReads += 1;
        await route.abort('connectionreset');
        return;
      }
      // Preserve the real identity fallback and all native business responses.
      await route.fallback();
    };
    if (kind === 'PRIMARY') {
      page.on('response', observeCorrection);
      await page.route(detailRoute, failCommittedRefresh);
    }
    try {
      const corrected = page.waitForResponse(
        nativeResponse('PATCH', detailPath),
      );
      await correction
        .getByRole('button', { name: 'Save metadata correction', exact: true })
        .click();
      expect((await corrected).status()).toBe(200);
      if (kind === 'PRIMARY') {
        const refreshFailed = source.getByRole('alert').filter({
          hasText:
            'The save was confirmed, but the evidence could not be refreshed. Retry only the read.',
        });
        await expect(
          source.getByText('Metadata correction confirmed.', { exact: true }),
        ).toBeVisible();
        await expect(refreshFailed).toBeVisible();
        expect(failedDetailReads).toBe(1);
        expect(correctionPatches).toBe(1);
        await artifacts.screenshot(
          page,
          `${suffix}-confirmed-save-refresh-failed`,
        );
        const refreshed = page.waitForResponse(
          nativeResponse('GET', detailPath),
        );
        await refreshFailed
          .getByRole('button', { name: 'Reload evidence', exact: true })
          .click();
        const freshDetail = await refreshed;
        expect(freshDetail.status()).toBe(200);
        expect(paymentObject(await freshDetail.json()).title).toBe(
          correctedTitle,
        );
      }
      await expect(
        source.getByRole('heading', { name: correctedTitle, exact: true }),
      ).toBeVisible();
      await source
        .getByRole('button', {
          name: 'Show reference correction history',
          exact: true,
        })
        .click();
      await expect(
        source
          .getByRole('list', {
            name: 'Reference corrections, newest first',
            exact: true,
          })
          .getByText(title, { exact: true }),
      ).toBeVisible();
      if (kind === 'PRIMARY') {
        expect(correctionCommitted).toBe(true);
        expect(failedDetailReads).toBe(1);
        expect(correctionPatches).toBe(1);
      }
    } finally {
      if (kind === 'PRIMARY') {
        page.off('response', observeCorrection);
        await page.unroute(detailRoute, failCommittedRefresh);
      }
    }
    expect(
      (await ready.read(`/documents/${documentId}`, ready.companyId))
        .paymentEvidenceSource,
    ).toEqual(immutableSource);

    const uploadA = await uploadPdf(
      page,
      source,
      documentId,
      firstVersionId,
      'fictional-notice-a.pdf',
      ready.pdfA,
    );
    const uploadB = await uploadPdf(
      page,
      source,
      documentId,
      firstVersionId,
      'fictional-notice-b.pdf',
      ready.pdfB,
    );
    expect(uploadA.receipt.representationId).not.toBe(
      uploadB.receipt.representationId,
    );
    // Replay the actual first public command after B: it conserves A's receipt, not B's current slot.
    const replayA = await page.request.post(uploadA.url, {
      headers: {
        ...paymentIdentities.owner,
        'x-company-context-id': ready.companyId,
        'idempotency-key': uploadA.key,
        'content-type': 'application/pdf',
      },
      data: ready.pdfA,
    });
    expect(replayA.status()).toBe(201);
    expect(await replayA.json()).toEqual(uploadA.receipt);
    await exactPaymentDownload(
      page,
      source.getByRole('button', {
        name: 'Download Version 1 PDF',
        exact: true,
      }),
      ready.pdfB,
    );
    const firstHistory = await ready.read(
      `/documents/${documentId}/versions/${firstVersionId}/content/history`,
      ready.companyId,
    );
    expect(firstHistory.uploads).toHaveLength(2);

    // Native designation consumes neither Content Reader nor Content Uploader.
    await ready.revoke('company-document-content-reader');
    await ready.revoke('company-document-content-uploader');
    source = await openPaymentEvidence(page, ready, narrow, correctedTitle);
    await expect(
      source.getByRole('button', { name: /Download Version/u }),
    ).toHaveCount(0);
    await source
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    const designated = page.waitForResponse(
      nativeResponse(
        'POST',
        `/documents/${documentId}/versions/${firstVersionId}/official-designation`,
      ),
    );
    await source
      .getByRole('button', {
        name: 'Confirm official designation',
        exact: true,
      })
      .click();
    expect((await designated).status()).toBe(200);
    await ready.grant('company-document-content-reader');
    await ready.grant('company-document-content-uploader');
    source = await openPaymentEvidence(page, ready, narrow, correctedTitle);
    const drafted = page.waitForResponse(
      nativeResponse('POST', `/documents/${documentId}/versions`),
    );
    await source
      .getByRole('button', { name: 'Start new draft', exact: true })
      .click();
    const draftResponse = await drafted;
    expect(draftResponse.status()).toBe(201);
    const secondVersionId = paymentText(
      paymentObject(await draftResponse.json()).versionId,
    );
    await expect(
      source.getByRole('button', { name: 'Version 2', exact: true }),
    ).toBeVisible();
    await source
      .getByRole('button', { name: 'Version 2', exact: true })
      .click();
    await expect(
      source.getByText('This Version has no preserved PDF yet.', {
        exact: true,
      }),
    ).toBeVisible();
    const empty = await ready.read(
      `/documents/${documentId}/versions`,
      ready.companyId,
    );
    if (!Array.isArray(empty.versions))
      throw new Error('Missing native Versions');
    const second = empty.versions
      .map(paymentObject)
      .find((version) => version.id === secondVersionId);
    expect(second).toMatchObject({
      status: 'draft',
      pdfContent: { state: 'absent' },
    });
    await uploadPdf(
      page,
      source,
      documentId,
      secondVersionId,
      'fictional-notice-c.pdf',
      ready.pdfC,
    );
    await exactPaymentDownload(
      page,
      source.getByRole('button', {
        name: 'Download Version 2 PDF',
        exact: true,
      }),
      ready.pdfC,
    );
    await source
      .getByRole('button', { name: 'Version 1', exact: true })
      .click();
    await source
      .getByRole('button', { name: 'PDF history', exact: true })
      .click();
    const uploads = source
      .getByRole('list', { name: 'PDF history', exact: true })
      .getByRole('listitem');
    await expect(uploads).toHaveCount(2);
    await exactPaymentDownload(
      page,
      uploads
        .filter({ hasText: 'fictional-notice-a.pdf' })
        .getByRole('button', { name: 'Download Version 1 PDF', exact: true }),
      ready.pdfA,
    );
    await exactPaymentDownload(
      page,
      uploads
        .filter({ hasText: 'fictional-notice-b.pdf' })
        .getByRole('button', { name: 'Download Version 1 PDF', exact: true }),
      ready.pdfB,
    );
    await artifacts.screenshot(
      page,
      `${suffix}-official-v1-history-and-draft-v2`,
    );

    const currentClient = await ready.read(
      `/clients/${ready.clientId}`,
      ready.companyId,
    );
    const changed = await page.request.patch(
      paymentApiOrigin +
        (kind === 'PRIMARY'
          ? `/clients/${ready.clientId}`
          : `/clients/${ready.clientId}/legal-entities/${ready.legalEntityId}`),
      {
        headers: {
          ...paymentIdentities.owner,
          'x-company-context-id': ready.companyId,
          'idempotency-key': randomUUID(),
        },
        data:
          kind === 'PRIMARY'
            ? {
                expectedVersion: paymentInteger(currentClient.version),
                displayName: 'Changed live Client name',
                address: 'Changed live address',
              }
            : {
                expectedClientVersion: paymentInteger(currentClient.version),
                changes: {
                  legalName: 'Changed live additional entity',
                  legalAddress: 'Changed live address',
                },
              },
      },
    );
    expect(changed.status()).toBe(200);
    await source
      .getByRole('button', { name: 'Reload evidence', exact: true })
      .click();
    await expect(
      source
        .getByRole('region', { name: 'Exact payer', exact: true })
        .getByText(paymentText(expectedParty.legalName), { exact: true }),
    ).toBeVisible();
    expect(
      (await ready.read(`/documents/${documentId}`, ready.companyId))
        .paymentEvidenceSource,
    ).toEqual(immutableSource);

    // Manager reference-read remains; losing Company identity-read closes only the frozen payer.
    await ready.revoke('company-director-client');
    await source
      .getByRole('button', { name: 'Reload evidence', exact: true })
      .click();
    await expect(
      source.getByText(payerUnavailable, { exact: true }),
    ).toBeVisible();
    await expect(
      source.getByRole('region', { name: 'Exact payer', exact: true }),
    ).toHaveCount(0);
    await expect(
      source.getByRole('heading', { name: correctedTitle, exact: true }),
    ).toBeVisible();
    await expect(
      source.getByText(declaredSource, { exact: true }),
    ).toBeVisible();
    const withheld = paymentObject(
      (await ready.read(`/documents/${documentId}`, ready.companyId))
        .paymentEvidenceSource,
    );
    expect(withheld.payer).toEqual({ kind: 'UNAVAILABLE' });
    const { payer: unavailable, ...facts } = withheld;
    expect(unavailable).toEqual({ kind: 'UNAVAILABLE' });
    const { payer: frozen, ...originalFacts } = immutableSource;
    expect(frozen).toEqual({ kind: 'AVAILABLE', party: expectedParty });
    expect(facts).toEqual(originalFacts);
    await source
      .getByRole('button', { name: 'Version 2', exact: true })
      .click();
    await exactPaymentDownload(
      page,
      source.getByRole('button', {
        name: 'Download Version 2 PDF',
        exact: true,
      }),
      ready.pdfC,
    );
    await artifacts.screenshot(page, `${suffix}-payer-only-loss`);
    await ready.grant('company-director-client');
    await source
      .getByRole('button', { name: 'Reload evidence', exact: true })
      .click();
    await expect(
      source
        .getByRole('region', { name: 'Exact payer', exact: true })
        .getByText(paymentText(expectedParty.legalName), { exact: true }),
    ).toBeVisible();

    // A supported Reader survives Recorder removal, without granting any mutation.
    await ready.grant('company-payment-reader');
    await ready.revoke('company-payment-recorder');
    source = await openPaymentEvidence(page, ready, narrow, correctedTitle);
    await expect(
      source.getByRole('heading', { name: correctedTitle, exact: true }),
    ).toBeVisible();
    await expect(
      source.getByRole('button', {
        name: 'Correct draft metadata',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      source.getByRole('button', { name: 'Start new draft', exact: true }),
    ).toHaveCount(0);
    await source
      .getByRole('button', { name: 'Version 2', exact: true })
      .click();
    await exactPaymentDownload(
      page,
      source.getByRole('button', {
        name: 'Download Version 2 PDF',
        exact: true,
      }),
      ready.pdfC,
    );
    // Confirmer/Reverser are useful Source readers without Recorder or future action endpoints.
    for (const role of ['reader', 'confirmer', 'reverser'] as const) {
      const other = paymentIdentities[role];
      const memberId = paymentText(
        (await ready.read('/access/current-actor', undefined, other))
          .workspaceMembershipId,
      );
      for (const bundle of [
        'company-context',
        'company-director-client',
        'company-document-registrar',
        'company-payment-evidence-access',
        `company-payment-${role}`,
      ])
        await ready.grant(bundle, memberId);
      identity = other;
      source = await openPaymentEvidence(page, ready, narrow, correctedTitle);
      await expect(
        source.getByRole('heading', { name: correctedTitle, exact: true }),
      ).toBeVisible();
      await expect(
        source.getByRole('button', {
          name: 'Correct draft metadata',
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        source.getByRole('button', { name: 'Preserve PDF', exact: true }),
      ).toHaveCount(0);
    }
    await artifacts.screenshot(page, `${suffix}-independent-source-reader`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test('retains literal protected registration through four locales and both frames, then replays the real uncertain command after payer-only loss', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow');
  const suffix = `uncertain-${narrow ? 'Narrow' : 'Desktop'}`;
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: { ...route.request().headers(), ...paymentIdentities.owner },
    }),
  );
  const ready = await preparePaymentEvidenceCase(page, suffix);
  const artifacts = paymentEvidenceArtifacts(info);
  await administerPaymentRoles(page, ready);
  const source = await openPaymentEvidence(page, ready, narrow);
  const title = `Uncertain fictional source ${suffix}`;
  const form = await fillRegistration(
    source,
    ready,
    'ADDITIONAL',
    title,
    'unrecorded literal date',
  );
  const sourceFieldId = paymentText(
    await form
      .getByLabel('Declared source', { exact: true })
      .getAttribute('id'),
  );
  const dateFieldId = paymentText(
    await form.getByLabel('Received on', { exact: true }).getAttribute('id'),
  );
  const titleFieldId = paymentText(
    await form.getByLabel('Title', { exact: true }).getAttribute('id'),
  );
  const literalField = page.locator(`[id="${sourceFieldId}"]`);
  const dateField = page.locator(`[id="${dateFieldId}"]`);
  const titleField = page.locator(`[id="${titleFieldId}"]`);
  const originalField = await literalField.elementHandle();
  if (!originalField) throw new Error('Missing literal Source input');
  const traffic: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/documents'))
      traffic.push(request.method() + ' ' + request.url());
  });
  // An invalid keyboard submission stays local and associates its error with
  // the labeled input; tab order reaches the real native submit action.
  await titleField.fill('');
  await titleField.press('Enter');
  const validation = form.getByRole('alert');
  await expect(validation).toBeVisible();
  await expect(titleField).toBeFocused();
  await expect(titleField).toHaveAttribute(
    'aria-describedby',
    paymentText(await validation.getAttribute('id')),
  );
  expect(traffic.filter((entry) => entry.startsWith('POST '))).toHaveLength(0);
  await titleField.fill(title);
  await page.keyboard.press('Tab');
  await expect(form.getByLabel('Purpose', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(literalField).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dateField).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    form.getByRole('button', { name: 'Preserve evidence source', exact: true }),
  ).toBeFocused();
  const beforePresentation = traffic.length;
  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    await selectOption(page.locator('#interface-locale'), { value: locale });
    for (const frame of ['classic', 'prisme'] as const) {
      await changeFrame(page, frame);
      await expect(literalField).toHaveValue(declaredSource);
      await expect(dateField).toHaveValue('unrecorded literal date');
      await expect(titleField).toHaveValue(title);
      expect(
        await originalField.evaluate((element) => element.isConnected),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await artifacts.screenshot(
        page,
        `${suffix}-${locale}-${frame}-literal-draft`,
      );
      if (narrow && frame === 'classic') {
        await source
          .locator('.payment-evidence-registration h4')
          .scrollIntoViewIfNeeded();
        await artifacts.screenshot(
          page,
          `${suffix}-${locale}-${frame}-literal-draft-viewport`,
          { fullPage: false },
        );
      }
    }
  }
  expect(traffic).toHaveLength(beforePresentation);
  await dateField.fill('');

  const attempts: { key: string; body: string }[] = [];
  let releaseResponse = () => {};
  const release = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let reportCommitted: (saved: Record<string, unknown>) => void = () => {};
  let rejectCommitted: (error: unknown) => void = () => {};
  const committed = new Promise<Record<string, unknown>>((resolve, reject) => {
    reportCommitted = resolve;
    rejectCommitted = reject;
  });
  let first = true;
  await page.route('**/api/documents', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts.push({
      key: paymentText(route.request().headers()['idempotency-key']),
      body: paymentText(route.request().postData()),
    });
    if (!first) return route.fallback();
    first = false;
    // Forward to the actual server/scanner/Postgres, then lose only the browser response.
    try {
      const actual = await route.fetch({
        headers: { ...route.request().headers(), ...paymentIdentities.owner },
      });
      expect(actual.status()).toBe(201);
      reportCommitted(paymentObject(await actual.json()));
      await release;
      await route.abort('connectionreset');
    } catch (error) {
      rejectCommitted(error);
      await route.abort('failed');
    }
  });
  try {
    await form
      .getByRole('button', { name: 'Preserve evidence source', exact: true })
      .press('Enter');
    const saved = await committed;
    const documentId = paymentText(saved.id);
    await expect(
      page.getByRole('button', { name: 'Other Documents', exact: true }),
    ).toBeDisabled();
    const afterDispatch = traffic.length;
    await expectProtectedSourceNavigation(page, source, narrow);
    // Locale and frame changes preserve the disabled in-flight fields and one command.
    for (const locale of ['ro', 'ru', 'fr', 'en']) {
      await selectOption(page.locator('#interface-locale'), { value: locale });
      for (const frame of ['classic', 'prisme'] as const) {
        await changeFrame(page, frame);
        await expect(literalField).toHaveValue(declaredSource);
        await expect(literalField).toBeDisabled();
        await expect(dateField).toHaveValue('');
        expect(
          await originalField.evaluate((element) => element.isConnected),
        ).toBe(true);
        await artifacts.screenshot(
          page,
          `${suffix}-${locale}-${frame}-protected-dispatch`,
        );
        if (narrow && frame === 'classic') {
          await source
            .locator('.payment-evidence-registration h4')
            .scrollIntoViewIfNeeded();
          await artifacts.screenshot(
            page,
            `${suffix}-${locale}-${frame}-protected-dispatch-viewport`,
            { fullPage: false },
          );
        }
      }
    }
    expect(traffic).toHaveLength(afterDispatch);
    expect(attempts).toHaveLength(1);
    releaseResponse();
    await expect(
      source.getByText(
        'The registration outcome is uncertain. Retry the identical request safely.',
        { exact: true },
      ),
    ).toBeVisible();
    await expectProtectedSourceNavigation(page, source, narrow);
    await ready.revoke('company-director-client');
    const replayed = page.waitForResponse(nativeResponse('POST', '/documents'));
    await source
      .getByRole('button', {
        name: 'Retry identical evidence registration',
        exact: true,
      })
      .click();
    const replay = await replayed;
    expect(replay.status()).toBe(201);
    const conserved = paymentObject(await replay.json());
    expect(conserved.id).toBe(documentId);
    expect(paymentObject(conserved.paymentEvidenceSource)).toMatchObject({
      sourceDescription: declaredSource,
      receivedOn: null,
      payer: { kind: 'UNAVAILABLE' },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    await expect(
      source.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      source.getByText(payerUnavailable, { exact: true }),
    ).toBeVisible();
    // Fresh hydration proves no new-copy affordance under the now-current Actor.
    const hydrated = await openPaymentEvidence(page, ready, narrow, title);
    await expect(
      hydrated.getByRole('button', {
        name: 'Register payment evidence',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      hydrated.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    const inventory = hydrated
      .locator('.payment-evidence-inventory li')
      .filter({ has: page.getByText(title, { exact: true }) });
    await expect(inventory).toHaveCount(1);
    await artifacts.screenshot(
      page,
      `${suffix}-identical-replay-payer-unavailable`,
    );
  } finally {
    releaseResponse();
  }
});

test('opens native Client Document commands after selecting Source without replaying an older intent', async ({
  page,
}, info) => {
  // Same budget as the registered native Client–Document navigation journey.
  test.setTimeout(120_000);
  const narrow = info.project.name.endsWith('narrow');
  const suffix = `native-intent-${narrow ? 'Narrow' : 'Desktop'}`;
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: { ...route.request().headers(), ...paymentIdentities.owner },
    }),
  );
  const ready = await preparePaymentEvidenceCase(page, suffix);
  const artifacts = paymentEvidenceArtifacts(info);
  const ordinary: { id: string; title: string }[] = [];
  for (const letter of ['A', 'B']) {
    const title = `Ordinary questionnaire ${letter} ${suffix}`;
    const saved = await ready.command(
      '/documents',
      {
        clientId: ready.clientId,
        title,
        purpose: 'Preserve the existing native Document navigation command.',
        url: `https://example.test/native-source-navigation-${letter}`,
      },
      ready.companyId,
    );
    const id = paymentText(saved.id);
    expect((await ready.read(`/documents/${id}`, ready.companyId)).title).toBe(
      title,
    );
    ordinary.push({ id, title });
  }
  const [first, second] = ordinary;
  if (!first || !second) throw new Error('Missing native positive controls');
  await administerPaymentRoles(page, ready);
  await openPaymentEvidence(page, ready, narrow);
  const detailReads = new Map<string, number>();
  page.on('request', (request) => {
    if (request.method() !== 'GET') return;
    const document = ordinary.find(
      (item) => new URL(request.url()).pathname === `/api/documents/${item.id}`,
    );
    if (document)
      detailReads.set(document.id, (detailReads.get(document.id) ?? 0) + 1);
  });
  async function clientDossier() {
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Clients', exact: true })
      .click();
    const dossier = page.locator('.client-dossier-detail');
    const heading = dossier.getByRole('heading', {
      name: ready.clientName,
      exact: true,
    });
    if (!(await heading.isVisible()))
      await page
        .locator('.client-workspace')
        .getByRole('listitem')
        .filter({
          has: page.getByRole('heading', {
            name: ready.clientName,
            exact: true,
          }),
        })
        .getByRole('button', { name: 'Open dossier', exact: true })
        .click();
    await expect(heading).toBeVisible();
    return dossier;
  }
  const dossier = await clientDossier();
  await dossier
    .getByRole('button', { name: 'Open Client working Documents', exact: true })
    .click();
  const workspace = page.locator('.working-documents');
  await expect(page.locator('.payment-evidence-source')).toHaveCount(0);
  await expect(
    workspace.getByRole('searchbox', { name: 'Filter working Documents' }),
  ).toHaveValue(ready.clientName);
  for (const document of ordinary)
    await expect(
      workspace.getByRole('button', { name: document.title, exact: true }),
    ).toBeVisible();
  expect(detailReads.size).toBe(0);
  await artifacts.screenshot(page, `${suffix}-native-filter`);
  for (const [index, document] of [first, second, first].entries()) {
    await workspace
      .getByRole('button', { name: 'Payment evidence', exact: true })
      .click();
    const frame = index === 1 ? 'classic' : 'prisme';
    await changeFrame(page, frame);
    await expect(
      page.getByRole('form', {
        name: 'Register payment evidence',
        exact: true,
      }),
    ).toBeVisible();
    expect(detailReads.get(first.id) ?? 0).toBe(index === 0 ? 0 : 1);
    const current = await clientDossier();
    await current
      .getByRole('region', { name: 'Client Documents', exact: true })
      .getByRole('listitem')
      .filter({
        has: page.getByRole('heading', { name: document.title, exact: true }),
      })
      .getByRole('button', { name: 'Open Document', exact: true })
      .click();
    const heading = workspace.getByRole('heading', {
      name: document.title,
      exact: true,
    });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.locator('.payment-evidence-source')).toHaveCount(0);
    expect(detailReads.get(document.id)).toBe(index === 2 ? 2 : 1);
    await artifacts.screenshot(page, `${suffix}-${frame}-native-${index}`);
    if (narrow && frame === 'classic') {
      await heading.scrollIntoViewIfNeeded();
      await artifacts.screenshot(
        page,
        `${suffix}-${frame}-native-${index}-viewport`,
        {
          fullPage: false,
        },
      );
    }
  }
  expect(detailReads.get(first.id)).toBe(2);
  expect(detailReads.get(second.id)).toBe(1);
});

test('recovers definite evidence conflicts through native reload and a new deliberate command', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow');
  const suffix = `conflict-${narrow ? 'Narrow' : 'Desktop'}`;
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: { ...route.request().headers(), ...paymentIdentities.owner },
    }),
  );
  const ready = await preparePaymentEvidenceCase(page, suffix);
  const artifacts = paymentEvidenceArtifacts(info);
  await administerPaymentRoles(page, ready);
  const source = await openPaymentEvidence(page, ready, narrow);
  const title = `Fictional conflict recovery ${suffix}`;
  const form = await fillRegistration(source, ready, 'PRIMARY', title, '');
  const registered = page.waitForResponse(nativeResponse('POST', '/documents'));
  await form
    .getByRole('button', { name: 'Preserve evidence source', exact: true })
    .click();
  const registration = await registered;
  expect(registration.status()).toBe(201);
  const saved = paymentObject(await registration.json());
  const documentId = paymentText(saved.id);
  const versionId = paymentText(paymentObject(saved.version).id);
  const detailPath = `/documents/${documentId}`;
  const contentPath = `${detailPath}/versions/${versionId}/content`;
  await expect(
    source.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    source.getByLabel('Choose the PDF file', { exact: true }),
  ).toBeEnabled();
  const writes: {
    path: string;
    key: string;
    body: string | null;
    url: string;
  }[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      (request.method() === 'PATCH' && path === '/api' + detailPath) ||
      (request.method() === 'POST' && path === '/api' + contentPath)
    )
      writes.push({
        path,
        key: paymentText(request.headers()['idempotency-key']),
        body: request.postData(),
        url: request.url(),
      });
  });
  async function concurrentCorrection(nextTitle: string) {
    const current = await ready.read(detailPath, ready.companyId);
    const expectedRevision = paymentInteger(current.workingRevision);
    const response = await page.request.patch(paymentApiOrigin + detailPath, {
      headers: {
        ...paymentIdentities.owner,
        'x-company-context-id': ready.companyId,
        'idempotency-key': randomUUID(),
      },
      data: {
        expectedRevision,
        title: nextTitle,
        purpose: paymentText(current.purpose),
      },
    });
    expect(response.status()).toBe(200);
    const receipt = paymentObject(await response.json());
    expect(receipt).toMatchObject({
      documentId,
      outcome: 'corrected',
      revision: expectedRevision + 1,
    });
    return expectedRevision + 1;
  }
  async function viewport(name: string, anchor: Locator) {
    await anchor.scrollIntoViewIfNeeded();
    await artifacts.screenshot(page, `${suffix}-${name}-viewport`, {
      fullPage: false,
    });
  }
  const edit = source.getByRole('button', {
    name: 'Correct draft metadata',
    exact: true,
  });
  await edit.click();
  const correction = source.locator('form').filter({
    has: page.getByRole('button', {
      name: 'Save metadata correction',
      exact: true,
    }),
  });
  await correction.getByLabel('Title', { exact: true }).fill(`${title} stale`);
  const concurrentTitle = `${title} concurrently corrected`;
  const currentRevision = await concurrentCorrection(concurrentTitle);
  const refusedCorrection = page.waitForResponse(
    nativeResponse('PATCH', detailPath),
  );
  await correction
    .getByRole('button', { name: 'Save metadata correction', exact: true })
    .click();
  expect((await refusedCorrection).status()).toBe(409);
  await expect(
    source.getByText('The Document changed. Reload it before continuing.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(edit).toBeDisabled();
  expect(writes).toHaveLength(1);
  const staleCorrection = writes[0];
  if (!staleCorrection?.body)
    throw new Error('Missing native refused correction');
  expect(paymentObject(JSON.parse(staleCorrection.body)).expectedRevision).toBe(
    currentRevision - 1,
  );
  await viewport('metadata-conflict', edit);
  await source
    .getByRole('button', { name: 'Reload evidence', exact: true })
    .click();
  await expect(
    source.getByRole('heading', { name: concurrentTitle, exact: true }),
  ).toBeVisible();
  await expect(edit).toBeEnabled();
  expect(writes).toHaveLength(1);
  await viewport('metadata-reloaded', edit);
  await edit.click();
  await expect(correction.getByLabel('Title', { exact: true })).toHaveValue(
    concurrentTitle,
  );
  const recoveredTitle = `${title} deliberately recovered`;
  await correction.getByLabel('Title', { exact: true }).fill(recoveredTitle);
  const corrected = page.waitForResponse(nativeResponse('PATCH', detailPath));
  await correction
    .getByRole('button', { name: 'Save metadata correction', exact: true })
    .click();
  expect((await corrected).status()).toBe(200);
  await expect(
    source.getByRole('heading', { name: recoveredTitle, exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  const recoveredCorrection = writes[1];
  if (!recoveredCorrection?.body)
    throw new Error('Missing native recovered correction');
  expect(recoveredCorrection.key).not.toBe(staleCorrection.key);
  expect(
    paymentObject(JSON.parse(recoveredCorrection.body)).expectedRevision,
  ).toBe(currentRevision);

  const upload = source.locator('.payment-evidence-pdf-upload');
  const file = upload.getByLabel('Choose the PDF file', { exact: true });
  await expect(file).toBeEnabled();
  await file.setInputFiles({
    name: 'stale-conflict.pdf',
    mimeType: 'application/pdf',
    buffer: ready.pdfA,
  });
  const uploadTitle = `${title} concurrent upload revision`;
  const uploadRevision = await concurrentCorrection(uploadTitle);
  const refusedUpload = page.waitForResponse(
    nativeResponse('POST', contentPath),
  );
  await upload
    .getByRole('button', { name: 'Preserve PDF', exact: true })
    .click();
  expect((await refusedUpload).status()).toBe(409);
  await expect(
    source.getByText('This Document changed. Reload it before trying again.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(file).toBeDisabled();
  expect(writes).toHaveLength(3);
  const staleUpload = writes[2];
  if (!staleUpload) throw new Error('Missing native refused upload');
  expect(new URL(staleUpload.url).searchParams.get('expectedRevision')).toBe(
    String(uploadRevision - 1),
  );
  await viewport('upload-conflict', file);
  await source
    .getByRole('button', { name: 'Reload evidence', exact: true })
    .click();
  await expect(
    source.getByRole('heading', { name: uploadTitle, exact: true }),
  ).toBeVisible();
  await expect(file).toBeEnabled();
  await expect(file).toHaveValue('');
  await expect(
    upload.getByRole('button', { name: 'Preserve PDF', exact: true }),
  ).toBeDisabled();
  expect(writes).toHaveLength(3);
  await viewport('upload-reloaded', file);
  const preserved = await uploadPdf(
    page,
    source,
    documentId,
    versionId,
    'recovered-conflict.pdf',
    ready.pdfB,
  );
  expect(preserved.key).not.toBe(staleUpload.key);
  expect(new URL(preserved.url).searchParams.get('expectedRevision')).toBe(
    String(uploadRevision),
  );
  expect(preserved.receipt.workingRevision).toBe(uploadRevision + 1);
  expect(writes).toHaveLength(4);
  await exactPaymentDownload(
    page,
    source.getByRole('button', { name: 'Download Version 1 PDF', exact: true }),
    ready.pdfB,
  );
  const current = await ready.read(detailPath, ready.companyId);
  expect(current.paymentEvidenceSource).toEqual(saved.paymentEvidenceSource);
  await viewport(
    'recovered-pdf',
    source
      .locator('.payment-evidence-pdf-read')
      .getByText('recovered-conflict.pdf', { exact: true }),
  );
});
