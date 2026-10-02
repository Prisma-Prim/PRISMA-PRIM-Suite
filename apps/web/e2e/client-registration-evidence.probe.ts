import { expect } from '@playwright/test';
import { test } from './client-registration-diagnostics';

// Deliberately unexpected failure. The parent process must verify its artifacts;
// test.fail() would cause retain-on-failure to discard the evidence.
test('captures an intentional Client evidence failure', async ({ page }) => {
  let listReads = 0;
  await page.setExtraHTTPHeaders({
    authorization: 'evidence-auth-canary',
    cookie: 'evidence-cookie-canary',
    'x-company-context-id': 'evidence-company',
    'x-private-header': 'evidence-header-canary',
  });
  await page.route('http://client-evidence.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/clients') {
      if (route.request().method() === 'POST')
        return route.fulfill({ status: 201, json: { id: 'evidence-client' } });
      listReads += 1;
      if (listReads === 3) return route.abort('connectionfailed');
      return route.fulfill({
        status: listReads === 1 ? 200 : 503,
        json:
          listReads === 1
            ? [
                {
                  id: 'evidence-client',
                  privateDetails: 'evidence-body-canary',
                },
              ]
            : { message: 'evidence-error-canary' },
      });
    }
    return route.fulfill({
      contentType: 'text/html',
      body: '<main><h1>Client evidence probe</h1></main>',
    });
  });
  await page.goto('http://client-evidence.test/');
  await page.evaluate(async () => {
    await (await fetch('/api/clients?private=evidence-query-canary')).text();
    await (await fetch('/api/clients')).text();
    await (
      await fetch('/api/clients', {
        method: 'POST',
        body: 'evidence-post-body-canary',
      })
    ).text();
    await fetch('/api/clients').catch(() => undefined);
    await (await fetch('/unrelated?private=evidence-unrelated-canary')).text();
  });
  await expect(
    page.getByRole('heading', { name: 'Client deliberately absent' }),
  ).toHaveCount(1);
});
