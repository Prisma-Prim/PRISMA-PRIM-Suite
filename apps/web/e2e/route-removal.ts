import type { Page } from '@playwright/test';

const passthroughs = new WeakMap<Page, Promise<void>>();

/** Remove temporary interception without stranding other reads (#1098). */
export async function removeRoute(
  page: Page,
  ...route: Parameters<Page['unroute']>
) {
  // Keep interception enabled until page close. A private predicate cannot be
  // removed by the caller's string/RegExp pattern. fallback preserves existing
  // auth/fault handlers, unlike continue, and later routes keep their priority.
  // Routing already disables the HTTP cache; it stays disabled after removal.
  let ready = passthroughs.get(page);
  if (!ready) {
    ready = page.route(
      () => true,
      (intercepted) => intercepted.fallback(),
    );
    passthroughs.set(page, ready);
  }
  await ready;
  await page.unroute(...route);
}
