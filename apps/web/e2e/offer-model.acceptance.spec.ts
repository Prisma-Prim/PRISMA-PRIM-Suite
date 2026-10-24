import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';
import { syntheticContent } from '../src/offer-model/offer-model.fixture';

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
  const companyName = `Consulting Model DEMO ${suffix}`;
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
  const otherCompanyName = `Other Model Scope DEMO ${suffix}`;
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
    'Company Offer Model Editor',
    'Company Offer Model Approver',
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
  await navigate(page, 'Consulting Offer model', narrow);
  const workspace = page.locator('.offer-model-workspace');
  await expect(
    workspace.getByText('No consulting Offer model has been configured.'),
  ).toBeVisible();
  await workspace
    .getByRole('button', { name: 'New model version', exact: true })
    .click();
  await selectOption(workspace.getByLabel('Source kind', { exact: true }), {
    label: 'Illustrative content',
  });
  const fields: Record<string, string> = {
    'Source description': syntheticContent.sourceDescription,
    'Issuer legal name': syntheticContent.issuer.legalName,
    'Issuer tax identifier': syntheticContent.issuer.taxId,
    'Issuer legal address': syntheticContent.issuer.legalAddress,
    'Romanian service title': syntheticContent.serviceTitle,
    'Framework name 1': 'Cadru demonstrativ',
    'Framework edition 1': 'Ediția 1',
    Introduction: syntheticContent.sections.introduction,
    'Provider profile': syntheticContent.sections.providerProfile,
    Scope: syntheticContent.sections.scope,
    Objectives: syntheticContent.sections.objectives,
    'Assessment guidance': syntheticContent.sections.assessmentGuidance,
    Methodology: syntheticContent.sections.methodology,
    Deliverables: syntheticContent.sections.deliverables,
    'Realization conditions': syntheticContent.sections.realizationConditions,
    'Payment conditions': syntheticContent.sections.paymentConditions,
    'Closing rationale': syntheticContent.sections.closingRationale,
  };
  for (const [label, value] of Object.entries(fields))
    await workspace.getByLabel(label, { exact: true }).fill(value);
  for (let number = 1; number <= 18; number++) {
    await workspace
      .getByLabel(`Stage title ${number}`, { exact: true })
      .fill(`Etapă ${number}`);
    await workspace
      .getByLabel(`Planned activity ${number}`, { exact: true })
      .fill(`Activitate ${number}`);
    await workspace
      .getByLabel(`Intended result ${number}`, { exact: true })
      .fill(`Rezultat ${number}`);
  }
  const attempts: { body: string | null; key: string | undefined }[] = [];
  await page.route(
    '**/api/offer-models/consulting-ro/versions',
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
      } else await route.fulfill({ response: result });
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
  expect(attempts).toHaveLength(3);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[1]).toEqual(attempts[2]);
  await expect(
    workspace.getByRole('heading', {
      name: 'Version 1: Consultanță demonstrativă',
    }),
  ).toBeVisible();
  await expect(workspace.locator('.offer-model-literal').first()).toHaveText(
    syntheticContent.sections.introduction,
  );
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
    path: info.outputPath(`offer-model-approved-${suffix}.png`),
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
  const history = workspace.locator('.offer-model-history');
  await expect(
    history.getByRole('heading', {
      name: 'Version 1: Consultanță demonstrativă',
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
    path: info.outputPath(`offer-model-history-${suffix}.png`),
  });
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
  await expect(page.locator('.offer-model-workspace')).toHaveCount(0);
  await selectCompany(page, companyName, narrow);
  await navigate(page, 'Consulting Offer model', narrow);
  await expect(
    workspace.getByLabel('Romanian service title', { exact: true }),
  ).toHaveCount(0);
  for (const bundle of [
    'company-offer-model-editor',
    'company-offer-model-approver',
  ]) {
    const response = await page.request.delete(
      `${apiOrigin}/${bundle}-assignments/${memberId}/${companyId}`,
      { headers: { ...owner, 'idempotency-key': randomUUID() } },
    );
    expect(response.status()).toBe(200);
  }
  await workspace
    .getByRole('button', { name: 'Reload the current model' })
    .click();
  await expect(page.locator('.offer-model-workspace')).toHaveCount(0);
});
