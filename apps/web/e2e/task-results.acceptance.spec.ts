import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { enterClassicCompatibility } from './classic-compatibility';
import { selectOption } from './select-option';

const origin = 'http://127.0.0.1:4174/api';
const ada = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const owner = {
  ...ada,
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected identified response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Expected identity');
  return value;
}
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
async function exactDownload(page: Page, button: Locator, bytes: Buffer) {
  const pending = page.waitForEvent('download');
  await button.click();
  const path = await (await pending).path();
  if (!path) throw new Error('Missing exact download');
  expect(await readFile(path)).toEqual(bytes);
}

test('records a Task result, preserves its exact superseded PDF, corrects and completes/reopens without rewriting history under independent rights', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const companyId = text(process.env.ACCEPTANCE_PRIMARY_COMPANY_ID);
  const membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const identity = { ...ada, 'x-company-context-id': companyId };
  const title = `Task-result mission DEMO ${suffix}`;
  const projectTitle = `Task-result Project DEMO ${suffix}`;
  const taskTitle = `Prepare mission output DEMO ${suffix}`;
  const firstText = `Prepared the first mission output DEMO ${suffix}`;
  const secondText = `Updated the mission output DEMO ${suffix}`;
  const pdfA = await readFile(
    new URL(
      '../../api/test-support/fixtures/questionnaire-demo.pdf',
      import.meta.url,
    ),
  );
  const pdfB = Buffer.from(pdfA);
  pdfB.write('NEXT', pdfB.indexOf('DEMO'), 'ascii');
  const grants = new Set<string>();
  async function assign(bundle: string, active: boolean) {
    const path = `${origin}/company-${bundle}-assignments`;
    const headers = { ...owner, 'idempotency-key': randomUUID() };
    const response = active
      ? await page.request.post(path, {
          headers,
          data: { companyId, workspaceMembershipId: membershipId },
        })
      : await page.request.delete(`${path}/${membershipId}/${companyId}`, {
          headers,
        });
    expect(response.status()).toBe(active ? 201 : 200);
    if (active) grants.add(bundle);
    else grants.delete(bundle);
  }
  async function post(path: string, data: unknown) {
    const response = await page.request.post(`${origin}${path}`, {
      headers: { ...identity, 'idempotency-key': randomUUID() },
      data,
    });
    expect(response.status()).toBe(201);
    return record(await response.json());
  }
  async function openTask() {
    await page.goto('/');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: 'PRISMA-PRIM',
    });
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await navigate(page, 'Projects', narrow);
    const projects = page.locator('.project-workspace');
    await projects
      .getByRole('searchbox', { name: 'Find Projects' })
      .fill(projectTitle);
    await projects
      .getByRole('list', { name: 'Projects' })
      .getByRole('button', { name: new RegExp(projectTitle, 'u') })
      .click();
    await projects.getByRole('tab', { name: 'Tasks', exact: true }).click();
    const tasks = projects.locator('.project-tasks');
    await tasks
      .locator('.task-list')
      .getByRole('button', { name: taskTitle, exact: true })
      .click();
    return tasks;
  }
  try {
    for (const bundle of [
      'mission-deliverable-access',
      'document-content-reader',
      'document-content-uploader',
      'document-approver',
      'task-result-recorder',
    ])
      await assign(bundle, true);
    const client = await post('/clients', {
      displayName: `Task-result Client DEMO ${suffix}`,
    });
    const clientId = text(client.id);
    const project = await post('/projects', {
      title: projectTitle,
      clientAccountId: clientId,
    });
    const projectId = text(project.id);
    const taskId = text(
      (await post(`/projects/${projectId}/tasks`, { title: taskTitle })).id,
    );
    const document = await post('/documents', {
      type: 'mission-deliverable',
      clientId,
      title,
      purpose: 'Synthetic declared result evidence',
    });
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    const upload = await page.request.post(
      `${origin}/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=task-result-a.pdf`,
      {
        headers: {
          ...identity,
          'idempotency-key': randomUUID(),
          'content-type': 'application/pdf',
        },
        data: pdfA,
      },
    );
    expect(upload.status()).toBe(201);
    expect(
      (
        await page.request.post(
          `${origin}/documents/${documentId}/versions/${versionId}/official-designation`,
          {
            headers: { ...identity, 'idempotency-key': randomUUID() },
            data: { expectedRevision: 2 },
          },
        )
      ).status(),
    ).toBe(200);
    await post(`/documents/${documentId}/project-association`, {
      action: 'link',
      projectId,
      expectedRevision: 0,
    });
    let tasks = await openTask();
    let results = tasks.locator('.task-results');
    await expect(results.getByText('No declared result.')).toBeVisible();
    await results.getByLabel('Result declaration').fill(firstText);
    await results.getByLabel('Frozen mission Version').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(results.getByLabel('Frozen mission Version')).toHaveText(
      new RegExp(title, 'u'),
    );
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await results.screenshot({
      path: testInfo.outputPath('task-result-record-form.png'),
    });
    await results
      .getByRole('button', { name: 'Record result', exact: true })
      .click();
    await expect(results.getByText('Result confirmed.')).toBeVisible();
    await expect(results.getByText(firstText, { exact: true })).toBeVisible();
    await exactDownload(
      page,
      results.getByRole('button', {
        name: 'Download exact PDF · Version 1',
        exact: true,
      }),
      pdfA,
    );
    await navigate(page, 'Working Documents', narrow);
    const documents = page.locator('.working-documents');
    await documents.getByRole('button', { name: title, exact: true }).click();
    await documents
      .getByRole('button', { name: 'Start new draft', exact: true })
      .click();
    const successor = documents.locator('.working-document-version').filter({
      has: page.getByRole('heading', { name: 'Version 2', exact: true }),
    });
    await successor.getByLabel('Choose the PDF file').setInputFiles({
      name: 'task-result-b.pdf',
      mimeType: 'application/pdf',
      buffer: pdfB,
    });
    await successor
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(
      successor.getByText('task-result-b.pdf', { exact: true }),
    ).toBeVisible();
    await successor
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    await documents
      .getByRole('button', { name: 'Confirm official designation' })
      .click();
    tasks = await openTask();
    results = tasks.locator('.task-results');
    await expect(results.getByText(firstText, { exact: true })).toBeVisible();
    await expect(results.getByText(/Superseded · historical/u)).toBeVisible();
    await exactDownload(
      page,
      results.getByRole('button', {
        name: 'Download exact PDF · Version 1',
        exact: true,
      }),
      pdfA,
    );
    await results
      .getByRole('button', { name: 'Correct result', exact: true })
      .click();
    await results.getByLabel('Result declaration').fill(secondText);
    await selectOption(results.getByLabel('Frozen mission Version'), {
      label: `${title} · 2 · Official`,
    });
    await results
      .getByLabel('Correction reason')
      .fill('New preserved output DEMO');
    await results
      .getByRole('button', { name: 'Save correction', exact: true })
      .click();
    await expect(results.getByText(secondText, { exact: true })).toBeVisible();
    await exactDownload(
      page,
      results.getByRole('button', {
        name: 'Download exact PDF · Version 2',
        exact: true,
      }),
      pdfB,
    );
    await tasks.getByRole('button', { name: 'Mark done', exact: true }).click();
    await expect(
      results.getByText(/Result history is read-only/u),
    ).toBeVisible();
    await tasks
      .getByRole('button', { name: 'Reopen Task', exact: true })
      .click();
    await expect(
      results.getByRole('button', { name: 'Correct result', exact: true }),
    ).toBeVisible();
    await results
      .getByRole('button', { name: 'Result history', exact: true })
      .click();
    const history = results.getByRole('list');
    await expect(history.getByRole('listitem')).toHaveCount(2);
    await expect(history.getByRole('listitem').nth(0)).toContainText(
      secondText,
    );
    await expect(history.getByRole('listitem').nth(1)).toContainText(firstText);
    await exactDownload(
      page,
      history.getByRole('button', {
        name: 'Download exact PDF · Version 1',
        exact: true,
      }),
      pdfA,
    );
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await results
      .getByRole('heading', { name: 'Declared Task result', exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath('task-result-exact-history.png'),
      fullPage: true,
    });
    await results.screenshot({
      path: testInfo.outputPath('task-result-protected-history.png'),
    });
    await assign('task-result-recorder', false);
    tasks = await openTask();
    results = tasks.locator('.task-results');
    await expect(results.getByText(secondText, { exact: true })).toBeVisible();
    await expect(
      results.getByRole('button', { name: 'Correct result', exact: true }),
    ).toHaveCount(0);
    await assign('document-content-reader', false);
    tasks = await openTask();
    results = tasks.locator('.task-results');
    await expect(
      tasks.getByRole('heading', { name: taskTitle, exact: true }),
    ).toBeVisible();
    await expect(
      results.getByText(
        'Task result access is unavailable. Ordinary Task work remains separate.',
      ),
    ).toBeVisible();
    await expect(results.getByText(secondText, { exact: true })).toHaveCount(0);
    await expect(
      results.getByRole('button', { name: /Download exact PDF/u }),
    ).toHaveCount(0);
    expect(
      (
        await page.request.get(`${origin}/tasks/${taskId}/results/history`, {
          headers: identity,
        })
      ).status(),
    ).toBe(404);
  } finally {
    for (const bundle of [...grants].reverse()) await assign(bundle, false);
  }
});

