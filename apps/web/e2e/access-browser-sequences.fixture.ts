import * as fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import type { Request, Route } from '@playwright/test';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import { resolveMessage } from '../src/localization/messages';
import { companyAssignmentMessages } from '../src/access/company-assignment-localization.copy';
import { companyContextMessages } from '../src/company/company-context.copy';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import { expect, expectApiFailure } from './ui-chaos.fixture';
import { removeRoute } from './route-removal';
import { expectValue, selectOption } from './select-option';
import { replaceCompanyBeforeActivityReply } from './access-held-activity.fixture';
import {
  accessApiOrigin,
  accessIdentities,
  accessObject,
  accessText,
  prepareAccessSequenceCase,
} from './access-sequence-source.fixture';

type Company = 'a' | 'b';
type Bundle = 'company-context' | 'company-director-client';
type Values = { locale: InterfaceLocale; company: Company; bundle: Bundle };
type Grant = { active: boolean; id: string | null };
type Sent = { method: string; path: string; body: string; key: string };
type Intent = {
  kind: 'uncertain';
  action: 'grant' | 'revoke';
  company: Company;
  bundle: Bundle;
  original: Sent;
  receipt: Record<string, unknown>;
};
const bundles: Record<
  Bundle,
  {
    label: string;
    value: string;
    copy: 'companyContextBundle' | 'directorClientBundle';
    version: string | null;
  }
> = {
  'company-context': {
    label: 'Company Context Access',
    value: 'company-context',
    copy: 'companyContextBundle',
    version: null,
  },
  'company-director-client': {
    label: 'Company Director Client Access',
    value: 'director-client',
    copy: 'directorClientBundle',
    version: 'v2',
  },
};

