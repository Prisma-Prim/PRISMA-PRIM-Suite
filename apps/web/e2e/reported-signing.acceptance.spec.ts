import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  prepareReceivedContractCase,
  modelContractIdentities,
  object,
  text,
  selectReceivedCompany,
  navigateReceived,
  exactReceivedDownload,
} from './received-contract.acceptance.fixture';
import { selectOption } from './select-option';
import { enterClassicCompatibility } from './classic-compatibility';

const apiOrigin = 'http://127.0.0.1:4174/api';
test('records reported signing through exact uncertain retries, literal locale/frame continuity, independent PDF denial and the existing thirteen-Task Project', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const narrow = info.project.name.endsWith('narrow');
  const ready = await prepareReceivedContractCase(
    page,
    'reported-' + (narrow ? 'narrow' : 'desktop'),
  );
  for (const bundle of [
    'company-received-contract-access',
    'company-contract-approver',
    'company-project',
    'company-task-manager',
    'company-project-template-user',
  ])
    await ready.command('/' + bundle + '-assignments', {
      companyId: ready.companyId,
      workspaceMembershipId: ready.preparerId,
    });
  const contractPath = `/contracts/opportunities/${ready.opportunityId}`;
  await ready.command(
    `${contractPath}/versions/${ready.contractVersionId}/approve`,
    {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: [
        'MODEL_WORDING_REVIEWED',
        'ANNEX_SCOPE_REVIEWED',
      ],
      reviewBasis:
        'Anonymous Contract and thirteen activities explicitly reviewed',
    },
    modelContractIdentities.preparer,
    ready.companyId,
  );
  const document = await ready.command(
    '/documents',
    {
      type: 'received-contract',
      opportunityId: ready.opportunityId,
      contractId: ready.contractId,
      contractVersionId: ready.contractVersionId,
      title: 'Representative received Contract DEMO',
      purpose: 'Preserve exact synthetic external copy',
      sourceDescription: 'Anonymous rehearsal source',
      receivedOn: null,
    },
    modelContractIdentities.preparer,
    ready.companyId,
  );
  const documentId = text(document.id),
    documentVersionId = text(object(document.version).id);
  const headers = {
    ...modelContractIdentities.preparer,
    'x-company-context-id': ready.companyId,
    'idempotency-key': randomUUID(),
  };
  const upload = await page.request.post(
    `${apiOrigin}/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=reported-demo.pdf`,
    {
      headers: { ...headers, 'content-type': 'application/pdf' },
      data: ready.pdfA,
    },
  );
  expect(upload.status()).toBe(201);
  const designated = await page.request.post(
    `${apiOrigin}/documents/${documentId}/versions/${documentVersionId}/official-designation`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { expectedRevision: 2 },
    },
  );
  expect(designated.status()).toBe(200);
  const projectTitle =
    'Representative thirteen-Task Project DEMO ' +
    (narrow ? 'narrow' : 'desktop');
  const project = await ready.command(
    '/projects/from-template',
    {
      title: projectTitle,
      clientAccountId: ready.clientId,
      templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
      templateVersion: 1,
    },
    modelContractIdentities.preparer,
    ready.companyId,
  );
  const projectId = text(project.id);
  const tasksBefore = await ready.read(
    `/projects/${projectId}/tasks`,
    ready.companyId,
  );
  expect(tasksBefore.tasks).toHaveLength(13);
  const contractBefore = object(
    (await ready.read(contractPath, ready.companyId)).contract,
  );
  const offerBefore = await ready.read(
    `/offers/opportunities/${ready.opportunityId}`,
    ready.companyId,
  );
  let identity = modelContractIdentities.owner;
  await page.route('**/api/**', (route) =>
    route.fallback({ headers: { ...route.request().headers(), ...identity } }),
  );
  await page.goto('/#access');
  const admin = page.locator('.company-access');
  await selectOption(admin.getByLabel('Workspace member'), {
    value: ready.preparerId,
  });
  await selectOption(admin.getByLabel('Company', { exact: true }), {
    value: ready.companyId,
  });
  await selectOption(admin.getByLabel('Access bundle'), {
    value: 'contract-signature-declarer',
  });
  await admin
    .getByRole('button', { name: 'Grant access', exact: true })
    .click();
  await expect(
    admin.getByText('Granted — captured version v1', { exact: true }),
  ).toBeVisible();
  identity = modelContractIdentities.preparer;
  async function openCase() {
    await page.goto('/');
    await selectReceivedCompany(page, ready.companyName, narrow);
    await navigateReceived(page, 'Client Requests', narrow);
    const workspace = page.locator('.commercial-intake-workspace');
    await workspace
      .getByRole('button')
      .filter({ has: page.getByText(ready.subject, { exact: true }) })
      .click();
    return workspace.locator('.model-contract-panel');
  }
  const panel = await openCase();
  const declaration = panel.getByRole('region', {
    name: 'Reported signing and case acceptance',
    exact: true,
  });
  await expect(
    declaration.getByLabel('Literal signatory label').first(),
  ).toHaveValue('');
  await declaration
    .getByRole('button', { name: 'Load eligible received PDFs' })
    .click();
  const selector = declaration.getByLabel(
    'Select the exact preserved received Contract PDF',
  );
  await selectOption(selector, {
    label:
      'Representative received Contract DEMO · 1 · Official · reported-demo.pdf',
  });
  // A selected PDF download belongs to its Document authority, independently
  // from the declaration draft that initially offered the reference.
  let releaseSelectedPdf: (() => void) | undefined;
  const selectedPdfRoute =
    '**/api/documents/' +
    documentId +
    '/versions/' +
    documentVersionId +
    '/content/*';
  await page.route(selectedPdfRoute, async (route) => {
    const actual = await route.fetch({
      headers: { ...route.request().headers(), ...identity },
    });
    expect(actual.status()).toBe(200);
    await new Promise<void>((resolve) => {
      releaseSelectedPdf = resolve;
    });
    await route.fulfill({ response: actual });
  });
  const selectedDownload = page.waitForEvent('download');
  await panel
    .getByRole('button', { name: 'Download this exact PDF', exact: true })
    .click();
  await expect.poll(() => Boolean(releaseSelectedPdf)).toBe(true);
  await ready.revoke('company-contract-signature-declarer');
  await declaration
    .getByRole('button', { name: 'Load eligible received PDFs' })
    .click();
  await expect(declaration).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: 'Download this exact PDF', exact: true }),
  ).toBeVisible();
  releaseSelectedPdf?.();
  const downloaded = await selectedDownload;
  const downloadedPath = await downloaded.path();
  if (!downloadedPath)
    throw new Error('Missing independently conserved PDF download.');
  expect(await readFile(downloadedPath)).toEqual(ready.pdfA);
  await page.unroute(selectedPdfRoute);
  await ready.command('/company-contract-signature-declarer-assignments', {
    companyId: ready.companyId,
    workspaceMembershipId: ready.preparerId,
  });
  await openCase();
  await declaration
    .getByRole('button', { name: 'Load eligible received PDFs' })
    .click();
  await selectOption(selector, {
    label:
      'Representative received Contract DEMO · 1 · Official · reported-demo.pdf',
  });
  const provider = declaration.getByRole('group', {
      name: 'Reported provider signatory',
    }),
    client = declaration.getByRole('group', {
      name: 'Reported Client signatory',
    });
  const providerLabel = '  Anonymous provider 😀 / Știință  ',
    clientLabel = ' Anonymous Client / Компания ';
  await provider.getByLabel('Literal signatory label').fill(providerLabel);
  await provider
    .getByLabel('Reported signing date (blank = unknown)')
    .fill('2026-01-01');
  await client.getByLabel('Literal signatory label').fill(clientLabel);
  await expect(
    client.getByLabel('Reported signing date (blank = unknown)'),
  ).toHaveValue('');
  await selectOption(client.getByLabel('Reported mandate'), {
    value: 'DECLARED_UNVERIFIED',
  });
  const mandateBasis =
      ' Literal unverified mandate basis\nNo inferred authority ',
    concordanceBasis =
      ' Compared exact synthetic PDF / approved Contract / Offer ',
    acceptanceBasis =
      ' Case acceptance reported through both signatures, unverified ';
  await client.getByLabel('Literal mandate basis').fill(mandateBasis);
  await declaration
    .getByLabel(
      'Basis for comparing this exact PDF, approved Contract and Offer',
    )
    .fill(concordanceBasis);
  await declaration
    .getByLabel(
      'Basis for this case accepting the exact Offer through both reported signatures',
    )
    .fill(acceptanceBasis);
  for (const checkbox of await declaration.getByRole('checkbox').all())
    await checkbox.check();
  const providerId = await provider
    .getByLabel('Literal signatory label')
    .getAttribute('id');
  if (!providerId) throw new Error('Missing labeled provider field.');
  const preservedProvider = page.locator(`[id="${providerId}"]`);
  let releaseOldReload: (() => void) | undefined;
  let heldOldReload = false;
  const rootReadRoute = '**/api' + contractPath;
  await page.route(rootReadRoute, async (route) => {
    if (route.request().method() !== 'GET' || heldOldReload)
      return route.fallback();
    heldOldReload = true;
    const old = await route.fetch({
      headers: { ...route.request().headers(), ...identity },
    });
    expect(old.status()).toBe(200);
    await new Promise<void>((resolve) => {
      releaseOldReload = resolve;
    });
    await route.fulfill({ response: old }).catch(() => undefined);
  });
  await panel
    .getByRole('button', { name: 'Reload Contract', exact: true })
    .click();
  await expect.poll(() => Boolean(releaseOldReload)).toBe(true);
  const declarationRequests: {
    body: string | null;
    key: string | undefined;
  }[] = [];
  for (const locale of ['fr', 'ro', 'ru', 'en']) {
    await selectOption(page.locator('#interface-locale'), { value: locale });
    await expect(preservedProvider).toHaveValue(providerLabel);
  }
  await enterClassicCompatibility(page);
  await expect(preservedProvider).toHaveValue(providerLabel);
  await page.getByRole('button', { name: 'Try Prisme', exact: true }).click();
  await expect(preservedProvider).toHaveValue(providerLabel);
  await exactReceivedDownload(
    page,
    panel.getByRole('button', { name: 'Download this exact PDF', exact: true }),
    ready.pdfA,
  );
  await declaration
    .getByRole('heading', { name: 'Reported signing and case acceptance' })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('reported-signing-literal-draft-viewport.png'),
  });
  await page.screenshot({
    path: info.outputPath('reported-signing-literal-draft.png'),
    fullPage: true,
  });
  const declarationPath =
    contractPath + `/versions/${ready.contractVersionId}/signing-declarations`;
  await page.route('**/api' + declarationPath, async (route) => {
    declarationRequests.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    const actual = await route.fetch({
      headers: { ...route.request().headers(), ...identity },
    });
    expect(actual.status()).toBe(201);
    const recorded = object(await actual.json());
    if (declarationRequests.length === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      });
    else if (declarationRequests.length === 2)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...recorded,
          acceptanceBasis: 'Mismatched success',
        }),
      });
    else await route.fulfill({ response: actual });
  });
  await declaration
    .getByRole('button', {
      name: 'Declare both reported signatures, concordance and case acceptance',
    })
    .click();
  await expect(
    panel.getByRole('button', { name: 'Retry the identical declaration' }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', {
      name: 'Copy this Version into a successor draft',
    }),
  ).toBeDisabled();
  await expect(
    panel.getByRole('button', {
      name: 'Download exact non-official Contract HTML',
    }),
  ).toBeEnabled();
  // A later independently read executed head must not erase the still-uncertain original key.
  await panel
    .getByRole('button', { name: 'Reload Contract', exact: true })
    .click();
  await expect(
    panel.getByRole('heading', { name: 'Recorded declaration' }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Retry the identical declaration' }),
  ).toBeVisible();
  await enterClassicCompatibility(page);
  await panel
    .getByRole('button', { name: 'Retry the identical declaration' })
    .click();
  await expect.poll(() => declarationRequests.length).toBe(2);
  await page.getByRole('button', { name: 'Try Prisme', exact: true }).click();
  await panel
    .getByRole('button', { name: 'Retry the identical declaration' })
    .click();
  await expect(
    panel.getByRole('button', { name: 'Retry the identical declaration' }),
  ).toHaveCount(0);
  releaseOldReload?.();
  await page.unroute(rootReadRoute);
  await expect(
    panel.getByRole('heading', { name: 'Recorded declaration' }),
  ).toBeVisible();
  expect(declarationRequests).toHaveLength(3);
  expect(declarationRequests[1]).toEqual(declarationRequests[0]);
  expect(declarationRequests[2]).toEqual(declarationRequests[0]);
  const body = object(JSON.parse(declarationRequests[0]?.body ?? '{}'));
  expect(body).toMatchObject({
    expectedContractRevision: 2,
    documentId,
    documentVersionId,
    providerSignatory: {
      label: providerLabel,
      signedOn: '2026-01-01',
      mandate: { kind: 'UNKNOWN' },
    },
    clientSignatory: {
      label: clientLabel,
      signedOn: null,
      mandate: { kind: 'DECLARED_UNVERIFIED', basis: mandateBasis },
    },
    concordanceBasis,
    acceptanceBasis,
  });
  await panel
    .getByRole('heading', { name: 'Recorded declaration' })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('reported-signing-conserved-viewport.png'),
  });
  await page.screenshot({
    path: info.outputPath('reported-signing-conserved.png'),
    fullPage: true,
  });
  const linkAttempts: { body: string | null; key: string | undefined }[] = [];
  await page.route('**/api' + contractPath + '/projects', async (route) => {
    linkAttempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    const actual = await route.fetch({
      headers: { ...route.request().headers(), ...identity },
    });
    expect(actual.status()).toBe(201);
    if (linkAttempts.length === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      });
    else await route.fulfill({ response: actual });
  });
  const pendingProject = panel.getByRole('region', {
    name: 'Contract Projects',
    exact: true,
  });
  await pendingProject
    .locator(`input[type="radio"][value="${projectId}"]`)
    .check();
  await pendingProject
    .getByRole('button', { name: 'Link selected Project', exact: true })
    .click();
  await expect(
    pendingProject.getByRole('button', {
      name: 'Retry the same Project link',
      exact: true,
    }),
  ).toBeVisible();
  await ready.revoke('company-contract-signature-declarer');
  await ready.revoke('company-document-content-reader');
  await panel
    .getByRole('button', { name: 'Download this exact PDF', exact: true })
    .click();
  await expect(
    panel.getByText(
      'PDF reference withheld: independent Document or content access is unavailable.',
    ),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Reload Contract', exact: true })
    .click();
  await expect(
    panel.getByText(
      'PDF reference withheld: independent Document or content access is unavailable.',
    ),
  ).toBeVisible();
  await pendingProject
    .getByRole('button', { name: 'Retry the same Project link', exact: true })
    .click();
  await expect(
    pendingProject.getByRole('button', {
      name: 'Retry the same Project link',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(linkAttempts).toHaveLength(2);
  expect(linkAttempts[1]).toEqual(linkAttempts[0]);
  const reopened = await openCase();
  await expect(
    reopened.getByRole('heading', { name: 'Recorded declaration' }),
  ).toBeVisible();
  await expect(
    reopened.getByText(
      'PDF reference withheld: independent Document or content access is unavailable.',
    ),
  ).toBeVisible();
  await expect(
    reopened.getByText('reported-demo.pdf', { exact: false }),
  ).toHaveCount(0);
  const projectControls = reopened.getByRole('region', {
    name: 'Contract Projects',
    exact: true,
  });
  await expect(
    projectControls.getByText(projectTitle, { exact: true }).first(),
  ).toBeVisible();
  const current = object(
    (await ready.read(contractPath, ready.companyId)).contract,
  );
  expect(current).toMatchObject({
    revision: 4,
    linkedProjects: [expect.objectContaining({ id: projectId })],
    version: {
      executionState: 'EXECUTED',
      signature: { pdf: { access: 'denied' } },
    },
  });
  expect(object(current.version).representation).toEqual(
    object(contractBefore.version).representation,
  );
  expect(
    await ready.read(`/projects/${projectId}/tasks`, ready.companyId),
  ).toEqual(tasksBefore);
  expect(
    await ready.read(
      `/offers/opportunities/${ready.opportunityId}`,
      ready.companyId,
    ),
  ).toEqual(offerBefore);
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
  await projectControls
    .getByRole('heading', { name: 'Contract Projects', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('reported-signing-existing-project-viewport.png'),
  });
  await page.screenshot({
    path: info.outputPath('reported-signing-existing-project.png'),
    fullPage: true,
  });
});
