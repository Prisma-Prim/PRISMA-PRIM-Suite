import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { selectOption } from './select-option';

const apiOrigin = 'http://127.0.0.1:4174';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const ada = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};

// Every identity, fact, Company and observation is synthetic. Commands reach
// the real API/PostgreSQL; interception loses only one committed response.
test('explicitly records, replays, follows and corrects a confidential Company Risk while preserving independent access', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const company = await createCompany(
    page.request,
    `Synthetic Risk ${narrow ? '390' : '1440'}`,
  );
  const membershipId = required('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
  for (const path of [
    'company-context-assignments',
    'company-director-client-assignments',
    'company-project-assignments',
    'company-task-manager-assignments',
    'company-operational-risk-reader-assignments',
  ])
    await grant({
      request: page.request,
      path,
      workspaceMembershipId: membershipId,
      companyId: company.id,
    });
  const rejectedWrite = await page.request.post(
    `${apiOrigin}/api/operational-risks`,
    {
      headers: {
        ...ada,
        'x-company-context-id': company.id,
        'idempotency-key': randomUUID(),
      },
      data: {
        process: 'No recorder',
        cause: 'Cause',
        effect: 'Effect',
        plannedMeasure: 'Measure',
      },
    },
  );
  expect(rejectedWrite.status()).toBe(403);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
    company.id,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await navigate(page, 'Operational risks', narrow);
  const risks = page.locator('.risk-workspace');
  await expect(risks.getByText('No risks recorded.')).toBeVisible();
  await expect(
    risks.getByRole('button', { name: 'Record a risk' }),
  ).toHaveCount(0);
  await grant({
    request: page.request,
    path: 'company-operational-risk-recorder-assignments',
    workspaceMembershipId: membershipId,
    companyId: company.id,
  });
  await page.reload();
  const create = risks.getByRole('button', {
    name: 'Record a risk',
    exact: true,
  });
  await expect(create).toBeVisible();
  await create.focus();
  await page.keyboard.press('Enter');
  const literal = ` Synthetic literal risk ${narrow ? '390' : '1440'}\n${'LongText'.repeat(15)}\n<script>safe text</script> `;
  await risks.getByLabel(/^Process \/ activity/u).fill(literal);
  await risks
    .getByLabel(/^Possible cause/u)
    .fill(' Synthetic cause\nwith a preserved second line ');
  await risks.getByLabel(/^Possible effect/u).fill(' Synthetic effect ');
  await risks
    .getByLabel(/^Planned measure/u)
    .fill(' Synthetic manual measure ');
  await risks
    .getByLabel('Planned date (optional)', { exact: true })
    .fill('2024-02-29');
  const writes: {
    body: string | null;
    key: string | undefined;
    company: string | undefined;
  }[] = [];
  let recordedId: string | undefined;
  await page.route('**/api/operational-risks', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
      company: route.request().headers()['x-company-context-id'],
    });
    if (writes.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      const body: unknown = await response.json();
      recordedId = string(object(object(body).risk).id);
      return route.fulfill({
        status: 503,
        body: 'Synthetic lost confirmation',
      });
    }
    return route.continue();
  });
  await risks.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(
    risks.getByRole('button', { name: 'Retry the same record' }),
  ).toBeVisible();
  for (const [locale, process, retry] of [
    ['fr', /^Processus \/ activité/u, 'Réessayer le même enregistrement'],
    ['ru', /^Процесс \/ деятельность/u, 'Повторить ту же запись'],
    ['ro', /^Proces \/ activitate/u, 'Reîncercați aceeași înregistrare'],
    ['en', /^Process \/ activity/u, 'Retry the same record'],
  ] satisfies [string, RegExp, string][]) {
    await selectOption(page.locator('#interface-locale'), locale);
    await expect(risks.getByLabel(process)).toHaveValue(literal);
    await expect(risks.getByLabel(process)).toBeDisabled();
    await expect(
      risks.getByRole('button', { name: retry, exact: true }),
    ).toBeEnabled();
    expect(writes).toHaveLength(1);
    await page.screenshot({
      path: testInfo.outputPath(`risk-uncertain-${locale}.png`),
      fullPage: true,
    });
  }
  await risks
    .getByRole('button', { name: 'Retry the same record', exact: true })
    .click();
  await expect(risks.getByText('Recorded.', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]?.company).toBe(company.id);
  if (!recordedId) throw new Error('The real committed Risk was not observed.');
  await page.unroute('**/api/operational-risks');
  await expect(risks.getByText('Assessment: not assessed')).toBeVisible();
  await expect(
    risks.getByText(/The note author is not the risk owner/u),
  ).toBeVisible();
  await expect(risks.locator('script')).toHaveCount(0);

  for (const kind of ['observation', 'reassessment']) {
    await risks
      .getByRole('button', {
        name: 'Observation / Narrative reassessment',
        exact: true,
      })
      .click();
    await selectOption(
      risks.getByRole('combobox', { name: 'Note type', exact: true }),
      kind,
    );
    await risks
      .getByLabel('Note', { exact: true })
      .fill(` Synthetic ${kind}\n<literal note> `);
    await risks
      .getByLabel('Occurrence date (optional)', { exact: true })
      .fill('2024-02-29');
    const written = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/operational-risks/${recordedId}/journal`),
    );
    await risks.getByRole('button', { name: 'Record', exact: true }).click();
    expect((await written).status()).toBe(201);
    await expect(risks.getByText('Recorded.', { exact: true })).toBeVisible();
    await expect(
      risks.getByText(` Synthetic ${kind}\n<literal note> `, { exact: true }),
    ).toBeVisible();
  }
  await risks
    .getByRole('button', { name: 'Correct intake facts', exact: true })
    .click();
  await expect(risks.getByLabel(/^Process \/ activity/u)).toHaveValue(literal);
  await risks
    .getByLabel(/^Possible cause/u)
    .fill(' Corrected synthetic cause ');
  await risks
    .getByLabel('Correction reason', { exact: true })
    .fill(' Synthetic verified source ');
  const corrected = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response
        .url()
        .endsWith(`/operational-risks/${recordedId}/intake-corrections`),
  );
  await risks.getByRole('button', { name: 'Record', exact: true }).click();
  expect((await corrected).status()).toBe(201);
  await expect(risks.getByText('Recorded.', { exact: true })).toBeVisible();
  await page.reload();
  await risks.getByRole('button', { name: /Synthetic literal risk/u }).click();
  await expect(
    risks.getByRole('heading', { name: 'Immutable history' }),
  ).toBeVisible();
  await expect(risks.locator('.risk-history > li')).toHaveCount(4);
  await expect(risks.locator('.risk-revision')).toHaveText('Revision 4');
  await risks.locator('summary').click();
  await expect(risks.locator('details')).toContainText('Synthetic cause');
  await expect(risks.locator('details')).not.toContainText(
    'Corrected synthetic cause',
  );
  await expect(risks.locator('.risk-history')).toContainText(
    'Synthetic verified source',
  );
  await expect(risks.locator('select, input[type=checkbox]')).toHaveCount(0);
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('risk-history.png'),
    fullPage: true,
  });

  const foreign = await createCompany(
    page.request,
    'Synthetic separate Risk Company',
  );
  for (const path of [
    'company-context-assignments',
    'company-operational-risk-reader-assignments',
  ])
    await grant({
      request: page.request,
      path,
      workspaceMembershipId: membershipId,
      companyId: foreign.id,
    });
  const forbiddenTarget = await page.request.get(
    `${apiOrigin}/api/operational-risks/${recordedId}/history?limit=1`,
    { headers: { ...ada, 'x-company-context-id': foreign.id } },
  );
  expect(forbiddenTarget.status()).toBe(404);
  const privateActivity = await page.request.get(
    `${apiOrigin}/api/activity-log`,
    { headers: { ...owner, 'x-company-context-id': company.id } },
  );
  expect(privateActivity.status()).toBe(200);
  expect(JSON.stringify(await privateActivity.json())).not.toContain(
    recordedId,
  );

  // Feature-only revocation must not discard independently valid Company,
  // Project, Client and Task authority. The same Company survives revalidation.
  await navigate(page, 'Projects', narrow);
  const projectTitle = page
    .locator('.project-workspace')
    .getByRole('textbox', { name: 'Project title', exact: true });
  await projectTitle.fill('Synthetic independent Project draft');
  await navigate(page, 'Operational risks', narrow);
  const revoke = await page.request.delete(
    `${apiOrigin}/api/company-operational-risk-reader-assignments/${membershipId}/${company.id}`,
    { headers: { ...owner, 'idempotency-key': randomUUID() } },
  );
  expect(revoke.status()).toBe(200);
  await risks.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(page.locator('.risk-workspace')).toHaveCount(0);
  await navigate(page, 'Projects', narrow);
  await expect(page.locator('.project-workspace')).toBeVisible();
  await expect(projectTitle).toHaveValue('Synthetic independent Project draft');
  await navigate(page, 'My Tasks', narrow);
  await expect(page.locator('.my-tasks')).toBeVisible();
  await navigate(page, 'Clients', narrow);
  await expect(page.locator('.client-workspace')).toBeVisible();
});

async function navigate(
  page: Page,
  label: string,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: label, exact: true })
    .click();
}
async function createCompany(
  request: APIRequestContext,
  displayName: string,
): Promise<{ id: string }> {
  const response = await request.post(`${apiOrigin}/api/companies`, {
    headers: { ...owner, 'idempotency-key': randomUUID() },
    data: { displayName },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  return { id: string(object(body).id) };
}
async function grant({
  request,
  path,
  workspaceMembershipId,
  companyId,
}: {
  request: APIRequestContext;
  path: string;
  workspaceMembershipId: string;
  companyId: string;
}): Promise<void> {
  const response = await request.post(`${apiOrigin}/api/${path}`, {
    headers: { ...owner, 'idempotency-key': randomUUID() },
    data: { workspaceMembershipId, companyId },
  });
  expect(response.status()).toBe(201);
}
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing synthetic acceptance fixture ${name}.`);
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a synthetic object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Expected a synthetic string.');
  return value;
}
