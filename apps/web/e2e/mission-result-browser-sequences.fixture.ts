import { publishNativeGrantLoss } from './native-grant-loss.fixture';
import * as fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Request, Route } from '@playwright/test';
import {
  expect,
  expectApiFailure,
  observeApiRequests,
  IDLE_DEADLINE_MILLISECONDS,
} from './ui-chaos.fixture';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import { prepareMissionResultSource } from './mission-result-sequence-source.fixture';
import {
  accessApiOrigin,
  accessIdentities,
  accessObject,
  accessText,
} from './access-sequence-source.fixture';
import {
  installNativeReadHolds,
  nativeReadProof,
} from './native-read-holds.fixture';
import { replaceScopeBeforeFinancialReply } from './financial-held-read.fixture';
import { removeRoute } from './route-removal';
import { selectOption } from './select-option';
import { resolveMessage, formatMessage } from '../src/localization/messages';
import { taskResultMessages } from '../src/project/task-results.copy';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import { projectNextActionMessages } from '../src/project/project-next-action.copy';

type Values = {
  variant: 'a' | 'b';
  locale: 'ro' | 'ru';
  stage: 'token' | 'parser' | 'http';
  replacement: 'task' | 'company' | 'access';
};
type Sent = { body: string; key: string };
type Declaration = { id: string; text: string; reason: string | null };
type Mode =
  | {
      kind:
        | 'ready'
        | 'read-error'
        | 'conflict'
        | 'held-denial'
        | 'away'
        | 'retiring'
        | 'project-navigation'
        | 'project-directory'
        | 'project-open';
    }
  | { kind: 'draft'; text: string; reason: string }
  | { kind: 'uncertain'; sent: Sent };

export const missionResultSequenceAdapter: BrowserSequenceAdapter<
  'empty' | 'recorded',
  Values
