import * as fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import type { Locator, Request, Route } from '@playwright/test';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import { resolveMessage } from '../src/localization/messages';
import { projectTaskMessages } from '../src/project/task.copy';
import { projectNextActionMessages } from '../src/project/project-next-action.copy';
import { companyContextMessages } from '../src/company/company-context.copy';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import {
  expect,
  expectApiFailure,
  observeApiRequests,
  IDLE_DEADLINE_MILLISECONDS,
} from './ui-chaos.fixture';
import { removeRoute } from './route-removal';
import { selectOption } from './select-option';
import {
  accessIdentities,
  accessObject,
} from './access-sequence-source.fixture';
import { prepareProjectTaskSource } from './project-task-sequence-source.fixture';
import {
  installProjectTaskReadHolds,
  projectTaskReadProof,
} from './project-task-read-holds.fixture';

type Variant = 'a' | 'b';
type Values = {
  variant: Variant;
  locale: 'ro' | 'ru';
  stage: 'token' | 'parser' | 'http';
  replacement: 'project' | 'company' | 'access';
};
type Sent = { body: string | null; key: string };
type Mode =
  | { kind: 'ready' | 'refresh-error' }
  | { kind: 'draft' | 'conflict'; text: string }
  | { kind: 'uncertain'; text: string; sent: Sent };

export const projectTaskSequenceAdapter: BrowserSequenceAdapter<
  Variant,
  Values