// Seed through public REST; the new read/reload/navigation outcome uses the actual App.
test('inspects mission readiness without accepting work and preserves independent evidence access', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const narrow = info.project.name.endsWith('narrow');
  const companyId = text(process.env.ACCEPTANCE_PRIMARY_COMPANY_ID),
    membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const headers = { ...ada, 'x-company-context-id': companyId },
    title = `Mission readiness DEMO ${narrow ? 'narrow' : 'desktop'}`;
  const bundles = [
    'mission-result-reviewer',
    'project-template-user',
    'mission-deliverable-access',
    'document-content-reader',
    'document-content-uploader',
    'document-approver',
    'document-project-organizer',
    'task-result-recorder',
  ];
  const granted = new Set<string>();
  async function assign(bundle: string, active: boolean) {
    const path = `${origin}/company-${bundle}-assignments`,
      options = { headers: { ...owner, 'idempotency-key': randomUUID() } };
    const response = active
      ? await page.request.post(path, {
          ...options,
          data: { companyId, workspaceMembershipId: membershipId },
        })
      : await page.request.delete(
          `${path}/${membershipId}/${companyId}`,
          options,
        );
    expect(response.status()).toBe(active ? 201 : 200);
    if (active) granted.add(bundle);
    else granted.delete(bundle);
  }
  async function post(path: string, data: unknown) {
    const response = await page.request.post(`${origin}${path}`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data,
    });
    expect(response.status()).toBe(201);
    return record(await response.json());
  }
  async function openProject() {
    await page.goto('/');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(
      page.getByLabel('Active Company', { exact: true }),
      companyId,
    );
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await navigate(page, 'Projects', narrow);
    const projects = page.locator('.project-workspace');
    await projects
      .getByRole('searchbox', { name: 'Find Projects' })
      .fill(title);
    await projects
      .getByRole('list', { name: 'Projects', exact: true })
      .getByRole('button', { name: new RegExp(title, 'u') })
      .click();
    return projects;
  }
  try {
    for (const bundle of bundles) await assign(bundle, true);
    expect(
      (
        await page.request.post(`${origin}/company-context-assignments`, {
          headers: { ...owner, 'idempotency-key': randomUUID() },
          data: {
            companyId: text(process.env.ACCEPTANCE_OTHER_COMPANY_ID),
            workspaceMembershipId: membershipId,
          },
        })
      ).status(),
    ).toBe(201);

    const clientId = text(
      (await post('/clients', { displayName: title + ' Client' })).id,
    );
    const projectId = text(
      (
        await post('/projects/from-template', {
          title,
          clientAccountId: clientId,
          templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
          templateVersion: 1,
        })
      ).id,
    );
    const planResponse = await page.request.get(
      `${origin}/projects/${projectId}/template`,
      { headers },
    );
    expect(planResponse.status()).toBe(200);
    const plan = record(record(await planResponse.json()).template);
    if (!Array.isArray(plan.activities))
      throw new Error('Missing copied activities');
    const [first, second, third] = plan.activities.map((value) =>
      text(record(value).taskId),
    );
    if (!first || !second || !third) throw new Error('Missing mapped Tasks');
    const pdf = await readFile(
      new URL(
        '../../api/test-support/fixtures/questionnaire-demo.pdf',
        import.meta.url,
      ),
    );
    const document = await post('/documents', {
      type: 'mission-deliverable',
      clientId,
      title: title + ' PDF',
      purpose: 'Synthetic readiness evidence',
    });
    const documentId = text(document.id),
      versionId = text(record(document.version).id),
      declaration = `Literal readiness result ${narrow ? 'narrow' : 'desktop'} DEMO883`;
    const upload = await page.request.post(
      `${origin}/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=readiness-demo.pdf`,
      {
        headers: {
          ...headers,
          'idempotency-key': randomUUID(),
          'content-type': 'application/pdf',
        },
        data: pdf,
      },
    );
    expect(upload.status()).toBe(201);
    expect(
      (
        await page.request.post(
          `${origin}/documents/${documentId}/versions/${versionId}/official-designation`,
          {
            headers: { ...headers, 'idempotency-key': randomUUID() },
            data: { expectedRevision: 2 },
          },
        )
      ).status(),
    ).toBe(200);
    await post(`/documents/${documentId}/project-association`, {
      action: 'link',
      projectId,
      expectedRevision: 0,
    });
    await post(`/tasks/${third}/results`, {
      expectedTaskVersion: 1,
      expectedResultRevision: 0,
      documentId,
      versionId,
      declaration,
    });
    for (const taskId of [first, third])
      await post(`/tasks/${taskId}/complete`, { expectedVersion: 1 });
    await post(`/tasks/${second}/cancel`, {
      expectedVersion: 1,
      reason: 'Cancellation is not fulfillment DEMO',
    });
    const projects = await openProject();
    let readiness = projects.getByRole('region', {
      name: 'Mission readiness',
      exact: true,
    });
    await expect(readiness.getByRole('listitem')).toHaveCount(13);
    await expect(
      readiness.getByText('Task done; no recorded result', { exact: true }),
    ).toBeVisible();
    await expect(
      readiness.getByText('Work cancelled; not fulfilled', { exact: true }),
    ).toBeVisible();
    await expect(
      readiness.getByText('Task done; recorded declaration', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(readiness.getByText('Work open', { exact: true })).toHaveCount(
      10,
    );
    await expect(
      readiness.getByText('Certificare obținută', { exact: true }),
    ).toBeVisible();
    await expect(
      readiness.getByText(
        'Whether the mission can close before certification, and the evidence required, await business clarification.',
        { exact: true },
      ),
    ).toBeVisible();
    const reviewRegion = projects.locator('.mission-result-review');
    await expect(reviewRegion).toHaveAccessibleName('Mission result review');
    await expect(reviewRegion.getByRole('checkbox')).toHaveCount(13);
    await reviewRegion
      .getByRole('checkbox', { name: 'Select activity — CT_AN01', exact: true })
      .check();
    await reviewRegion
      .getByRole('checkbox', { name: 'Select activity — CT_AN03', exact: true })
      .check();
    await reviewRegion
      .getByRole('textbox', {
        name: 'Literal external reference — CT_AN01',
        exact: true,
      })
      .fill('Physical register {literal} DEMO887');
    await reviewRegion
      .getByRole('combobox', { name: 'Review outcome', exact: true })
      .selectOption('ACCEPTED_BY_REVIEWER');
    await reviewRegion
      .getByRole('textbox', { name: 'Shared review basis', exact: true })
      .fill('Reviewed literal criteria and exact declared evidence DEMO887');
    const sent: Array<{ body: string | null; key: string | undefined }> = [];
    let loseFirstConfirmation = true;
    const reviewPattern = `**/api/projects/${projectId}/mission-result-reviews`;
    await page.route(reviewPattern, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      sent.push({
        body: route.request().postData(),
        key: route.request().headers()['idempotency-key'],
      });
      if (loseFirstConfirmation) {
        loseFirstConfirmation = false;
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        await route.abort('failed');
      } else await route.continue();
    });
    await reviewRegion
      .getByRole('button', { name: 'Record human review', exact: true })
      .click();
    await expect(
      reviewRegion.getByRole('button', {
        name: 'Retry identical review',
        exact: true,
      }),
    ).toBeVisible();
    const presentationRequests: string[] = [];
    const countPresentation = (request: { url(): string }) => {
      if (
        request.url().includes(`/projects/${projectId}/mission-result-reviews`)
      )
        presentationRequests.push(request.url());
    };
    page.on('request', countPresentation);
    for (const locale of ['ro', 'ru', 'fr', 'en']) {
      await selectOption(page.locator('#interface-locale'), locale);
      await expect(reviewRegion.locator('textarea')).toHaveValue(
        'Reviewed literal criteria and exact declared evidence DEMO887',
      );
      await expect(
        reviewRegion.locator('input:not([type="checkbox"])'),
      ).toHaveValue('Physical register {literal} DEMO887');
    }
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await enterClassicCompatibility(page);
    await expect(reviewRegion.locator('textarea')).toHaveValue(
      'Reviewed literal criteria and exact declared evidence DEMO887',
    );
    await page.getByRole('button', { name: 'Try Prisme' }).click();
    if (narrow)
      await expect(
        page.getByRole('button', { name: 'Open navigation' }),
      ).toBeVisible();
    expect(presentationRequests).toEqual([]);
    page.off('request', countPresentation);
    await reviewRegion
      .getByRole('button', { name: 'Retry identical review', exact: true })
      .click();
    await expect(
      reviewRegion.getByText('Review confirmed.', { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    await page.unroute(reviewPattern);
    await expect(
      reviewRegion.getByText('Observed app facts still match', { exact: true }),
    ).toHaveCount(2);
    const reviewed = record(
      await (
        await page.request.get(
          `${origin}/projects/${projectId}/mission-result-reviews/history`,
          { headers },
        )
      ).json(),
    );
    expect(record(reviewed.history).batches).toHaveLength(1);
    await reviewRegion.screenshot({
      path: info.outputPath('mission-human-review.png'),
    });
    await readiness
      .getByRole('button', { name: 'Open Task — CT_AN03', exact: true })
      .click();
    const results = projects.locator('.task-results');
    await expect(results.getByText(declaration, { exact: true })).toBeVisible();
    await exactDownload(
      page,
      results.getByRole('button', { name: /Download exact PDF/u }),
      pdf,
    );
    await post(`/tasks/${first}/reopen`, { expectedVersion: 2 });
    await reviewRegion
      .getByRole('button', { name: 'Reload review', exact: true })
      .click();
    await expect(
      reviewRegion.getByText('App facts changed; review again', {
        exact: true,
      }),
    ).toHaveCount(1);
    await readiness
      .getByRole('button', { name: 'Reload mission readiness', exact: true })
      .click();
    await expect(readiness.getByText('Work open', { exact: true })).toHaveCount(
      11,
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await readiness.screenshot({
      path: info.outputPath('mission-readiness.png'),
    });

    let releaseOld = () => {},
      markHeld = () => {};
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const held = new Promise<void>((resolve) => {
      markHeld = resolve;
    });
    let firstRead = true;
    const pattern = `**/api/projects/${projectId}/mission-readiness`;
    await page.route(pattern, async (route) => {
      const response = await route.fetch();
      if (firstRead) {
        firstRead = false;
        markHeld();
        await oldGate;
      }
      await route.fulfill({ response });
    });
    await readiness
      .getByRole('button', { name: 'Reload mission readiness', exact: true })
      .click();
    await held;
    await assign('document-content-reader', false);
    // A real Company change retires the old App owner, then the same Project
    // is reopened under newly observed evidence denial before releasing old data.
    try {
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await selectOption(
        page.getByLabel('Active Company', { exact: true }),
        text(process.env.ACCEPTANCE_OTHER_COMPANY_ID),
      );
      await expect(readiness).toHaveCount(0);
      await selectOption(
        page.getByLabel('Active Company', { exact: true }),
        companyId,
      );
      if (narrow)
        await page.getByRole('button', { name: 'Close navigation' }).click();
      await navigate(page, 'Projects', narrow);
      await projects
        .getByRole('searchbox', { name: 'Find Projects' })
        .fill(title);
      await projects
        .getByRole('list', { name: 'Projects', exact: true })
        .getByRole('button', { name: new RegExp(title, 'u') })
        .click();
      await expect(
        readiness.getByText('Task done; evidence unavailable', { exact: true }),
      ).toBeVisible();
    } finally {
      releaseOld();
    }

    readiness = projects.getByRole('region', {
      name: 'Mission readiness',
      exact: true,
    });
    await expect(
      readiness.getByText('Task done; evidence unavailable', { exact: true }),
    ).toBeVisible();
    await expect(readiness.getByText(declaration, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      readiness.getByText(title + ' PDF', { exact: false }),
    ).toHaveCount(0);
    await expect(
      projects
        .getByRole('region', { name: 'Plan copied from template', exact: true })
        .getByRole('listitem'),
    ).toHaveCount(13);
  } finally {
    expect(
      (
        await page.request.delete(
          `${origin}/company-context-assignments/${membershipId}/${text(process.env.ACCEPTANCE_OTHER_COMPANY_ID)}`,
          { headers: { ...owner, 'idempotency-key': randomUUID() } },
        )
      ).status(),
    ).toBe(200);
    for (const bundle of [...granted].reverse()) await assign(bundle, false);
  }
});
