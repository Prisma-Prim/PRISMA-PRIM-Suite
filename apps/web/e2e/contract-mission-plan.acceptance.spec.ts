import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  prepareReceivedContractCase,
  modelContractIdentities as identities,
  object,
  text,
  selectReceivedCompany,
  navigateReceived,
} from './received-contract.acceptance.fixture';
const api = 'http://127.0.0.1:4174/api';
test('creates a configured mission from the eligible Contract, recovers after real candidate refresh and preserves native Tasks and exact source', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'Narrow' : 'Desktop';
  const f = await prepareReceivedContractCase(
    page,
    'configured-mission-' + suffix,
  );
  for (const bundle of [
    'company-received-contract-access',
    'company-contract-approver',
    'company-contract-signature-declarer',
    'company-project',
    'company-task-manager',
    'company-mission-plan-configuration',
    'company-mission-plan-user',
  ])
    await f.command('/' + bundle + '-assignments', {
      companyId: f.companyId,
      workspaceMembershipId: f.preparerId,
    });
  const base = `/contracts/opportunities/${f.opportunityId}`,
    version = base + `/versions/${f.contractVersionId}`;
  await f.command(
    version + '/approve',
    {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: [
        'MODEL_WORDING_REVIEWED',
        'ANNEX_SCOPE_REVIEWED',
      ],
      reviewBasis: 'Synthetic exact Contract and annex deliberately reviewed',
    },
    identities.preparer,
    f.companyId,
  );
  const received = await f.command(
    '/documents',
    {
      type: 'received-contract',
      opportunityId: f.opportunityId,
      contractId: f.contractId,
      contractVersionId: f.contractVersionId,
      title: 'Synthetic configured mission signed copy',
      purpose: 'Synthetic signing evidence',
      sourceDescription: 'Anonymous public acceptance',
      receivedOn: null,
    },
    identities.preparer,
    f.companyId,
  );
  const documentId = text(received.id),
    documentVersionId = text(object(received.version).id),
    headers = { ...identities.preparer, 'x-company-context-id': f.companyId };
  const uploaded = await page.request.post(
    `${api}/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=configured-demo.pdf`,
    {
      headers: {
        ...headers,
        'content-type': 'application/pdf',
        'idempotency-key': randomUUID(),
      },
      data: f.pdfA,
    },
  );
  expect(uploaded.status()).toBe(201);
  const representationId = text(object(await uploaded.json()).representationId);
  const designated = await page.request.post(
    `${api}/documents/${documentId}/versions/${documentVersionId}/official-designation`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { expectedRevision: 2 },
    },
  );
  expect(designated.status()).toBe(200);
  await f.command(
    version + '/signing-declarations',
    {
      expectedContractRevision: 2,
      documentId,
      documentVersionId,
      representationId,
      providerSignatory: {
        label: 'Synthetic provider',
        signedOn: '2026-10-24',
        mandate: { kind: 'UNKNOWN' },
      },
      clientSignatory: {
        label: 'Synthetic Client',
        signedOn: null,
        mandate: { kind: 'UNKNOWN' },
      },
      concordanceBasis: 'Synthetic exact saved PDF and agreement compared',
      acceptanceBasis: 'Synthetic reported acceptance',
      acknowledgedWarningCodes: [
        'MODEL_WORDING_REVIEWED',
        'ANNEX_SCOPE_REVIEWED',
      ],
    },
    identities.preparer,
    f.companyId,
  );
  const content = {
    title: 'Contract mission plan DEMO ' + suffix,
    activities: [
      {
        key: randomUUID(),
        title: 'Review initial scope DEMO',
        activity: ' Literal review\n🌍 ',
        intendedResult: 'Original scope recorded',
      },
      {
        key: randomUUID(),
        title: 'Prepare delivery DEMO',
        activity: 'Prepare synthetic agreed work',
        intendedResult: 'Original agreed work ready',
      },
    ],
  };
  const source = object(
    (
      await f.command(
        '/mission-plans',
        content,
        identities.preparer,
        f.companyId,
      )
    ).version,
  );
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: { ...route.request().headers(), ...identities.preparer },
    }),
  );
  async function openCase() {
    await page.goto('/');
    await selectReceivedCompany(page, f.companyName, narrow);
    await navigateReceived(page, 'Client Requests', narrow);
    const workspace = page.locator('.commercial-intake-workspace');
    await workspace
      .getByRole('button')
      .filter({ has: page.getByText(f.subject, { exact: true }) })
      .click();
    return workspace.locator('.model-contract-panel');
  }
  const panel = await openCase(),
    projects = panel.getByRole('region', {
      name: 'Contract Projects',
      exact: true,
    });
  const manual = projects.getByRole('region', {
    name: 'Create a preparatory Project',
    exact: true,
  });
  await manual
    .getByRole('textbox')
    .fill('Independent manual Contract draft DEMO');
  const inspect = projects.getByRole('button', {
    name: 'Open Version: ' + content.title,
    exact: true,
  });
  await inspect.focus();
  await page.keyboard.press('Enter');
  const exact = projects.getByRole('button', {
    name: 'Open Version: ' + content.title + ' · Version 1',
    exact: true,
  });
  await exact.focus();
  await page.keyboard.press('Enter');
  await expect(
    projects.getByText('Original scope recorded', { exact: true }),
  ).toBeVisible();
  const planned = projects.getByRole('region', {
      name: 'Create a mission from a plan',
      exact: true,
    }),
    projectTitle = 'Configured Contract mission DEMO ' + suffix;
  await planned.getByRole('textbox').fill(projectTitle);
  const acknowledgement = planned.getByRole('checkbox');
  await expect(acknowledgement).toBeEnabled();
  await acknowledgement.focus();
  await page.keyboard.press('Space');
  await expect(acknowledgement).toBeChecked();
  const attempts: {
    path: string;
    body: string | null;
    key: string | undefined;
  }[] = [];
  let projectId: string | undefined;
  await page.route(
    '**/api' + base + '/projects/create-from-mission-plan',
    async (route) => {
      const request = route.request();
      attempts.push({
        path: new URL(request.url()).pathname,
        body: request.postData(),
        key: request.headers()['idempotency-key'],
      });
      const actual = await route.fetch({
        headers: { ...request.headers(), ...identities.preparer },
      });
      expect(actual.status()).toBe(201);
      projectId = text(object(object(await actual.json()).project).id);
      if (attempts.length === 1)
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        });
      else await route.fulfill({ response: actual });
    },
  );
  await planned
    .getByRole('button', { name: 'Create and link mission', exact: true })
    .click();
  const retry = planned.getByRole('button', {
    name: 'Retry the same Project creation',
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(planned.getByRole('textbox')).toBeDisabled();
  await expect(manual.getByRole('textbox')).toHaveValue(
    'Independent manual Contract draft DEMO',
  );
  const refreshed = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api' + base + '/project-candidates',
  );
  await projects
    .getByRole('button', { name: 'Refresh eligible Projects', exact: true })
    .click();
  expect((await refreshed).status()).toBe(200);
  await expect(projects.getByText(projectTitle, { exact: true })).toBeVisible();
  await expect(planned.getByRole('checkbox')).toBeChecked();
  await expect(planned.getByRole('textbox')).toHaveValue(projectTitle);
  await retry.click();
  await expect(
    planned.getByText('Preparatory Project created and linked.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  await page.unroute('**/api' + base + '/projects/create-from-mission-plan');
  expect(JSON.parse(attempts[0]?.body ?? 'null')).toEqual({
    title: projectTitle,
    expectedContractRevision: 3,
    acknowledgedCandidateProjectIds: [],
    missionPlan: {
      planId: source.planId,
      versionId: source.id,
      versionNumber: 1,
    },
  });
  const contract = object((await f.read(base, f.companyId)).contract);
  expect(contract.revision).toBe(4);
  expect(contract.linkedProjects).toHaveLength(1);
  if (!projectId) throw new Error('Expected the public created Project.');
  const directory = await f.read(
    '/projects/' + projectId + '/tasks',
    f.companyId,
  );
  expect(directory.tasks).toHaveLength(2);
  await projects.screenshot({
    path: info.outputPath('contract-configured-controls.png'),
  });
  await page.screenshot({
    path: info.outputPath('contract-configured-confirmation.png'),
    fullPage: true,
  });
  await projects
    .getByRole('button', { name: 'Open Project', exact: true })
    .click();
  const native = page.locator('.project-workspace'),
    copy = native.getByRole('region', {
      name: 'Preserved mission plan',
      exact: true,
    });
  await expect(
    native.getByRole('heading', { name: projectTitle, exact: true }),
  ).toBeVisible();
  await expect(
    copy.getByText('Original scope recorded', { exact: true }),
  ).toBeVisible();
  const task = copy.getByRole('button', {
    name: 'Open Project Task: Review initial scope DEMO',
    exact: true,
  });
  const taskRead = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      /^\/api\/tasks\/[^/]+$/u.test(new URL(r.url()).pathname),
  );
  await task.focus();
  await page.keyboard.press('Enter');
  const openedTask = await taskRead;
  expect(openedTask.status()).toBe(200);
  const tasks = native.locator('.project-tasks'),
    taskTitle = tasks.getByRole('textbox', { name: 'Task title', exact: true });
  await expect(
    tasks.getByRole('heading', {
      name: 'Review initial scope DEMO',
      exact: true,
    }),
  ).toBeVisible();
  await expect(taskTitle).toHaveValue('Review initial scope DEMO');
  await taskTitle.fill('Native edited Contract Task DEMO');
  const taskSave = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' &&
      new URL(r.url()).pathname === new URL(openedTask.url()).pathname,
  );
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  const savedTask = await taskSave;
  expect(savedTask.status()).toBe(200);
  expect(object(savedTask.request().postDataJSON())).toMatchObject({
    expectedVersion: 1,
    title: 'Native edited Contract Task DEMO',
  });
  await expect(
    tasks.getByRole('heading', {
      name: 'Native edited Contract Task DEMO',
      exact: true,
    }),
  ).toBeVisible();
  const successor = {
    ...content,
    expectedHeadVersion: 1,
    activities: content.activities.map((row) => ({
      ...row,
      intendedResult: 'Changed successor result',
    })),
  };
  const changed = object(
    (
      await f.command(
        '/mission-plans/' + text(source.planId) + '/versions',
        successor,
        identities.preparer,
        f.companyId,
      )
    ).version,
  );
  expect(changed.versionNumber).toBe(2);
  await copy.getByRole('button', { name: 'Refresh list', exact: true }).click();
  await expect(
    copy.getByText(content.title + ' · Version 1', { exact: true }),
  ).toBeVisible();
  await expect(
    copy.getByText('Original scope recorded', { exact: true }),
  ).toBeVisible();
  await expect(copy.getByText('Changed successor result')).toHaveCount(0);
  await copy.screenshot({ path: info.outputPath('contract-exact-source.png') });
  await page.screenshot({
    path: info.outputPath('contract-preserved-plan-native-task.png'),
    fullPage: true,
  });
  const reopened = await openCase(),
    manualAgain = reopened.getByRole('region', {
      name: 'Create a preparatory Project',
      exact: true,
    });
  await manualAgain
    .getByRole('textbox')
    .fill('Manual work after plan denial DEMO');
  await reopened
    .getByRole('button', {
      name: 'Open Version: ' + content.title,
      exact: true,
    })
    .click();
  await reopened
    .getByRole('button', {
      name: 'Open Version: ' + content.title + ' · Version 2',
      exact: true,
    })
    .click();
  const deniedCreation = reopened.getByRole('region', {
    name: 'Create a mission from a plan',
    exact: true,
  });
  await deniedCreation
    .getByRole('textbox')
    .fill('Denied configured mission DEMO');
  const denialAcknowledgement = deniedCreation.getByRole('checkbox');
  await expect(denialAcknowledgement).toBeEnabled();
  await denialAcknowledgement.focus();
  await page.keyboard.press('Space');
  await expect(denialAcknowledgement).toBeChecked();
  const revoked = await page.request.delete(
    `${api}/company-mission-plan-user-assignments/${f.preparerId}/${f.companyId}`,
    { headers: { ...identities.owner, 'idempotency-key': randomUUID() } },
  );
  expect(revoked.status()).toBe(200);
  await deniedCreation
    .getByRole('button', { name: 'Create and link mission', exact: true })
    .click();
  await expect(
    reopened.getByRole('region', {
      name: 'Create a mission from a plan',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(manualAgain.getByRole('textbox')).toHaveValue(
    'Manual work after plan denial DEMO',
  );
  await expect(manualAgain.getByRole('textbox')).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await manualAgain.screenshot({
    path: info.outputPath('contract-manual-controls-after-denial.png'),
  });
  await page.screenshot({
    path: info.outputPath('contract-manual-work-after-plan-denial.png'),
    fullPage: true,
  });
});
