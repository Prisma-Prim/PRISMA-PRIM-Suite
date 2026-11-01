import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterClassicCompatibility } from './classic-compatibility';
import { selectOption } from './select-option';
import { resolveMessage } from '../src/localization/messages';
import { followUpMessages } from '../src/opportunity-follow-up/follow-up.copy';
import {
  readFollowUpCurrent,
  readFollowUpDiscovery,
  readFollowUpReceipt,
  type FollowUpCurrent,
} from '../src/opportunity-follow-up/follow-up-contract';

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
const locales = ['ro', 'ru', 'fr', 'en'] as const;
type Locale = (typeof locales)[number];
type CopyKey = (typeof followUpMessages.keys)[number];
const copy = (key: CopyKey, locale: Locale = 'en') =>
  resolveMessage(followUpMessages, locale, key);
const date = '2032-02-29';
const through = '2032-03-05';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an actual public response object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Expected an actual public identifier.');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Expected an actual public version.');
  return value;
}
function gate() {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
async function activate(control: Locator) {
  await expect(control).toBeEnabled();
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
async function chooseCompany(
  page: Page,
  companyId: string,
  companyName: string,
) {
  await expect(page.locator('.production-shell')).toBeVisible();
  const open = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  if (await open.isVisible()) await activate(open);
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    value: companyId,
  });
  await expect(page.locator('.commercial-intake-heading')).toContainText(
    companyName,
  );
  const close = page.getByRole('button', {
    name: 'Close navigation',
    exact: true,
  });
  if (await close.isVisible()) await activate(close);
}
function panelIn(page: Page) {
  return page.locator('.opportunity-follow-up').filter({
    has: page.locator('h4'),
  });
}
function discoveryIn(page: Page) {
  return page.locator('.opportunity-follow-up').filter({
    has: page.locator('h3'),
  });
}
type NativeCase = {
  requestId: string;
  opportunityId: string;
  subject: string;
  title: string;
  originalText: string;
};