> = {
  caseId: 'mission-task-result',
  initial: fc.constantFrom('empty', 'recorded'),
  values: fc.record({
    variant: fc.constantFrom('a', 'b'),
    locale: fc.constantFrom('ro', 'ru'),
    stage: fc.constantFrom('token', 'parser', 'http'),
    replacement: fc.constantFrom('task', 'company', 'access'),
  }),
  async open({ page, info, trial, initial }) {
    const source = await prepareMissionResultSource(
      page,
      `${info.project.name}-${trial}-${randomUUID()}`,
    );
    const declarations: Declaration[] = [];
    let taskVersion = 1;
    let mode: Mode = { kind: 'ready' };
    let locale: 'en' | 'ro' | 'ru' = info.project.name.endsWith('narrow')
      ? 'ru'
      : 'ro';
    let failedRead = false;
    const writes: Sent[] = [];
    let resultReads = 0;
    const resultPath = `/api${source.resultPath}`;
    const projects = page.locator('.project-workspace:visible');
    const tasks = page.locator('.project-tasks:visible');
    const results = tasks.locator('.task-results');
    const copy = (key: (typeof taskResultMessages.keys)[number]) =>
      resolveMessage(taskResultMessages, locale, key);
    const intent = (text: string, reason: string) => ({
      declaration: text.trim(),
      documentId: source.documentId,
      versionId: source.versionId,
      expectedTaskVersion: taskVersion,
      expectedResultRevision: declarations.length,
      ...(declarations.length ? { reason: reason.trim() } : {}),
    });
    if (initial === 'recorded') {
      const text = 'Native seed Ș Я 001';
      const receipt = await source.command(source.resultPath, intent(text, ''));
      declarations.push({
        id: accessText(receipt.resultId),
        text,
        reason: null,
      });
    }
    const identify = (route: Route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...accessIdentities.member },
      });
    const failRefresh = async (route: Route) => {
      if (
        !failedRead ||
        route.request().method() !== 'GET' ||
        new URL(route.request().url()).pathname !== resultPath
      )
        return route.fallback();
      expectApiFailure({
        page,
        request: route.request(),
        reason:
          'The native result committed; its independent result refresh deliberately fails.',
      });
      await route.fulfill({ status: 503, body: '' });
    };
    const observe = (request: Request) => {
      if (
        request.method() === 'GET' &&
        new URL(request.url()).pathname === resultPath
      )
        resultReads++;
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith(resultPath)
      )
        writes.push({
          body: request.postData() ?? '',
          key: request.headers()['idempotency-key'] ?? '',
        });
    };
    await page.route('**/api/**', identify);
    await page.route('**/api/**', failRefresh);
    page.on('request', observe);
    // Task editor and assignee reads do not own the independent Result controls.
    const taskReads = observeApiRequests(page, (request) => {
      const path = new URL(request.url()).pathname;
      return (
        request.method() === 'GET' &&
        (path.startsWith(`/api/tasks/${source.taskId}/results`) ||
          path.startsWith(`/api/tasks/${source.otherTaskId}/results`))
      );
    });
    async function finishTaskReads() {
      await expect
        .poll(() => taskReads.isIdle(), {
          timeout: IDLE_DEADLINE_MILLISECONDS,
          intervals: [100],
        })
        .toBe(true);
    }
    async function drawer(open: boolean) {
      if (!info.project.name.endsWith('narrow')) return;
      const close = page.getByRole('button', {
        name: resolveMessage(prismeMessages, locale, 'closeNavigation'),
        exact: true,
      });
      if ((await close.isVisible()) !== open)
        await page.locator('.production-menu-button').click();
    }
    async function company(value: 'a' | 'b') {
      await drawer(true);
      const control = page
        .locator('.prisme-company-selector')
        .getByRole('combobox');
      await selectOption(control, { value: source.companies[value].id });
      await expect(control).toBeEnabled();
      await drawer(false);
    }
    async function enterProjects() {
      await drawer(true);
      await page.locator('nav a[href="#projects"]').click();
      await drawer(false);
      mode = { kind: 'project-directory' };
    }
    async function selectProject() {
      // Exactly one native Project belongs to this freshly prepared Company.
      await projects
        .locator('.project-list')
        .getByRole('button')
        .filter({ hasText: source.title })
        .click();
      await expect(
        tasks
          .locator('.task-list')
          .getByRole('button', { name: source.taskTitle, exact: true }),
      ).toBeVisible();
      mode = { kind: 'project-open' };
    }
    async function selectResultTask() {
      await tasks
        .locator('.task-list')
        .getByRole('button', { name: source.taskTitle, exact: true })
        .click();
      await expect(
        results.getByRole('heading', { name: copy('title'), exact: true }),
      ).toBeVisible();
      await expect(
        results.getByRole('button', { name: copy('reload'), exact: true }),
      ).toBeEnabled();
      await finishTaskReads();
      mode = { kind: 'ready' };
    }
    async function openTask() {
      if (!(await projects.isVisible())) await enterProjects();
      await selectProject();
      await selectResultTask();
    }
    async function reload() {
      failedRead = false;
      await results
        .getByRole('button', { name: copy('reload'), exact: true })
        .click();
      await expect(
        results.getByRole('button', { name: copy('reload'), exact: true }),
      ).toBeEnabled();
      await finishTaskReads();
      mode = { kind: 'ready' };
    }
    async function draft(variant: Values['variant']) {
      if (mode.kind === 'read-error' || mode.kind === 'conflict')
        await reload();
      await finishTaskReads();
      if (
        declarations.length &&
        !(await results
          .getByLabel(copy('declaration'), { exact: true })
          .isVisible())
      )
        await results
          .getByRole('button', { name: copy('correct'), exact: true })
          .click();
      const text = `  Ș Я ${variant}/${declarations.length + 1}\n  Literal <b>001</b> 😀  `;
      const reason = `  Human correction ${variant}/${declarations.length + 1} Ș Я  `;
      await results.getByLabel(copy('declaration'), { exact: true }).fill(text);
      await selectOption(results.getByLabel(copy('version'), { exact: true }), {
        value: source.versionId,
      });
      if (declarations.length)
        await results.getByLabel(copy('reason'), { exact: true }).fill(reason);
      mode = { kind: 'draft', text, reason };
    }
    async function save(fault: 'none' | 'lost-receipt' | 'failed-refresh') {
      if (mode.kind !== 'draft') await draft('a');
      if (mode.kind !== 'draft')
        throw new Error('Missing literal result intention');
      const intended = intent(mode.text, mode.reason);
      const endpoint = resultPath + (declarations.length ? '/corrections' : '');
      const before = writes.length;
      let receipt: Record<string, unknown> | undefined;
      const lose = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const reply = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(reply.status()).toBe(201);
        receipt = accessObject(await reply.json());
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'The actual result committed; its first receipt is deliberately lost.',
        });
        await route.abort('connectionfailed');
      };
      if (fault === 'lost-receipt') await page.route(`**${endpoint}`, lose);
      if (fault === 'failed-refresh') failedRead = true;
      const response =
        fault === 'lost-receipt'
          ? null
          : page.waitForResponse(
              (reply) =>
                reply.request().method() === 'POST' &&
                new URL(reply.url()).pathname === endpoint,
            );
      try {
        await results
          .getByRole('button', {
            name: copy(declarations.length ? 'save' : 'record'),
            exact: true,
          })
          .click();
        if (response) {
          const reply = await response;
          expect(reply.status()).toBe(201);
          receipt = accessObject(await reply.json());
        } else
          await expect(
            results.getByRole('button', { name: copy('retry'), exact: true }),
          ).toBeVisible();
      } finally {
        if (fault === 'lost-receipt')
          await removeRoute(page, `**${endpoint}`, lose);
      }
      expect(writes).toHaveLength(before + 1);
      const sent = writes[before];
      if (!sent || !receipt)
        throw new Error('Missing native result receipt or browser intent');
      expect(sent.key).toMatch(/^[0-9a-f-]{36}$/iu);
      const payload: unknown = JSON.parse(sent.body);
      expect(payload).toEqual(intended);
      expect(receipt.resultRevision).toBe(declarations.length + 1);
      declarations.push({
        id: accessText(receipt.resultId),
        text: intended.declaration,
        reason: 'reason' in intended ? accessText(intended.reason) : null,
      });
      mode =
        fault === 'lost-receipt'
          ? { kind: 'uncertain', sent }
          : fault === 'failed-refresh'
            ? { kind: 'read-error' }
            : { kind: 'ready' };
      if (fault === 'failed-refresh')
        await expect(
          results.getByText(copy('unavailable'), { exact: true }),
        ).toBeVisible();
      if (fault === 'none') await finishTaskReads();
      if (fault === 'none')
        await expect(
          results.getByText(intended.declaration, { exact: true }).first(),
        ).toBeVisible();
    }
    async function retry() {
      if (mode.kind !== 'uncertain')
        throw new Error('Missing uncertain exact intention');
      const original = mode.sent;
      const before = writes.length;
      const reply = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname.startsWith(resultPath),
      );
      await results
        .getByRole('button', { name: copy('retry'), exact: true })
        .evaluate((button) => {
          if (!(button instanceof HTMLButtonElement))
            throw new Error('Expected result retry');
          button.click();
          button.click();
        });
      expect((await reply).status()).toBe(201);
      await expect(
        results.getByRole('button', { name: copy('retry'), exact: true }),
      ).toHaveCount(0);
      expect(writes).toHaveLength(before + 1);
      expect(writes[before]).toEqual(original);
      await finishTaskReads();
      mode = { kind: 'ready' };
      await expect(
        results.getByRole('button', { name: copy('reload'), exact: true }),
      ).toBeEnabled();
    }
    async function history() {
      const open = results.getByRole('button', {
        name: copy('history'),
        exact: true,
      });
      if (await open.isVisible()) await open.click();
      const list = results.getByRole('list');
      await expect(list.getByRole('listitem')).toHaveCount(declarations.length);
      for (let index = 0; index < declarations.length; index++)
        await expect(list.getByRole('listitem').nth(index)).toContainText(
          declarations[declarations.length - index - 1]?.text ?? '',
        );
    }
    async function download() {
      const pending = page.waitForEvent('download');
      await results
        .getByRole('button', {
          name: formatMessage(copy('download'), { number: '1' }),
          exact: true,
        })
        .first()
        .click();
      const path = info.outputPath(`mission-result-${trial}-original.pdf`);
      await (await pending).saveAs(path);
      expect(await readFile(path)).toEqual(source.bytes);
    }
    async function stale() {
      if (mode.kind !== 'draft') throw new Error('Missing stale result draft');
      const response = await page.request.patch(
        `${accessApiOrigin}/tasks/${source.taskId}`,
        {
          headers: { ...source.headers, 'idempotency-key': randomUUID() },
          data: {
            expectedVersion: taskVersion,
            description: `Native external Task edit ${taskVersion}`,
          },
        },
      );
      expect(response.status()).toBe(200);
      taskVersion++;
      const endpoint = resultPath + (declarations.length ? '/corrections' : '');
      const allowConflict = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const reply = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(reply.status()).toBe(409);
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'A native concurrent Task edit invalidates the observed result intention.',
        });
        await route.fulfill({ response: reply });
      };
      await page.route(`**${endpoint}`, allowConflict);
      try {
        await results
          .getByRole('button', {
            name: copy(declarations.length ? 'save' : 'record'),
            exact: true,
          })
          .click();
        await expect(
          results.getByText(copy('conflict'), { exact: true }),
        ).toBeVisible();
        mode = { kind: 'conflict' };
      } finally {
        await removeRoute(page, `**${endpoint}`, allowConflict);
      }
    }
    type Retirement = {
      stage: Values['stage'];
      replacement: Values['replacement'];
      phase:
        | 'replace'
        | 'return'
        | 'return-project-navigation'
        | 'return-project'
        | 'return-task'
        | 'restore-access'
        | 'return-access'
        | 'restore-project-navigation'
        | 'restore-project'
        | 'restore-task'
        | 'release';
      replaced: boolean;
      revoked: boolean;
      finish: () => Promise<void>;
    };
    let retirement: Retirement | undefined;
    async function publishRevokedResultAuthority() {
      await source.revoke('company-task-result-recorder', 'a');
      await source.revoke('company-project-next-action-coordinator', 'a');
      const nextPanel = projects.getByRole('region', {
        name: resolveMessage(projectNextActionMessages, locale, 'title'),
        exact: true,
      });
      await publishNativeGrantLoss({
        page,
        path: `/projects/${source.projectId}/next-action`,
        method: 'POST',
        companyId: source.companies.a.id,
        absentBundles: [
          'company_task_result_recorder',
          'company_project_next_action_coordinator',
        ],
        start: async () => {
          await nextPanel
            .getByRole('textbox', {
              name: resolveMessage(projectNextActionMessages, locale, 'label'),
              exact: true,
            })
            .fill('Fictional refused intention; must never commit.');
          await nextPanel.locator('button[type="submit"]').click();
        },
      });
      await expect(
        results.getByRole('button', {
          name: copy(declarations.length ? 'correct' : 'record'),
          exact: true,
        }),
      ).toHaveCount(0);
    }

    async function beginRetirement(
      stage: Values['stage'],
      replacement: Values['replacement'],
    ) {
      await finishTaskReads();
      const before = writes.length;
      let finish: () => Promise<void>;
      if (stage === 'http') {
        let ready: (() => void) | undefined;
        let release: (() => void) | undefined;
        const captured = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const replacementsDone = new Promise<void>((resolve) => {
          release = resolve;
        });
        const completion = replaceScopeBeforeFinancialReply({
          page,
          path: source.resultPath,
          identity: accessIdentities.member,
          reply: { kind: 'authorized' },
          start: () =>
            results
              .getByRole('button', { name: copy('reload'), exact: true })
              .click(),
          replace: async () => {
            ready?.();
            await replacementsDone;
          },
        }).then(
          () => ({ kind: 'complete' as const }),
          (error: unknown) => ({ kind: 'failed' as const, error }),
        );
        finish = async () => {
          release?.();
          const result = await completion;
          if (result.kind === 'failed') throw result.error;
        };
        await Promise.race([
          captured,
          completion.then((result) => {
            if (result.kind === 'failed') throw result.error;
            throw new Error('Native held read completed before replacement');
          }),
        ]);
      } else {
        const beforeToken = resultReads;
        await nativeReadProof(page, 'arm', stage);
        await results
          .getByRole('button', { name: copy('reload'), exact: true })
          .click();
        await expect
          .poll(
            async () => accessObject(await nativeReadProof(page, 'read')).held,
            { intervals: [100] },
          )
          .toBe(true);
        if (stage === 'token') {
          await page.waitForLoadState('networkidle');
          expect(
            resultReads,
            'The held token belongs to this Result reload.',
          ).toBe(beforeToken);
          await expect(
            results.getByRole('button', {
              name: copy('reload'),
              exact: true,
            }),
          ).toBeDisabled();
        }
        finish = async () => {
          await finishTaskReads();
          const dispatched = resultReads;
          await nativeReadProof(page, 'release');
          await page.waitForLoadState('networkidle');
          expect(
            resultReads,
            'Retired token/parser work cannot dispatch after replacement.',
          ).toBe(dispatched);
        };
      }
      let finished: Promise<void> | undefined;
      retirement = {
        stage,
        replacement,
        phase: 'replace',
        replaced: false,
        revoked: false,
        finish: () => (finished ??= finishRetiredRead()),
      };
      async function finishRetiredRead() {
        await finish();
        expect(writes).toHaveLength(before);
        await expect(
          results.getByText(copy('denied'), { exact: true }),
        ).toHaveCount(0);
      }
      mode = { kind: 'retiring' };
    }
    async function advanceRetirement() {
      const current = retirement;
      if (!current) throw new Error('Missing generated held read');
      async function nextProject(
        restored: boolean,
      ): Promise<Retirement['phase']> {
        const visible = await projects.isVisible();
        if (restored)
          return visible ? 'restore-project' : 'restore-project-navigation';
        return visible ? 'return-project' : 'return-project-navigation';
      }
      if (current.phase === 'replace') {
        if (current.replacement === 'task') {
          await tasks
            .locator('.task-list')
            .getByRole('button', { name: source.otherTaskTitle, exact: true })
            .click();
          await expect(
            results.getByText(copy('empty'), { exact: true }),
          ).toBeVisible();
        } else if (current.replacement === 'access') {
          current.revoked = true;
          await publishRevokedResultAuthority();
        } else {
          await company('b');
        }
        current.replaced = true;
        current.phase = 'return';
      } else if (current.phase === 'return') {
        if (current.replacement === 'task') {
          await selectResultTask();
          current.phase = 'release';
        } else if (current.replacement === 'access') {
          // Consume and check the old continuation before any Company disposal.
          await current.finish();
          await expect(
            projects.getByRole('heading', { name: source.title, exact: true }),
          ).toBeVisible();
          await expect(
            results.getByRole('button', {
              name: copy(declarations.length ? 'correct' : 'record'),
              exact: true,
            }),
          ).toHaveCount(0);
          current.phase = 'restore-access';
        } else {
          await company('a');
          current.phase = await nextProject(false);
        }
      } else if (current.phase === 'return-project-navigation') {
        await enterProjects();
        current.phase = 'return-project';
      } else if (current.phase === 'return-project') {
        await selectProject();
        current.phase = 'return-task';
      } else if (current.phase === 'return-task') {
        await selectResultTask();
        current.phase =
          current.replacement === 'access' ? 'restore-access' : 'release';
      } else if (current.phase === 'restore-access') {
        await source.grant('company-task-result-recorder', 'a');
        await source.grant('company-project-next-action-coordinator', 'a');
        current.revoked = false;
        await company('b');
        current.phase = 'return-access';
      } else if (current.phase === 'return-access') {
        await company('a');
        current.phase = await nextProject(true);
      } else if (current.phase === 'restore-project-navigation') {
        await enterProjects();
        current.phase = 'restore-project';
      } else if (current.phase === 'restore-project') {
        await selectProject();
        current.phase = 'restore-task';
      } else if (current.phase === 'restore-task') {
        await selectResultTask();
        current.phase = 'release';
      } else {
        await current.finish();
        await expect(
          results.getByRole('button', {
            name: copy(declarations.length ? 'correct' : 'record'),
            exact: true,
          }),
        ).toBeVisible();
        retirement = undefined;
        mode = { kind: 'ready' };
        return;
      }
      mode = { kind: 'retiring' };
    }
    async function closeRetirement() {
      const current = retirement;
      if (!current) return;
      // Cleanup retires once and restores its prepared authority; it invents no remaining browser actions.
      if (!current.replaced) await advanceRetirement();
      if (current.revoked) {
        await current.finish();
        await source.grant('company-task-result-recorder', 'a');
        await source.grant('company-project-next-action-coordinator', 'a');
        current.revoked = false;
      }
      await current.finish();
      retirement = undefined;
      mode = { kind: 'away' };
    }
    let heldDenial: { finish: () => Promise<void> } | undefined;
    async function holdDeniedReply() {
      let ready: (() => void) | undefined;
      let proceed: (() => void) | undefined;
      const captured = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const replacement = new Promise<void>((resolve) => {
        proceed = resolve;
      });
      // A generated action is one browser interaction. Holding, replacing and
      // returning are separate enabled actions, so other choices cannot run in
      // a fictional ready source while the native read is still pending.
      const completion = replaceScopeBeforeFinancialReply({
        page,
        path: source.resultPath,
        identity: accessIdentities.member,
        reply: {
          kind: 'denied',
          status: 404,
          revoke: () =>
            source
              .revoke('company-mission-deliverable-access', 'a')
              .then(() => undefined),
          restore: () =>
            source
              .grant('company-mission-deliverable-access', 'a')
              .then(() => undefined),
        },
        start: () =>
          results
            .getByRole('button', { name: copy('reload'), exact: true })
            .click(),
        replace: async () => {
          ready?.();
          await replacement;
          await company('b');
        },
      }).then(
        () => ({ kind: 'complete' as const }),
        (error: unknown) => ({ kind: 'failed' as const, error }),
      );
      heldDenial = {
        finish: async () => {
          proceed?.();
          const result = await completion;
          heldDenial = undefined;
          if (result.kind === 'failed') throw result.error;
          mode = { kind: 'away' };
        },
      };
      await Promise.race([
        captured,
        completion.then((result) => {
          if (result.kind === 'failed') throw result.error;
          throw new Error(
            'Native denial completed before replacement was admitted',
          );
        }),
      ]);
      mode = { kind: 'held-denial' };
    }
    async function releaseDeniedReply() {
      if (!heldDenial) throw new Error('Missing held native denial');
      await heldDenial.finish();
    }
    async function returnToSource() {
      await company('a');
      mode = {
        kind: (await projects.isVisible())
          ? 'project-directory'
          : 'project-navigation',
      };
    }
    async function independentWrite() {
      if (mode.kind !== 'draft')
        throw new Error('Missing independent result write draft');
      const label = resolveMessage(projectNextActionMessages, locale, 'title');
      const panel = projects.getByRole('region', { name: label, exact: true });
      let release: (() => void) | undefined;
      let observed: (() => void) | undefined;
      const captured = new Promise<void>((resolve) => {
        observed = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const pattern = `**/api/projects/${source.projectId}/next-action`;
      let first = true;
      const hold = async (route: Route) => {
        if (route.request().method() !== 'GET' || !first)
          return route.fallback();
        first = false;
        const reply = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(reply.status()).toBe(200);
        observed?.();
        await gate;
        await route.fulfill({ response: reply });
      };
      await page.route(pattern, hold);
      try {
        await panel
          .getByRole('button', {
            name: resolveMessage(projectNextActionMessages, locale, 'refresh'),
            exact: true,
          })
          .click();
        await captured;
        await save('none');
      } finally {
        release?.();
        await removeRoute(page, pattern, hold);
      }
      await expect(
        panel.getByRole('button', {
          name: resolveMessage(projectNextActionMessages, locale, 'refresh'),
          exact: true,
        }),
      ).toBeEnabled();
    }
    try {
      await installNativeReadHolds(page);
      // Seed the supported optional preference from an actually authorized native Actor.
      // The App still performs its native Company validation on every fresh document.
      await page.context().addInitScript(
        ({ key, companyId, language }) => {
          try {
            localStorage.setItem(key, companyId);
            localStorage.setItem('prisma-prim.interface-locale', language);
          } catch {
            /* opaque reset document */
          }
        },
        {
          key: `prisma-prim.company-context:${source.workspaceId}:${source.membershipId}`,
          companyId: source.companies.a.id,
          language: locale,
        },
      );
      await page.goto('/#projects');
      await expect(
        page
          .locator('.prisme-company-selector')
          .getByRole('combobox', { includeHidden: true }),
      ).toHaveAttribute('data-value', source.companies.a.id);
      await openTask();
      await nativeReadProof(page, 'target', resultPath);
    } catch (error) {
      page.off('request', observe);
      await removeRoute(page, '**/api/**', failRefresh);
      await removeRoute(page, '**/api/**', identify);
      throw error;
    }
    return {
      actions(value) {
        if (mode.kind === 'project-navigation')
          return [
            { label: 'enter-native-result-projects', run: enterProjects },
          ];
        if (mode.kind === 'project-directory')
          return [
            { label: 'select-native-result-project', run: selectProject },
          ];
        if (mode.kind === 'project-open')
          return [{ label: 'open-native-result-task', run: selectResultTask }];
        if (retirement)
          return [
            { label: `held-read:${retirement.phase}`, run: advanceRetirement },
          ];
        if (mode.kind === 'held-denial')
          return [
            {
              label: 'replace-company-and-deliver-held-denial',
              run: releaseDeniedReply,
            },
          ];
        if (mode.kind === 'away')
          return [
            { label: 'recover-native-source-company', run: returnToSource },
          ];
        if (mode.kind === 'uncertain')
          return [
            {
              label: 'retry-identical-result-command-double-admission',
              run: retry,
            },
          ];
        if (mode.kind === 'read-error' || mode.kind === 'conflict')
          return [{ label: 'recover-result-from-native-read', run: reload }];
        const actions: BrowserAction[] = [
          {
            label: `locale:${value.locale}`,
            run: async () => {
              const literal = mode.kind === 'draft' ? mode.text : null;
              await selectOption(page.locator('#interface-locale'), {
                value: value.locale,
              });
              locale = value.locale;
              if (literal !== null)
                await expect(
                  results.getByLabel(copy('declaration'), { exact: true }),
                ).toHaveValue(literal);
            },
          },
          {
            label: `retire-${value.stage}-through-${value.replacement}-aba`,
            run: () => beginRetirement(value.stage, value.replacement),
          },
          {
            label: 'hold-native-denial-before-company-recovery',
            run: holdDeniedReply,
          },
        ];
        if (mode.kind === 'draft')
          actions.push(
            { label: 'native-stale-task-result-intention', run: stale },
            {
              label: 'write-result-during-independent-project-read',
              run: independentWrite,
            },
            ...(
              ['none', 'lost-receipt', 'failed-refresh'] satisfies Array<
                Parameters<typeof save>[0]
              >
            ).map((fault) => ({
              label: `save-result:${fault}`,
              run: () => save(fault),
            })),
          );
        else {
          actions.push({
            label: 'prepare-literal-mission-result',
            run: () => draft(value.variant),
          });
          if (declarations.length)
            actions.push(
              { label: 'native-result-history', run: history },
              { label: 'download-exact-mission-original', run: download },
            );
        }
        return actions;
      },
      async verify() {
        const [current, history, other] = await Promise.all([
          source.read(source.resultPath),
          source.read(`${source.resultPath}/history`),
          source.read(`/tasks/${source.otherTaskId}/results`),
        ]);
        expect(current).toMatchObject({
          taskId: source.taskId,
          projectId: source.projectId,
          taskVersion,
          revision: declarations.length,
        });
        const last = declarations.at(-1);
        if (last)
          expect(current.current).toMatchObject({
            id: last.id,
            declaration: last.text,
            revision: declarations.length,
            reference: {
              documentId: source.documentId,
              versionId: source.versionId,
              versionNumber: 1,
            },
          });
        else expect(current.current).toBeNull();
        if (!Array.isArray(history.declarations))
          throw new Error('Missing native declaration history');
        expect(history.declarations).toHaveLength(declarations.length);
        for (let index = 0; index < declarations.length; index++) {
          const expected = declarations[declarations.length - index - 1];
          if (!expected)
            throw new Error('Missing independent declared expectation');
          expect(history.declarations[index]).toMatchObject({
            id: expected.id,
            declaration: expected.text,
            revision: declarations.length - index,
            ...(expected.reason === null
              ? { kind: 'recorded' }
              : { kind: 'corrected', reason: expected.reason }),
          });
        }
        expect(other.revision).toBe(0);
        if (mode.kind === 'draft')
          await expect(
            results.getByLabel(copy('declaration'), { exact: true }),
          ).toHaveValue(mode.text);
        if (mode.kind === 'ready' && last)
          await expect(
            results.getByText(last.text, { exact: true }).first(),
          ).toBeVisible();
      },
      async settle() {
        if (retirement) await closeRetirement();
        if (mode.kind === 'held-denial') await releaseDeniedReply();
        if (mode.kind === 'uncertain') await retry();
        // An unsubmitted draft remains unsubmitted. Every native history is
        // still independently checked by verify; generated downloads check exact bytes.
      },
      async dispose() {
        if (retirement) await closeRetirement();
        if (heldDenial) await heldDenial.finish();
        failedRead = false;
        await nativeReadProof(page, 'restore');
        taskReads.dispose();
        page.off('request', observe);
        await removeRoute(page, '**/api/**', failRefresh);
        await removeRoute(page, '**/api/**', identify);
      },
      describe: () => ({
        taskId: source.taskId,
        documentId: source.documentId,
        versionId: source.versionId,
        companyId: source.companies.a.id,
        taskVersion,
        declarations,
        mode: mode.kind,
        retirement: retirement?.phase ?? null,
        writes: writes.length,
      }),
    };
  },
};
