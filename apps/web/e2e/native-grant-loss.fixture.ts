import type { Page, Route } from '@playwright/test';
import { accessObject } from './access-sequence-source.fixture';
import { expect, expectApiFailure } from './ui-chaos.fixture';
import { removeRoute } from './route-removal';

/** Publish the actually revoked Actor through an independent native refusal. */
export async function publishNativeGrantLoss(input: {
  page: Page;
  path: string;
  method: 'GET' | 'POST';
  companyId: string;
  absentBundles: readonly string[];
  start: () => Promise<void>;
}) {
  const path = '/api' + input.path;
  const refusal = (route: Route) => {
    if (route.request().method() === input.method)
      expectApiFailure({
        page: input.page,
        request: route.request(),
        reason:
          'An independent native refusal publishes revoked authority in the same Company before the held continuation is consumed.',
      });
    return route.fallback();
  };
  await input.page.route('**' + path, refusal);
  try {
    const refused = input.page.waitForResponse(
      (reply) =>
        reply.request().method() === input.method &&
        new URL(reply.url()).pathname === path,
    );
    const recovered = input.page.waitForResponse(
      (reply) =>
        new URL(reply.url()).pathname === '/api/access/current-actor' &&
        reply.request().headers()['x-company-context-id'] === input.companyId,
    );
    await input.start();
    expect((await refused).status()).toBe(403);
    const reply = await recovered;
    expect(reply.status()).toBe(200);
    const company = accessObject(
      accessObject(await reply.json()).activeCompany,
    );
    expect(company.id).toBe(input.companyId);
    if (!Array.isArray(company.grants))
      throw new Error('Missing native current Company grants');
    const grants: unknown[] = company.grants;
    const bundles = grants.map((grant) => accessObject(grant).bundle);
    for (const bundle of input.absentBundles)
      expect(bundles).not.toContain(bundle);
  } finally {
    await removeRoute(input.page, '**' + path, refusal);
  }
}