for (const frame of ['prisme', 'classic'] as const) {
  test(`conserves manual Opportunity follow-up, private lifetimes and native administration in ${frame}`, async ({
    page,
  }, info) => {
    // One complete native journey per frame/project, with the four locales in
    // the same live owner. Public fixture commands supply bounded page depth.
    test.setTimeout(240_000);
    const suffix = `${frame}-${info.project.name.endsWith('narrow') ? 'narrow' : 'desktop'}`;
    const membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
    const forbidden = new Set<string>([
      date,
      through,
      '2032-03-01',
      '2032-03-02',
      '2032-03-04',
      '2032-03-06',
    ]);
    const diagnostics: string[] = [];
    const analytics: string[] = [];
    const outsideApi: string[] = [];
    const commands: Array<{ body: string | null; key: string | undefined }> =
      [];
    let protectedReads = 0;
    let discoveryReads = 0;
    let loseNextAck = false;
    let failFreshRead = false;
    let failDiscovery = false;

    function remember(value: unknown) {
      if (typeof value === 'string') {
        if (value.length > 0) forbidden.add(value);
        return;
      }
      if (Array.isArray(value)) {
        const items: unknown[] = value;
        for (const item of items) remember(item);
        return;
      }
      if (value !== null && typeof value === 'object') {
        // Only private value fields become needles. Common enums, field names,
        // small revisions and Company/locale preferences remain independent.
        for (const [key, item] of Object.entries(value)) {
          if (
            [
              'opportunityId',
              'requestId',
              'followUpOn',
              'confirmedEpoch',
              'recordedAt',
              'occurredAt',
              'reason',
              'commandId',
              'nextCursor',
            ].includes(key)
          )
            remember(item);
          else if (
            [
              'head',
              'fact',
              'history',
              'entries',
              'before',
              'after',
              'items',
            ].includes(key)
          )
            remember(item);
        }
      }
    }
    function observe(browserPage: Page) {
      browserPage.on('console', (message) => diagnostics.push(message.text()));
      browserPage.on('pageerror', (error) => diagnostics.push(error.message));
      browserPage.on('request', (request) => {
        const url = new URL(request.url());
        if (!url.pathname.startsWith('/api/'))
          outsideApi.push(request.url(), request.postData() ?? '');
        if (/analytics|telemetry|beacon/iu.test(url.pathname + url.hostname))
          analytics.push(request.url(), request.postData() ?? '');
        if (/\/follow-up$/u.test(url.pathname) && request.method() === 'GET')
          protectedReads += 1;
        if (url.pathname === '/api/commercial-intake/opportunity-follow-ups')
          discoveryReads += 1;
      });
    }
    observe(page);
    async function read(path: string, companyId: string) {
      const response = await page.request.get(origin + path, {
        headers: { ...ada, 'x-company-context-id': companyId },
      });
      expect(response.status()).toBe(200);
      const result: unknown = await response.json();
      return object(result);
    }
    async function post(
      path: string,
      body: unknown,
      companyId?: string,
      expectedStatus = 201,
      identity = owner,
    ) {
      const response = await page.request.post(origin + path, {
        headers: {
          ...identity,
          ...(companyId ? { 'x-company-context-id': companyId } : {}),
          'idempotency-key': randomUUID(),
        },
        data: body,
      });
      expect(response.status()).toBe(expectedStatus);
      const result: unknown = await response.json();
      return object(result);
    }
    const companyName = 'Follow-up synthetic provider ' + suffix;
    const companyId = text(
      (await post('/companies', { displayName: companyName })).id,
    );
    const otherCompanyName = 'Other follow-up provider ' + suffix;
    const otherCompanyId = text(
      (
        await post('/companies', {
          displayName: otherCompanyName,
        })
      ).id,
    );
    for (const targetCompanyId of [companyId, otherCompanyId])
      for (const bundle of ['context', 'commercial-intake'])
        await post(`/company-${bundle}-assignments`, {
          companyId: targetCompanyId,
          workspaceMembershipId: membershipId,
        });
    await post('/company-opportunity-manager-assignments', {
      companyId,
      workspaceMembershipId: membershipId,
    });
    const headers = { ...ada, 'x-company-context-id': companyId };
    const cases = new Map<string, NativeCase>();
    async function createCase(label: string): Promise<NativeCase> {
      const subject = `${label} Request ${suffix}`;
      const title = `${label} Opportunity ${suffix}`;
      const originalText = `Literal synthetic source for ${label}.\n  Ș Я é <b>preserved</b> ${suffix}`;
      const created = await post(
        '/commercial-intake/requests',
        {
          subject,
          originalText,
          sourceLabel: 'Synthetic manual source',
          opportunity: { title, nextAction: 'Arrange a manual discussion' },
        },
        companyId,
        201,
        ada,
      );
      const result = {
        requestId: text(created.id),
        opportunityId: text(object(created.initialOpportunity).id),
        subject,
        title,
        originalText,
      };
      cases.set(result.requestId, result);
      remember(result);
      expect(created.clientAssociationStatus).toBe('absent');
      return result;
    }
    const alpha = await createCase('Alpha');
    const beta = await createCase('Beta');
    const initialActor = object(
      (await read('/access/current-actor', companyId)).activeCompany,
    );
    expect(initialActor.clientPermissions).toEqual([]);
    expect(initialActor.opportunityFollowUpPermissions).toBeUndefined();
    expect(initialActor.opportunityFollowUpReadCapture).toBeUndefined();
    const beforeGrant = await page.request.get(
      `${origin}/commercial-intake/opportunities/${alpha.opportunityId}/follow-up`,
      { headers },
    );
    expect(beforeGrant.status()).toBe(403);

    // Fault routes are registered before identity middleware. Fetching an
    // accepted command explicitly carries Ada's headers even after fallback.
    await page.route('**/api/commercial-intake/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (/\/follow-up$/u.test(path) && request.method() === 'POST') {
        const command = {
          body: request.postData(),
          key: request.headers()['idempotency-key'],
        };
        commands.push(command);
        if (command.body) forbidden.add(command.body);
        if (command.key) forbidden.add(command.key);
        const response = await route.fetch({
          headers: { ...request.headers(), ...ada },
        });
        if (response.status() === 200) {
          const receipt = readFollowUpReceipt(await response.json());
          if (!receipt)
            throw new Error('Malformed actual native follow-up receipt.');
          remember(receipt);
          forbidden.add(JSON.stringify(receipt));
        }
        if (loseNextAck) {
          loseNextAck = false;
          await route.abort('failed');
        } else await route.fulfill({ response });
        return;
      }
      if (
        (failFreshRead &&
          /\/follow-up$/u.test(path) &&
          request.method() === 'GET') ||
        (failDiscovery &&
          path === '/api/commercial-intake/opportunity-follow-ups')
      ) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'FOLLOW_UP_UNAVAILABLE' }),
        });
        return;
      }
      await route.fallback();
    });
    await page.route('**/api/**', (route) =>
      route.fallback({ headers: { ...route.request().headers(), ...ada } }),
    );
    const adminPage = await page.context().newPage();
    observe(adminPage);
    await adminPage.route('**/api/**', (route) =>
      route.fallback({ headers: { ...route.request().headers(), ...owner } }),
    );
    async function administer(action: 'grant' | 'revoke') {
      await adminPage.goto('/#access');
      await adminPage.reload();
      await selectOption(adminPage.locator('#interface-locale'), {
        value: 'en',
      });
      const admin = adminPage.locator('.company-access');
      await expect(admin).toBeVisible();
      await selectOption(
        admin.getByLabel('Workspace member', { exact: true }),
        { value: membershipId },
      );
      await selectOption(admin.getByLabel('Company', { exact: true }), {
        value: companyId,
      });
      await selectOption(admin.getByLabel('Access bundle', { exact: true }), {
        value: 'opportunity-follow-up-coordinator',
      });
      const response = adminPage.waitForResponse(
        (reply) =>
          new URL(reply.url()).pathname ===
            '/api/company-opportunity-follow-up-coordinator-assignments' +
              (action === 'grant' ? '' : `/${membershipId}/${companyId}`) &&
          reply.request().method() === (action === 'grant' ? 'POST' : 'DELETE'),
      );
      await activate(
        admin.getByRole('button', {
          name: action === 'grant' ? 'Grant access' : 'Revoke access',
          exact: true,
        }),
      );
      expect((await response).status()).toBe(action === 'grant' ? 201 : 200);
      await expect(
        admin.getByText(
          action === 'grant' ? 'Granted — captured version v1' : 'Not granted',
          { exact: true },
        ),
      ).toBeVisible();
    }
    await administer('grant');
    const granted = object(
      (await read('/access/current-actor', companyId)).activeCompany,
    );
    expect(granted.opportunityFollowUpPermissions).toEqual([
      'commercial.opportunity.follow_up.read',
      'commercial.opportunity.follow_up.manage',
    ]);
    expect(granted.opportunityFollowUpCoordinatorPermissionSetVersion).toBe(
      'v1',
    );
    expect(text(granted.opportunityFollowUpCoordinatorAssignmentId)).toMatch(
      /^[0-9a-f-]{36}$/u,
    );
    expect(text(granted.opportunityFollowUpReadCapture)).toMatch(
      /^opportunity-follow-up-read\.v1\.[a-f0-9]{64}$/u,
    );
    expect(granted.clientPermissions).toEqual([]);

    const intake = page.locator('.commercial-intake-workspace');
    async function openWorkspace() {
      await page.goto('/#requests');
      await chooseCompany(page, companyId, companyName);
      const open = page.getByRole('button', {
        name: 'Open navigation',
        exact: true,
      });
      if (await open.isVisible()) await activate(open);
      await activate(
        page
          .getByRole('navigation', { name: 'Primary navigation' })
          .getByRole('link', { name: 'Client Requests', exact: true }),
      );
      const close = page.getByRole('button', {
        name: 'Close navigation',
        exact: true,
      });
      if (await close.isVisible()) await activate(close);
      await expect(intake).toBeVisible();
      if (frame === 'classic') await enterClassicCompatibility(page);
    }
    async function openCase(target: NativeCase) {
      await expect(intake.locator('.commercial-intake-list')).toBeVisible();
      const row = intake
        .locator('.commercial-intake-list > li')
        .filter({ hasText: target.subject });
      while (!(await row.isVisible())) {
        const older = intake.getByRole('button', {
          name: 'Show older Requests',
          exact: true,
        });
        await expect
          .poll(async () => (await row.count()) + (await older.count()))
          .toBeGreaterThan(0);
        if (await row.isVisible()) break;
        await expect(older).toBeEnabled();
        await activate(older);
      }
      await activate(row.getByRole('button').first());
      await expect(
        intake.getByRole('article', { name: target.subject, exact: true }),
      ).toBeVisible();
      await expect(
        intake.getByText(target.originalText, { exact: true }),
      ).toBeVisible();
    }
    const panel = panelIn(page);
    const discovery = discoveryIn(page);
    async function current(target = alpha): Promise<FollowUpCurrent> {
      const value = readFollowUpCurrent(
        await read(
          `/commercial-intake/opportunities/${target.opportunityId}/follow-up`,
          companyId,
        ),
      );
      if (!value) throw new Error('Malformed actual current follow-up.');
      remember(value);
      forbidden.add(JSON.stringify(value.history));
      return value;
    }
    async function declare(
      target: NativeCase,
      followUpOn: string | null,
      reason: string | null,
    ) {
      remember(followUpOn);
      remember(reason);
      const observed = await current(target);
      const raw = await post(
        `/commercial-intake/opportunities/${target.opportunityId}/follow-up`,
        {
          expectedRevision: observed.head.revision,
          observedOpportunityVersion: observed.opportunityVersion,
          followUpOn,
          reason,
        },
        companyId,
        200,
        ada,
      );
      const receipt = readFollowUpReceipt(raw);
      if (!receipt) throw new Error('Malformed actual fixture receipt.');
      remember(receipt);
      return receipt;
    }
    async function privacy(browserPage = page) {
      // No private probe values enter page globals, init scripts or persistent
      // browser options. This reads existing stores and returns only to Node.
      const snapshot = await browserPage.evaluate(async () => {
        const indexed: unknown[] = [];
        for (const description of await indexedDB.databases()) {
          const name = description.name;
          if (!name) continue;
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onupgradeneeded = () => {
              request.transaction?.abort();
              reject(new Error('An existing database disappeared.'));
            };
            request.onerror = () =>
              reject(new Error('Cannot inspect an existing database.'));
            request.onsuccess = () => resolve(request.result);
          });
          try {
            for (const store of database.objectStoreNames) {
              const values = await new Promise<unknown[]>((resolve, reject) => {
                const request = database
                  .transaction(store, 'readonly')
                  .objectStore(store)
                  .getAll();
                request.onsuccess = () => {
                  const result: unknown[] = request.result;
                  resolve(result);
                };
                request.onerror = () =>
                  reject(new Error('Cannot inspect existing store values.'));
              });
              indexed.push({ name, store, values });
            }
          } finally {
            database.close();
          }
        }
        const cached: unknown[] = [];
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          for (const request of await cache.keys()) {
            const response = await cache.match(request);
            cached.push({
              name,
              url: request.url,
              body: response ? await response.text() : '',
            });
          }
        }
        const layer: unknown = Reflect.get(window, 'dataLayer');
        return JSON.stringify({
          url: location.href,
          history: history.state,
          cookies: document.cookie,
          local: Object.entries(localStorage),
          session: Object.entries(sessionStorage),
          indexed,
          cached,
          workers: (await navigator.serviceWorker.getRegistrations()).map(
            (registration) => ({
              scope: registration.scope,
              script: registration.active?.scriptURL,
            }),
          ),
          analytics: layer ?? null,
        });
      });
      const cookies = JSON.stringify(await page.context().cookies());
      for (const needle of forbidden) {
        expect(snapshot).not.toContain(needle);
        expect(cookies).not.toContain(needle);
        expect(diagnostics.join('\n')).not.toContain(needle);
        expect(analytics.join('\n')).not.toContain(needle);
        expect(outsideApi.join('\n')).not.toContain(needle);
      }
    }
    await openWorkspace();
    await expect(
      discovery.getByLabel(copy('through'), { exact: true }),
    ).toHaveValue('');
    expect(discoveryReads).toBe(0);
    await openCase(alpha);
    await expect(
      panel.getByText(copy('noEntry'), { exact: true }),
    ).toBeVisible();
    await expect(
      panel.locator('.opportunity-follow-up-history > li'),
    ).toHaveCount(0);
    // The unchanged native text command is a positive control before any date.
    await activate(
      intake.getByRole('button', { name: 'Edit next action', exact: true }),
    );
    await intake
      .getByLabel('Next action', { exact: true })
      .fill('Native text remains independent ' + suffix);
    await activate(
      intake.getByRole('button', { name: 'Save next action', exact: true }),
    );
    await expect(intake.getByText('Version: 2', { exact: true })).toBeVisible();
    const nativeBaseline = await read(
      `/commercial-intake/requests/${alpha.requestId}`,
      companyId,
    );
    await activate(
      panel.getByRole('button', { name: copy('reload'), exact: true }),
    );
    await activate(
      panel.getByRole('button', { name: copy('record'), exact: true }),
    );
    await expect(panel.getByLabel(copy('date'), { exact: true })).toHaveValue(
      '',
    );
    await expect(
      intake.getByRole('button', { name: 'Edit next action', exact: true }),
    ).toBeDisabled();
    await activate(
      panel.getByRole('button', { name: copy('save'), exact: true }),
    );
    await expect.poll(async () => (await current()).head.revision).toBe(1);
    await expect(
      panel.getByText(copy('undated'), { exact: true }).first(),
    ).toBeVisible();
    expect((await current()).head).toMatchObject({
      state: 'RECORDED',
      revision: 1,
      followUpOn: null,
      recordedBy: { workspaceMembershipId: membershipId },
    });
    const literalReason =
      '  A manual planning choice Ș Я 📅\n' +
      'Literal preserved words '.repeat(10);
    forbidden.add(literalReason);
    await activate(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    );
    const input = panel.locator('input[type="text"]');
    const reasonInput = panel.locator('textarea');
    await input.fill(date);
    await reasonInput.fill(literalReason);
    for (const locale of locales) {
      await selectOption(page.locator('#interface-locale'), { value: locale });
      await expect(input).toHaveValue(date);
      await expect(reasonInput).toHaveValue(literalReason);
      await expect(input).toHaveAccessibleName(copy('date', locale));
      await reasonInput.focus();
      await expect(reasonInput).toBeFocused();
      await expect(reasonInput).toHaveCSS('outline-style', 'solid');
      await privacy();
      await page.screenshot({
        path: info.outputPath(`follow-up-${suffix}-${locale}-form.png`),
        fullPage: true,
      });
    }
    await selectOption(page.locator('#interface-locale'), { value: 'en' });
    await activate(
      panel.getByRole('button', { name: copy('save'), exact: true }),
    );
    await expect.poll(async () => (await current()).head.revision).toBe(2);
    await expect(
      panel.getByRole('heading', { name: copy('title'), exact: true }),
    ).toBeFocused();
    expect(
      await read(`/commercial-intake/requests/${alpha.requestId}`, companyId),
    ).toEqual(nativeBaseline);
    for (const [locale, expected] of [
      ['ro', '29 feb. 2032'],
      ['ru', '29 февр. 2032 г.'],
      ['fr', '29 févr. 2032'],
      ['en', 'Feb 29, 2032'],
    ] as const) {
      await selectOption(page.locator('#interface-locale'), { value: locale });
      await expect(
        panel.locator(`time[datetime="${date}"]`).first(),
      ).toHaveText(expected);
      await expect(
        panel.getByText(copy('confirmed', locale), { exact: true }),
      ).toBeVisible();
      await privacy();
      await page.screenshot({
        path: info.outputPath(`follow-up-${suffix}-${locale}-dated.png`),
        fullPage: true,
      });
    }
    await selectOption(page.locator('#interface-locale'), { value: 'en' });
    async function editDate(
      value: string | null,
      reason: string,
      revision: number,
    ) {
      forbidden.add(reason);
      if (value !== null) forbidden.add(value);
      await activate(
        panel.getByRole('button', { name: copy('edit'), exact: true }),
      );
      if (value === null)
        await activate(
          panel.getByRole('button', { name: copy('clear'), exact: true }),
        );
      else await panel.getByLabel(copy('date'), { exact: true }).fill(value);
      await panel.getByLabel(copy('reason'), { exact: true }).fill(reason);
      await activate(
        panel.getByRole('button', { name: copy('save'), exact: true }),
      );
      await expect
        .poll(async () => (await current()).head.revision)
        .toBe(revision);
      await expect(
        panel.getByRole('button', { name: copy('edit'), exact: true }),
      ).toBeEnabled();
    }
    await editDate('2032-03-01', '  The discussion moved Ж  ', 3);
    await editDate(null, '  No date agreed; declaration conserved  ', 4);
    await expect(
      panel.locator('.opportunity-follow-up-history > li'),
    ).toHaveCount(4);
    expect(
      (await current()).history.entries.find((entry) => entry.revision === 2)
        ?.reason,
    ).toBe(literalReason);
    expect(
      await read(`/commercial-intake/requests/${alpha.requestId}`, companyId),
    ).toEqual(nativeBaseline);
    await editDate(date, 'Restore the manual plan for outcome review', 5);
    async function transition(label: string, reason?: string) {
      await activate(
        intake.getByRole('button', { name: 'Change status', exact: true }),
      );
      await selectOption(intake.getByLabel('Status change', { exact: true }), {
        label,
      });
      if (reason)
        await intake.getByLabel('Reason', { exact: true }).fill(reason);
      const response = page.waitForResponse(
        (reply) =>
          new URL(reply.url()).pathname ===
            `/api/commercial-intake/opportunities/${alpha.opportunityId}/outcome` &&
          reply.request().method() === 'POST',
      );
      await activate(
        intake.getByRole('button', { name: 'Save status', exact: true }),
      );
      expect((await response).status()).toBe(200);
    }
    await transition('Put on hold', 'Synthetic manual hold');
    await expect(
      panel.getByText(copy('notOpen'), { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    ).toHaveCount(0);
    await transition('Resume');
    await expect(panel.getByText(copy('stale'), { exact: true })).toBeVisible();
    expect(discoveryReads).toBe(0);
    await discovery.getByLabel(copy('through'), { exact: true }).fill(through);
    await activate(
      discovery.getByRole('button', { name: copy('find'), exact: true }),
    );
    await expect(
      discovery.getByText(copy('discoveryEmpty'), { exact: true }),
    ).toBeVisible();
    await activate(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    );
    await activate(
      panel.getByRole('button', { name: copy('save'), exact: true }),
    );
    await expect(
      panel.getByLabel(copy('reason'), { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true');
    const reconfirmation = '  Explicitly resume the same manual date Ș Я  ';
    forbidden.add(reconfirmation);
    await panel
      .getByLabel(copy('reason'), { exact: true })
      .fill(reconfirmation);
    await activate(
      panel.getByRole('button', { name: copy('save'), exact: true }),
    );
    await expect.poll(async () => (await current()).head.revision).toBe(6);
    const confirmed = await current();
    expect(confirmed.head.state).toBe('RECORDED');
    if (confirmed.head.state !== 'RECORDED')
      throw new Error('Expected a persisted reconfirmation.');
    expect(confirmed.head.confirmedEpoch).toBe(confirmed.outcomeEpoch);

    await activate(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    );
    await panel.getByLabel(copy('date'), { exact: true }).fill('2032-03-02');
    await panel
      .getByLabel(copy('reason'), { exact: true })
      .fill('Stale literal planning intent');
    forbidden.add('Stale literal planning intent');
    const nativeBeforeConflict = await read(
      `/commercial-intake/requests/${alpha.requestId}`,
      companyId,
    );
    await post(
      `/commercial-intake/opportunities/${alpha.opportunityId}/next-action`,
      {
        expectedVersion: number(
          object(nativeBeforeConflict.initialOpportunity).version,
        ),
        nextAction: 'A concurrent native text change',
      },
      companyId,
      200,
      ada,
    );
    await activate(
      panel.getByRole('button', { name: copy('save'), exact: true }),
    );
    await expect(
      panel.getByText(copy('conflict'), { exact: true }),
    ).toBeVisible();
    await expect(panel.getByLabel(copy('date'), { exact: true })).toHaveValue(
      '2032-03-02',
    );
    await expect(
      panel.getByRole('heading', { name: copy('title'), exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`follow-up-${suffix}-stale-review.png`),
      fullPage: true,
    });
    await activate(
      panel.getByRole('button', { name: copy('reload'), exact: true }),
    );
    await expect(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    ).toBeEnabled();
    const nativeAfterText = await read(
      `/commercial-intake/requests/${alpha.requestId}`,
      companyId,
    );

    loseNextAck = true;
    const beforeUncertain = commands.length;
    await activate(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    );
    await panel.getByLabel(copy('date'), { exact: true }).fill('2032-03-02');
    const uncertainReason =
      '  Accepted manual plan; deliberately lost acknowledgement Я  ';
    forbidden.add(uncertainReason);
    await panel
      .getByLabel(copy('reason'), { exact: true })
      .fill(uncertainReason);
    await activate(
      panel.getByRole('button', { name: copy('save'), exact: true }),
    );
    await expect(
      panel.getByRole('button', { name: copy('retry'), exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByLabel(copy('reason'), { exact: true }),
    ).toBeDisabled();
    await expect(
      intake.getByRole('button', { name: 'Edit next action', exact: true }),
    ).toBeDisabled();
    await privacy();
    await page.screenshot({
      path: info.outputPath(`follow-up-${suffix}-uncertain.png`),
      fullPage: true,
    });
    await selectOption(page.locator('#interface-locale'), { value: 'fr' });
    await expect(panel.locator('textarea')).toHaveValue(uncertainReason);
    await selectOption(page.locator('#interface-locale'), { value: 'en' });
    failFreshRead = true;
    await activate(
      panel.getByRole('button', { name: copy('retry'), exact: true }),
    );
    await expect(panel.getByText(copy('saved'), { exact: true })).toBeVisible();
    await expect(
      panel.getByText(copy('refreshFailed'), { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: copy('record'), exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: copy('historyOlder'), exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: copy('reload'), exact: true }),
    ).toBeEnabled();
    expect(commands.slice(beforeUncertain)).toHaveLength(2);
    expect(commands[beforeUncertain + 1]).toEqual(commands[beforeUncertain]);
    expect(commands[beforeUncertain]?.key).toBeTruthy();
    await privacy();
    await page.screenshot({
      path: info.outputPath(`follow-up-${suffix}-confirmed-read-failure.png`),
      fullPage: true,
    });
    failFreshRead = false;
    await activate(
      panel.getByRole('button', { name: copy('reload'), exact: true }),
    );
    await expect(
      panel.getByText(copy('refreshFailed'), { exact: true }),
    ).toHaveCount(0);
    expect(commands.slice(beforeUncertain)).toHaveLength(2);
    expect(
      await read(`/commercial-intake/requests/${alpha.requestId}`, companyId),
    ).toEqual(nativeAfterText);

    // A committed-but-unacknowledged intent is retired through real A→B→A.
    // Its server fact can return on a fresh read, its editor/key cannot return.
    loseNextAck = true;
    await activate(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    );
    await panel.getByLabel(copy('date'), { exact: true }).fill('2032-03-04');
    const retiredReason = '  Retire this transient retry owner Ș Я  ';
    forbidden.add(retiredReason);
    await panel.getByLabel(copy('reason'), { exact: true }).fill(retiredReason);
    await activate(
      panel.getByRole('button', { name: copy('save'), exact: true }),
    );
    await expect(
      panel.getByRole('button', { name: copy('retry'), exact: true }),
    ).toBeVisible();
    const afterRetiredCommand = commands.length;
    await privacy();
    await chooseCompany(page, otherCompanyId, otherCompanyName);
    await expect(page.locator('.opportunity-follow-up')).toHaveCount(0);
    await chooseCompany(page, companyId, companyName);
    await openCase(alpha);
    await expect(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    ).toBeEnabled();
    await expect(panel.locator('textarea')).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: copy('retry'), exact: true }),
    ).toHaveCount(0);
    expect(commands).toHaveLength(afterRetiredCommand);
    await activate(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    );
    const abandonedDraft =
      'Never submitted; cold reload must discard this private draft';
    forbidden.add(abandonedDraft);
    await panel
      .getByLabel(copy('reason'), { exact: true })
      .fill(abandonedDraft);
    const beforeColdReads = protectedReads;
    await privacy();
    await page.reload();
    await openCase(alpha);
    await expect(panel.locator('textarea')).toHaveCount(0);
    await expect.poll(() => protectedReads).toBeGreaterThan(beforeColdReads);
    expect(commands).toHaveLength(afterRetiredCommand);
    await privacy();

    let historyRevision = (await current()).head.revision;
    while (historyRevision < 28) {
      const next = historyRevision + 1;
      const receipt = await declare(
        alpha,
        next % 2 ? '2032-03-01' : '2032-03-02',
        `Immutable history correction ${next} ${suffix}`,
      );
      historyRevision = receipt.fact.revision;
    }
    await activate(
      panel.getByRole('button', { name: copy('reload'), exact: true }),
    );
    await expect(
      panel.locator('.opportunity-follow-up-history > li'),
    ).toHaveCount(25);
    await declare(
      alpha,
      '2032-03-01',
      'Advance the head before the older-page read',
    );
    await activate(
      panel.getByRole('button', { name: copy('historyOlder'), exact: true }),
    );
    await expect(
      panel.getByText(copy('historyChanged'), { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: copy('historyOlder'), exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByRole('button', { name: copy('edit'), exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: copy('reload'), exact: true }),
    ).toBeEnabled();
    await expect(
      intake.getByRole('button', { name: 'Edit next action', exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: info.outputPath(`follow-up-${suffix}-changed-history.png`),
      fullPage: true,
    });
    await activate(
      panel.getByRole('button', { name: copy('reload'), exact: true }),
    );
    await activate(
      panel.getByRole('button', { name: copy('historyOlder'), exact: true }),
    );
    await expect(
      panel.locator('.opportunity-follow-up-history > li'),
    ).toHaveCount(29);
    await expect(
      panel.getByText(copy('historyEnd'), { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: copy('history'), exact: true }),
    ).toBeFocused();
    await panel.screenshot({
      path: info.outputPath(`follow-up-${suffix}-complete-history.png`),
    });
    await privacy();
    expect(
      await read(`/commercial-intake/requests/${alpha.requestId}`, companyId),
    ).toEqual(nativeAfterText);

    for (let index = 0; index < 27; index += 1) {
      const target = await createCase(
        `Discovery ${String(index).padStart(2, '0')}${index === 0 ? ' long literal '.repeat(5) : ''}`,
      );
      await declare(target, through, null);
    }
    await declare(beta, null, null);
    const later = await createCase('Beyond the chosen boundary');
    await declare(later, '2032-03-06', null);
    const first = readFollowUpDiscovery(
      await read(
        `/commercial-intake/opportunity-follow-ups?through=${through}`,
        companyId,
      ),
    );
    if (!first || first.nextCursor === null)
      throw new Error('Expected native eligible continuation beyond25.');
    remember(first);
    expect(first.items).toHaveLength(25);
    expect(first.items.every((item) => item.followUpOn <= through)).toBe(true);
    const second = readFollowUpDiscovery(
      await read(
        `/commercial-intake/opportunity-follow-ups?through=${through}&cursor=${encodeURIComponent(first.nextCursor)}`,
        companyId,
      ),
    );
    if (!second) throw new Error('Expected an actual continuation page.');
    remember(second);
    expect(second.items).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    expect(
      [...first.items, ...second.items].map((item) => item.requestId),
    ).not.toContain(beta.requestId);
    expect(
      [...first.items, ...second.items].map((item) => item.requestId),
    ).not.toContain(later.requestId);
    await discovery.getByLabel(copy('through'), { exact: true }).fill(through);
    await activate(
      discovery.getByRole('button', { name: copy('find'), exact: true }),
    );
    const results = discovery.locator('.opportunity-follow-up-results > li');
    await expect(results).toHaveCount(25);
    expect(
      await results.evaluateAll((rows) =>
        rows.map((row) => row.querySelector('p')?.textContent ?? ''),
      ),
    ).toEqual(first.items.map((item) => item.title));
    await discovery.screenshot({
      path: info.outputPath(`follow-up-${suffix}-discovery-first.png`),
    });
    await activate(
      discovery.getByRole('button', { name: copy('next'), exact: true }),
    );
    await expect(results).toHaveCount(3);
    expect(
      await results.evaluateAll((rows) =>
        rows.map((row) => row.querySelector('p')?.textContent ?? ''),
      ),
    ).toEqual(second.items.map((item) => item.title));
    await expect(
      discovery.getByRole('heading', { name: copy('discovery'), exact: true }),
    ).toBeFocused();
    await discovery.screenshot({
      path: info.outputPath(`follow-up-${suffix}-discovery-continuation.png`),
    });
    const selected = second.items[0];
    if (!selected) throw new Error('Expected the exact discoverable Request.');
    const selectedCase = cases.get(selected.requestId);
    if (!selectedCase)
      throw new Error('Discovery returned an unrecognized native fixture.');
    const exactRequest = page.waitForResponse(
      (reply) =>
        new URL(reply.url()).pathname ===
          `/api/commercial-intake/requests/${selected.requestId}` &&
        reply.request().method() === 'GET',
    );
    await activate(
      results
        .first()
        .getByRole('button', { name: copy('openRequest'), exact: true }),
    );
    expect((await exactRequest).status()).toBe(200);
    await expect(
      intake.getByRole('article', { name: selectedCase.subject, exact: true }),
    ).toBeVisible();
    await expect(
      intake.getByText(selectedCase.originalText, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.locator(`time[datetime="${through}"]`).first(),
    ).toBeVisible();
    failDiscovery = true;
    await activate(
      discovery.getByRole('button', { name: copy('find'), exact: true }),
    );
    await expect(
      discovery.getByText(copy('discoveryError'), { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`follow-up-${suffix}-discovery-safe-failure.png`),
      fullPage: true,
    });
    await privacy();
    failDiscovery = false;
    await activate(
      discovery.getByRole('button', { name: copy('restart'), exact: true }),
    );
    await expect(results).toHaveCount(25);

    // Workspace Owner's company.manage path keeps Date's consumed context
    // stable when an independently captured Company Client grant changes.
    async function readOwner(path: string) {
      const response = await page.request.get(origin + path, {
        headers: { ...owner, 'x-company-context-id': companyId },
      });
      expect(response.status()).toBe(200);
      const body: unknown = await response.json();
      return object(body);
    }
    const ownerActor = await readOwner('/access/current-actor');
    const ownerMembershipId = text(ownerActor.workspaceMembershipId);
    expect(ownerActor.workspacePermissions).toEqual(
      expect.arrayContaining(['company.manage', 'client.manage']),
    );
    for (const bundle of [
      'commercial-intake',
      'opportunity-follow-up-coordinator',
    ])
      await post(`/company-${bundle}-assignments`, {
        companyId,
        workspaceMembershipId: ownerMembershipId,
      });
    const stableDateCapture = object(
      (await readOwner('/access/current-actor')).activeCompany,
    ).opportunityFollowUpReadCapture;
    expect(text(stableDateCapture)).toMatch(
      /^opportunity-follow-up-read\.v1\.[a-f0-9]{64}$/u,
    );
    const clientName = 'Optional native Client projection ' + suffix;
    const clientId = text(
      (
        await post(
          '/clients',
          { displayName: clientName },
          companyId,
          201,
          owner,
        )
      ).id,
    );
    const linked = await createCase('Optional Client projection');
    await post(
      `/commercial-intake/requests/${linked.requestId}/client-association`,
      {
        expectedVersion: number(
          (await readOwner(`/commercial-intake/requests/${linked.requestId}`))
            .version,
        ),
        clientAccountId: clientId,
      },
      companyId,
      200,
      owner,
    );
    await declare(linked, '2032-03-01', null);
    const optionalLookup = await page.request.get(
      `${origin}/clients/search?query=${encodeURIComponent(clientName)}`,
      {
        headers: { ...owner, 'x-company-context-id': companyId },
      },
    );
    expect(optionalLookup.status()).toBe(200);
    const choices: unknown = await optionalLookup.json();
    expect(choices).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: clientId })]),
    );

    async function ownerNavigate(label: 'Team & access' | 'Client Requests') {
      if (frame === 'classic') {
        const section = adminPage.locator(
          label === 'Team & access'
            ? '.company-access'
            : '.commercial-intake-workspace',
        );
        await expect(section).toBeVisible();
        await section.scrollIntoViewIfNeeded();
        return;
      }
      const open = adminPage.getByRole('button', {
        name: 'Open navigation',
        exact: true,
      });
      if (await open.isVisible()) await activate(open);
      await activate(
        adminPage
          .getByRole('navigation', { name: 'Primary navigation' })
          .getByRole('link', { name: label, exact: true }),
      );
      const close = adminPage.getByRole('button', {
        name: 'Close navigation',
        exact: true,
      });
      if (await close.isVisible()) await activate(close);
    }
    await adminPage.goto('/#requests');
    await chooseCompany(adminPage, companyId, companyName);
    if (frame === 'classic') await enterClassicCompatibility(adminPage);
    const ownerIntake = adminPage.locator('.commercial-intake-workspace');
    const ownerPanel = panelIn(adminPage);
    const ownerDiscovery = discoveryIn(adminPage);
    const linkedRow = ownerIntake
      .locator('.commercial-intake-list > li')
      .filter({ hasText: linked.subject });
    await activate(linkedRow.getByRole('button').first());
    await expect(
      ownerIntake.getByRole('article', { name: linked.subject, exact: true }),
    ).toBeVisible();
    async function findOwnerProjection() {
      await ownerDiscovery
        .getByLabel(copy('through'), { exact: true })
        .fill(through);
      await activate(
        ownerDiscovery.getByRole('button', { name: copy('find'), exact: true }),
      );
      await expect(
        ownerDiscovery.getByText(clientName, { exact: true }),
      ).toBeVisible();
    }
    async function administerOwnerClient(action: 'grant' | 'revoke') {
      await ownerNavigate('Team & access');
      const admin = adminPage.locator('.company-access');
      await selectOption(
        admin.getByLabel('Workspace member', { exact: true }),
        { value: ownerMembershipId },
      );
      await selectOption(admin.getByLabel('Company', { exact: true }), {
        value: companyId,
      });
      await selectOption(admin.getByLabel('Access bundle', { exact: true }), {
        value: 'director-client',
      });
      const actorResponse = adminPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/access/current-actor',
      );
      const command = adminPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            '/api/company-director-client-assignments' +
              (action === 'grant'
                ? ''
                : `/${ownerMembershipId}/${companyId}`) &&
          response.request().method() ===
            (action === 'grant' ? 'POST' : 'DELETE'),
      );
      await activate(
        admin.getByRole('button', {
          name: action === 'grant' ? 'Grant access' : 'Revoke access',
          exact: true,
        }),
      );
      expect((await command).status()).toBe(action === 'grant' ? 201 : 200);
      const actorBody: unknown = await (await actorResponse).json();
      const capture = object(object(actorBody).activeCompany);
      expect(capture.opportunityFollowUpReadCapture).toBe(stableDateCapture);
      await expect(
        admin.getByText(
          action === 'grant' ? 'Granted — captured version v2' : 'Not granted',
          { exact: true },
        ),
      ).toBeVisible();
      await ownerNavigate('Client Requests');
      return capture;
    }
    await findOwnerProjection();
    const clientCaptureA = await administerOwnerClient('grant');
    await expect(
      ownerDiscovery.getByLabel(copy('through'), { exact: true }),
    ).toHaveValue('');
    await findOwnerProjection();
    const oldProjection = { ready: gate(), release: gate() };
    let holdOwnerProjection = true;
    await adminPage.route(
      '**/api/commercial-intake/opportunity-follow-ups?**',
      async (route) => {
        if (!holdOwnerProjection) {
          await route.fallback();
          return;
        }
        holdOwnerProjection = false;
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...owner },
        });
        expect(response.status()).toBe(200);
        const nativePage = readFollowUpDiscovery(await response.json());
        expect(
          nativePage?.items.find(
            (item) => item.opportunityId === linked.opportunityId,
          )?.clientDossierId,
        ).toBe(clientId);
        oldProjection.ready.open();
        await oldProjection.release.promise;
        try {
          await route.fulfill({ response });
        } catch (error) {
          if (route.request().failure() === null) throw error;
        }
      },
    );
    await activate(
      ownerDiscovery.getByRole('button', { name: copy('find'), exact: true }),
    );
    await oldProjection.ready.promise;
    const independentReason =
      'Date draft survives only native Client capture replacement ' + suffix;
    forbidden.add(independentReason);
    await activate(
      ownerPanel.getByRole('button', { name: copy('edit'), exact: true }),
    );
    await ownerPanel
      .getByLabel(copy('date'), { exact: true })
      .fill('2032-03-04');
    await ownerPanel
      .getByLabel(copy('reason'), { exact: true })
      .fill(independentReason);
    try {
      const lostCapture = await administerOwnerClient('revoke');
      expect(lostCapture.clientPermissions).toEqual([]);
      await expect(
        ownerDiscovery.getByLabel(copy('through'), { exact: true }),
      ).toHaveValue('');
      await expect(
        ownerDiscovery.locator('.opportunity-follow-up-results > li'),
      ).toHaveCount(0);
      await expect(
        ownerPanel.getByLabel(copy('date'), { exact: true }),
      ).toHaveValue('2032-03-04');
      await expect(
        ownerPanel.getByLabel(copy('reason'), { exact: true }),
      ).toHaveValue(independentReason);
    } finally {
      oldProjection.release.open();
    }
    await expect(
      ownerDiscovery.locator('.opportunity-follow-up-results > li'),
    ).toHaveCount(0);
    const clientCaptureB = await administerOwnerClient('grant');
    expect(clientCaptureB.clientPermissionAssignmentId).not.toBe(
      clientCaptureA.clientPermissionAssignmentId,
    );
    expect(clientCaptureB.clientPermissions).toEqual(
      clientCaptureA.clientPermissions,
    );
    await expect(
      ownerDiscovery.getByLabel(copy('through'), { exact: true }),
    ).toHaveValue('');
    await expect(
      ownerPanel.getByLabel(copy('date'), { exact: true }),
    ).toHaveValue('2032-03-04');
    await expect(
      ownerPanel.getByLabel(copy('reason'), { exact: true }),
    ).toHaveValue(independentReason);
    await adminPage.screenshot({
      path: info.outputPath(
        `follow-up-${suffix}-client-replacement-date-draft-preserved.png`,
      ),
      fullPage: true,
    });
    await privacy(adminPage);
    await activate(
      ownerPanel.getByRole('button', { name: copy('cancel'), exact: true }),
    );
    const nativeReference = (
      await readOwner(`/commercial-intake/requests/${linked.requestId}`)
    ).clientReference;
    const freshProjection = readFollowUpDiscovery(
      await readOwner(
        `/commercial-intake/opportunity-follow-ups?through=${through}`,
      ),
    );
    const freshLinked = freshProjection?.items.find(
      (item) => item.opportunityId === linked.opportunityId,
    );
    if (!freshLinked)
      throw new Error(
        'Date discovery remains available under the stable native context.',
      );
    const nativeProjection =
      nativeReference === undefined ? undefined : object(nativeReference);
    expect(freshLinked.clientDisplayName).toBe(nativeProjection?.displayName);
    expect(freshLinked.clientDossierId).toBe(nativeProjection?.currentClientId);
    await findOwnerProjection();
    await ownerDiscovery.screenshot({
      path: info.outputPath(
        `follow-up-${suffix}-client-replacement-fresh-native-projection.png`,
      ),
    });
    await administerOwnerClient('revoke');
    const nativeLossReference = (
      await readOwner(`/commercial-intake/requests/${linked.requestId}`)
    ).clientReference;
    const lossProjection = readFollowUpDiscovery(
      await readOwner(
        `/commercial-intake/opportunity-follow-ups?through=${through}`,
      ),
    );
    const lossLinked = lossProjection?.items.find(
      (item) => item.opportunityId === linked.opportunityId,
    );
    if (!lossLinked)
      throw new Error(
        'Date discovery has no Company Client-read prerequisite.',
      );
    const authorizedLossProjection =
      nativeLossReference === undefined
        ? undefined
        : object(nativeLossReference);
    expect(lossLinked.clientDisplayName).toBe(
      authorizedLossProjection?.displayName,
    );
    expect(lossLinked.clientDossierId).toBe(
      authorizedLossProjection?.currentClientId,
    );
    await findOwnerProjection();
    await ownerDiscovery.screenshot({
      path: info.outputPath(
        `follow-up-${suffix}-client-loss-exact-native-projection.png`,
      ),
    });
    await privacy(adminPage);

    // Revocation is performed in the actual native administration UI while the
    // Ada page keeps an unrelated native text editor mounted and usable.
    await activate(
      intake.getByRole('button', { name: 'Edit next action', exact: true }),
    );
    const nativeDraft =
      'Unrelated native editor survives Date capture retirement ' + suffix;
    const nativeInput = intake.getByLabel('Next action', { exact: true });
    await nativeInput.fill(nativeDraft);
    await administer('revoke');
    await activate(
      panel.getByRole('button', { name: copy('reload'), exact: true }),
    );
    await expect(page.locator('.opportunity-follow-up')).toHaveCount(0);
    await expect(nativeInput).toHaveValue(nativeDraft);
    await expect(nativeInput).toBeEnabled();
    const denied = await page.request.get(
      `${origin}/commercial-intake/opportunities/${selected.opportunityId}/follow-up`,
      { headers },
    );
    expect(denied.status()).toBe(403);
    await activate(
      intake.getByRole('button', { name: 'Save next action', exact: true }),
    );
    await expect(
      intake.getByText(`Next action: ${nativeDraft}`, { exact: true }),
    ).toBeVisible();
    await privacy();
    await page.screenshot({
      path: info.outputPath(
        `follow-up-${suffix}-revoked-native-work-preserved.png`,
      ),
      fullPage: true,
    });
    await administer('grant');
    const replacement = object(
      (await read('/access/current-actor', companyId)).activeCompany,
    );
    expect(replacement.opportunityFollowUpPermissions).toEqual(
      granted.opportunityFollowUpPermissions,
    );
    expect(replacement.opportunityFollowUpCoordinatorAssignmentId).not.toBe(
      granted.opportunityFollowUpCoordinatorAssignmentId,
    );
    expect(replacement.opportunityFollowUpReadCapture).not.toBe(
      granted.opportunityFollowUpReadCapture,
    );
    await page.reload();
    await openCase(selectedCase);
    await expect(
      panel.locator(`time[datetime="${through}"]`).first(),
    ).toBeVisible();
    expect((await current(selectedCase)).head.revision).toBe(1);
    await privacy();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await administer('revoke');
    await adminPage.close();
  });
}
