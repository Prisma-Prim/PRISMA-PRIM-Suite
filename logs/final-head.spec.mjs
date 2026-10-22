import { test, expect } from '/workspace/work/659/validation/apps/web/node_modules/@playwright/test/index.mjs';

test('existing anonymous embedded Clerk form renders without submission', async ({ page }, testInfo) => {
  await testInfo.attach('tested-source', { body: '8a5d607bf22409c4d8285e961e8b221d11201a02', contentType: 'text/plain' });
  const requests = [];
  const responses = [];
  const failures = [];
  const errors = [];
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname === 'boss-tarpon-28.clerk.accounts.dev') requests.push({ method: r.method(), path: u.pathname });
  });
  page.on('response', r => {
    const u = new URL(r.url());
    if (u.hostname === 'boss-tarpon-28.clerk.accounts.dev') responses.push({ status: r.status(), path: u.pathname });
  });
  page.on('requestfailed', r => failures.push({ host: new URL(r.url()).hostname, path: new URL(r.url()).pathname, error: r.failure()?.errorText }));
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/accept-invitation?invitation=00000000-0000-4000-8000-000000000659&mode=signin');
    await expect(page.locator('.cl-signIn-root')).toBeVisible({ timeout: 20000 });
    await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('anonymous-embedded-signin.png'), fullPage: true });
    expect(requests.filter(r => /sign_ins|sign_ups|invitations|reset_password|verification/.test(r.path))).toEqual([]);
    expect(responses.some(r => r.path.endsWith('clerk.browser.js') && r.status === 200)).toBe(true);
    expect(responses.some(r => r.path === '/v1/environment' && r.status === 200)).toBe(true);
  } finally {
    await testInfo.attach('sanitized-network', { body: JSON.stringify({ requests, responses, failures, errors }, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('terminal.png'), fullPage: true }).catch(() => {});
  }
});
