import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { selectOption } from './select-option';
const origin = 'http://127.0.0.1:4174/api';
function headers(subject: string) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}
const owner = headers('workspace-owner'),
  director = headers('local-demonstration-user'),
  contributor = headers('responsible-colleague');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identity');
  return value;
}

test('discovers every pending estimate, decides an exact earlier Version with identical lost-confirmation retry and preserves history', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Decision queue DEMO ${suffix}`,
    title = `Pending estimate DEMO ${suffix}`;
  async function command(
    path: string,
    body: unknown,
    identity = owner,
    companyId?: string,
  ) {
    const response = await page.request.post(origin + path, {
      headers: {
        ...identity,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(response.status(), path).toBe(201);
    return object(await response.json());
  }
  async function membership(identity: Record<string, string>) {
    const response = await page.request.get(origin + '/access/current-actor', {
      headers: identity,
    });
    expect(response.status()).toBe(200);
    return text(object(await response.json()).workspaceMembershipId);
  }
  const companyId = text(
    (await command('/companies', { displayName: companyName })).id,
  );
  const directorId = await membership(director),
    contributorId = await membership(contributor);
  for (const member of [directorId, contributorId])
    for (const bundle of ['company-context', 'company-commercial-intake'])
      await command(`/${bundle}-assignments`, {
        companyId,
        workspaceMembershipId: member,
      });
  await command('/company-profitability-director-assignments', {
    companyId,
    workspaceMembershipId: directorId,
  });
  await command('/company-profitability-contributor-assignments', {
    companyId,
    workspaceMembershipId: contributorId,
  });
  const request = await command(
    '/commercial-intake/requests',
    {
      sourceLabel: 'Synthetic decision queue proof',
      originalText: 'Synthetic record; no real customer.',
      subject: title,
      opportunity: {
        title,
        scope: 'Synthetic consulting',
        nextAction: 'Review confirmed economics',
      },
    },
    contributor,
    companyId,
  );
  const opportunityId = text(object(request.initialOpportunity).id),
    basePath = `/opportunities/${opportunityId}/profitability-estimates`;
  const inputs = {
    currency: 'EUR',
    executorType: 'PATENT_CONSULTANT',
    executorCost: '60.00',
    fiscalCost: '10.00',
    allocatedOverhead: '10.00',
    directCosts: [
      {
        key: 'travel',
        category: 'TRAVEL',
        label: 'Synthetic travel',
        amount: '20.00',
        currency: 'EUR',
      },
    ],
    targetProfitability: '20',
    proposedPrice: '125.00',
    pricingIntent: { kind: 'ORDINARY' },
    costConfirmation: true,
  };
  const first = await command(
    basePath,
    { ...inputs, expectedLatestVersionNumber: null },
    contributor,
    companyId,
  );
  const second = await command(
    basePath,
    { ...inputs, proposedPrice: '150.00', expectedLatestVersionNumber: 1 },
    contributor,
    companyId,
  );
  const firstId = text(first.id),
    secondId = text(second.id);
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: companyName,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  const queue = page.getByRole('region', {
    name: 'Pending profitability estimates',
    exact: true,
  });
  await expect(
    queue.getByRole('button', { name: 'Review version 1', exact: true }),
  ).toBeVisible();
  await expect(
    queue.getByRole('button', { name: 'Review version 2', exact: true }),
  ).toBeVisible();
  await expect(
    queue.getByText('Version 1 — Earlier version', { exact: true }),
  ).toBeVisible();
  await queue.screenshot({
    path: testInfo.outputPath(`pending-queue-${suffix.toLowerCase()}.png`),
  });
  await queue
    .getByRole('button', { name: 'Review version 1', exact: true })
    .click();
  const exact = queue.getByRole('article', { name: 'Version 1', exact: true });
  await expect(exact).toBeVisible();
  await expect(
    queue.getByRole('article', { name: 'Version 2', exact: true }),
  ).toHaveCount(0);
  const attempts: {
    path: string;
    body: string | null;
    key: string | undefined;
  }[] = [];
  await page.route(
    `**/api${basePath}/versions/${firstId}/decision`,
    async (route) => {
      const request = route.request();
      attempts.push({
        path: new URL(request.url()).pathname,
        body: request.postData(),
        key: request.headers()['idempotency-key'],
      });
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      if (attempts.length === 1) {
        await route.abort('failed');
        return;
      }
      await route.fulfill({ response });
    },
  );
  await exact
    .getByRole('button', { name: 'Approve this version', exact: true })
    .click();
  await queue
    .getByRole('button', { name: 'Retry exact command', exact: true })
    .click();
  await expect(
    queue.getByText('Director decision recorded for this exact version.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  await expect(exact.getByText('Approved', { exact: true })).toBeVisible();
  await queue.screenshot({
    path: testInfo.outputPath(`exact-decision-${suffix.toLowerCase()}.png`),
  });
  await queue
    .getByRole('button', { name: 'Back to pending estimates', exact: true })
    .click();
  await expect(
    queue.getByRole('button', { name: 'Review version 1', exact: true }),
  ).toHaveCount(0);
  await expect(
    queue.getByRole('button', { name: 'Review version 2', exact: true }),
  ).toBeVisible();
  await queue
    .getByRole('button', { name: 'Review version 2', exact: true })
    .click();
  await queue
    .getByRole('article', { name: 'Version 2', exact: true })
    .getByRole('button', {
      name: 'Return this version for modification',
      exact: true,
    })
    .click();
  await expect(
    queue.getByText('Director decision recorded for this exact version.', {
      exact: true,
    }),
  ).toBeVisible();
  await queue
    .getByRole('button', { name: 'Back to pending estimates', exact: true })
    .click();
  await expect(
    queue.getByText('No estimate versions awaiting your decision.', {
      exact: true,
    }),
  ).toBeVisible();
  for (const [id, code] of [
    [firstId, 'APPROVE'],
    [secondId, 'MODIFY'],
  ]) {
    const response = await page.request.get(
      `${origin}${basePath}/versions/${id}`,
      { headers: { ...director, 'x-company-context-id': companyId } },
    );
    expect(response.status()).toBe(200);
    expect(object(await response.json())).toMatchObject({
      id,
      decision: { code },
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const revoked = await page.request.delete(
    `${origin}/company-profitability-director-assignments/${directorId}/${companyId}`,
    {
      headers: { ...owner, 'idempotency-key': randomUUID() },
    },
  );
  expect(revoked.status()).toBe(200);
  await page.reload();
  await expect(
    page.getByLabel('Active Company', { exact: true }),
  ).toBeEnabled();
  await expect(queue).toHaveCount(0);
});
