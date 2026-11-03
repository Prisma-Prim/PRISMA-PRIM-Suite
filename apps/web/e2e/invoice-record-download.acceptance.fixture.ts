import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { invoiceRecordMessages } from '../src/invoice-record/invoice-record-copy';
import { sourceKey } from '../src/invoice-record/invoice-record-contract';
import { selectOption } from './select-option';

const copy = invoiceRecordMessages.en;
async function activate(control: Locator) {
  await expect(control).toBeEnabled();
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
async function proof(page: Page, operation: string): Promise<unknown> {
  return page.evaluate(async (name) => {
    const owner: unknown = Reflect.get(window, '__invoiceDownloadProof');
    if (!owner || typeof owner !== 'object')
      throw new Error('Expected the native download observation owner');
    const callback: unknown = Reflect.get(owner, name);
    if (typeof callback !== 'function')
      throw new Error('Expected a download observation operation');
    return callback();
  }, operation);
}

/** Observe real native PDF responses and browser effects; never invent bytes. */
export async function exerciseInvoiceDownloadMode({
  page,
  info,
  mode,
  recordId,
  sourceBytes,
  sourceHeaders,
  replacementSource,
}: {
  page: Page;
  info: TestInfo;
  mode: 'CORRECT' | 'WITHDRAW_ENTRY' | 'REPLACE';
  recordId: string;
  sourceBytes: Buffer;
  sourceHeaders: Record<string, string>;
  replacementSource?: {
    documentId: string;
    documentVersionId: string;
    representationId: string;
  };
}) {
  const workspace = page.locator('.invoice-record-workspace');
  const form = workspace.locator('.invoice-record-editor');
  const modeName =
    mode === 'CORRECT'
      ? copy.correct
      : mode === 'WITHDRAW_ENTRY'
        ? copy.withdraw
        : copy.replace;
  const expectedHash = createHash('sha256').update(sourceBytes).digest('hex');
  await page.evaluate((length) => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    const click = HTMLAnchorElement.prototype.click;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let urls = 0;
    let revokes = 0;
    let clicks = 0;
    let armed = false;
    let held = false;
    let release: (() => void) | undefined;
    let work: Promise<ArrayBuffer> | undefined;
    URL.createObjectURL = (blob) => {
      urls += 1;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      revokes += 1;
      revoke(url);
    };
    HTMLAnchorElement.prototype.click = function () {
      clicks += 1;
      click.call(this);
    };
    crypto.subtle.digest = (algorithm, data) => {
      if (!armed || data.byteLength !== length) return digest(algorithm, data);
      armed = false;
      held = true;
      work = (async () => {
        // WebCrypto has no abort API: the retired owner must reject this result.
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return digest(algorithm, data);
      })();
      return work;
    };
    Object.defineProperty(window, '__invoiceDownloadProof', {
      configurable: true,
      value: {
        read: () => ({ urls, revokes, clicks, held }),
        reset: () => {
          urls = revokes = clicks = 0;
          held = false;
          work = undefined;
          release = undefined;
        },
        arm: () => {
          armed = true;
        },
        release: async () => {
          release?.();
          await work;
        },
        restore: () => {
          release?.();
          URL.createObjectURL = create;
          URL.revokeObjectURL = revoke;
          HTMLAnchorElement.prototype.click = click;
          crypto.subtle.digest = digest;
          Reflect.deleteProperty(window, '__invoiceDownloadProof');
        },
      },
    });
  }, sourceBytes.byteLength);
  let downloads = 0;
  const observedDownload = () => {
    downloads += 1;
  };
  page.on('download', observedDownload);
  const originalUrl = page.url();
  const path = `**/api/invoice-records/${recordId}/source`;
  try {
    for (const stage of ['HTTP', 'hash'] as const) {
      await proof(page, 'reset');
      downloads = 0;
      let nativeReads = 0;
      let releaseHttp: (() => void) | undefined;
      let routeFinished: Promise<void> | undefined;
      await page.route(path, async (route) => {
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...sourceHeaders },
        });
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toBe('application/pdf');
        expect(
          createHash('sha256')
            .update(await response.body())
            .digest('hex'),
        ).toBe(expectedHash);
        nativeReads += 1;
        const completion = (async () => {
          if (stage === 'HTTP' && nativeReads === 1)
            await new Promise<void>((resolve) => {
              releaseHttp = resolve;
            });
          try {
            await route.fulfill({ response });
          } catch (error: unknown) {
            // The browser can cancel the retired native request before delivery.
            if (!route.request().failure()?.errorText.includes('ERR_ABORTED'))
              throw error;
          }
        })();
        routeFinished = completion;
        await completion;
      });
      if (stage === 'hash') await proof(page, 'arm');
      await activate(
        workspace.getByRole('button', { name: copy.download, exact: true }),
      );
      if (stage === 'HTTP')
        await expect.poll(() => typeof releaseHttp).toBe('function');
      else
        await expect
          .poll(() => proof(page, 'read'))
          .toMatchObject({ held: true });
      await activate(
        workspace.getByRole('button', { name: modeName, exact: true }),
      );
      await activate(
        form.getByRole('button', { name: copy.cancel, exact: true }),
      );
      await activate(
        workspace.getByRole('button', { name: modeName, exact: true }),
      );
      if (mode === 'REPLACE') {
        if (!replacementSource)
          throw new Error('Expected a distinct native replacement source');
        await selectOption(form.getByLabel(copy.chooseSource), {
          value: sourceKey(replacementSource),
        });
      } else
        await form
          .getByRole('textbox', { name: copy.reason, exact: true })
          .fill(`Fictional ${mode} after retired ${stage}`);
      releaseHttp?.();
      await routeFinished;
      await proof(page, 'release');
      await expect(
        workspace.getByRole('button', { name: copy.download, exact: true }),
      ).toBeEnabled();
      expect(await proof(page, 'read')).toMatchObject({
        urls: 0,
        clicks: 0,
        revokes: 0,
      });
      expect(downloads).toBe(0);
      expect(page.url()).toBe(originalUrl);
      const fresh = page.waitForEvent('download');
      await activate(
        workspace.getByRole('button', { name: copy.download, exact: true }),
      );
      const downloaded = await fresh;
      expect(downloaded.suggestedFilename()).toBe('fictional-invoice.pdf');
      const local = await downloaded.path();
      if (!local) throw new Error('Expected the fresh native exact PDF');
      expect(
        createHash('sha256')
          .update(await readFile(local))
          .digest('hex'),
      ).toBe(expectedHash);
      expect(await proof(page, 'read')).toMatchObject({
        urls: 1,
        clicks: 1,
        revokes: 1,
      });
      expect(downloads).toBe(1);
      expect(nativeReads).toBe(2);
      expect(page.url()).toBe(originalUrl);
      await page.screenshot({
        path: info.outputPath(`invoice-download-${mode}-${stage}-current.png`),
        fullPage: true,
      });
      await page.unroute(path);
      await activate(
        form.getByRole('button', { name: copy.cancel, exact: true }),
      );
    }
  } finally {
    await page.unroute(path);
    page.off('download', observedDownload);
    await proof(page, 'restore');
  }
}
