import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('Expected response');
  return Object.fromEntries(Object.entries(v));
}
function text(v: unknown) {
  if (typeof v !== 'string' || !v) throw new Error('Expected identity');
  return v;
}
async function command(
  page: Page,
  path: string,
  body: unknown,
  companyId?: string,
) {
  const r = await page.request.post('http://127.0.0.1:4174/api' + path, {
    headers: {
      ...owner,
      'idempotency-key': randomUUID(),
      ...(companyId ? { 'x-company-context-id': companyId } : {}),
    },
    data: body,
  });
  expect(r.status(), path).toBe(201);
  return object(await r.json());
}
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name, exact: true }).click();
}
test('configures a Company-only plan, creates exact native Tasks with a lost-confirmation retry, and retains the old copy after successor and native edits', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'Narrow' : 'Desktop',
    name = 'Configurable mission DEMO ' + suffix;
  const member = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID),
    companyId = text(
      (await command(page, '/companies', { displayName: name })).id,
    );
  for (const path of ['company-context', 'company-mission-plan-configuration'])
    await command(page, '/' + path + '-assignments', {
      companyId,
      workspaceMembershipId: member,
    });
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
    companyId,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await navigate(page, 'Projects', narrow);
  const config = page.getByRole('region', {
    name: 'Mission plans',
    exact: true,
  });
  await config.getByRole('button', { name: 'New plan', exact: true }).click();
  await config
    .getByRole('textbox', { name: 'Plan name', exact: true })
    .fill(name);
  await config
    .getByRole('textbox', { name: 'Activity title', exact: true })
    .fill('Scope DEMO');
  await config
    .getByRole('textbox', { name: 'Planned action', exact: true })
    .fill(' Action A\nLiteral 🌍 ');
  await config
    .getByRole('textbox', { name: 'Intended result', exact: true })
    .fill(' Expected A ');
  await config.getByRole('button', { name: 'Add activity' }).click();
  await config
    .getByRole('textbox', { name: 'Activity title', exact: true })
    .nth(1)
    .fill('Delivery DEMO');
  await config
    .getByRole('textbox', { name: 'Planned action', exact: true })
    .nth(1)
    .fill('Action B');
  await config
    .getByRole('textbox', { name: 'Intended result', exact: true })
    .nth(1)
    .fill('Expected B');
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === '/api/mission-plans',
  );
  await config.getByRole('button', { name: 'Publish plan' }).click();
  const first = object(object(await (await saved).json()).version);
  expect(first.versionNumber).toBe(1);
  await expect(config.getByText('Publication confirmed.')).toBeVisible();
  await expect(page.locator('.project-workspace')).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('configuration-only.png'),
    fullPage: true,
  });
  // Deliberate synthetic grants; model configuration alone supplied none of these.
  for (const path of [
    'company-mission-plan-user',
    'company-director-client',
    'company-project',
    'company-task-manager',
  ])
    await command(page, '/' + path + '-assignments', {
      companyId,
      workspaceMembershipId: member,
    });
  // The administrator has explicit Client management; the new Company is selected by header.
  const clientName = 'Mission-plan Client DEMO ' + suffix;
  const adminResponse = await page.request.get(
    'http://127.0.0.1:4174/api/access/current-actor',
    { headers: owner },
  );
  expect(adminResponse.status()).toBe(200);
  const administrator = text(
    object(await adminResponse.json()).workspaceMembershipId,
  );
  await command(page, '/company-director-client-assignments', {
    companyId,
    workspaceMembershipId: administrator,
  });
  const client = text(
    (await command(page, '/clients', { displayName: clientName }, companyId))
      .id,
  );
  await page.reload();
  await navigate(page, 'Projects', narrow);
  const native = page.locator('.project-workspace');
  await native
    .getByRole('textbox', { name: 'Project title', exact: true })
    .fill('Independent manual draft DEMO');
  const creator = page.getByRole('region', {
    name: 'Project from a mission plan',
    exact: true,
  });
  const inspect = creator.getByRole('button', {
    name: 'Open Version: ' + name,
    exact: true,
  });
  await inspect.focus();
  await page.keyboard.press('Enter');
  const select = creator.getByRole('button', {
    name: 'Open Version: ' + name + ' · Version 1',
    exact: true,
  });
  await select.focus();
  await page.keyboard.press('Enter');
  await expect(creator.getByText('Expected A', { exact: true })).toBeVisible();
  const projectName = 'Reusable mission Project DEMO ' + suffix;
  await creator
    .getByRole('textbox', { name: 'New Project title', exact: true })
    .fill(projectName);
  await selectOption(
    creator.getByRole('combobox', { name: 'New Project Client', exact: true }),
    client,
  );
  const writes: { body: string | null; key: string | undefined }[] = [];
  await page.route('**/api/projects/from-mission-plan', async (route) => {
    writes.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    if (writes.length === 1) {
      const r = await route.fetch();
      expect(r.status()).toBe(201);
      await route.fulfill({ status: 503, body: 'Synthetic lost confirmation' });
    } else await route.continue();
  });
  await creator
    .getByRole('button', { name: 'Create Project with selected activities' })
    .click();
  await expect(
    creator.getByText('Outcome uncertain. Retry the identical command.'),
  ).toBeVisible();
  await expect(
    creator.getByRole('textbox', { name: 'New Project title' }),
  ).toBeDisabled();
  await expect(
    native.getByRole('textbox', { name: 'Project title', exact: true }),
  ).toHaveValue('Independent manual draft DEMO');
  await native
    .getByRole('button', { name: 'Reload Projects', exact: true })
    .click();
  await expect(
    creator.getByRole('textbox', { name: 'New Project title', exact: true }),
  ).toHaveValue(projectName);
  await expect(
    creator.getByRole('combobox', { name: 'New Project Client', exact: true }),
  ).toContainText(clientName);
  await expect(
    creator.getByRole('button', { name: 'Retry identical command' }),
  ).toBeVisible();
  await native
    .getByRole('textbox', { name: 'Project title', exact: true })
    .fill('Independent manual draft DEMO');
  await creator
    .getByRole('button', { name: 'Retry identical command' })
    .click();
  await expect(
    native.getByRole('heading', { name: projectName, exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  const copy = native.getByRole('region', { name: 'Preserved mission plan' });
  await expect(copy.getByText('Expected A', { exact: true })).toBeVisible();
  const taskButton = copy.getByRole('button', {
    name: 'Open Project Task: Scope DEMO',
    exact: true,
  });
  await taskButton.focus();
  await page.keyboard.press('Enter');
  const tasks = native.locator('.project-tasks');
  await tasks
    .getByRole('textbox', { name: 'Task title', exact: true })
    .fill('Ordinary edited Task DEMO');
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(
    tasks.getByRole('heading', {
      name: 'Ordinary edited Task DEMO',
      exact: true,
    }),
  ).toBeVisible();
  // Explicitly load the existing source and publish a reordered, corrected successor.
  await config
    .getByRole('button', { name: 'Open Version: ' + name, exact: true })
    .click();
  await config
    .getByRole('button', {
      name: 'Open Version: ' + name + ' · Version 1',
      exact: true,
    })
    .click();
  await config
    .getByRole('button', { name: 'Successor Version', exact: true })
    .click();
  await config.getByRole('button', { name: 'Move up 2' }).click();
  await config
    .getByRole('textbox', { name: 'Intended result', exact: true })
    .nth(0)
    .fill('Changed successor result');
  const successor = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.endsWith('/versions'),
  );
  await config.getByRole('button', { name: 'Publish plan' }).click();
  expect(
    object(object(await (await successor).json()).version).versionNumber,
  ).toBe(2);
  const directoryProject = native
    .locator('.project-list')
    .getByRole('button', { name: new RegExp(projectName) });
  await expect(directoryProject).toBeVisible();
  await directoryProject.click();
  await copy.getByRole('button', { name: 'Refresh list' }).click();
  await expect(
    copy.getByText(name + ' · Version 1', { exact: true }),
  ).toBeVisible();
  await expect(copy.getByText('Expected A', { exact: true })).toBeVisible();
  await expect(copy.getByText('Changed successor result')).toHaveCount(0);
  await expect(
    native.getByRole('textbox', { name: 'Project title', exact: true }),
  ).toHaveValue('Independent manual draft DEMO');
  await copy.screenshot({
    path: info.outputPath('unchanged-original-copy.png'),
  });
  await tasks
    .getByRole('textbox', { name: 'Task title', exact: true })
    .fill('Independent native draft DEMO');
  async function revoke(path: string) {
    const r = await page.request.delete(
      `http://127.0.0.1:4174/api/${path}-assignments/${member}/${companyId}`,
      { headers: { ...owner, 'idempotency-key': randomUUID() } },
    );
    expect(r.status()).toBe(200);
  }
  await revoke('company-mission-plan-user');
  // The nested creator itself must revalidate App authority after its denied command.
  await creator
    .getByRole('button', { name: 'Create Project with selected activities' })
    .click();
  await expect(creator).toHaveCount(0);
  await expect(config).toBeVisible();
  await expect(
    tasks.getByRole('textbox', { name: 'Task title', exact: true }),
  ).toHaveValue('Independent native draft DEMO');
  // The copied-plan region independently propagates a read denial, without a configuration interaction.
  await revoke('company-mission-plan-configuration');
  await copy.getByRole('button', { name: 'Refresh list', exact: true }).click();
  await expect(copy).toHaveCount(0);
  await expect(config).toHaveCount(0);
  await expect(
    tasks.getByRole('textbox', { name: 'Task title', exact: true }),
  ).toHaveValue('Independent native draft DEMO');
  await expect(
    native.getByRole('textbox', { name: 'Project title', exact: true }),
  ).toHaveValue('Independent manual draft DEMO');
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(
    tasks.getByRole('heading', {
      name: 'Independent native draft DEMO',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await tasks.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('native-work-after-plan-access-loss.png'),
    fullPage: true,
  });
});
