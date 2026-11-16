import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Request, Route } from '@playwright/test';
import { expect, test, expectApiFailure } from './ui-chaos.fixture';
import { removeRoute } from './route-removal';
import { replaceSourceBeforePdfReply } from './document-held-download.fixture';
import { runBrowserSequences } from './browser-sequences.fixture';
import {
  documentVersionSequenceAdapter,
  documentPdfSequenceAdapter,
} from './document-browser-sequences.fixture';
import { expectValue, selectOption } from './select-option';
import { resolveMessage, formatMessage } from '../src/localization/messages';
import { documentPdfMessages } from '../src/documents/document-pdf.copy';
import { companyContextMessages } from '../src/company/company-context.copy';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import {
  prepareDocumentSequenceSource,
  documentIdentities,
  documentObject,
  documentText,
} from './document-sequence-source.fixture';

test.use({ actionTimeout: 20_000 });

test.describe('generated Document sequences', () => {
  test.use({ chaosOwner: 'sequence' });
  test('explores generated native Document Version action sequences', async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await runBrowserSequences({
      page,
      info,
      adapter: documentVersionSequenceAdapter,
    });
  });

  test('explores generated native Document PDF action sequences', async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await runBrowserSequences({
      page,
      info,
      adapter: documentPdfSequenceAdapter,
    });
  });
});

test('recovers a confirmed Version read while its authorized immutable PDF download is still pending', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const world = await documentVersionSequenceAdapter.open({
    page,
    info,
    trial: 1,
    initial: 'a',
  });
  const latch: { release?: () => void; captured?: () => void } = {};
  const holding = new Promise<void>((resolve) => {
    latch.release = resolve;
  });
  const captured = new Promise<void>((resolve) => {
    latch.captured = resolve;
  });
  let bytes: Buffer | undefined;
  let downloading = false;
  let received = false;
  const pattern = '**/api/documents/*/versions/*/content/*';
  const hold = async (route: Route) => {
    if (
      !/\/content\/[0-9a-f-]{36}$/iu.test(
        new URL(route.request().url()).pathname,
      )
    )
      return route.fallback();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    bytes = await response.body();
    if (!latch.captured) throw new Error('Expected the native PDF capture');
    latch.captured();
    await holding;
    await route.fulfill({ response });
  };
  const observeDownload = () => {
    received = true;
  };
  page.on('download', observeDownload);
  async function run(label: string) {
    const action = world
      .actions({ locale: 'en', variant: 'a' })
      .find((candidate) => candidate.label === label);
    if (!action) throw new Error(`Expected enabled native action: ${label}`);
    await action.run();
    await world.verify();
  }
  const errors: unknown[] = [];
  try {
    await page.route(pattern, hold);
    await run('designation-failed-read');
    await page
      .getByRole('button', { name: 'Download Version 1 PDF', exact: true })
      .click();
    await captured;
    downloading = true;
    await run('retry-confirmed-read-without-writing');
    expect(received).toBe(false);
  } catch (error) {
    errors.push(error);
  }
  try {
    if (!latch.release) throw new Error('Expected the native PDF release');
    const saved = downloading ? page.waitForEvent('download') : null;
    latch.release();
    if (saved) {
      const download = await saved;
      expect(download.suggestedFilename()).toBe('fictional-sequence-a.pdf');
      const file = await download.path();
      if (!file || !bytes)
        throw new Error('Expected the exact native PDF bytes');
      expect(await readFile(file)).toEqual(bytes);
    }
    await world.settle();
    await page.screenshot({
      path: info.outputPath('document-independent-read-recovery.png'),
      fullPage: true,
    });
  } catch (error) {
    errors.push(error);
  }
  page.off('download', observeDownload);
  for (const cleanup of [
    () => removeRoute(page, pattern, hold),
    () => world.dispose(),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, 'Native Document read recovery failed');
});

