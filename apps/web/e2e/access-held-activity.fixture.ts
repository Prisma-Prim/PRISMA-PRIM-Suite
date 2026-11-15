import type { APIResponse, Page, Request, Route } from '@playwright/test';
import { expect, expectApiFailure } from './ui-chaos.fixture';
import { removeRoute } from './route-removal';

function gate<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!complete) throw new Error('Activity response gate is not ready.');
      complete(value);
    },
  };
}

/** Capture the native Activity answer after the selected Actor has been admitted. */
export async function replaceCompanyBeforeActivityReply(input: {
  page: Page;
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
  const pattern = (url: URL) => url.pathname === '/api/activity-log';
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
            'Native Company context was revoked before the Activity read.',
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
  const observe = (request: Request) => {
    if (new URL(request.url()).pathname === '/api/access/current-actor')
      recoveries++;
  };
  await input.page.route(pattern, hold);
  try {
    await input.start();
    const capture = await captured.promise;
    if (capture.kind === 'failure') throw capture.error;
    expect(capture.response.status()).toBe(input.status);
    await input.afterCapture(capture.response);
    await input.replace();
    await input.page.waitForLoadState('networkidle');
    input.page.on('request', observe);
    release.resolve();
    const delivery = await delivered.promise;
    if (delivery) throw delivery.error;
    await input.page.waitForLoadState('networkidle');
    expect(
      recoveries,
      'A retired Activity answer cannot recover the replacement Company Actor.',
    ).toBe(0);
  } finally {
    release.resolve();
    input.page.off('request', observe);
    await removeRoute(input.page, pattern, hold);
  }
}
