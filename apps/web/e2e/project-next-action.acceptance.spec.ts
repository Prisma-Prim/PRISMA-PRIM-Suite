import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { selectOption } from './select-option';
import { enterClassicCompatibility } from './classic-compatibility';
import { projectNextActionMessages } from '../src/project/project-next-action.copy';
import { projectTaskMessages } from '../src/project/task.copy';
import { resolveMessage } from '../src/localization/messages';

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
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identifier.');
  return value;
}

for (const frame of ['prisme', 'classic'] as const)
  for (const locale of ['en', 'ro', 'fr', 'ru'] as const)
    test(`records, recovers, replaces and clears the exact Project next action in ${frame} / ${locale}`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      const narrow = info.project.name.endsWith('narrow'),
        suffix = `${frame}-${locale}-${narrow ? 'narrow' : 'desktop'}`;
      const copy = (key: (typeof projectNextActionMessages.keys)[number]) =>
        resolveMessage(projectNextActionMessages, locale, key);
      const taskCopy = (key: (typeof projectTaskMessages.keys)[number]) =>
        resolveMessage(projectTaskMessages, locale, key);
      async function captureViewport(name: string) {
        const skip = page.locator('.prisme-skip-link');
        if (await skip.count()) {
          await expect(skip).not.toBeFocused();
          const box = await skip.boundingBox();
          if (!box) throw new Error('Missing native skip-link layout.');
          expect(box.y + box.height).toBeLessThanOrEqual(0);
        }
        await page.screenshot({
          path: info.outputPath(`${name}-viewport-${suffix}.png`),
        });
      }
      const companyResponse = await page.request.post(origin + '/companies', {
        headers: { ...owner, 'idempotency-key': randomUUID() },
        data: { displayName: 'Next action DEMO ' + suffix },
      });
      expect(companyResponse.status()).toBe(201);
      const companyId = text(object(await companyResponse.json()).id),
        headers = { ...ada, 'x-company-context-id': companyId };
      for (const bundle of [
        'context',
        'director-client',
        'project',
        'task-manager',
        'project-approver',
        'project-next-action-coordinator',
      ]) {
        const response = await page.request.post(
          origin + `/company-${bundle}-assignments`,
          {
            headers: { ...owner, 'idempotency-key': randomUUID() },
            data: {
              companyId,
              workspaceMembershipId: text(
                process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID,
              ),
            },
          },
        );
        expect(response.status()).toBe(201);
      }
      async function post(path: string, data: unknown) {
        const response = await page.request.post(origin + path, {
          headers: { ...headers, 'idempotency-key': randomUUID() },
          data,
        });
        expect(response.status()).toBe(201);
        return object(await response.json());
      }
      const clientName = 'Next action Client DEMO ' + suffix,
        clientId = text(
          (
            await post('/clients', {
              displayName: clientName,
            })
          ).id,
        ),
        title = 'Next action Project DEMO ' + suffix;
      const project = await post('/projects', {
          clientAccountId: clientId,
          title,
        }),
        projectId = text(project.id),
        path = `/projects/${projectId}/next-action`;
      const initialClient = await (
        await page.request.get(origin + `/clients/${clientId}`, { headers })
      ).json();
      await page.goto('/');
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await selectOption(
        page.getByLabel('Active Company', { exact: true }),
        companyId,
      );
      if (narrow)
        await page.getByRole('button', { name: 'Close navigation' }).click();
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Clients', exact: true })
        .click();
      await page
        .locator('.client-directory li')
        .filter({ has: page.getByText(clientName, { exact: true }) })
        .getByRole('button', { name: 'Open dossier', exact: true })
        .click();
      await page
        .getByRole('region', { name: clientName, exact: true })
        .getByRole('button', { name: 'Open Client Projects', exact: true })
        .click();
      const projects = page.locator('.project-workspace');
      await projects
        .getByRole('searchbox', { name: 'Find Projects' })
        .fill(title);
      await projects
        .getByRole('list', { name: 'Projects', exact: true })
        .getByRole('button', { name: new RegExp(title, 'u') })
        .click();
      if (frame === 'classic') await enterClassicCompatibility(page);
      await selectOption(page.locator('#interface-locale'), locale);
      const taskTitle = projects.getByRole('textbox', {
          name: taskCopy('titleLabel'),
          exact: true,
        }),
        independentTaskTitle = 'Independent native Task DEMO ' + suffix;
      await taskTitle.fill(independentTaskTitle);
      const panel = page.getByRole('region', {
          name: copy('title'),
          exact: true,
        }),
        input = panel.getByRole('textbox', {
          name: copy('label'),
          exact: true,
        });
      await expect(
        panel.getByText(copy('missing'), { exact: true }),
      ).toBeVisible();
      await expect(input).toBeEnabled();
      await captureViewport('entry');
      await panel.screenshot({ path: info.outputPath(`entry-${suffix}.png`) });
      await input.fill('🌍'.repeat(501));
      await panel
        .getByRole('button', { name: copy('save'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      const validation = panel
        .getByRole('alert')
        .filter({ hasText: copy('invalid') });
      await expect(validation).toBeVisible();
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(
        (await input.getAttribute('aria-describedby'))?.split(' '),
      ).toContain(await validation.getAttribute('id'));
      const untouched = await page.request.get(origin + path, { headers });
      expect(object(object(await untouched.json()).current).revision).toBe(0);
      const literal =
        'Ж / e\u0301 / 🌍 / <b>Send</b>\n' + 'LongLiteral'.repeat(42);
      await input.fill('');
      await input.focus();
      await page.keyboard.insertText(literal);
      await expect(input).toHaveValue(literal);
      await expect(input).toBeFocused();
      expect(await input.getAttribute('aria-describedby')).toBeTruthy();
      const writes: Array<{ body: string | null; key: string | undefined }> =
        [];
      let loseReply = true;
      await page.route('**/api' + path, async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        writes.push({
          body: route.request().postData(),
          key: route.request().headers()['idempotency-key'],
        });
        if (loseReply) {
          loseReply = false;
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          await route.fulfill({
            status: 503,
            body: 'Synthetic lost response after commit',
          });
          return;
        }
        await route.continue();
      });
      await page.keyboard.press('Tab');
      await expect(
        panel.getByRole('button', { name: copy('save'), exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByText(copy('uncertain'), { exact: true }),
      ).toBeVisible();
      await expect(input).toBeDisabled();
      await expect(
        panel.getByRole('button', { name: copy('clear'), exact: true }),
      ).toBeDisabled();
      await captureViewport('uncertain');
      await panel.screenshot({
        path: info.outputPath(`uncertain-${suffix}.png`),
      });
      const retry = panel.getByRole('button', {
        name: copy('retry'),
        exact: true,
      });
      await retry.focus();
      await expect(retry).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByText(copy('confirmed'), { exact: true }),
      ).toBeVisible();
      await expect(input).toBeEnabled();
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
      expect(writes[0]?.key).toBeTruthy();
      expect(JSON.parse(writes[0]?.body ?? 'null')).toEqual({
        expectedRevision: 0,
        expectedLifecycleRevision: 0,
        text: literal,
      });
      expect(
        await page
          .locator('body')
          .evaluate((element) => element.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await input.fill('Corrected literal action.');
      await panel
        .getByRole('button', { name: copy('replace'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue('Corrected literal action.');
      await expect(input).toBeEnabled();
      const clear = panel.getByRole('button', {
        name: copy('clear'),
        exact: true,
      });
      await clear.focus();
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue('');
      await expect(input).toBeEnabled();
      const read = await page.request.get(origin + path, { headers });
      expect(read.status()).toBe(200);
      const loaded = object(await read.json());
      expect(object(loaded.current)).toMatchObject({
        revision: 3,
        text: null,
        originalClientAccountId: clientId,
      });
      expect(object(loaded.history).entries).toEqual([
        expect.objectContaining({
          revision: 3,
          before: 'Corrected literal action.',
          after: null,
        }),
        expect.objectContaining({
          revision: 2,
          before: literal,
          after: 'Corrected literal action.',
        }),
        expect.objectContaining({ revision: 1, before: null, after: literal }),
      ]);
      await captureViewport('cleared-history');
      await panel.screenshot({
        path: info.outputPath(`cleared-history-${suffix}.png`),
      });
      expect(
        await (
          await page.request.get(origin + `/projects/${projectId}`, { headers })
        ).json(),
      ).toEqual(project);
      const afterClient = object(
          await (
            await page.request.get(origin + `/clients/${clientId}`, { headers })
          ).json(),
        ),
        beforeClient = object(initialClient);
      expect(afterClient.version).toBe(Number(beforeClient.version) + 3);
      const activity = await page.request.get(origin + '/activity-log', {
        headers,
      });
      expect(await activity.text()).not.toContain(literal);
      for (let revision = 3; revision < 29; revision++) {
        const response = await page.request.post(origin + path, {
          headers: { ...headers, 'idempotency-key': randomUUID() },
          data: {
            expectedRevision: revision,
            expectedLifecycleRevision: 0,
            text: `DEMO older page ${revision + 1}`,
          },
        });
        expect(response.status()).toBe(200);
      }
      await panel
        .getByRole('button', { name: copy('refresh'), exact: true })
        .click();
      await expect(input).toHaveValue('DEMO older page 29');
      const history = panel.getByRole('region', {
          name: copy('history'),
          exact: true,
        }),
        older = history.getByRole('button', {
          name: copy('older'),
          exact: true,
        });
      await older.focus();
      await page.keyboard.press('Enter');
      await expect(
        history.getByRole('article', {
          name: `${copy('revision')} 1`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(history.getByRole('article')).toHaveCount(4);
      await expect(
        history.getByRole('heading', { name: copy('history'), exact: true }),
      ).toBeFocused();
      await expect(input).toHaveValue('DEMO older page 29');
      await captureViewport('older-history');
      await panel.screenshot({
        path: info.outputPath(`older-history-${suffix}.png`),
      });
      await expect(taskTitle).toHaveValue(independentTaskTitle);
      await projects
        .getByRole('button', { name: taskCopy('create'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        projects.getByText(taskCopy('confirmed'), { exact: true }),
      ).toBeVisible();
      const tasks = await page.request.get(
        origin + `/projects/${projectId}/tasks`,
        { headers },
      );
      expect(tasks.status()).toBe(200);
      const rows = object(await tasks.json()).tasks;
      expect(rows).toEqual([
        expect.objectContaining({ title: independentTaskTitle, version: 1 }),
      ]);
      if (!Array.isArray(rows)) throw new Error('Expected native Task page.');
      // Ordinary closure already requires every Task to be terminal. Complete
      // the independently created Task explicitly; it must not fulfill the action.
      const completion = await page.request.post(
        origin + `/tasks/${text(object(rows[0]).id)}/complete`,
        {
          headers: { ...headers, 'idempotency-key': randomUUID() },
          data: { expectedVersion: 1 },
        },
      );
      expect(completion.status()).toBe(201);
      const afterTask = await page.request.get(origin + path, { headers });
      expect(object(object(await afterTask.json()).current)).toMatchObject({
        revision: 29,
        text: 'DEMO older page 29',
      });
      const closure = await page.request.post(
        origin + `/projects/${projectId}/lifecycle-transitions`,
        {
          headers: { ...headers, 'idempotency-key': randomUUID() },
          data: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'DEMO ordinary closure, independent of the recorded action',
          },
        },
      );
      expect(closure.status()).toBe(200);
      await panel
        .getByRole('button', { name: copy('refresh'), exact: true })
        .click();
      await expect(
        panel.getByText(copy('closed'), { exact: true }),
      ).toBeVisible();
      await expect(input).toBeDisabled();
      await expect(input).toHaveValue('DEMO older page 29');
      await expect(history.getByRole('article')).toHaveCount(25);
      await input.scrollIntoViewIfNeeded();
      await captureViewport('closed');
      await page.reload();
      await expect(
        page.getByRole('region', { name: copy('title'), exact: true }),
      ).toHaveCount(0);
    });
