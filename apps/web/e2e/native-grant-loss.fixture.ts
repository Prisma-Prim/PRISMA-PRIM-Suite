import type { Page, Request, Route } from '@playwright/test';
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
  const admitted = new Set<Request>();
  const actorReads = new Set<Request>();
  const observeActor = (request: Request) => {
    if (
      admitted.size > 0 &&
      new URL(request.url()).pathname === '/api/access/current-actor' &&
      request.headers()['x-company-context-id'] === input.companyId
    )
      actorReads.add(request);
  };
  const refusal = (route: Route) => {
    if (route.request().method() === input.method) {
      admitted.add(route.request());
      expectApiFailure({
        page: input.page,
        request: route.request(),
        reason:
          'An independent native refusal publishes revoked authority in the same Company before the held continuation is consumed.',
      });
    }
    return route.fallback();
  };
  await input.page.route('**' + path, refusal);
  input.page.on('request', observeActor);
  try {
    const refused = input.page.waitForResponse(
      (reply) =>
        reply.request().method() === input.method &&
        admitted.has(reply.request()) &&
        new URL(reply.url()).pathname === path,
    );
    const recovered = input.page.waitForResponse((reply) =>
      actorReads.has(reply.request()),
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
    input.page.off('request', observeActor);
    await removeRoute(input.page, '**' + path, refusal);
  }
}
