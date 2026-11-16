import type { APIResponse, Page, Request, Route } from '@playwright/test';
import { expect, expectApiFailure } from './ui-chaos.fixture';
import { removeRoute } from './route-removal';

function gate<T>() {
  let ready = false;
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    ready: () => ready,
    resolve(value: T) {
      if (!complete) throw new Error('PDF response gate was not initialized');
      ready = true;
      complete(value);
    },
  };
}

/** Hold the real immutable byte/denial response after the displayed Reader is admitted. */
export async function replaceSourceBeforePdfReply(input: {
  page: Page;
  path: string;
  companyId: string;
  identity: Record<string, string>;
  status: 200 | 403;
  beforeRead: () => Promise<void>;
  afterCapture: (response: APIResponse) => Promise<void>;
  start: () => Promise<void>;
  replace: () => Promise<void>;
}) {
  const captured = gate<
    | { kind: 'reply'; response: APIResponse }
    | { kind: 'failure'; error: unknown }
  >();
  const release = gate<void>();
  const delivered = gate<{ error: unknown } | null>();
  let intercepted = false;
  const pattern = (url: URL) => url.pathname === input.path;
  const hold = async (route: Route) => {
    if (
      intercepted ||
      route.request().method() !== 'GET' ||
      route.request().headers()['x-company-context-id'] !== input.companyId
    )
      return route.fallback();
    intercepted = true;
    try {
      await input.beforeRead();
      const response = await route.fetch({
        headers: { ...route.request().headers(), ...input.identity },
      });
      if (input.status === 403)
        expectApiFailure({
          page: input.page,
          request: route.request(),
          reason:
            'The native PDF Reader grant was revoked after UI admission and before the immutable content read.',
        });
      captured.resolve({ kind: 'reply', response });
      await release.promise;
      await route.fulfill({ response });
      delivered.resolve(null);
    } catch (error) {
      captured.resolve({ kind: 'failure', error });
      delivered.resolve({ error });
    }
  };
  let recoveries = 0;
  let downloads = 0;
  const observe = (request: Request) => {
    if (new URL(request.url()).pathname === '/api/access/current-actor')
      recoveries += 1;
  };
  const downloaded = () => {
    downloads += 1;
  };
  await input.page.route(pattern, hold);
  try {
    await input.start();
    await expect
      .poll(captured.ready, {
        timeout: 20_000,
        message: 'The admitted PDF read must reach the native capture boundary',
      })
      .toBe(true);
    const capture = await captured.promise;
    if (capture.kind === 'failure') throw capture.error;
    expect(capture.response.status()).toBe(input.status);
    await input.afterCapture(capture.response);
    await input.replace();
    await input.page.waitForLoadState('networkidle');
    input.page.on('request', observe);
    input.page.on('download', downloaded);
    release.resolve();
    await expect
      .poll(delivered.ready, {
        timeout: 20_000,
        message: 'The held native PDF reply must finish delivery',
      })
      .toBe(true);
    const delivery = await delivered.promise;
    if (delivery) throw delivery.error;
    await input.page.waitForLoadState('networkidle');
    expect(
      recoveries,
      'An obsolete PDF response cannot replace the current Company Actor',
    ).toBe(0);
    expect(
      downloads,
      'An obsolete PDF response cannot create a browser download',
    ).toBe(0);
  } finally {
    release.resolve();
    input.page.off('request', observe);
    input.page.off('download', downloaded);
    await removeRoute(input.page, pattern, hold);
  }
}