test('preserves native PDF retry bytes and freezes an official Version before starting its empty-PDF successor', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const source = await prepareDocumentSequenceSource(
    page,
    `${info.project.name}-${randomUUID()}`,
  );
  const identify = (route: Route) =>
    route.fallback({
      headers: { ...route.request().headers(), ...documentIdentities.member },
    });
  await page.route('**/api/**', identify);
  const contentPath = `/api/documents/${source.documentId}/versions/${source.firstVersionId}/content`;
  const sent: Array<{ body: Buffer | null; url: string; key: string }> = [];
  const observe = (request: Request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === contentPath
    )
      sent.push({
        body: request.postDataBuffer(),
        url: request.url(),
        key: request.headers()['idempotency-key'] ?? '',
      });
  };
  page.on('request', observe);
  let dropped = false;
  let receipt: unknown;
  const drop = async (route: Route) => {
    if (route.request().method() !== 'POST' || dropped) return route.fallback();
    dropped = true;
    const response = await route.fetch({
      headers: { ...route.request().headers(), ...documentIdentities.member },
    });
    expect(response.status()).toBe(201);
    receipt = await response.json();
    expectApiFailure({
      page,
      request: route.request(),
      reason:
        'The native PDF committed; its first durable receipt is deliberately lost.',
    });
    await route.abort('connectionfailed');
  };
  try {
    await page.goto('/');
    const narrow = info.project.name.endsWith('narrow');
    if (narrow)
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    const company = page.getByLabel('Active Company', { exact: true });
    await selectOption(company, { value: source.companyId });
    await expectValue(company, source.companyId);
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Working Documents', exact: true })
      .click();
    const documents = page.locator('.working-documents');
    await documents
      .getByRole('button', { name: source.title, exact: true })
      .click();
    await documents.getByLabel('Choose the PDF file').setInputFiles({
      name: 'fictional-original.pdf',
      mimeType: 'application/pdf',
      buffer: source.pdfA,
    });
    await page.route('**' + contentPath + '?*', drop);
    await documents
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(
      documents.getByRole('button', {
        name: 'Retry the same PDF',
        exact: true,
      }),
    ).toBeVisible();
    await removeRoute(page, '**' + contentPath + '?*', drop);
    expect(sent).toHaveLength(1);
    await selectOption(page.locator('#interface-locale'), { value: 'fr' });
    const retried = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === contentPath,
    );
    await documents
      .getByRole('button', {
        name: resolveMessage(documentPdfMessages, 'fr', 'retry'),
        exact: true,
      })
      .evaluate((button) => {
        if (!(button instanceof HTMLButtonElement))
          throw new Error('Expected an exact PDF retry control');
        button.click();
        button.click();
      });
    expect(await (await retried).json()).toEqual(receipt);
    await expect(
      documents.getByText('fictional-original.pdf', { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(2);
    const [first, second] = sent;
    if (!first || !second)
      throw new Error(
        'Expected one original PDF intention and its exact retry',
      );
    expect(first.body).toEqual(source.pdfA);
    expect(first.key).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(new URL(first.url).searchParams.get('expectedRevision')).toBe('1');
    expect(second).toEqual(first);
    const current = await source.versions();
    expect(current.revision).toBe(2);
    const firstVersion = current.versions[0];
    if (!firstVersion) throw new Error('Expected the native initial Version');
    const pdf = documentObject(firstVersion.pdfContent);
    expect(pdf.sha256).toBe(
      createHash('sha256').update(source.pdfA).digest('hex'),
    );
    const downloading = page.waitForEvent('download');
    await documents
      .getByRole('button', {
        name: formatMessage(
          resolveMessage(documentPdfMessages, 'fr', 'download'),
          { version: 1 },
        ),
        exact: true,
      })
      .click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('fictional-original.pdf');
    const downloaded = await download.path();
    if (!downloaded) throw new Error('Expected real downloaded PDF bytes');
    expect(await readFile(downloaded)).toEqual(source.pdfA);
    await selectOption(page.locator('#interface-locale'), { value: 'en' });
    await documents
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    await documents
      .getByRole('button', {
        name: 'Confirm official designation',
        exact: true,
      })
      .click();
    await expect(
      documents.getByText('Version 1 is now official.', { exact: true }),
    ).toBeVisible();
    const officialRow = documents.locator('.working-document-version').filter({
      has: page.getByRole('heading', { name: 'Version 1', exact: true }),
    });
    const appendedReference = `https://example.test/after-designation/${randomUUID()}`;
    await officialRow
      .getByLabel('HTTPS URL', { exact: true })
      .fill(appendedReference);
    await officialRow
      .getByRole('button', {
        name: 'Add reference to official Version',
        exact: true,
      })
      .click();
    await documents
      .getByRole('button', { name: 'Add irreversible reference', exact: true })
      .click();
    await expect(
      officialRow.locator('.working-document-version-references a'),
    ).toHaveCount(2);
    await documents
      .getByRole('button', { name: 'Start new draft', exact: true })
      .click();
    await expect(
      documents.getByRole('heading', { name: 'Version 2', exact: true }),
    ).toBeVisible();
    const after = await source.versions();
    expect(after.revision).toBe(5);
    const original = after.versions.find(
      (version) => version.id === source.firstVersionId,
    );
    const successor = after.versions.find((version) => version.number === 2);
    if (!original || !successor)
      throw new Error('Expected frozen predecessor and successor');
    expect(original.status).toBe('official');
    expect(original.pdfContent).toEqual(firstVersion.pdfContent);
    if (
      !Array.isArray(original.representations) ||
      !Array.isArray(firstVersion.representations)
    )
      throw new Error('Expected the preserved original references');
    expect(
      original.representations.slice(0, firstVersion.representations.length),
    ).toEqual(firstVersion.representations);
    expect(original.representations).toHaveLength(
      firstVersion.representations.length + 1,
    );
    expect(documentObject(original.representations.at(-1))).toMatchObject({
      url: appendedReference,
      appendedAfterDesignation: true,
    });
    expect(successor.status).toBe('draft');
    expect(successor.pdfContent).toEqual({ state: 'absent' });
    if (!Array.isArray(successor.representations))
      throw new Error('Expected copied native references');
    expect(
      successor.representations.map((entry) => documentObject(entry).url),
    ).toEqual([source.reference]);
    for (const status of [200, 403] satisfies Array<200 | 403>) {
      await replaceSourceBeforePdfReply({
        page,
        path: `${contentPath}/${documentText(pdf.representationId)}`,
        companyId: source.companyId,
        identity: documentIdentities.member,
        status,
        beforeRead: async () => {
          if (status === 403)
            await source.revoke('company-document-content-reader', 'a');
        },
        afterCapture: async (reply) => {
          if (status === 200) expect(await reply.body()).toEqual(source.pdfA);
          else await source.grant('company-document-content-reader', 'a');
        },
        start: () =>
          documents
            .getByRole('button', {
              name: 'Download Version 1 PDF',
              exact: true,
            })
            .click(),
        replace: async () => {
          for (const company of ['b', 'a'] satisfies Array<'a' | 'b'>) {
            if (narrow)
              await page
                .getByRole('button', { name: 'Open navigation', exact: true })
                .click();
            const control = page.getByLabel('Active Company', { exact: true });
            await selectOption(control, {
              value: source.companies[company].id,
            });
            await expect(control).toBeEnabled();
            await expectValue(control, source.companies[company].id);
            if (narrow)
              await page
                .getByRole('button', { name: 'Close navigation', exact: true })
                .click();
          }
          await page.evaluate(() => {
            location.hash = 'documents';
          });
          await documents
            .getByRole('button', { name: source.title, exact: true })
            .click();
          await expect(
            documents.getByRole('heading', { name: 'Version 2', exact: true }),
          ).toBeVisible();
        },
      });
      await expect(
        documents.getByRole('button', {
          name: 'Download Version 1 PDF',
          exact: true,
        }),
      ).toBeEnabled();
    }
    if (narrow)
      await page
        .getByRole('button', {
          name: resolveMessage(prismeMessages, 'en', 'openNavigation'),
          exact: true,
        })
        .click();
    await expect(
      page.getByLabel(
        resolveMessage(companyContextMessages, 'en', 'activeCompany'),
        { exact: true },
      ),
    ).toHaveAttribute('data-value', source.companyId);
    if (narrow)
      await page
        .getByRole('button', {
          name: resolveMessage(prismeMessages, 'en', 'closeNavigation'),
          exact: true,
        })
        .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath('document-pdf-native-hand.png'),
      fullPage: true,
    });
  } finally {
    page.off('request', observe);
    await removeRoute(page, '**' + contentPath + '?*', drop);
    await removeRoute(page, '**/api/**', identify);
  }
});