> = {
  caseId: 'project-task',
  initial: fc.constantFrom<Variant>('a', 'b'),
  values: fc.record({
    variant: fc.constantFrom<Variant>('a', 'b'),
    locale: fc.constantFrom('ro', 'ru'),
    stage: fc.constantFrom('token', 'parser', 'http'),
    replacement: fc.constantFrom('project', 'company', 'access'),
  }),
  async open({ page, info, trial, initial }) {
    const source = await prepareProjectTaskSource(
      page,
      `${info.project.name}-${trial}-${randomUUID()}`,
    );
    const preferredLocale = info.project.name.endsWith('narrow') ? 'ru' : 'ro';
    let locale: InterfaceLocale = 'en';
    let version = 1;
    let description = source.initialDescription;
    const descriptions = [source.initialDescription];
    let nextRevision = 0;
    let nextText: string | null = null;
    const nextTexts: Array<string | null> = [null];
    let otherProjectDraftTitle = '';
    let mode: Mode = { kind: 'ready' };
    let failReads = false;
    let failedReads = 0;
    let taskReadsStarted = 0;
    const writes: Sent[] = [];
    const readPaths: string[] = [];
    const tasks = page.locator('.project-tasks:visible');
    const projects = page.locator('.project-workspace:visible');
    const taskWord = (key: (typeof projectTaskMessages.keys)[number]) =>
      resolveMessage(projectTaskMessages, locale, key);
    const nextWord = (key: (typeof projectNextActionMessages.keys)[number]) =>
      resolveMessage(projectNextActionMessages, locale, key);
    const nextPanel = () =>
      page.getByRole('region', { name: nextWord('title'), exact: true });
    const instructions = () =>
      tasks.getByLabel(taskWord('descriptionLabel'), { exact: true });
    // Observe readiness promptly under bounded transport lag; the usual locator
    // assertion backoff can add a full second after each sequential read phase.
    async function expectEnabled(control: Locator) {
      await expect
        .poll(() => control.isEnabled(), { intervals: [100] })
        .toBe(true);
    }
    const taskPath = `/api/tasks/${source.taskId}`;
    const isTaskRead = (request: Request) =>
      request.method() === 'GET' &&
      [
        taskPath,
        `${taskPath}/history`,
        `/api/projects/${source.projectId}/tasks`,
        `/api/projects/${source.projectId}/eligible-task-assignees`,
      ].includes(new URL(request.url()).pathname);
    const taskReads = observeApiRequests(page, isTaskRead);
    async function finishTaskReadPhase(after: number) {
      await expect
        .poll(() => taskReadsStarted, {
          timeout: IDLE_DEADLINE_MILLISECONDS,
          intervals: [100],
          message: 'The command must start a fresh native Task read phase',
        })
        .toBeGreaterThan(after);
      await expect
        .poll(() => taskReads.isIdle(), {
          timeout: IDLE_DEADLINE_MILLISECONDS,
          intervals: [100],
          message:
            'Native Task listing, detail, history and member reads must settle',
        })
        .toBe(true);
    }
    const identify = (route: Route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...accessIdentities.member },
      });
    const observe = (request: Request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === 'PATCH' && path === taskPath)
        writes.push({
          body: request.postData(),
          key: request.headers()['idempotency-key'] ?? '',
        });
      if (request.method() === 'GET') readPaths.push(path);
      if (isTaskRead(request)) taskReadsStarted++;
    };
    const failedRead = async (route: Route) => {
      const path = new URL(route.request().url()).pathname;
      if (
        !failReads ||
        route.request().method() !== 'GET' ||
        ![
          taskPath,
          `${taskPath}/history`,
          `/api/projects/${source.projectId}/tasks`,
        ].includes(path)
      )
        return route.fallback();
      expectApiFailure({
        page,
        request: route.request(),
        reason:
          'The native Task committed; only its independent read refresh fails.',
      });
      failedReads++;
      await route.fulfill({ status: 503, body: '' });
    };
    await page.route('**/api/**', identify);
    await page.route('**/api/**', failedRead);
    page.on('request', observe);
    async function drawer(open: boolean) {
      if (!info.project.name.endsWith('narrow')) return;
      const close = page.getByRole('button', {
        name: resolveMessage(prismeMessages, locale, 'closeNavigation'),
        exact: true,
      });
      if ((await close.isVisible()) !== open)
        await page
          .getByRole('button', {
            name: resolveMessage(
              prismeMessages,
              locale,
              open ? 'openNavigation' : 'closeNavigation',
            ),
            exact: true,
          })
          .click();
    }
    async function company(value: 'a' | 'b') {
      await drawer(true);
      const selector = page.getByLabel(
        resolveMessage(companyContextMessages, locale, 'activeCompany'),
        { exact: true },
      );
      await selectOption(selector, { value: source.companies[value].id });
      await expectEnabled(selector);
      await drawer(false);
    }
    async function openProject(title: string) {
      if (!(await projects.isVisible())) {
        await drawer(true);
        await page.locator('nav ul a[href="#projects"]').click();
        await drawer(false);
      }
      await expect(projects).toBeVisible();
      await projects.getByRole('button').filter({ hasText: title }).click();
      await expect
        .poll(
          () =>
            projects
              .getByRole('heading', { name: title, exact: true })
              .isVisible(),
          { intervals: [100] },
        )
        .toBe(true);
      await expect(tasks).toBeVisible();
    }
    async function openTask(expectedDescription = description) {
      await openProject(source.title);
      await tasks
        .locator('.task-list')
        .getByRole('button', { name: source.taskTitle, exact: true })
        .click();
      await expectEnabled(instructions());
      await expect(instructions()).toHaveValue(expectedDescription);
    }
    async function setLocale(value: 'ro' | 'ru') {
      await selectOption(page.locator('#interface-locale'), { value });
      locale = value;
      await expect(projects).toBeVisible();
    }
    async function draft(variant: Variant) {
      const text = `Ș Я ${variant} / ${version} / <b>literal</b>\n  Keep 001 and 😀 unchanged`;
      await instructions().fill(text);
      mode = { kind: 'draft', text };
    }
    await installProjectTaskReadHolds(page);
    await page.goto('/');
    await company('a');
    await openTask();
    await setLocale(preferredLocale);
    await projectTaskReadProof(page, 'target', taskPath);
    await draft(initial);

    async function save(fault: 'none' | 'lost-receipt' | 'failed-read') {
      if (mode.kind !== 'draft')
        throw new Error('Expected a deliberate native Task draft');
      const text = mode.text;
      const expectedVersion = version;
      const before = writes.length;
      const beforeReads = taskReadsStarted;
      const beforeFailedReads = failedReads;
      const lose = async (route: Route) => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(response.status()).toBe(200);
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'The native Task committed; its first durable receipt is lost.',
        });
        await route.abort('connectionfailed');
      };
      if (fault === 'lost-receipt') await page.route(`**${taskPath}`, lose);
      if (fault === 'failed-read') failReads = true;
      const reply =
        fault === 'lost-receipt'
          ? null
          : page.waitForResponse(
              (response) =>
                response.request().method() === 'PATCH' &&
                new URL(response.url()).pathname === taskPath,
            );
      try {
        await tasks
          .getByRole('button', { name: taskWord('save'), exact: true })
          .click();
        if (reply) expect((await reply).status()).toBe(200);
        else
          await expect(
            tasks.getByRole('button', { name: taskWord('retry'), exact: true }),
          ).toBeVisible();
      } finally {
        if (fault === 'lost-receipt')
          await removeRoute(page, `**${taskPath}`, lose);
      }
      expect(writes).toHaveLength(before + 1);
      const sent = writes[before];
      if (!sent) throw new Error('Missing browser Task intent');
      expect(sent.key).toMatch(/^[0-9a-f-]{36}$/iu);
      expect(accessObject(JSON.parse(sent.body ?? '{}'))).toEqual({
        expectedVersion,
        description: text,
      });
      version++;
      description = text;
      descriptions.push(text);
      mode =
        fault === 'lost-receipt'
          ? { kind: 'uncertain', text, sent }
          : fault === 'failed-read'
            ? { kind: 'refresh-error' }
            : { kind: 'ready' };
      if (fault === 'none') {
        await finishTaskReadPhase(beforeReads);
        await expectEnabled(instructions());
        await expect(instructions()).toHaveValue(description);
      }
      if (fault === 'failed-read') {
        await expect
          .poll(() => failedReads, { timeout: IDLE_DEADLINE_MILLISECONDS })
          .toBeGreaterThan(beforeFailedReads);
        await finishTaskReadPhase(beforeReads);
        await expect(
          tasks.getByRole('button', {
            name: taskWord('reloadDetail'),
            exact: true,
          }),
        ).toBeEnabled();
      }
    }
    async function retry() {
      if (mode.kind !== 'uncertain')
        throw new Error('Expected uncertain Task command');
      const original = mode.sent;
      const before = writes.length;
      const beforeReads = taskReadsStarted;
      const reply = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          new URL(response.url()).pathname === taskPath,
      );
      const button = tasks.getByRole('button', {
        name: taskWord('retry'),
        exact: true,
      });
      await button.evaluate((element) => {
        if (!(element instanceof HTMLButtonElement))
          throw new Error('Expected native retry button');
        element.click();
        element.click();
      });
      expect((await reply).status()).toBe(200);
      await finishTaskReadPhase(beforeReads);
      await expectEnabled(instructions());
      await expect(instructions()).toHaveValue(description);
      expect(writes).toHaveLength(before + 1);
      expect(writes[before]).toEqual(original);
      mode = { kind: 'ready' };
    }
    async function recoverRead() {
      const before = writes.length;
      const beforeReads = taskReadsStarted;
      await expect
        .poll(() => taskReads.isIdle(), { timeout: IDLE_DEADLINE_MILLISECONDS })
        .toBe(true);
      failReads = false;
      await tasks
        .getByRole('button', { name: taskWord('reloadDetail'), exact: true })
        .click();
      await finishTaskReadPhase(beforeReads);
      await expectEnabled(instructions());
      await expect(instructions()).toHaveValue(description);
      expect(writes).toHaveLength(before);
      mode = { kind: 'ready' };
    }
    async function projectRead() {
      const before = writes.length;
      const reply = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          new URL(response.url()).pathname ===
            `/api/projects/${source.projectId}/next-action`,
      );
      await nextPanel()
        .getByRole('button', { name: nextWord('refresh'), exact: true })
        .click();
      expect((await reply).status()).toBe(200);
      await expect(
        nextPanel().getByRole('textbox', {
          name: nextWord('label'),
          exact: true,
        }),
      ).toBeEnabled();
      if (mode.kind === 'draft')
        await expect(instructions()).toHaveValue(mode.text);
      expect(writes).toHaveLength(before);
    }
    async function projectWrite(variant: Variant) {
      const text = `Project Ș Я ${variant} / ${nextRevision + 1}\n  Independent literal next action`;
      await nextPanel()
        .getByRole('textbox', { name: nextWord('label'), exact: true })
        .fill(text);
      const response = page.waitForResponse(
        (reply) =>
          reply.request().method() === 'POST' &&
          new URL(reply.url()).pathname ===
            `/api/projects/${source.projectId}/next-action`,
      );
      await nextPanel().locator('button[type="submit"]').click();
      expect((await response).status()).toBe(200);
      nextRevision++;
      nextText = text;
      nextTexts.push(text);
      await expect(
        nextPanel().getByRole('textbox', {
          name: nextWord('label'),
          exact: true,
        }),
      ).toBeEnabled();
      if (mode.kind === 'draft')
        await expect(instructions()).toHaveValue(mode.text);
    }
    async function staleRevision(variant: Variant) {
      await draft(variant);
      if (mode.kind !== 'draft')
        throw new Error('Expected a literal conflict intention');
      const text = mode.text;
      const observedVersion = version;
      const external = `Native concurrent Ș Я ${version + 1}\n  Independent 001`;
      await source.externalTaskEdit(version, external);
      version++;
      description = external;
      descriptions.push(external);
      const before = writes.length;
      const conflict = async (route: Route) => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(response.status()).toBe(409);
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'A real native concurrent Task edit made this observed version stale.',
        });
        await route.fulfill({ response });
      };
      await page.route(`**${taskPath}`, conflict);
      try {
        const reply = page.waitForResponse(
          (response) =>
            response.request().method() === 'PATCH' &&
            new URL(response.url()).pathname === taskPath,
        );
        await tasks
          .getByRole('button', { name: taskWord('save'), exact: true })
          .click();
        expect((await reply).status()).toBe(409);
        await expect(
          tasks.getByText(taskWord('conflict'), { exact: true }),
        ).toBeVisible();
      } finally {
        await removeRoute(page, `**${taskPath}`, conflict);
      }
      expect(writes).toHaveLength(before + 1);
      expect(accessObject(JSON.parse(writes[before]?.body ?? '{}'))).toEqual({
        expectedVersion: observedVersion,
        description: text,
      });
      mode = { kind: 'conflict', text };
    }
    async function taskWriteDuringProjectRead() {
      if (mode.kind !== 'draft') await draft('a');
      const pattern = `**/api/projects/${source.projectId}/next-action`;
      let closing = false,
        first = true;
      let release: (() => void) | undefined;
      let finished: Promise<void> | undefined;
      const hold = async (route: Route) => {
        if (route.request().method() !== 'GET' || !first)
          return route.fallback();
        first = false;
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(response.status()).toBe(200);
        if (closing) return route.fulfill({ response });
        finished = (async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          try {
            await route.fulfill({ response });
          } catch (error: unknown) {
            if (!route.request().failure()?.errorText.includes('ERR_ABORTED'))
              throw error;
          }
        })();
        await finished;
      };
      await page.route(pattern, hold);
      try {
        await nextPanel()
          .getByRole('button', { name: nextWord('refresh'), exact: true })
          .click();
        await expect
          .poll(() => typeof release, { timeout: IDLE_DEADLINE_MILLISECONDS })
          .toBe('function');
        await save('none');
        expect(await source.task()).toMatchObject({ version, description });
      } finally {
        closing = true;
        release?.();
        await finished;
        await removeRoute(page, pattern, hold);
      }
      await expect(
        nextPanel().getByRole('textbox', {
          name: nextWord('label'),
          exact: true,
        }),
      ).toBeEnabled();
    }
    async function lateRead(value: Values) {
      const beforeWrites = writes.length;
      const beforeHttp = readPaths.filter((path) => path === taskPath).length;
      const beforeReads = taskReadsStarted;
      const stage = value.stage;
      const replacement = value.replacement;
      let closing = false,
        first = true;
      let releaseReply: (() => void) | undefined;
      let finished: Promise<void> | undefined;
      const pattern = `**${taskPath}`;
      const hold = async (route: Route) => {
        if (route.request().method() !== 'GET' || !first)
          return route.fallback();
        first = false;
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(response.status()).toBe(200);
        if (closing) return route.fulfill({ response });
        finished = (async () => {
          await new Promise<void>((resolve) => {
            releaseReply = resolve;
          });
          try {
            if (value.variant === 'b' && replacement !== 'project') {
              expectApiFailure({
                page,
                request: route.request(),
                reason:
                  'An old native Task read returns denial only after the foreground source changed.',
              });
              await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: '{}',
              });
            } else await route.fulfill({ response });
          } catch (error: unknown) {
            if (!route.request().failure()?.errorText.includes('ERR_ABORTED'))
              throw error;
          }
        })();
        await finished;
      };
      if (stage === 'http') await page.route(pattern, hold);
      else await projectTaskReadProof(page, 'arm', stage);
      try {
        await tasks
          .getByRole('button', { name: taskWord('reloadDetail'), exact: true })
          .click();
        if (stage === 'http')
          await expect
            .poll(() => typeof releaseReply, {
              timeout: IDLE_DEADLINE_MILLISECONDS,
              intervals: [100],
            })
            .toBe('function');
        else
          await expect
            .poll(() => projectTaskReadProof(page, 'read'), {
              timeout: IDLE_DEADLINE_MILLISECONDS,
              intervals: [100],
            })
            .toMatchObject({ held: true });
        if (replacement === 'access') {
          await source.revoke('company-task-manager', 'a');
          await source.revoke('company-project-next-action-coordinator', 'a');
          const nextPath = `/api/projects/${source.projectId}/next-action`;
          const nativeRefusal = (route: Route) => {
            if (route.request().method() === 'POST')
              expectApiFailure({
                page,
                request: route.request(),
                reason:
                  'Native revoked next-action authority publishes the current Actor without Task authority in the same Company.',
              });
            return route.fallback();
          };
          await page.route(`**${nextPath}`, nativeRefusal);
          try {
            const refused = page.waitForResponse(
              (reply) =>
                reply.request().method() === 'POST' &&
                new URL(reply.url()).pathname === nextPath,
            );
            const recovered = page.waitForResponse(
              (reply) =>
                new URL(reply.url()).pathname === '/api/access/current-actor' &&
                reply.request().headers()['x-company-context-id'] ===
                  source.companies.a.id,
            );
            await nextPanel()
              .getByRole('textbox', { name: nextWord('label'), exact: true })
              .fill('Fictional refused next action; must never commit.');
            await nextPanel().locator('button[type="submit"]').click();
            expect((await refused).status()).toBe(403);
            const actorReply = await recovered;
            expect(actorReply.status()).toBe(200);
            const activeCompany = accessObject(
              accessObject(await actorReply.json()).activeCompany,
            );
            expect(activeCompany.id).toBe(source.companies.a.id);
            if (!Array.isArray(activeCompany.grants))
              throw new Error('Expected native revalidated Actor grants');
            const grants: unknown[] = activeCompany.grants;
            const bundles = grants.map((grant) => accessObject(grant).bundle);
            expect(bundles).not.toContain('company_task_manager');
            expect(bundles).not.toContain(
              'company_project_next_action_coordinator',
            );
            await expect(instructions()).toHaveCount(0);
          } finally {
            await removeRoute(page, `**${nextPath}`, nativeRefusal);
          }
        } else if (replacement === 'project')
          await openProject(source.otherTitle);
        else {
          await company('b');
          otherProjectDraftTitle = '';
          await openProject(source.companyBTitle);
        }
        if (replacement === 'access')
          await expect(
            projects.getByRole('heading', { name: source.title, exact: true }),
          ).toBeVisible();
        const title =
          replacement === 'access'
            ? projects.locator('.project-registration input').first()
            : tasks.getByLabel(taskWord('titleLabel'), { exact: true });
        await expect(title).toHaveValue(
          replacement === 'project' ? otherProjectDraftTitle : '',
        );
        const independent = `Independent Ș Я ${value.variant} ${version}`;
        await title.fill(independent);
        if (replacement === 'project') otherProjectDraftTitle = independent;
        closing = true;
        if (stage === 'http') {
          releaseReply?.();
          await finished;
        } else await projectTaskReadProof(page, 'release');
        // Hidden Projects retain their own authorized Task state. A foreground
        // Project switch isolates that completion rather than revoking its grant.
        if (replacement === 'project') await finishTaskReadPhase(beforeReads);
        else
          await expect
            .poll(() => taskReads.isIdle(), {
              timeout: IDLE_DEADLINE_MILLISECONDS,
              intervals: [100],
            })
            .toBe(true);
        await expect(title).toHaveValue(independent);
        if (replacement === 'access') {
          await expect(instructions()).toHaveCount(0);
          await expect(
            tasks.getByRole('button', { name: source.taskTitle, exact: true }),
          ).toHaveCount(0);
          await expect(
            projects.getByRole('heading', { name: source.title, exact: true }),
          ).toBeVisible();
          await title.fill('');
        } else await expect(instructions()).toHaveValue('');
        if (stage === 'token' && replacement === 'access')
          expect(readPaths.filter((path) => path === taskPath)).toHaveLength(
            beforeHttp,
          );
        expect(writes).toHaveLength(beforeWrites);
      } finally {
        closing = true;
        if (stage === 'http') {
          releaseReply?.();
          await finished;
          await removeRoute(page, pattern, hold);
        } else await projectTaskReadProof(page, 'release');
      }
      if (replacement === 'access') {
        // Consume the old continuation and assert isolation before any Company
        // replacement. B/A below only publishes the deliberately restored grants.
        await source.grant('company-task-manager', 'a');
        await source.grant('company-project-next-action-coordinator', 'a');
        await company('b');
        otherProjectDraftTitle = '';
      }
      if (replacement !== 'project') await company('a');
      await openTask();
      mode = { kind: 'ready' };
    }
    async function navigate() {
      const before = writes.length;
      const expected = mode.kind === 'draft' ? mode.text : description;
      await drawer(true);
      await page.locator('nav ul a[href="#overview"]').click();
      await drawer(false);
      await expect(projects).not.toBeVisible();
      await openTask(expected);
      expect(writes).toHaveLength(before);
    }
    async function verify() {
      const [task, events, nextSnapshot, unrelated] = await Promise.all([
        source.task(),
        source.history(),
        source.nextAction(),
        source.unrelatedTasks(),
      ]);
      expect(task).toMatchObject({
        id: source.taskId,
        companyId: source.companies.a.id,
        projectId: source.projectId,
        clientAccountId: source.clientA,
        title: source.taskTitle,
        version,
        description,
        status: 'todo',
        priority: 'normal',
        dueDate: null,
        assignee: null,
      });
      expect(unrelated).toEqual([[], []]);
      expect(events).toHaveLength(version);
      for (let i = 0; i < descriptions.length; i++) {
        const event = events.find(
          (event) => accessObject(event.metadata).version === i + 1,
        );
        if (!event) throw new Error('Missing attributed native Task version');
        expect(accessObject(event.actor).workspaceMembershipId).toBe(
          source.membershipId,
        );
        expect(event.target).toMatchObject({
          companyId: source.companies.a.id,
          taskId: source.taskId,
        });
        if (i === 0)
          expect(
            accessObject(accessObject(event.metadata).initial).description,
          ).toBe(descriptions[i]);
        else
          expect(
            accessObject(accessObject(event.metadata).changes).description,
          ).toEqual({ before: descriptions[i - 1], after: descriptions[i] });
      }
      expect(accessObject(nextSnapshot.current)).toMatchObject({
        revision: nextRevision,
        text: nextText,
      });
      const entries = accessObject(nextSnapshot.history).entries;
      if (!Array.isArray(entries))
        throw new Error('Missing native next-action history');
      expect(entries).toHaveLength(nextRevision);
      for (let i = 1; i <= nextRevision; i++)
        expect(
          entries.map(accessObject).find((entry) => entry.revision === i),
        ).toMatchObject({ before: nextTexts[i - 1], after: nextTexts[i] });
      if (
        mode.kind === 'draft' ||
        mode.kind === 'conflict' ||
        mode.kind === 'uncertain'
      )
        await expect(instructions()).toHaveValue(mode.text);
      else if (mode.kind === 'ready') {
        await expectEnabled(instructions());
        await expect(instructions()).toHaveValue(description);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    return {
      actions(value) {
        const actions: BrowserAction[] = [
          {
            label: 'change-interface-locale',
            run: () => setLocale(value.locale),
          },
        ];
        if (mode.kind === 'uncertain')
          actions.push({
            label: 'retry-exact-task-with-double-admission',
            run: retry,
          });
        else if (mode.kind === 'refresh-error' || mode.kind === 'conflict')
          actions.push({
            label: 'reload-confirmed-or-conflicted-task-without-writing',
            run: recoverRead,
          });
        else {
          actions.push({
            label: 'edit-literal-task-instructions',
            run: () => draft(value.variant),
          });
          actions.push({
            label: 'read-project-with-independent-task-draft',
            run: projectRead,
          });
          actions.push({
            label: 'write-project-with-independent-task-draft',
            run: () => projectWrite(value.variant),
          });
          actions.push({
            label: 'stale-task-revision-requires-deliberate-reload',
            run: () => staleRevision(value.variant),
          });
          actions.push({
            label: 'write-task-while-project-read-is-held',
            run: taskWriteDuringProjectRead,
          });
          if (mode.kind === 'ready')
            actions.push({
              label: `isolate-${value.stage}${value.stage === 'http' && value.variant === 'b' && value.replacement !== 'project' ? '-403' : ''}-task-after-${value.replacement}`,
              run: () => lateRead(value),
            });
          actions.push({
            label: 'navigate-and-reopen-exact-project-task',
            run: navigate,
          });
          if (mode.kind === 'draft')
            for (const fault of [
              'none',
              'lost-receipt',
              'failed-read',
            ] as const)
              actions.push({
                label: `save-task-${fault}`,
                run: () => save(fault),
              });
        }
        return actions;
      },
      verify,
      async settle() {
        if (mode.kind === 'uncertain') await retry();
        if (mode.kind === 'refresh-error' || mode.kind === 'conflict')
          await recoverRead();
        if (locale !== preferredLocale) await setLocale(preferredLocale);
      },
      async dispose() {
        taskReads.dispose();
        await projectTaskReadProof(page, 'restore');
        page.off('request', observe);
        await removeRoute(page, '**/api/**', failedRead);
        await removeRoute(page, '**/api/**', identify);
      },
      describe: () => ({
        version,
        nextRevision,
        mode: mode.kind,
        writes: writes.length,
        reads: readPaths.length,
        locale,
      }),
    };
  },
};
