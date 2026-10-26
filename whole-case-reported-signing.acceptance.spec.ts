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
test('completes the anonymous representative Request to thirteen exact results and ordinary Project closure', async ({
  page,
}, info) => {
  test.setTimeout(360_000);
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

  // Private milestone harness: the committed production tree is unchanged.
  // Every fact and PDF below is deliberately synthetic, with no real content approval.
  for (const bundle of ['company-document-content-reader', 'company-mission-deliverable-access', 'company-document-project-organizer', 'company-task-result-recorder', 'company-project-approver'])
    await ready.command('/' + bundle + '-assignments', { companyId: ready.companyId, workspaceMembershipId: ready.preparerId });
  const caseHeaders = { ...modelContractIdentities.preparer, 'x-company-context-id': ready.companyId };
  async function mutate(method: string, path: string, data: unknown, status: number, key = randomUUID()) {
    const result = await page.request.fetch(apiOrigin + path, { method, headers: { ...caseHeaders, 'idempotency-key': key }, data });
    expect(result.status(), path).toBe(status);
    return object(await result.json());
  }
  function revision(value: unknown) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Missing observed revision.');
    return value;
  }
  const responsible = await ready.read(`/projects/${projectId}/responsible`, ready.companyId);
  await mutate('PUT', `/projects/${projectId}/responsible`, { expectedRevision: revision(responsible.revision), workspaceMembershipId: ready.preparerId }, 200);
  const listing = await ready.read(`/projects/${projectId}/tasks`, ready.companyId);
  if (!Array.isArray(listing.tasks) || listing.tasks.length !== 13) throw new Error('Expected the exact existing thirteen ordinary Tasks.');
  const taskRows = listing.tasks.map(object);
  for (const row of taskRows)
    await mutate('PATCH', `/tasks/${text(row.id)}`, { expectedVersion: revision(row.version), assigneeMembershipId: ready.preparerId, dueDate: '2026-12-31' }, 200);
  // This is a deliberate anonymous human declaration, not an automatic completeness check.
  const startDeclaration = { approvedOffer: 'present', contractOrPrecontract: 'present', projectPlan: 'present', initialDocuments: 'present', deadlines: 'present', financialConditions: 'present', risks: 'present' };
  const lifecycleBefore = await ready.read(`/projects/${projectId}/lifecycle`, ready.companyId);
  await mutate('POST', `/projects/${projectId}/lifecycle-transitions`, { action: 'activate', expectedLifecycleRevision: revision(lifecycleBefore.lifecycleRevision), declaration: startDeclaration }, 200);
  const premature = await page.request.post(`${apiOrigin}/projects/${projectId}/lifecycle-transitions`, { headers: { ...caseHeaders, 'idempotency-key': randomUUID() }, data: { action: 'complete', expectedLifecycleRevision: 1, note: 'Deliberate premature closure refusal probe' } });
  expect(premature.status()).toBe(409);
  const outputs: { taskId: string; taskTitle: string; documentId: string; versionId: string; declaration: string; bytes: Buffer }[] = [];
  for (const [index, row] of taskRows.entries()) {
    const taskId = text(row.id), taskTitle = text(row.title), ordinal = String(index + 1).padStart(2, '0');
    const doc = await ready.command('/documents', { type: 'mission-deliverable', clientId: ready.clientId, title: 'Representative output ' + ordinal + ' DEMO', purpose: 'Anonymous exact result evidence for ordinary activity ' + ordinal }, modelContractIdentities.preparer, ready.companyId);
    const docId = text(doc.id), versionId = text(object(doc.version).id);
    const bytes = Buffer.from(ready.pdfA), marker = bytes.indexOf('DEMO');
    if (marker < 0) throw new Error('Missing synthetic PDF marker.');
    bytes.write('R' + String(index + 1).padStart(3, '0'), marker, 'ascii');
    const uploaded = await page.request.post(`${apiOrigin}/documents/${docId}/versions/${versionId}/content?expectedRevision=1&fileName=result-${ordinal}-demo.pdf`, { headers: { ...caseHeaders, 'idempotency-key': randomUUID(), 'content-type': 'application/pdf' }, data: bytes });
    expect(uploaded.status()).toBe(201);
    await mutate('POST', `/documents/${docId}/versions/${versionId}/official-designation`, { expectedRevision: 2 }, 200);
    await ready.command(`/documents/${docId}/project-association`, { action: 'link', projectId, expectedRevision: 0 }, modelContractIdentities.preparer, ready.companyId);
    const taskDetail = await ready.read(`/tasks/${taskId}`, ready.companyId);
    const task = object(taskDetail.task), observedVersion = revision(task.version);
    const declared = 'Anonymous result for activity ' + ordinal + ': ' + taskTitle;
    await ready.command(`/tasks/${taskId}/results`, { expectedTaskVersion: observedVersion, expectedResultRevision: 0, documentId: docId, versionId, declaration: declared }, modelContractIdentities.preparer, ready.companyId);
    await ready.command(`/tasks/${taskId}/complete`, { expectedVersion: observedVersion }, modelContractIdentities.preparer, ready.companyId);
    const result = await ready.read(`/tasks/${taskId}/results`, ready.companyId);
    expect(result).toMatchObject({ revision: 1, current: { declaration: declared, reference: { documentId: docId, versionId, status: 'official' } } });
    const downloaded = await page.request.get(`${apiOrigin}/documents/${docId}/versions/${versionId}/content`, { headers: caseHeaders });
    expect(downloaded.status()).toBe(200); expect(await downloaded.body()).toEqual(bytes);
    outputs.push({ taskId, taskTitle, documentId: docId, versionId, declaration: declared, bytes });
  }
  const completedTasks = await ready.read(`/projects/${projectId}/tasks`, ready.companyId);
  expect(completedTasks.tasks).toHaveLength(13);
  if (!Array.isArray(completedTasks.tasks)) throw new Error('Missing persisted Tasks.');
  expect(completedTasks.tasks.map(object).map((t) => t.id).sort()).toEqual(taskRows.map((t) => t.id).sort());
  expect(completedTasks.tasks.map(object).every((t) => t.status === 'done')).toBe(true);
  const reopenedContract = await openCase();
  await reopenedContract.getByRole('button', { name: 'Open Project', exact: true }).click();
  const projects = page.locator('.project-workspace');
  await expect(projects.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
  const lifecycle = projects.getByRole('region', { name: 'Lifecycle', exact: true });
  await lifecycle.getByRole('button', { name: 'Complete Project', exact: true }).click();
  const completionNote = 'Thirteen ordinary Tasks explicitly completed with exact anonymous result and PDF Versions. Representative rehearsal only.';
  await lifecycle.getByLabel('Completion note', { exact: true }).fill(completionNote);
  await lifecycle.getByRole('button', { name: 'Complete Project', exact: true }).click();
  await expect(lifecycle.getByText('Completed', { exact: true }).first()).toBeVisible();
  expect(await ready.read(`/projects/${projectId}/lifecycle`, ready.companyId)).toMatchObject({ status: 'completed', mutable: false });
  await page.screenshot({ path: info.outputPath('whole-case-closed-viewport.png') });
  const closedContract = await openCase();
  await closedContract.getByRole('button', { name: 'Open Project', exact: true }).click();
  await expect(projects.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
  await projects.getByRole('tab', { name: 'Tasks', exact: true }).click();
  const tasks = projects.locator('.project-tasks');
  const last = outputs.at(-1); if (!last) throw new Error('Missing last exact output.');
  await tasks.locator('.task-list').getByRole('button', { name: last.taskTitle, exact: true }).click();
  const resultPanel = tasks.locator('.task-results');
  await expect(resultPanel.getByText(last.declaration, { exact: true })).toBeVisible();
  await exactReceivedDownload(page, resultPanel.getByRole('button', { name: 'Download exact PDF · Version 1', exact: true }), last.bytes);
  await page.screenshot({ path: info.outputPath('whole-case-final-result-viewport.png') });
  for (const output of outputs) {
    expect(await ready.read(`/tasks/${output.taskId}/results`, ready.companyId)).toMatchObject({ mutable: false, current: { declaration: output.declaration, reference: { documentId: output.documentId, versionId: output.versionId } } });
    const downloaded = await page.request.get(`${apiOrigin}/documents/${output.documentId}/versions/${output.versionId}/content`, { headers: caseHeaders });
    expect(downloaded.status()).toBe(200); expect(await downloaded.body()).toEqual(output.bytes);
  }
  const foreign = await page.request.get(`${apiOrigin}/projects/${projectId}`, { headers: { ...caseHeaders, 'x-company-context-id': ready.otherCompanyId } });
  expect([403,404]).toContain(foreign.status()); expect(await foreign.text()).not.toContain(projectTitle);
  await ready.revoke('company-document-content-reader');
  const deniedBytes = await page.request.get(`${apiOrigin}/documents/${last.documentId}/versions/${last.versionId}/content`, { headers: caseHeaders });
  expect(deniedBytes.status()).toBe(403);
  expect(await ready.read(`/projects/${projectId}/lifecycle`, ready.companyId)).toMatchObject({ status: 'completed' });
  expect(await ready.read(`/offers/opportunities/${ready.opportunityId}`, ready.companyId)).toEqual(offerBefore);
  const finalContract = object((await ready.read(contractPath, ready.companyId)).contract);
  expect(finalContract).toMatchObject({ revision: 4, linkedProjects: [expect.objectContaining({ id: projectId })], version: { executionState: 'EXECUTED', signature: { evidenceKind: 'DECLARED_RECEIVED_PDF', pdf: { access: 'denied' } } } });
  await info.attach('whole-case-summary.json', { contentType: 'application/json', body: Buffer.from(JSON.stringify({ synthetic: true, projectId, contractId: ready.contractId, ordinaryTasks: 13, exactResultVersions: outputs.length, exactPdfBytesBeforeAndAfterClosure: true, projectStatus: 'completed', reloadedThroughActualApp: true, offerResponseUnchanged: true, foreignCompanyDenied: true, independentPdfAccessDenied: true })) });

});