function createAccessSequenceAdapter(
  role: keyof typeof accessIdentities,
): BrowserSequenceAdapter<Company, Values> {
  return {
    caseId: role === 'administrator' ? 'workspace-access' : 'company-context',
    initial: fc.constantFrom<Company>('a', 'b'),
    values: fc.record({
      locale: fc.constantFrom<InterfaceLocale>('en', 'ro', 'ru', 'fr'),
      company: fc.constantFrom<Company>('a', 'b'),
      bundle: fc.constantFrom<Bundle>(
        'company-context',
        'company-director-client',
      ),
    }),
    async open({ page, info, trial, initial }) {
      const ready = await prepareAccessSequenceCase(
        page,
        `${info.project.name}-${trial}-${randomUUID()}`,
      );
      const grants: Record<Company, Record<Bundle, Grant>> = {
        a: {
          'company-context': { active: false, id: null },
          'company-director-client': { active: false, id: null },
        },
        b: {
          'company-context': { active: false, id: null },
          'company-director-client': { active: false, id: null },
        },
      };
      for (const company of ['a', 'b'] satisfies Company[]) {
        const grant = await ready.grant('company-context', company);
        grants[company]['company-context'] = {
          active: true,
          id: accessText(grant.id),
        };
      }
      let locale: InterfaceLocale = 'en';
      let activeCompany: Company = initial;
      let target: Company = initial;
      let bundle: Bundle = 'company-context';
      let section: 'access' | 'activity' | 'overview' =
        role === 'administrator' ? 'access' : 'activity';
      let intent:
        Intent | { kind: 'confirmed-read'; action: 'grant' | 'revoke' } | null =
        null;
      const hiddenCompanyId =
        role === 'member'
          ? accessText(
              (
                await ready.command('/companies', {
                  displayName: `Fictional hidden Access scope ${randomUUID()}`,
                })
              ).id,
            )
          : null;
      const administration = page.locator('.company-access');
      const word = (key: (typeof companyAssignmentMessages)['keys'][number]) =>
        resolveMessage(companyAssignmentMessages, locale, key);
      const memberControl = () =>
        administration.getByLabel(word('workspaceMemberLabel'));
      const companyControl = () =>
        administration.getByLabel(word('companyLabel'), { exact: true });
      const bundleControl = () =>
        administration.getByLabel(word('bundleLabel'));
      const identify = (route: Route) =>
        route.fallback({
          headers: { ...route.request().headers(), ...accessIdentities[role] },
        });
      await page.route('**/api/**', identify);
      async function chooseCompany(company: Company) {
        if (info.project.name.endsWith('narrow'))
          await page
            .getByRole('button', {
              name: resolveMessage(prismeMessages, locale, 'openNavigation'),
              exact: true,
            })
            .click();
        const control = page.getByLabel(
          resolveMessage(companyContextMessages, locale, 'activeCompany'),
          { exact: true },
        );
        await selectOption(control, { value: ready.companies[company].id });
        await expect(control).toBeEnabled();
        await expectValue(control, ready.companies[company].id);
        activeCompany = company;
        if (info.project.name.endsWith('narrow'))
          await page
            .getByRole('button', {
              name: resolveMessage(prismeMessages, locale, 'closeNavigation'),
              exact: true,
            })
            .click();
      }
      try {
        await page.goto(role === 'administrator' ? '/#access' : '/#activity');
        await chooseCompany(initial);
        if (role === 'administrator') {
          await selectOption(memberControl(), { value: ready.membershipId });
          await selectOption(companyControl(), {
            value: ready.companies[initial].id,
          });
          await selectOption(bundleControl(), { value: bundles[bundle].value });
        }
      } catch (error) {
        if (!page.isClosed()) await removeRoute(page, '**/api/**', identify);
        throw error;
      }
      const sent: Sent[] = [];
      const observe = (request: Request) => {
        const path = new URL(request.url()).pathname;
        if (
          ['POST', 'DELETE'].includes(request.method()) &&
          /^\/api\/company-(?:context|director-client)-assignments(?:\/|$)/u.test(
            path,
          )
        )
          sent.push({
            method: request.method(),
            path,
            body: request.postData() ?? '',
            key: request.headers()['idempotency-key'] ?? '',
          });
      };
      page.on('request', observe);
      async function toggle() {
        const previous = grants[target][bundle].active;
        const action = previous ? 'revoke' : 'grant';
        const path =
          `/api/${bundle}-assignments` +
          (previous
            ? `/${ready.membershipId}/${ready.companies[target].id}`
            : '');
        const capture: { receipt?: Record<string, unknown> } = {};
        let intercepted = false;
        const drop = async (route: Route) => {
          if (new URL(route.request().url()).pathname !== path || intercepted)
            return route.fallback();
          intercepted = true;
          const response = await route.fetch({
            headers: {
              ...route.request().headers(),
              ...accessIdentities.administrator,
            },
          });
          expect(response.status()).toBe(previous ? 200 : 201);
          capture.receipt = accessObject(await response.json());
          expectApiFailure({
            page,
            request: route.request(),
            reason:
              'Native Access command committed; first receipt deliberately lost.',
          });
          await route.abort('connectionfailed');
        };
        const pattern = (url: URL) => url.pathname === path;
        const count = sent.length;
        const canonicalRefresh = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            new URL(response.url()).pathname ===
              '/api/company-context-assignments/administration',
        );
        await page.route(pattern, drop);
        try {
          await administration
            .getByRole('button', { name: word(action), exact: true })
            .click();
          await expect(administration.getByRole('alert')).toHaveText(
            word('error'),
          );
          expect((await canonicalRefresh).status()).toBe(200);
        } finally {
          if (!page.isClosed()) await removeRoute(page, pattern, drop);
        }
        expect(sent).toHaveLength(count + 1);
        const original = sent[count];
        if (!original || !capture.receipt)
          throw new Error('Expected the committed Access command.');
        expect(original.key).toMatch(/^[0-9a-f-]{36}$/iu);
        expect(original.method).toBe(previous ? 'DELETE' : 'POST');
        expect(original.path).toBe(path);
        expect(original.body).toBe(
          previous
            ? ''
            : JSON.stringify({
                workspaceMembershipId: ready.membershipId,
                companyId: ready.companies[target].id,
              }),
        );
        expect(capture.receipt).toMatchObject({
          active: !previous,
          companyId: ready.companies[target].id,
          workspaceMembershipId: ready.membershipId,
          bundle: bundles[bundle].label,
          permissionSetVersion: bundles[bundle].version,
        });
        grants[target][bundle] = {
          active: !previous,
          id: accessText(capture.receipt.id),
        };
        intent = {
          kind: 'uncertain',
          action,
          company: target,
          bundle,
          original,
          receipt: capture.receipt,
        };
      }
      async function retry() {
        const retained = intent;
        if (!retained || retained.kind !== 'uncertain')
          throw new Error('An exact Access retry needs an uncertain intent.');
        const count = sent.length;
        const response = page.waitForResponse(
          (reply) =>
            reply.request().method() === retained.original.method &&
            new URL(reply.url()).pathname === retained.original.path,
        );
        await administration
          .getByRole('button', { name: word(retained.action), exact: true })
          .evaluate((button) => {
            if (!(button instanceof HTMLButtonElement))
              throw new Error('Expected a native Access retry button.');
            button.click();
            button.click();
          });
        expect(await (await response).json()).toEqual(retained.receipt);
        await expect(
          administration.getByText(
            word(retained.action === 'grant' ? 'granted' : 'revoked'),
            { exact: true },
          ),
        ).toBeVisible();
        expect(sent).toHaveLength(count + 1);
        expect(sent[count]).toEqual(retained.original);
        intent = null;
      }
      async function toggleWithFailedRefresh() {
        const previous = grants[target][bundle].active;
        const action = previous ? 'revoke' : 'grant';
        const path =
          `/api/${bundle}-assignments` +
          (previous
            ? `/${ready.membershipId}/${ready.companies[target].id}`
            : '');
        const method = previous ? 'DELETE' : 'POST';
        const pattern = '**/api/company-context-assignments/administration';
        let refused = false;
        const refuse = async (route: Route) => {
          if (route.request().method() !== 'GET' || refused)
            return route.fallback();
          refused = true;
          expectApiFailure({
            page,
            request: route.request(),
            reason:
              'Native Access command succeeded; its independent administration read is deliberately unavailable.',
          });
          await route.fulfill({
            status: 503,
            json: { message: 'Controlled independent-read failure' },
          });
        };
        const count = sent.length;
        const write = page.waitForResponse(
          (response) =>
            response.request().method() === method &&
            new URL(response.url()).pathname === path,
        );
        const read = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            new URL(response.url()).pathname ===
              '/api/company-context-assignments/administration',
        );
        await page.route(pattern, refuse);
        try {
          await administration
            .getByRole('button', { name: word(action), exact: true })
            .click();
          const committed = await write;
          expect(committed.status()).toBe(previous ? 200 : 201);
          const receipt = accessObject(await committed.json());
          expect(receipt).toMatchObject({
            active: !previous,
            companyId: ready.companies[target].id,
            workspaceMembershipId: ready.membershipId,
            bundle: bundles[bundle].label,
            permissionSetVersion: bundles[bundle].version,
          });
          grants[target][bundle] = {
            active: !previous,
            id: accessText(receipt.id),
          };
          expect((await read).status()).toBe(503);
          await expect(administration.getByRole('alert')).toHaveText(
            word('error'),
          );
          expect(sent).toHaveLength(count + 1);
          const original = sent[count];
          if (!original)
            throw new Error('Expected one confirmed native Access command.');
          expect(original.key).toMatch(/^[0-9a-f-]{36}$/iu);
          expect(original.body).toBe(
            previous
              ? ''
              : JSON.stringify({
                  workspaceMembershipId: ready.membershipId,
                  companyId: ready.companies[target].id,
                }),
          );
          intent = { kind: 'confirmed-read', action };
        } finally {
          if (!page.isClosed()) await removeRoute(page, pattern, refuse);
        }
      }
      async function retryRead() {
        const retained = intent;
        if (!retained || retained.kind !== 'confirmed-read')
          throw new Error(
            'A read-only retry needs a confirmed Access command.',
          );
        const count = sent.length;
        const read = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            new URL(response.url()).pathname ===
              '/api/company-context-assignments/administration',
        );
        await administration
          .getByRole('button', { name: word('retry'), exact: true })
          .click();
        expect((await read).status()).toBe(200);
        await expect(
          administration.getByText(
            word(retained.action === 'grant' ? 'granted' : 'revoked'),
            { exact: true },
          ),
        ).toBeVisible();
        expect(sent).toHaveLength(count);
        intent = null;
      }
      async function replaceBeforeActivity() {
        const company = activeCompany === 'a' ? 'b' : 'a';
        const other = activeCompany;
        const retainedBundles = (
          ['company-context', 'company-director-client'] satisfies Bundle[]
        ).filter((candidate) => grants[company][candidate].active);
        const activity = page.locator('.activity-log');
        let freshCount = 0;
        let freshTimes: string[] = [];
        async function expectFreshActivity() {
          await expect(activity.locator('.activity-log-list > li')).toHaveCount(
            freshCount,
          );
          await expect
            .poll(() =>
              activity
                .locator('li time')
                .evaluateAll((times) =>
                  times.map((time) => time.getAttribute('datetime')),
                ),
            )
            .toEqual(freshTimes);
        }
        async function restoreGrants() {
          for (const candidate of retainedBundles) {
            const receipt = await ready.grant(candidate, company);
            grants[company][candidate] = {
              active: true,
              id: accessText(receipt.id),
            };
          }
        }
        await replaceCompanyBeforeActivityReply({
          page,
          companyId: ready.companies[company].id,
          identity: accessIdentities[role],
          status: role === 'member' ? 403 : 200,
          async beforeRead() {
            if (role === 'member')
              for (const candidate of retainedBundles) {
                await ready.revoke(candidate, company);
                grants[company][candidate].active = false;
              }
          },
          async afterCapture(response) {
            if (role === 'administrator') {
              const oldPage = accessObject(await response.json());
              if (!Array.isArray(oldPage.events))
                throw new Error('Expected the native Activity event page.');
              for (const candidate of retainedBundles)
                await ready.revoke(candidate, company);
              await restoreGrants();
              const current = await ready.read(
                '/activity-log',
                ready.companies[company].id,
                role,
              );
              if (!Array.isArray(current.events))
                throw new Error('Expected the current native Activity page.');
              freshCount = current.events.length;
              const oldEvents = oldPage.events.map(accessObject);
              const freshEvents = current.events.map(accessObject);
              expect(freshEvents.map((event) => event.id)).not.toEqual(
                oldEvents.map((event) => event.id),
              );
              freshTimes = freshEvents.flatMap((event) =>
                typeof event.occurredAt === 'string' ? [event.occurredAt] : [],
              );
              expect(freshTimes).not.toEqual(
                oldEvents.flatMap((event) =>
                  typeof event.occurredAt === 'string'
                    ? [event.occurredAt]
                    : [],
                ),
              );
            } else {
              await restoreGrants();
            }
          },
          start: () => chooseCompany(company),
          async replace() {
            await chooseCompany(other);
            await chooseCompany(company);
            await expect(activity.getByRole('status')).toHaveCount(0);
            await expect(activity.getByRole('alert')).toHaveCount(0);
            if (role === 'administrator') await expectFreshActivity();
          },
        });
        await expect(activity.getByRole('alert')).toHaveCount(0);
        if (role === 'administrator') await expectFreshActivity();
      }
      return {
        actions(value) {
          const actions: BrowserAction[] = [
            {
              label: `locale:${value.locale}`,
              async run() {
                await selectOption(page.locator('#interface-locale'), {
                  value: value.locale,
                });
                locale = value.locale;
              },
            },
            {
              label: 'company:aba',
              async run() {
                const other = value.company === 'a' ? 'b' : 'a';
                for (const company of [
                  value.company,
                  other,
                  value.company,
                ] satisfies Company[])
                  await chooseCompany(company);
              },
            },
            {
              label:
                section === 'activity'
                  ? role === 'administrator'
                    ? 'navigate:access'
                    : 'navigate:overview'
                  : 'navigate:activity',
              async run() {
                section =
                  section === 'activity'
                    ? role === 'administrator'
                      ? 'access'
                      : 'overview'
                    : 'activity';
                await page.goto(
                  section === 'access'
                    ? '/#access'
                    : section === 'activity'
                      ? '/#activity'
                      : '/',
                );
              },
            },
          ];
          const nextCompany = activeCompany === 'a' ? 'b' : 'a';
          if (
            section === 'activity' &&
            (
              ['company-context', 'company-director-client'] satisfies Bundle[]
            ).some((candidate) => grants[nextCompany][candidate].active)
          )
            actions.push({
              label:
                role === 'administrator'
                  ? 'activity:retired-native-200'
                  : 'activity:retired-native-403',
              run: replaceBeforeActivity,
            });
          if (role === 'administrator' && section === 'access') {
            if (intent)
              actions.push(
                intent.kind === 'uncertain'
                  ? { label: 'command:exact-double-retry', run: retry }
                  : { label: 'command:read-only-retry', run: retryRead },
              );
            else {
              actions.push({
                label: 'target:select',
                async run() {
                  await selectOption(companyControl(), {
                    value: ready.companies[value.company].id,
                  });
                  await selectOption(bundleControl(), {
                    value: bundles[value.bundle].value,
                  });
                  target = value.company;
                  bundle = value.bundle;
                },
              });
              actions.push({
                label: grants[target][bundle].active
                  ? 'command:revoke-lost-reply'
                  : 'command:grant-lost-reply',
                run: toggle,
              });
              actions.push({
                label: 'command:confirmed-failed-read',
                run: toggleWithFailedRefresh,
              });
            }
          }
          return actions;
        },
        async verify() {
          const canonical = await ready.read(
            '/company-context-assignments/administration',
          );
          if (!Array.isArray(canonical.assignments))
            throw new Error('Expected canonical native assignments.');
          const rows = canonical.assignments.map(accessObject);
          for (const company of ['a', 'b'] satisfies Company[])
            for (const candidate of [
              'company-context',
              'company-director-client',
            ] satisfies Bundle[]) {
              const actual = rows.filter(
                (entry) =>
                  entry.workspaceMembershipId === ready.membershipId &&
                  entry.companyId === ready.companies[company].id &&
                  entry.bundle === bundles[candidate].label &&
                  entry.active === true,
              );
              const expected = grants[company][candidate];
              expect(actual).toHaveLength(expected.active ? 1 : 0);
              if (expected.active)
                expect(actual[0]).toMatchObject({
                  id: expected.id,
                  permissionSetVersion: bundles[candidate].version,
                });
            }
          if (role === 'administrator') {
            if (intent?.kind === 'confirmed-read') {
              if (role === 'administrator' && section === 'access') {
                await expect(administration.getByRole('alert')).toHaveText(
                  word('error'),
                );
                await expect(
                  administration.getByRole('button', {
                    name: word('retry'),
                    exact: true,
                  }),
                ).toBeEnabled();
              } else {
                await expect(administration).toBeHidden();
              }
            } else {
              await expectValue(memberControl(), ready.membershipId);
              await expectValue(companyControl(), ready.companies[target].id);
              await expectValue(bundleControl(), bundles[bundle].value);
              const displayed = grants[target][bundle].active;
              const version = bundles[bundle].version;
              const expected = !displayed
                ? word('currentStateNotGranted')
                : version === null
                  ? word('currentStateGranted')
                  : word('currentStateGrantedVersion').replace(
                      '{version}',
                      version,
                    );
              await expect(
                administration
                  .locator('p[role="status"]')
                  .filter({ hasText: word('currentStateLabel') }),
              ).toHaveText(word('currentStateLabel') + ': ' + expected);
            }
          } else {
            await expect(administration).toHaveCount(0);
            if (!hiddenCompanyId)
              throw new Error('Member proof needs an isolated hidden Company.');
            const hidden = await page.request.get(
              accessApiOrigin + '/access/current-actor',
              {
                headers: {
                  ...accessIdentities.member,
                  'x-company-context-id': hiddenCompanyId,
                },
              },
            );
            expect(hidden.status()).toBe(403);
          }
          const actor = await ready.read(
            '/access/current-actor',
            ready.companies[activeCompany].id,
            role,
          );
          expect(actor.workspaceMembershipId).toBe(
            role === 'administrator'
              ? ready.administratorId
              : ready.membershipId,
          );
          expect(accessObject(actor.activeCompany).id).toBe(
            ready.companies[activeCompany].id,
          );
          await expect(page.locator('.prisme-breadcrumb strong')).toHaveText(
            ready.companies[activeCompany].name,
          );
        },
        async settle() {
          await page.waitForLoadState('networkidle');
          await page.screenshot({
            path: info.outputPath(
              `access-generated-final-${info.project.name}.png`,
            ),
            fullPage: true,
          });
        },
        async dispose() {
          page.off('request', observe);
          if (!page.isClosed()) await removeRoute(page, '**/api/**', identify);
        },
        describe: () => ({
          role,
          locale,
          activeCompany,
          target,
          bundle,
          section,
          grants,
          intent:
            intent?.kind === 'uncertain'
              ? {
                  action: intent.action,
                  company: intent.company,
                  bundle: intent.bundle,
                  original: intent.original,
                }
              : intent,
        }),
      };
    },
  };
}

export const accessSequenceAdapter =
  createAccessSequenceAdapter('administrator');
export const companyContextSequenceAdapter =
  createAccessSequenceAdapter('member');
