import { enterClassicCompatibility } from './classic-compatibility';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';
import { syntheticContent } from '../src/contract-model/contract-model.fixture';

const apiOrigin = 'http://127.0.0.1:4174/api';
function identity(subject: string, name: string) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name': name,
    'x-test-email': `${subject}@example.test`,
  };
}
const owner = identity('workspace-owner', 'Workspace Owner');
const modeller = identity('local-demonstration-user', 'Ada Ionescu');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected response object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected response identity.');
  return value;
}
async function selectCompany(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: name,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
}
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}

test('administers, configures, approves, versions, withdraws and reopens an exact synthetic model; retries literally and retires access and Company drafts', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Contract Model DEMO ${suffix}`;
  async function command(path: string, body: unknown) {
    const response = await page.request.post(`${apiOrigin}${path}`, {
      headers: { ...owner, 'idempotency-key': randomUUID() },
      data: body,
    });
    expect(response.status(), path).toBe(201);
    return record(await response.json());
  }
  const companyId = text(
    (await command('/companies', { displayName: companyName })).id,
  );
  const otherCompanyName = `Other Contract Model Scope DEMO ${suffix}`;
  const otherCompanyId = text(
    (await command('/companies', { displayName: otherCompanyName })).id,
  );
  const current = await page.request.get(`${apiOrigin}/access/current-actor`, {
    headers: modeller,
  });
  expect(current.status()).toBe(200);
  const memberId = text(record(await current.json()).workspaceMembershipId);
  for (const id of [companyId, otherCompanyId])
    await command('/company-context-assignments', {
      companyId: id,
      workspaceMembershipId: memberId,
    });
  let browserIdentity = owner;
  await page.route('**/api/**', (route) =>
    route.continue({
      headers: { ...route.request().headers(), ...browserIdentity },
    }),
  );
  await page.goto('/#access');
  const admin = page.locator('.company-access');
  await expect(
    admin.getByRole('heading', { name: 'Company access', exact: true }),
  ).toBeVisible();
  await selectOption(admin.getByLabel('Workspace member'), { value: memberId });
  await selectOption(admin.getByLabel('Company', { exact: true }), {
    label: companyName,
  });
  for (const role of [
    'Company Contract Model Editor',
    'Company Contract Model Approver',
  ]) {
    await selectOption(admin.getByLabel('Access bundle'), { label: role });
    await admin
      .getByRole('button', { name: 'Grant access', exact: true })
      .click();
    await expect(
      admin.getByText('Granted — captured version v1', { exact: true }),
    ).toBeVisible();
  }
  browserIdentity = modeller;
  await page.goto('/');
  await selectCompany(page, companyName, narrow);
  await navigate(page, 'Consulting Contract model', narrow);
  const workspace = page.locator('.contract-model-workspace');
  await expect(
    workspace.getByText('No consulting Contract model has been configured.'),
  ).toBeVisible();
  await workspace
    .getByRole('button', { name: 'New model version', exact: true })
    .click();
  await selectOption(workspace.getByLabel('Source kind', { exact: true }), {
    label: 'Illustrative content',
  });
  const fields: Record<string, string> = {
    'Source description': syntheticContent.sourceDescription,
    'Contract title': syntheticContent.title,
    'Romanian service title': syntheticContent.serviceTitle,
    'Intended place wording': syntheticContent.place,
    'Issuer legal name': syntheticContent.issuer.legalName,
    'Issuer tax identifier': syntheticContent.issuer.taxId,
    'Issuer legal address': syntheticContent.issuer.legalAddress,
    'Full provider requisites wording': syntheticContent.providerDetails,
    'Client requisites introduction':
      syntheticContent.clientDetailsIntroduction,
    'Framework name 1': 'Cadru sintetic',
    'Framework edition 1': 'Ediție sintetică 1',
    'I. Subject': syntheticContent.sections.subject,
    'II. Execution term': syntheticContent.sections.executionTerm,
    'III. Rights and obligations':
      syntheticContent.sections.rightsAndObligations,
    'IV. Confidentiality': syntheticContent.sections.confidentiality,
    'V. Price and payment wording': syntheticContent.sections.priceAndPayment,
    'VI. Liability': syntheticContent.sections.liability,
    'VII. Termination': syntheticContent.sections.termination,
    'VIII. Final provisions': syntheticContent.sections.finalProvisions,
    'IX. Parties and signatures wording':
      syntheticContent.sections.partiesAndSignatures,
    'Blank provider signature area': syntheticContent.signatureAreas.provider,
    'Blank Client signature area': syntheticContent.signatureAreas.client,
    'Blank annex provider signature area':
      syntheticContent.signatureAreas.annexProvider,
    'Blank annex Client signature area':
      syntheticContent.signatureAreas.annexClient,
    'Annex title': syntheticContent.annex.title,
    'Annex reference wording': syntheticContent.annex.referenceWording,
  };
  for (const [label, value] of Object.entries(fields))
    await workspace.getByLabel(label, { exact: true }).fill(value);
  for (let number = 1; number <= 13; number++) {
    await workspace
      .getByLabel(`Activity title ${number}`, { exact: true })
      .fill(`Activitate demonstrativă ${number}`);
    await workspace
      .getByLabel(`Planned activity ${number}`, { exact: true })
      .fill(`Lucrare planificată demonstrativă ${number}`);
    await workspace
      .getByLabel(`Intended result ${number}`, { exact: true })
      .fill(`Rezultat intenționat demonstrativ ${number}`);
  }

  const modelTraffic: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/contract-models/'))
      modelTraffic.push(`${request.method()} ${request.url()}`);
  });
  await selectOption(page.getByLabel('Interface language', { exact: true }), {
    value: 'fr',
  });
  await expect(
    workspace.getByLabel('Intitulé du service en roumain', { exact: true }),
  ).toHaveValue(syntheticContent.serviceTitle);
  await selectOption(
    page.getByLabel('Langue de l’interface', { exact: true }),
    { value: 'en' },
  );
  await navigate(page, 'Activity Log', narrow);
  await navigate(page, 'Consulting Contract model', narrow);
  await expect(
    workspace.getByLabel('Full provider requisites wording', { exact: true }),
  ).toHaveValue(syntheticContent.providerDetails);
  await enterClassicCompatibility(page);
  await expect(
    workspace.getByLabel('Romanian service title', { exact: true }),
  ).toHaveValue(syntheticContent.serviceTitle);
  await page.getByRole('button', { name: 'Try Prisme', exact: true }).click();
  await expect(
    workspace.getByLabel('Contract title', { exact: true }),
  ).toHaveValue(syntheticContent.title);
  expect(modelTraffic).toEqual([]);
  let failConfirmedRefresh = false;
  await page.route('**/api/contract-models/consulting-ro', (route) => {
    if (failConfirmedRefresh) {
      failConfirmedRefresh = false;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      });
    }
    return route.fallback();
  });
  const attempts: { body: string | null; key: string | undefined }[] = [];
  await page.route(
    '**/api/contract-models/consulting-ro/versions',
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      attempts.push({
        body: route.request().postData(),
        key: route.request().headers()['idempotency-key'],
      });
      const result = await route.fetch({
        headers: { ...route.request().headers(), ...modeller },
      });
      expect(result.status()).toBe(201);
      if (attempts.length === 1)
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        });
      else if (attempts.length === 2) {
        const receipt = record(await result.json());
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            ...receipt,
            model: { ...record(receipt.model), language: 'UNSUPPORTED' },
          }),
        });
      } else {
        failConfirmedRefresh = attempts.length === 3;
        await route.fulfill({ response: result });
      }
    },
  );
  await workspace
    .getByRole('button', { name: 'Submit complete version' })
    .click();
  await expect(
    workspace.getByText(
      'The result is uncertain. Retry the identical command before making another change.',
    ),
  ).toBeVisible();
  await expect(workspace.getByLabel('Romanian service title')).toHaveValue(
    syntheticContent.serviceTitle,
  );
  await expect(
    workspace.getByRole('button', { name: 'Submit complete version' }),
  ).toBeDisabled();

  await selectOption(page.getByLabel('Interface language', { exact: true }), {
    value: 'fr',
  });
  await expect(
    workspace.getByLabel('Intitulé du service en roumain', { exact: true }),
  ).toHaveValue(syntheticContent.serviceTitle);
  await selectOption(
    page.getByLabel('Langue de l’interface', { exact: true }),
    { value: 'en' },
  );
  expect(attempts).toHaveLength(1);
  await workspace
    .getByRole('button', { name: 'Retry identical command' })
    .click();
  await expect.poll(() => attempts.length).toBe(2);
  await expect(
    workspace.getByRole('button', { name: 'Retry identical command' }),
  ).toBeVisible();
  await workspace
    .getByRole('button', { name: 'Retry identical command' })
    .click();
  await expect(workspace.getByText('Version 1 saved.')).toBeVisible();
  await expect(
    workspace.getByText('The model could not be loaded. Try again.'),
  ).toBeVisible();
  await expect(
    workspace.getByRole('button', { name: 'Retry identical command' }),
  ).toHaveCount(0);
  await workspace
    .getByRole('button', { name: 'Reload the current model', exact: true })
    .click();

  expect(attempts).toHaveLength(3);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[1]).toEqual(attempts[2]);
  await expect(
    workspace.getByRole('heading', {
      name: 'Version 1: Serviciu sintetic de consultanță',
    }),
  ).toBeVisible();
  await expect(
    workspace
      .getByRole('heading', { name: 'I. Subject', exact: true })
      .locator('..')
      .locator('p'),
  ).toHaveText(syntheticContent.sections.subject);
  await workspace
    .getByLabel('Decision basis', { exact: true })
    .fill('Full synthetic content and editions reviewed DEMO');
  await workspace
    .getByRole('button', { name: 'Approve this exact version' })
    .click();
  await expect(
    workspace.getByText('Decision for version 1 recorded.'),
  ).toBeVisible();
  await expect(
    workspace.getByText('Available approved version: 1', { exact: true }),
  ).toBeVisible();
  await expect(
    workspace.getByText('Illustrative content', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath(`contract-model-approved-${suffix}.png`),
  });
  await workspace
    .getByRole('button', { name: 'Copy current version into a new draft' })
    .click();
  await workspace
    .getByLabel('Romanian service title', { exact: true })
    .fill('Conținut demonstrativ revizuit');
  await workspace
    .getByRole('button', { name: 'Submit complete version' })
    .click();
  await expect(workspace.getByText('Version 2 saved.')).toBeVisible();
  await expect(
    workspace.getByText('Available approved version: 1', { exact: true }),
  ).toBeVisible();
  await expect(
    workspace.getByText('Awaiting model approval', { exact: true }).first(),
  ).toBeVisible();
  const beforeWithdrawal = await page.request.get(
    `${apiOrigin}/contract-models/consulting-ro`,
    {
      headers: { ...modeller, 'x-company-context-id': companyId },
    },
  );
  expect(beforeWithdrawal.status()).toBe(200);
  const olderVersionId = text(
    record(record(record(await beforeWithdrawal.json()).model).activeVersion)
      .id,
  );
  const unavailableHistory = `**/api/contract-models/consulting-ro/versions/${olderVersionId}`;
  await page.route(unavailableHistory, (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  failConfirmedRefresh = true;
  await workspace
    .getByLabel('Withdrawal reason', { exact: true })
    .fill('Older active model deliberately withdrawn DEMO');
  await workspace
    .getByRole('button', { name: 'Withdraw the active version', exact: true })
    .click();
  await expect(
    workspace.getByText('Withdrawal of version 1 recorded.'),
  ).toBeVisible();
  await expect(
    workspace.getByText('The model could not be loaded. Try again.'),
  ).toBeVisible();
  await expect(
    workspace.getByRole('button', { name: 'Retry identical command' }),
  ).toHaveCount(0);
  await workspace
    .getByRole('button', { name: 'Reload the current model', exact: true })
    .click();
  await page.unroute(unavailableHistory);
  await expect(
    workspace.getByText(
      'No approved version is currently available for new use.',
    ),
  ).toBeVisible();
  await page.reload();
  await workspace
    .getByRole('button', { name: 'Version history', exact: true })
    .click();
  await workspace
    .getByRole('button', { name: 'Open version 1', exact: true })
    .click();
  const history = workspace.locator('.contract-model-history');
  await expect(
    history.getByRole('heading', {
      name: 'Version 1: Serviciu sintetic de consultanță',
    }),
  ).toBeVisible();
  await expect(
    history.getByText('Full synthetic content and editions reviewed DEMO', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    history.getByText('Older active model deliberately withdrawn DEMO', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    history.getByText('Withdrawn from new use', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('body').evaluate((element) => element.clientWidth),
  );
  await history.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(`contract-model-history-${suffix}.png`),
  });

  // A pending successor can be approved after withdrawal; a later approval replaces it.
  await workspace
    .getByLabel('Decision basis', { exact: true })
    .fill('Synthetic pending successor reviewed after withdrawal');
  await workspace
    .getByRole('button', { name: 'Approve this exact version', exact: true })
    .click();
  await expect(
    workspace.getByText('Available approved version: 2', { exact: true }),
  ).toBeVisible();
  const originalBeforeCopy = await page.request.get(
    `${apiOrigin}/contract-models/consulting-ro/versions/${olderVersionId}`,
    { headers: { ...modeller, 'x-company-context-id': companyId } },
  );
  expect(originalBeforeCopy.status()).toBe(200);
  const preservedOriginal = record(await originalBeforeCopy.json()).version;
  await workspace
    .getByRole('button', { name: 'Version history', exact: true })
    .click();
  await workspace
    .getByRole('button', { name: 'Open version 1', exact: true })
    .click();
  await history
    .getByRole('button', {
      name: 'Copy this version into a new draft',
      exact: true,
    })
    .click();
  await expect(
    workspace.getByLabel('Romanian service title', { exact: true }),
  ).toHaveValue(syntheticContent.serviceTitle);
  await expect(
    workspace.getByLabel('Activity title 13', { exact: true }),
  ).toHaveValue('Activitate demonstrativă 13');
  await workspace
    .getByLabel('Romanian service title', { exact: true })
    .fill('Synthetic replacement Contract model');
  await workspace
    .getByRole('button', { name: 'Submit complete version' })
    .click();
  await expect(workspace.getByText('Version 3 saved.')).toBeVisible();
  const copiedBody = attempts.at(-1)?.body;
  if (!copiedBody) throw new Error('Missing historical-copy command.');
  expect(record(JSON.parse(copiedBody))).toEqual({
    expectedModelRevision: 5,
    content: {
      ...syntheticContent,
      serviceTitle: 'Synthetic replacement Contract model',
    },
  });
  const originalAfterCopy = await page.request.get(
    `${apiOrigin}/contract-models/consulting-ro/versions/${olderVersionId}`,
    { headers: { ...modeller, 'x-company-context-id': companyId } },
  );
  expect(originalAfterCopy.status()).toBe(200);
  expect(record(await originalAfterCopy.json()).version).toEqual(
    preservedOriginal,
  );
  await expect(
    workspace.getByText('Available approved version: 2', { exact: true }),
  ).toBeVisible();
  await workspace
    .getByLabel('Decision basis', { exact: true })
    .fill('Synthetic replacement reviewed in full');
  await workspace
    .getByRole('button', { name: 'Approve this exact version', exact: true })
    .click();
  await expect(
    workspace.getByText('Available approved version: 3', { exact: true }),
  ).toBeVisible();
  await workspace
    .getByLabel('Withdrawal reason', { exact: true })
    .fill('Synthetic replacement withdrawn');
  await workspace
    .getByRole('button', { name: 'Withdraw the active version', exact: true })
    .click();
  await expect(
    workspace.getByText('Withdrawal of version 3 recorded.'),
  ).toBeVisible();
  await workspace
    .getByRole('button', { name: 'Copy current version into a new draft' })
    .click();
  await workspace
    .getByLabel('Romanian service title', { exact: true })
    .fill('PROTECTED DRAFT TO RETIRE');
  await selectCompany(page, otherCompanyName, narrow);
  await expect(
    page.getByText('PROTECTED DRAFT TO RETIRE', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.contract-model-workspace')).toHaveCount(0);
  await selectCompany(page, companyName, narrow);
  await navigate(page, 'Consulting Contract model', narrow);
  await expect(
    workspace.getByLabel('Romanian service title', { exact: true }),
  ).toHaveCount(0);
  for (const bundle of [
    'company-contract-model-editor',
    'company-contract-model-approver',
  ]) {
    const response = await page.request.delete(
      `${apiOrigin}/${bundle}-assignments/${memberId}/${companyId}`,
      { headers: { ...owner, 'idempotency-key': randomUUID() } },
    );
    expect(response.status()).toBe(200);
  }
  await workspace
    .getByRole('button', { name: 'Version history', exact: true })
    .click();
  await expect(page.locator('.contract-model-workspace')).toHaveCount(0);
});

test('preserves every accepted multiline title and identity when reviewing and copying an exact model', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const narrow = info.project.name.endsWith('narrow');
  const companyName = `Literal Contract Model DEMO ${narrow ? 'Narrow' : 'Desktop'}`;
  async function command(path: string, body: unknown, companyId?: string) {
    const response = await page.request.post(`${apiOrigin}${path}`, {
      headers: {
        ...owner,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(response.status(), path).toBe(201);
    return record(await response.json());
  }
  const companyId = text(
    (await command('/companies', { displayName: companyName })).id,
  );
  const actor = await page.request.get(`${apiOrigin}/access/current-actor`, {
    headers: owner,
  });
  const memberId = text(record(await actor.json()).workspaceMembershipId);
  for (const bundle of [
    'company-contract-model-editor',
    'company-contract-model-approver',
  ])
    await command(`/${bundle}-assignments`, {
      companyId,
      workspaceMembershipId: memberId,
    });
  const content = {
    ...syntheticContent,
    serviceTitle: 'Titlu unu\nTitlu doi',
    issuer: {
      ...syntheticContent.issuer,
      legalName: 'Furnizor unu\nFurnizor doi',
      taxId: 'DEMO unu\nDEMO doi',
    },
    frameworks: [
      { name: 'Cadru unu\nCadru doi', edition: 'Ediție unu\nEdiție doi' },
    ],
    annex: {
      ...syntheticContent.annex,
      activities: syntheticContent.annex.activities.map((stage, index) =>
        index === 0 ? { ...stage, title: 'Etapă unu\nEtapă doi' } : stage,
      ),
    },
  };
  const created = await command(
    '/contract-models/consulting-ro/versions',
    { expectedModelRevision: 0, content },
    companyId,
  );
  const id = text(record(record(created.model).head).id);
  await command(
    `/contract-models/consulting-ro/versions/${id}/decision`,
    {
      expectedModelRevision: 1,
      versionNumber: 1,
      outcome: 'APPROVE',
      basis: 'Synthetic literal formatting reviewed',
    },
    companyId,
  );
  await page.route('**/api/**', (route) =>
    route.continue({ headers: { ...route.request().headers(), ...owner } }),
  );
  await page.goto('/');
  await selectCompany(page, companyName, narrow);
  await navigate(page, 'Consulting Contract model', narrow);
  const workspace = page.locator('.contract-model-workspace');
  const version = workspace.locator('.contract-model-version').first();
  await expect(version.locator('h3')).toBeVisible();
  expect(await version.locator('h3').innerText()).toBe(
    'Version 1: Titlu unu\nTitlu doi',
  );
  expect(
    await version.locator('ol').first().locator('li').first().innerText(),
  ).toContain('Cadru unu\nCadru doi');
  expect(
    await version.locator('ol').first().locator('li').first().innerText(),
  ).toContain('Ediție unu\nEdiție doi');
  expect(await version.locator('h5').first().innerText()).toBe(
    'Etapă unu\nEtapă doi',
  );
  expect(
    await workspace
      .locator(':scope > p')
      .filter({ hasText: 'Titlu unu' })
      .innerText(),
  ).toContain('Titlu unu\nTitlu doi');
  await workspace
    .getByRole('button', { name: 'Version history', exact: true })
    .click();
  const historyRow = workspace
    .locator('.contract-model-history > ol > li')
    .first();
  await expect(historyRow).toBeVisible();
  expect(await historyRow.innerText()).toContain('Titlu unu\nTitlu doi');
  await workspace
    .getByRole('button', { name: 'Copy current version into a new draft' })
    .click();
  for (const [label, value] of [
    ['Romanian service title', content.serviceTitle],
    ['Issuer legal name', content.issuer.legalName],
    ['Issuer tax identifier', content.issuer.taxId],
    ['Framework name 1', content.frameworks[0]?.name],
    ['Framework edition 1', content.frameworks[0]?.edition],
    ['Activity title 1', content.annex.activities[0]?.title],
  ]) {
    if (!label || !value) throw new Error('Missing literal fixture.');
    await expect(workspace.getByLabel(label, { exact: true })).toHaveValue(
      value,
    );
  }
  await workspace
    .getByLabel('Romanian service title', { exact: true })
    .fill('Titlu editat\nAl doilea rând');
  await workspace
    .getByRole('button', { name: 'Submit complete version' })
    .click();
  await expect(workspace.getByText('Version 2 saved.')).toBeVisible();
  expect(
    await workspace.locator('.contract-model-version h3').first().innerText(),
  ).toBe('Version 2: Titlu editat\nAl doilea rând');
});

test('keeps the exact uncertain decision through App navigation and an earlier delayed history response', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const narrow = info.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Late Contract Owner DEMO ${suffix}`;
  async function command({
    path,
    body,
    companyId,
    actor = owner,
  }: {
    path: string;
    body: unknown;
    companyId?: string;
    actor?: ReturnType<typeof identity>;
  }) {
    const response = await page.request.post(`${apiOrigin}${path}`, {
      headers: {
        ...actor,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(response.status(), path).toBe(201);
    return record(await response.json());
  }
  const companyId = text(
    (await command({ path: '/companies', body: { displayName: companyName } }))
      .id,
  );
  const actor = await page.request.get(`${apiOrigin}/access/current-actor`, {
    headers: modeller,
  });
  expect(actor.status()).toBe(200);
  const workspaceMembershipId = text(
    record(await actor.json()).workspaceMembershipId,
  );
  for (const path of [
    '/company-context-assignments',
    '/company-contract-model-editor-assignments',
    '/company-contract-model-approver-assignments',
  ])
    await command({ path, body: { companyId, workspaceMembershipId } });
  const created = await command({
    path: '/contract-models/consulting-ro/versions',
    companyId,
    actor: modeller,
    body: { expectedModelRevision: 0, content: syntheticContent },
  });
  const versionId = text(record(record(created.model).head).id);
  await page.route('**/api/**', (route) =>
    route.continue({ headers: { ...route.request().headers(), ...modeller } }),
  );
  await page.goto('/');
  await selectCompany(page, companyName, narrow);
  await navigate(page, 'Consulting Contract model', narrow);
  const workspace = page.locator('.contract-model-workspace');
  await expect(
    workspace.getByRole('button', {
      name: 'Approve this exact version',
      exact: true,
    }),
  ).toBeVisible();
  let releaseHistory: (() => void) | undefined;
  const heldHistory = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  let historyHeld = false;
  let historyDelivered = false;
  await page.route(
    '**/api/contract-models/consulting-ro/versions',
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch({
        headers: { ...route.request().headers(), ...modeller },
      });
      expect(response.status()).toBe(200);
      historyHeld = true;
      await heldHistory;
      await route.fulfill({ response });
      historyDelivered = true;
    },
  );
  const attempts: { body: string | null; key: string | undefined }[] = [];
  await page.route(
    `**/api/contract-models/consulting-ro/versions/${versionId}/decision`,
    async (route) => {
      attempts.push({
        body: route.request().postData(),
        key: route.request().headers()['idempotency-key'],
      });
      const response = await route.fetch({
        headers: { ...route.request().headers(), ...modeller },
      });
      expect(response.status()).toBe(201);
      if (attempts.length === 1)
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        });
      else await route.fulfill({ response });
    },
  );
  try {
    await workspace
      .getByRole('button', { name: 'Version history', exact: true })
      .click();
    await expect.poll(() => historyHeld).toBe(true);
    await workspace
      .getByLabel('Decision basis', { exact: true })
      .fill(' Literal synthetic review retained through delayed navigation ');
    await workspace
      .getByRole('button', { name: 'Approve this exact version', exact: true })
      .click();
    await expect(
      workspace.getByRole('button', {
        name: 'Retry identical command',
        exact: true,
      }),
    ).toBeVisible();
    for (const name of [
      'Approve this exact version',
      'Reject this exact version',
      'New model version',
      'Copy current version into a new draft',
      'Version history',
      'Reload the current model',
    ])
      await expect(
        workspace.getByRole('button', { name, exact: true }),
      ).toBeDisabled();
    await expect(
      workspace.getByLabel('Decision basis', { exact: true }),
    ).toBeDisabled();
    await navigate(page, 'Activity Log', narrow);
    await navigate(page, 'Consulting Contract model', narrow);
    await expect(
      workspace.getByRole('button', {
        name: 'Retry identical command',
        exact: true,
      }),
    ).toBeVisible();
    if (!releaseHistory) throw new Error('Missing delayed history barrier.');
    releaseHistory();
    await expect.poll(() => historyDelivered).toBe(true);
    await expect(
      workspace.getByRole('button', { name: 'Open version 1', exact: true }),
    ).toHaveCount(0);
    await expect(
      workspace.getByRole('button', { name: 'Version history', exact: true }),
    ).toBeDisabled();
    await expect(
      workspace.getByLabel('Decision basis', { exact: true }),
    ).toHaveValue(
      ' Literal synthetic review retained through delayed navigation ',
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`contract-model-late-owner-${suffix}.png`),
    });
    await workspace
      .getByRole('button', { name: 'Retry identical command', exact: true })
      .click();
    await expect(
      workspace.getByText('Decision for version 1 recorded.'),
    ).toBeVisible();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]?.key).toBeTruthy();
    await page.reload();
    await expect(
      workspace.getByText('Available approved version: 1', { exact: true }),
    ).toBeVisible();
    await expect(
      workspace.getByText(
        ' Literal synthetic review retained through delayed navigation ',
        { exact: true },
      ),
    ).toBeVisible();
  } finally {
    releaseHistory?.();
  }
});
