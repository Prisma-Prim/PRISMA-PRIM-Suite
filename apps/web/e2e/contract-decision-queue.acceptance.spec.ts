import { expect, test } from '@playwright/test';
import { selectOption } from './select-option';
import { prepareContractDecisionQueue } from './contract-decision-queue.acceptance.fixture';
import {
  modelContractIdentities as identities,
  object,
  text,
} from './model-contract.acceptance.fixture';

test('discovers page2 and decides the exact native Contract through an identical uncertain retry without Client read', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'Narrow' : 'Desktop';
  const f = await prepareContractDecisionQueue(page, suffix);
  const origin = 'http://127.0.0.1:4174/api';
  expect(
    (
      await page.request.get(`${origin}/clients/${f.clientId}`, {
        headers: { ...identities.reader, 'x-company-context-id': f.companyId },
      })
    ).status(),
  ).toBe(403);
  let queueReads = 0;
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname.endsWith('/contract-decision-queue') &&
      request.headers()['x-company-context-id'] === f.companyId
    )
      queueReads++;
  });
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: f.companyName,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  const queue = page.getByRole('region', {
    name: 'Contracts awaiting an internal decision',
    exact: true,
  });
  await expect(queue.getByRole('listitem')).toHaveCount(25);
  await queue.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(queue.getByRole('listitem')).toHaveCount(2);
  const target = f.versions[25];
  if (!target) throw new Error('Missing page2 Contract');
  await expect(queue.getByText(target.title, { exact: true })).toBeVisible();
  const reads = queueReads;
  const language = page.getByRole('combobox', {
    name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
  });
  for (const [locale, title] of [
    ['ro', 'Contracte în așteptarea deciziei interne'],
    ['ru', 'Договоры, ожидающие внутреннего решения'],
    ['fr', 'Contrats en attente de décision interne'],
    ['en', 'Contracts awaiting an internal decision'],
  ]) {
    await selectOption(language, { value: locale });
    await expect(
      page
        .getByRole('region', { name: title, exact: true })
        .getByText(target.title, { exact: true }),
    ).toBeVisible();
  }
  expect(queueReads).toBe(reads);
  await queue.screenshot({
    path: info.outputPath(
      `pending-contracts-page2-${suffix.toLowerCase()}.png`,
    ),
  });
  await queue
    .getByRole('button', {
      name: `Review Contract ${target.reference}, version 1`,
      exact: true,
    })
    .click();
  await queue
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .click();
  await expect(
    queue.getByText('Contract checks recorded.', { exact: true }),
  ).toBeVisible();
  const checks = queue.getByRole('region', {
    name: 'Contract Quality Checks',
    exact: true,
  });
  await expect(checks.locator('li')).toHaveCount(17);
  const warnings = checks.getByRole('checkbox', {
    name: 'I acknowledge this warning',
    exact: true,
  });
  await expect(warnings).toHaveCount(2);
  for (const warning of await warnings.all()) {
    await expect(warning).not.toBeChecked();
    await warning.check();
  }
  const basis =
    ' Literal Contract and thirteen-row annex review 🌍\n exact source ';
  await checks
    .getByLabel('Exact Contract and annex review basis', { exact: true })
    .fill(basis);
  const attempts: {
    path: string;
    body: string | null;
    key: string | undefined;
  }[] = [];
  const base = `/contracts/opportunities/${target.opportunityId}/versions/${target.versionId}`;
  await page.route('**/api' + base + '/approve', async (route) => {
    const request = route.request();
    attempts.push({
      path: new URL(request.url()).pathname,
      body: request.postData(),
      key: request.headers()['idempotency-key'],
    });
    const response = await route.fetch({
      headers: { ...request.headers(), ...identities.reader },
    });
    expect(response.status()).toBe(201);
    if (attempts.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await checks
    .getByRole('button', {
      name: 'Approve exact Contract Version',
      exact: true,
    })
    .click();
  await expect(
    queue.getByRole('button', {
      name: 'Retry the same Contract command',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    queue.getByRole('button', {
      name: 'Back to pending agreements',
      exact: true,
    }),
  ).toBeDisabled();
  await selectOption(language, { value: 'fr' });
  await expect(
    page.getByRole('button', {
      name: 'Retour aux accords en attente',
      exact: true,
    }),
  ).toBeDisabled();
  await selectOption(language, { value: 'en' });
  await queue
    .getByRole('button', {
      name: 'Retry the same Contract command',
      exact: true,
    })
    .click();
  await expect(
    queue.getByText('Internal Contract decision recorded.', { exact: true }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(JSON.parse(attempts[0]?.body ?? '{}')).toMatchObject({
    reviewBasis: basis,
  });
  const frozen = object(
    (await f.read(base, f.companyId, identities.reader)).contract,
  );
  expect(frozen.id).toBe(target.contractId);
  expect(object(frozen.version)).toMatchObject({
    id: target.versionId,
    decisionState: 'APPROVED',
  });
  const source = object(
    (
      await f.read(
        `/offers/opportunities/${target.opportunityId}`,
        f.companyId,
        identities.reader,
      )
    ).offer,
  );
  expect(object(source.version)).toMatchObject({
    id: target.sourceOfferVersionId,
    clientResponseState: 'PENDING',
    clientResponse: null,
  });
  await queue
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(queue.locator('iframe')).toHaveAttribute(
    'srcdoc',
    text(object(object(frozen.version).representation).html),
  );
  const frame = queue.frameLocator('iframe');
  await expect(frame.locator('tbody tr')).toHaveCount(13);
  await queue.locator('iframe').scrollIntoViewIfNeeded();
  await expect(frame.getByRole('heading', { level: 1 })).toBeVisible();
  await queue.screenshot({
    path: info.outputPath(
      `pending-contract-exact-decision-${suffix.toLowerCase()}.png`,
    ),
  });
  await queue
    .getByRole('button', { name: 'Back to pending agreements', exact: true })
    .click();
  await expect(queue.getByRole('listitem')).toHaveCount(25);
  await queue.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(queue.getByRole('listitem')).toHaveCount(1);
  await expect(queue.getByText(target.title, { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await f.revoke('company-contract-approver', f.readerId);
  await queue
    .getByRole('button', { name: 'Refresh from beginning', exact: true })
    .click();
  await expect(queue).toHaveCount(0);
  await expect(
    page.getByRole('region', {
      name: 'Offers awaiting an internal decision',
      exact: true,
    }),
  ).toBeVisible();
});
