import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  compactPdfText,
  inspectCommercialPdf,
} from '../../api/src/commercial-pdf/pdf-inspection.test-support.mjs';
import {
  prepareOfferMessageCase,
  installOfferMessagePrivacyProbe,
  offerMessageIdentities,
  object,
  text,
} from './offer-message-preparation.acceptance.fixture';
import { selectOption } from './select-option';

test('prepares and reviews literal fields from an exact native Offer after source and PDF controls', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await page.addInitScript(installOfferMessagePrivacyProbe);
  const ready = await prepareOfferMessageCase(
    page,
    `MESSAGE1043-${info.project.name}`,
  );
  const base = `/offers/opportunities/${ready.opportunityId}`;
  const native = object(
    (
      await ready.read(
        `${base}/versions/${ready.offerVersionId}`,
        ready.companyId,
      )
    ).offer,
  );
  const representation = object(object(native.version).representation);
  expect(representation.html).toContain('lang="ro"');
  const digest = createHash('sha256')
    .update(text(representation.html))
    .digest('hex');
  expect(representation.sha256).toBe(digest);
  const pdf = await page.request.get(
    `http://127.0.0.1:4174/api${base}/versions/${ready.offerVersionId}/pdf?sourceHtmlSha256=${digest}`,
    {
      headers: {
        ...offerMessageIdentities.preparer,
        'x-company-context-id': ready.companyId,
      },
    },
  );
  expect(pdf.status()).toBe(200);
  const pages = await inspectCommercialPdf(new Uint8Array(await pdf.body()));
  expect(pages.length).toBeGreaterThan(0);
  expect(pages.map((page) => page.text).join(' ')).toContain(digest);
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: {
        ...route.request().headers(),
        ...offerMessageIdentities.preparer,
      },
    }),
  );
  await page.goto('/');
  const narrow = info.project.name.endsWith('narrow');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: ready.companyName,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Client Requests', exact: true })
    .click();
  const workspace = page.locator('.commercial-intake-workspace');
  await workspace
    .getByRole('button')
    .filter({ has: page.getByText(ready.subject, { exact: true }) })
    .click();
  await expect(page.locator('.offer-panel')).toContainText(
    String(native.illustrativeReference),
  );
  await expect(
    page.locator('.offer-panel').getByRole('button', {
      name: 'Download exact Romanian HTML',
      exact: true,
    }),
  ).toBeEnabled();
  const prepare = page
    .locator('.offer-panel')
    .getByRole('button', { name: 'Prepare message', exact: true });
  await expect(prepare).toBeVisible();
  const actor = await ready.read('/access/current-actor', ready.companyId);
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('Managed local PostgreSQL is required.');
  const snapshot = async () => {
    // Discovery precedes the registered webServer's API build on cold CI.
    const { snapshotOfferMessageAcceptanceState } =
      await import('../../api/dist/offer/offer-message-snapshot.test-support.js');
    return snapshotOfferMessageAcceptanceState({
      baseDatabaseUrl: databaseUrl,
      workspaceId: text(actor.workspaceId),
      companyId: ready.companyId,
    });
  };
  const before = await snapshot();
  const network: string[] = [];
  const diagnostics: string[] = [];
  let observations = 0;
  let downloads = 0;
  page.on('request', (request) => {
    network.push(request.url(), request.postData() ?? '');
    if (request.url().includes('/message-preparation?')) observations += 1;
    if (request.url().includes('/pdf?')) downloads += 1;
  });
  page.on('console', (message) => diagnostics.push(message.text()));
  await prepare.click();
  const composer = page.locator('.offer-message-preparation');
  await expect(composer).toContainText('Immutable Offer party');
  await expect(composer).toContainText('Ada Ionescu');
  await expect(composer).toContainText('Romanian');
  await expect(composer).toContainText('non-official');
  const fields = composer.getByRole('textbox');
  await expect(fields).toHaveCount(3);
  const recipient = fields.nth(0);
  const subject = fields.nth(1);
  const body = fields.nth(2);
  await expect(recipient).toHaveAccessibleName('Recipient');
  await expect(subject).toHaveAccessibleName('Subject');
  await expect(body).toHaveAccessibleName('Message body');
  const review = composer.getByRole('button', {
    name: 'Review message',
    exact: true,
  });
  await expect(
    page.getByRole('textbox', { name: 'Recipient', exact: true }),
  ).toHaveValue('');
  await expect(
    page.getByRole('textbox', { name: 'Subject', exact: true }),
  ).toHaveValue('');
  await expect(
    page.getByRole('textbox', { name: 'Message body', exact: true }),
  ).toHaveValue('');
  const literal = {
    recipient: 'reader+Message1043@example.invalid',
    subject: ' Message1043 literal subject Șț Русский Français ☀️ ',
    body: ' Message1043 privacy canary\n<script>literalOnly()</script>\n\tȘț Русский Français a\u0306 e\u0301 ☀️ ',
  };
  await recipient.fill(' ' + literal.recipient);
  await subject.fill('first line\nsecond line');
  await body.fill(literal.body);
  await expect(recipient).toHaveValue(' ' + literal.recipient);
  await expect(subject).toHaveValue('first line\nsecond line');
  await expect(recipient).toHaveAttribute('aria-invalid', 'true');
  await expect(subject).toHaveAttribute('aria-invalid', 'true');
  await expect(review).toBeDisabled();
  await recipient.fill(literal.recipient);
  await expect(review).toBeDisabled();
  await subject.fill(literal.subject);
  await expect(review).toBeEnabled();
  await review.focus();
  await page.keyboard.press('Enter');
  await expect(composer).toContainText('Reviewed for this exact Offer');

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const [name, expected] of [
    ['Copy recipient', literal.recipient],
    ['Copy subject', literal.subject],
    ['Copy body', literal.body],
  ]) {
    await composer.getByRole('button', { name, exact: true }).click();
    await expect(composer).toContainText('The browser accepted this field');
    // Test-only readback of the real browser clipboard; product never reads it.
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      expected,
    );
  }
  expect(observations).toBe(4);
  const downloaded = page.waitForEvent('download');
  const pdfResponse = page.waitForResponse((response) =>
    response.url().includes(`/versions/${ready.offerVersionId}/pdf?`),
  );
  await composer
    .getByRole('button', { name: 'Download intended PDF', exact: true })
    .click();
  const attachment = await downloaded;
  expect(attachment.suggestedFilename()).toBe(
    `offer-${native.illustrativeReference}-v2-non-official-ro.pdf`,
  );
  const file = await attachment.path();
  if (!file)
    throw new Error('The exact download must expose its test artifact.');
  const bytes = new Uint8Array(await readFile(file));
  const response = await pdfResponse;
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    response.headers()['x-commercial-pdf-sha256'],
  );
  const content = (await inspectCommercialPdf(bytes))
    .map((page) => page.text)
    .join(' ');
  expect(content).toContain(digest);
  expect(content).toContain('Synthetic second version');
  await expect(composer).toContainText('PDF was offered to the browser');

  const calls = { observations, downloads };
  for (const frame of ['classic', 'prisme']) {
    await page.evaluate((frame) => {
      const url = new URL(location.href);
      if (frame === 'classic') url.searchParams.set('frame', frame);
      else url.searchParams.delete('frame');
      history.pushState(null, '', url);
      dispatchEvent(new PopStateEvent('popstate'));
    }, frame);
    await expect(page.locator('.production-shell')).toHaveClass(
      frame === 'prisme' ? /prisme-shell/u : /production-shell/u,
    );
    for (const { locale, names } of [
      { locale: 'ro', names: ['Destinatar', 'Subiect', 'Corpul mesajului'] },
      { locale: 'ru', names: ['Получатель', 'Тема', 'Текст сообщения'] },
      { locale: 'fr', names: ['Destinataire', 'Objet', 'Corps du message'] },
      { locale: 'en', names: ['Recipient', 'Subject', 'Message body'] },
    ] satisfies { locale: string; names: [string, string, string] }[]) {
      const language = page.locator('#interface-locale');
      if (!(await language.isVisible()))
        await page.locator('.production-menu-button').click();
      await selectOption(language, locale);
      const menu = page.locator('.production-menu-button');
      if (narrow && (await menu.getAttribute('aria-expanded')) === 'true')
        await menu.click();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(recipient).toHaveAccessibleName(names[0]);
      await expect(subject).toHaveAccessibleName(names[1]);
      await expect(body).toHaveAccessibleName(names[2]);
      await expect(recipient).toHaveValue(literal.recipient);
      await expect(subject).toHaveValue(literal.subject);
      await expect(body).toHaveValue(literal.body);
      await expect(
        composer.locator('.offer-message-actions button').nth(1),
      ).toBeEnabled();
      const imagePath = info.outputPath(
        `message-${frame}-${locale}-${info.project.name}.png`,
      );
      await composer.screenshot({ path: imagePath });
      await info.attach(`message-${frame}-${locale}-${info.project.name}`, {
        path: imagePath,
        contentType: 'image/png',
      });
    }
  }
  expect({ observations, downloads }).toEqual(calls);
  await subject.fill(literal.subject + ' edited');
  await expect(
    composer.getByRole('button', { name: 'Copy subject', exact: true }),
  ).toBeDisabled();
  await review.click();
  await page
    .locator('.offer-version-history')
    .getByRole('button', { name: 'Open version 1', exact: true })
    .click();
  await expect(composer).toHaveCount(0);
  const nativeVersion = page
    .locator('.offer-panel .offer-summary')
    .getByText('Version', { exact: true })
    .locator('xpath=following-sibling::dd[1]');
  await expect(nativeVersion).toHaveText('1');
  await prepare.click();
  await expect(recipient).toHaveValue('');
  await expect(subject).toHaveValue('');
  await expect(body).toHaveValue('');
  const historySource = object(
    object(
      (
        await ready.read(
          `${base}/versions/${ready.historicalVersionId}`,
          ready.companyId,
        )
      ).offer,
    ).version,
  );
  const historyDigest = text(object(historySource.representation).sha256);
  const historyDownload = page.waitForEvent('download');
  await composer
    .getByRole('button', { name: 'Download intended PDF', exact: true })
    .click();
  const historical = await historyDownload;
  expect(historical.suggestedFilename()).toBe(
    `offer-${native.illustrativeReference}-v1-non-official-ro.pdf`,
  );
  const historicalPath = await historical.path();
  if (!historicalPath) throw new Error('Historical PDF test artifact missing.');
  expect(
    (await inspectCommercialPdf(new Uint8Array(await readFile(historicalPath))))
      .map((page) => page.text)
      .join(' '),
  ).toContain(historyDigest);
  await recipient.fill(literal.recipient);
  await subject.fill(literal.subject);
  await body.fill(literal.body);
  const privacy: unknown[] = [
    await page.evaluate(() =>
      Reflect.get(window, '__offerMessagePrivacyEvents'),
    ),
  ];
  await page.reload();
  await expect(page.locator('.offer-message-preparation')).toHaveCount(0);
  await workspace
    .getByRole('button')
    .filter({ has: page.getByText(ready.subject, { exact: true }) })
    .click();
  await prepare.click();
  await expect(recipient).toHaveValue('');
  await expect(subject).toHaveValue('');
  await expect(body).toHaveValue('');
  await body.fill(literal.body);
  for (const name of [ready.otherCompanyName, ready.companyName]) {
    const company = page.getByLabel('Active Company', { exact: true });
    if (!(await company.isVisible()))
      await page.locator('.production-menu-button').click();
    await selectOption(company, { label: name });
    const menu = page.locator('.production-menu-button');
    if (narrow && (await menu.getAttribute('aria-expanded')) === 'true')
      await menu.click();
    await expect(composer).toHaveCount(0);
  }
  if (narrow) await page.locator('.production-menu-button').click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Client Requests', exact: true })
    .click();
  await workspace
    .getByRole('button')
    .filter({ has: page.getByText(ready.subject, { exact: true }) })
    .click();
  await prepare.click();
  await expect(recipient).toHaveValue('');
  await expect(subject).toHaveValue('');
  await expect(body).toHaveValue('');
  await composer
    .getByRole('button', { name: 'Close preparation', exact: true })
    .click();
  await workspace
    .getByRole('button', { name: 'Back to Requests', exact: true })
    .click();
  const english = ready.illustrative;
  await workspace
    .getByRole('button')
    .filter({ has: page.getByText(english.subject, { exact: true }) })
    .click();
  const englishLiteral = {
    recipient: 'reader+English1043@example.invalid',
    subject: ' English Message1043 manual draft ',
    body: ' Message1043 English privacy canary\nNo transmission is recorded here. ',
  };
  for (const selected of [
    { id: english.offerVersionId, number: 2 },
    { id: english.historicalVersionId, number: 1 },
  ]) {
    if (selected.number === 1)
      await page
        .locator('.offer-version-history')
        .getByRole('button', { name: 'Open version 1', exact: true })
        .click();
    await expect(nativeVersion).toHaveText(String(selected.number));
    const sourceOffer = object(
      (
        await ready.read(
          `/offers/opportunities/${english.opportunityId}/versions/${selected.id}`,
          ready.companyId,
        )
      ).offer,
    );
    const version = object(sourceOffer.version);
    const representation = object(version.representation);
    const html = text(representation.html);
    const sourceDigest = createHash('sha256').update(html).digest('hex');
    expect(representation.sha256).toBe(sourceDigest);
    expect(html).toContain('lang="en"');
    await expect(
      page
        .locator('.offer-panel')
        .locator('iframe[title="Illustrative Offer representation"]'),
    ).toHaveAttribute('srcdoc', html);
    await prepare.click();
    await expect(composer).toContainText('Illustrative · English');
    await expect(composer).toContainText('Immutable Offer party');
    await expect(recipient).toHaveValue('');
    await expect(subject).toHaveValue('');
    await expect(body).toHaveValue('');
    await recipient.fill(englishLiteral.recipient);
    await subject.fill(englishLiteral.subject);
    await body.fill(englishLiteral.body);
    await review.click();
    if (selected.number === 2) {
      const previousClipboard = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      const restoreClipboard = await page.evaluateHandle(() => {
        const clipboard = navigator.clipboard;
        const descriptor = Object.getOwnPropertyDescriptor(
          clipboard,
          'writeText',
        );
        Object.defineProperty(clipboard, 'writeText', {
          configurable: true,
          value: () =>
            Promise.reject(
              new DOMException('Synthetic denied write', 'NotAllowedError'),
            ),
        });
        return () => {
          if (descriptor)
            Object.defineProperty(clipboard, 'writeText', descriptor);
          else Reflect.deleteProperty(clipboard, 'writeText');
        };
      });
      try {
        await composer
          .getByRole('button', { name: 'Copy subject', exact: true })
          .click();
        await expect(composer).toContainText(
          'The clipboard write was not confirmed',
        );
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
          previousClipboard,
        );
        await expect(subject).toHaveValue(englishLiteral.subject);
        await expect(body).toHaveValue(englishLiteral.body);
        await composer
          .getByRole('button', {
            name: 'Select subject for manual copy',
            exact: true,
          })
          .click();
        await expect(subject).toBeFocused();
        expect(
          await subject.evaluate((node) =>
            node instanceof HTMLTextAreaElement
              ? { start: node.selectionStart, end: node.selectionEnd }
              : null,
          ),
        ).toEqual({ start: 0, end: englishLiteral.subject.length });
      } finally {
        await restoreClipboard.evaluate((restore) => restore());
        await restoreClipboard.dispose();
      }
      await composer
        .getByRole('button', { name: 'Copy subject', exact: true })
        .click();
      await expect(composer).toContainText('The browser accepted this field');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        englishLiteral.subject,
      );
    }
    for (const [name, value] of [
      ['Copy recipient', englishLiteral.recipient],
      ['Copy subject', englishLiteral.subject],
      ['Copy body', englishLiteral.body],
    ]) {
      await composer.getByRole('button', { name, exact: true }).click();
      await expect(composer).toContainText('The browser accepted this field');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        value,
      );
    }
    const offered = page.waitForEvent('download');
    const nativePdf = page.waitForResponse((response) =>
      response.url().includes(`/versions/${selected.id}/pdf?`),
    );
    await composer
      .getByRole('button', { name: 'Download intended PDF', exact: true })
      .click();
    const file = await offered;
    expect(file.suggestedFilename()).toBe(
      `offer-${sourceOffer.illustrativeReference}-v${selected.number}-non-official-en.pdf`,
    );
    const path = await file.path();
    if (!path) throw new Error('Native English PDF test artifact missing.');
    const bytes = new Uint8Array(await readFile(path));
    const response = await nativePdf;
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(response.headers()['cache-control']).toBe('private, no-store');
    expect(response.headers()['x-commercial-pdf-sha256']).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(
      object(
        JSON.parse(response.headers()['x-commercial-pdf-source'] ?? 'null'),
      ),
    ).toEqual({
      kind: 'offer',
      workspaceId: actor.workspaceId,
      companyId: ready.companyId,
      opportunityId: english.opportunityId,
      rootId: sourceOffer.id,
      reference: sourceOffer.illustrativeReference,
      versionId: selected.id,
      versionNumber: selected.number,
      createdAt: version.createdAt,
      sourceRendererVersion: 1,
      sourceHtmlSha256: sourceDigest,
      provenance: 'ILLUSTRATIVE',
      language: 'en',
      sourceRendererCode: 'OFFER_ILLUSTRATIVE',
    });
    const content = (await inspectCommercialPdf(bytes))
      .map((page) => page.text)
      .join(' ');
    expect(content).toContain(sourceDigest);
    expect(compactPdfText(content)).toContain(
      compactPdfText('Synthetic English service'),
    );
    await expect(composer).toContainText('PDF was offered to the browser');
    const imagePath = info.outputPath(
      `english-v${selected.number}-${info.project.name}.png`,
    );
    await composer.screenshot({ path: imagePath });
    await info.attach(`english-v${selected.number}-${info.project.name}`, {
      path: imagePath,
      contentType: 'image/png',
    });
    await composer
      .getByRole('button', { name: 'Close preparation', exact: true })
      .click();
  }
  privacy.push(
    await page.evaluate(() =>
      Reflect.get(window, '__offerMessagePrivacyEvents'),
    ),
  );
  const stored = await page.evaluate(async () => {
    const cacheContents: unknown[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys())
        cacheContents.push({
          url: request.url,
          value: await (await cache.match(request))?.text(),
        });
    }
    return {
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
      url: location.href,
      history: history.state,
      cacheContents,
    };
  });
  for (const output of [
    ...network,
    ...diagnostics,
    JSON.stringify(stored),
    JSON.stringify(privacy),
  ]) {
    expect(output).not.toContain('Message1043 privacy canary');
    expect(output).not.toContain(literal.recipient);
    expect(output).not.toContain(literal.subject);
    expect(output).not.toContain('Message1043 English privacy canary');
    expect(output).not.toContain(englishLiteral.recipient);
    expect(output).not.toContain(englishLiteral.subject);
  }
  const after = await snapshot();
  expect(after.business).toEqual(before.business);
  const rowsPath = info.outputPath('normalized-business-no-write.json');
  await writeFile(
    rowsPath,
    JSON.stringify(
      {
        before: before.business,
        after: after.business,
        identityProfiles: {
          before: before.identityProfiles,
          after: after.identityProfiles,
        },
      },
      null,
      2,
    ),
  );
  await info.attach('normalized-business-no-write', {
    path: rowsPath,
    contentType: 'application/json',
  });
  const privacyPath = info.outputPath('privacy-probe.json');
  await writeFile(
    privacyPath,
    JSON.stringify({ network, diagnostics, stored, privacy }, null, 2),
  );
  await info.attach('privacy-probe', {
    path: privacyPath,
    contentType: 'application/json',
  });
});
