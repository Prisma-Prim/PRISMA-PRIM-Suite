import { randomUUID } from 'node:crypto';
import { expect, test, type Locator } from '@playwright/test';
import { enterClassicCompatibility } from './classic-compatibility';
import { internalTaskMessages } from '../src/internal-task/internal-task.copy';
import { resolveMessage } from '../src/localization/messages';
const origin = 'http://127.0.0.1:4174/api';
const user = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const owner = {
  ...user,
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected a public identifier.');
  return value;
}
async function choose(control: Locator, value: string) {
  await expect(control).toBeEnabled();
  await control.focus();
  await control.press('Enter');
  await expect(control.page().getByRole('listbox')).toBeVisible();
  const options = control.page().getByRole('listbox').getByRole('option');
  const values = await options.evaluateAll((rows) =>
    rows
      .filter(
        (row) =>
          !row.hasAttribute('disabled') &&
          row.getAttribute('aria-disabled') !== 'true',
      )
      .map((row) => row.getAttribute('data-value')),
  );
  const index = values.indexOf(value);
  if (index < 0) throw new Error('Missing native selectable value.');
  await control.press('Home');
  for (let i = 0; i < index; i++) await control.press('ArrowDown');
  await control.press('Enter');
  await expect(control).toHaveAttribute('data-value', value);
}
async function activate(control: Locator) {
  await expect(control).toBeEnabled();
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
for (const frame of ['prisme', 'classic'] as const)
  for (const locale of ['en', 'ro', 'fr', 'ru'] as const)
    test(`operates Company-only work, exact recovery and history by keyboard in ${frame}/${locale}`, async ({
      page,
    }, info) => {
      test.setTimeout(120000);
      const narrow = info.project.name.endsWith('narrow'),
        suffix = `${frame}-${locale}-${narrow ? 'narrow' : 'desktop'}`,
        copy = (key: (typeof internalTaskMessages.keys)[number]) =>
          resolveMessage(internalTaskMessages, locale, key);
      const companyResponse = await page.request.post(origin + '/companies', {
        headers: { ...owner, 'idempotency-key': randomUUID() },
        data: { displayName: 'Internal Company DEMO ' + suffix },
      });
      expect(companyResponse.status()).toBe(201);
      const companyId = text(object(await companyResponse.json()).id),
        membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID),
        headers = { ...user, 'x-company-context-id': companyId };
      for (const bundle of ['context', 'internal-task-manager']) {
        const response = await page.request.post(
          origin + '/company-' + bundle + '-assignments',
          {
            headers: { ...owner, 'idempotency-key': randomUUID() },
            data: { companyId, workspaceMembershipId: membershipId },
          },
        );
        expect(response.status()).toBe(201);
      }
      const actorResponse = await page.request.get(
        origin + '/access/current-actor',
        { headers },
      );
      expect(actorResponse.status()).toBe(200);
      const actor = object(await actorResponse.json()),
        company = object(actor.activeCompany);
      expect(actor.workspacePermissions).toEqual([]);
      expect(company.clientPermissions).toEqual([]);
      expect(company.taskPermissions).toBeUndefined();
      expect(company.projectPermissions).toBeUndefined();
      expect(company.internalTaskPermissions).toEqual([
        'internal_task.read',
        'internal_task.manage',
      ]);
      await page.goto('/');
      if (narrow)
        await activate(page.getByRole('button', { name: 'Open navigation' }));
      await choose(
        page.getByRole('combobox', { name: 'Active Company' }),
        companyId,
      );
      await expect(page.getByRole('banner')).toContainText(
        'Internal Company DEMO ' + suffix,
      );
      if (
        narrow &&
        (await page
          .getByRole('button', { name: 'Open navigation' })
          .isVisible())
      )
        await activate(page.getByRole('button', { name: 'Open navigation' }));
      await activate(
        page
          .getByRole('navigation', { name: 'Primary navigation' })
          .getByRole('link', { name: 'Internal Tasks', exact: true }),
      );
      if (
        narrow &&
        (await page
          .getByRole('button', { name: 'Close navigation' })
          .isVisible())
      )
        await activate(page.getByRole('button', { name: 'Close navigation' }));
      if (frame === 'classic') await enterClassicCompatibility(page);
      await choose(page.locator('#interface-locale'), locale);
      const panel = page.getByRole('region', {
          name: copy('title'),
          exact: true,
        }),
        create = panel.getByRole('form', { name: copy('create'), exact: true }),
        literalTitle = 'Equipment inventory Ж ' + suffix,
        literalDescription =
          'Read <b>literal</b> instructions.\n  Preserve every line.\n' +
          'Unbroken'.repeat(60);
      await create
        .getByRole('textbox', { name: copy('taskTitle'), exact: true })
        .fill('  ' + literalTitle + '  ');
      await create
        .getByRole('textbox', { name: copy('description'), exact: true })
        .fill('  ' + literalDescription + '  ');
      const attempts: Array<{ body: string | null; key: string | undefined }> =
        [];
      let taskId = '',
        loseFirst = true,
        failRefresh = false;
      await page.route('**/api/company-internal-tasks?**', async (route) => {
        if (failRefresh && route.request().method() === 'GET')
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'INTERNAL_TASK_UNAVAILABLE' }),
          });
        return route.continue();
      });
      await page.route('**/api/company-internal-tasks', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        attempts.push({
          body: route.request().postData(),
          key: route.request().headers()['idempotency-key'],
        });
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        taskId = text(object(object(await response.json()).task).id);
        if (loseFirst) {
          loseFirst = false;
          await route.abort('failed');
        } else await route.fulfill({ response });
      });
      await page.route('**/api/company-internal-tasks/**', async (route) => {
        if (
          failRefresh &&
          route.request().method() === 'GET' &&
          taskId &&
          new URL(route.request().url()).pathname ===
            '/api/company-internal-tasks/' + taskId
        )
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'INTERNAL_TASK_UNAVAILABLE' }),
          });
        return route.continue();
      });
      await activate(
        create.getByRole('button', { name: copy('create'), exact: true }),
      );
      await expect(
        panel.getByRole('button', { name: copy('retry'), exact: true }),
      ).toBeVisible();
      await expect(
        create.getByRole('textbox', { name: copy('taskTitle'), exact: true }),
      ).toHaveValue('  ' + literalTitle + '  ');
      failRefresh = true;
      await activate(
        panel.getByRole('button', { name: copy('retry'), exact: true }),
      );
      await expect(
        panel.getByText(copy('confirmed'), { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByText(copy('unavailable'), { exact: true }),
      ).toBeVisible();
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(attempts[0]?.key).toBeTruthy();
      failRefresh = false;
      await activate(
        panel.getByRole('button', { name: copy('reload'), exact: true }),
      );
      await activate(
        panel.getByRole('button', { name: literalTitle, exact: true }),
      );
      const edit = panel.getByRole('form', { name: copy('save'), exact: true });
      await expect(
        edit.getByRole('textbox', { name: copy('description'), exact: true }),
      ).toHaveValue(literalDescription);
      await choose(
        edit.getByRole('combobox', { name: copy('assignee'), exact: true }),
        membershipId,
      );
      await edit.getByLabel(copy('date'), { exact: true }).fill('2028-02-29');
      await choose(
        edit.getByRole('combobox', { name: copy('priority'), exact: true }),
        'critical',
      );
      await activate(
        edit.getByRole('button', { name: copy('save'), exact: true }),
      );
      async function current() {
        const response = await page.request.get(
          origin + '/company-internal-tasks/' + taskId,
          { headers },
        );
        expect(response.status()).toBe(200);
        return object(await response.json());
      }
      await expect
        .poll(async () => object((await current()).task).version)
        .toBe(2);
      expect(object((await current()).task)).toMatchObject({
        assignee: { membershipId },
        dueDate: '2028-02-29',
        priority: 'critical',
        description: literalDescription,
      });
      const movement = panel.getByRole('form', {
        name: copy('move'),
        exact: true,
      });
      async function move(status: string, version: number, reason?: string) {
        await choose(
          movement.getByRole('combobox', { name: copy('status'), exact: true }),
          status,
        );
        if (reason)
          await movement
            .getByRole('textbox', { name: copy('reason'), exact: true })
            .fill(reason);
        await activate(
          movement.getByRole('button', { name: copy('move'), exact: true }),
        );
        await expect
          .poll(async () => object((await current()).task).version)
          .toBe(version);
        await expect(
          edit.getByRole('textbox', { name: copy('taskTitle'), exact: true }),
        ).toBeEnabled();
        await expect(
          movement.getByRole('combobox', { name: copy('status'), exact: true }),
        ).not.toHaveAttribute('aria-invalid', 'true');
      }
      await move('blocked', 3, 'Blocked Ж\n  waiting for inventory');
      await page.screenshot({
        path: info.outputPath('internal-blocked-' + suffix + '.png'),
      });
      await move('in_progress', 4);
      await choose(
        movement.getByRole('combobox', { name: copy('status'), exact: true }),
        'done',
      );
      await activate(
        movement.getByRole('button', { name: copy('move'), exact: true }),
      );
      await expect
        .poll(async () => object((await current()).task).status)
        .toBe('done');
      await expect(
        edit.getByRole('textbox', { name: copy('taskTitle'), exact: true }),
      ).toBeDisabled();
      expect(
        object(object((await current()).task).completion).actorMembershipId,
      ).toBe(membershipId);
      await activate(
        movement.getByRole('button', { name: copy('reopen'), exact: true }),
      );
      await expect
        .poll(async () => object((await current()).task).status)
        .toBe('todo');
      await expect(
        edit.getByRole('textbox', { name: copy('taskTitle'), exact: true }),
      ).toBeEnabled();
      // Public real API commands extend this same native Task for complete pagination proof.
      // The user-visible create/correct/state/recovery journey above remains actual App/HTTP/PostgreSQL.
      let finalTitle = literalTitle;
      for (let i = 0; i < 20; i++) {
        finalTitle = 'Inventory correction ' + i + ' ' + suffix;
        const response = await page.request.post(
          origin + '/company-internal-tasks/' + taskId + '/changes',
          {
            headers: { ...headers, 'idempotency-key': randomUUID() },
            data: { kind: 'EDIT', expectedVersion: i + 6, title: finalTitle },
          },
        );
        expect(response.status()).toBe(200);
      }
      await activate(
        panel.getByRole('button', { name: copy('reload'), exact: true }).last(),
      );
      await expect(
        edit.getByRole('textbox', { name: copy('taskTitle'), exact: true }),
      ).toHaveValue(finalTitle);
      await choose(
        movement.getByRole('combobox', { name: copy('status'), exact: true }),
        'cancelled',
      );
      await movement
        .getByRole('textbox', { name: copy('reason'), exact: true })
        .fill('Cancelled literal Ж\n  retained forever');
      await activate(
        movement.getByRole('button', { name: copy('move'), exact: true }),
      );
      await expect
        .poll(async () => object((await current()).task).version)
        .toBe(27);
      await expect(
        edit.getByRole('textbox', { name: copy('taskTitle'), exact: true }),
      ).toBeDisabled();
      await expect(panel.locator('.internal-task-history > li')).toHaveCount(
        25,
      );
      await activate(
        panel.getByRole('button', { name: copy('older'), exact: true }),
      );
      await expect(panel.locator('.internal-task-history > li')).toHaveCount(
        27,
      );
      await expect(
        panel
          .locator('.internal-task-history')
          .getByText(literalDescription, { exact: true })
          .last(),
      ).toBeVisible();
      for (let i = 0; i < 27; i++) {
        const response = await page.request.post(
          origin + '/company-internal-tasks',
          {
            headers: { ...headers, 'idempotency-key': randomUUID() },
            data: { title: 'Pagination work ' + i + ' ' + suffix },
          },
        );
        expect(response.status()).toBe(201);
      }
      await choose(
        panel
          .getByRole('combobox', { name: copy('status'), exact: true })
          .first(),
        'all',
      );
      await expect(panel.locator('.internal-task-list > li')).toHaveCount(25);
      await choose(
        panel
          .getByRole('combobox', { name: copy('status'), exact: true })
          .first(),
        'open',
      );
      await expect(panel.locator('.internal-task-list > li')).toHaveCount(25);
      await activate(
        panel.getByRole('button', { name: copy('more'), exact: true }),
      );
      await expect(panel.locator('.internal-task-list > li')).toHaveCount(27);
      await choose(
        panel
          .getByRole('combobox', { name: copy('status'), exact: true })
          .first(),
        'cancelled',
      );
      await expect(panel.locator('.internal-task-list > li')).toHaveCount(1);
      await page.reload();
      const reloaded = page.getByRole('region', {
        name: copy('title'),
        exact: true,
      });
      await choose(
        reloaded
          .getByRole('combobox', { name: copy('status'), exact: true })
          .first(),
        'cancelled',
      );
      await activate(
        reloaded.getByRole('button', { name: finalTitle, exact: true }),
      );
      await expect(
        reloaded
          .getByRole('form', { name: copy('save'), exact: true })
          .getByRole('textbox', { name: copy('description'), exact: true }),
      ).toHaveValue(literalDescription);
      await expect(
        reloaded.getByRole('button', { name: copy('reopen'), exact: true }),
      ).toBeVisible();
      await activate(
        reloaded.getByRole('button', { name: copy('older'), exact: true }),
      );
      await expect(reloaded.locator('.internal-task-history > li')).toHaveCount(
        27,
      );
      const literalHistory = reloaded
          .locator('.internal-task-history')
          .getByText(literalDescription, { exact: true })
          .last(),
        summary = reloaded
          .locator('.internal-task-history > li')
          .last()
          .locator('summary')
          .last();
      await summary.scrollIntoViewIfNeeded();
      await summary.focus();
      await summary.press('Enter');
      await summary.press('Enter');
      await expect(summary).toBeFocused();
      await expect(literalHistory).toBeVisible();
      await expect(summary).toHaveCSS('outline-style', 'solid');
      await page.screenshot({
        path: info.outputPath('internal-history-literal-' + suffix + '.png'),
      });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
    });
