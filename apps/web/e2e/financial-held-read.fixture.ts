import type { APIResponse, Page, Request, Route } from '@playwright/test';
import { expect } from './ui-chaos.fixture';
import { removeRoute } from './route-removal';

function decision<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!complete)
        throw new Error('Financial response gate is not initialized.');
      complete(value);
    },
  };
}
type Capture =
  | { kind: 'reply'; response: APIResponse }
  | { kind: 'failure'; error: unknown };

/** Hold a native answer across a real scope replacement, including a native denial. */
export async function replaceScopeBeforeFinancialReply(input: {
  page: Page;
  path: string;
  identity: Record<string, string>;
  reply:
    | { kind: 'authorized' }
    | {
        kind: 'denied';
        revoke: () => Promise<void>;
        restore: () => Promise<void>;
      };
  start: () => Promise<void>;
  replace: () => Promise<void>;
}) {
  const captured = decision<Capture>();
  const release = decision<void>();
  const delivered = decision<{ error: unknown } | null>();
  let intercepted = false;
  let restored = input.reply.kind === 'authorized';
  const pattern = '**/api' + input.path;
  const hold = async (route: Route) => {
    if (route.request().method() !== 'GET' || intercepted)
      return route.fallback();
    intercepted = true;
    try {
      const response = await route.fetch({
        headers: { ...route.request().headers(), ...input.identity },
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
  if (input.reply.kind === 'denied') await input.reply.revoke();
  await input.page.route(pattern, hold);
  try {
    await input.start();
    const capture = await captured.promise;
    if (capture.kind === 'failure') throw capture.error;
    expect(capture.response.status()).toBe(
      input.reply.kind === 'denied' ? 403 : 200,
    );
    if (input.reply.kind === 'denied') {
      await input.reply.restore();
      restored = true;
    }
    await input.replace();
    await input.page.waitForLoadState('networkidle');
    input.page.on('request', observe);
    release.resolve();
    const delivery = await delivered.promise;
    if (delivery) throw delivery.error;
    await input.page.waitForLoadState('networkidle');
    expect(
      recoveries,
      'A retired response cannot start recovery for the replacement scope.',
    ).toBe(0);
  } finally {
    release.resolve();
    input.page.off('request', observe);
    if (!restored && input.reply.kind === 'denied') await input.reply.restore();
    await removeRoute(input.page, pattern, hold);
  }
}
