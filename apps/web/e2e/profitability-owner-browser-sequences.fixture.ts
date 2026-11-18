import { replaceScopeBeforeFinancialReply } from './financial-held-read.fixture';
import { publishNativeGrantLoss } from './native-grant-loss.fixture';
import * as fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import type { Request, Route } from '@playwright/test';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import { expect, expectApiFailure } from './ui-chaos.fixture';
import {
  prepareCommercialOwnerSource,
  sequenceDirector,
} from './commercial-owner-sequence-source.fixture';
import { commercialOwnerBrowser } from './commercial-owner-browser.fixture';
import {
  accessIdentities,
  accessObject,
  accessText,
} from './access-sequence-source.fixture';
import { selectOption } from './select-option';
import { removeRoute } from './route-removal';
import { resolveMessage } from '../src/localization/messages';
import { profitabilityMessages } from '../src/profitability-estimate/profitability.copy';

type Values = { variant: 'a' | 'b'; locale: 'ro' | 'ru' };
type Sent = { body: string; key: string };
type Version = {
  id: string;
  variant: Values['variant'];
  decision: 'APPROVE' | 'MODIFY' | null;
};
const economics = {
  a: {
    price: '125.00',
    profit: '25.00',
    profitability: '20.00',
    difference: '0.00',
  },
  b: {
    price: '150.00',
    profit: '50.00',
    profitability: '33.33',
    difference: '13.33',
  },
};
const inputs = (variant: Values['variant']) => ({
  currency: 'EUR',
  executorType: 'PATENT_CONSULTANT',
  executorCost: '70.00',
  fiscalCost: '10.00',
  allocatedOverhead: '20.00',
  directCosts: [],
  targetProfitability: '20',
  proposedPrice: economics[variant].price,
  pricingIntent: { kind: 'ORDINARY' },
  costConfirmation: true,
});
export const profitabilityOwnerSequenceAdapter: BrowserSequenceAdapter<
  'empty',
  Values
> = {
  caseId: 'profitability-version-owner',
  initial: fc.constant('empty'),
  values: fc.record({
    variant: fc.constantFrom('a', 'b'),
    locale: fc.constantFrom('ro', 'ru'),
  }),
  async open({ page, info, trial }) {
    const source = await prepareCommercialOwnerSource(
      page,
      `${info.project.name}-${trial}-${randomUUID()}`,
      [
        'company-profitability-contributor',
        'company-profitability-director',
        'company-offer-approver',
      ],
    );
    const base = `/opportunities/${source.opportunityId}/profitability-estimates`;
    const browser = commercialOwnerBrowser(
      page,
      info,
      source.companies,
      source.subject,
    );
    const panel = page.locator(
      '.commercial-intake-workspace:visible .profitability-estimate',
    );
    const copy = (key: (typeof profitabilityMessages.keys)[number]) =>
      resolveMessage(profitabilityMessages, browser.locale(), key);
    const versions: Version[] = [];
    const writes: Sent[] = [];
    let selected = 0;
    let variant: Values['variant'] = 'a';
    let mode:
      | 'ready'
      | 'draft'
      | 'uncertain'
      | 'stale'
      | 'away'
      | 'queue'
      | 'queue-exact' = 'ready';
    let uncertain: Sent | undefined;
    const identify = (route: Route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...accessIdentities.member },
      });
    const observe = (request: Request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/api' + base)
      )
        writes.push({
          body: request.postData() ?? '',
          key: request.headers()['idempotency-key'] ?? '',
        });
    };
    await page.route('**/api/**', identify);
    page.on('request', observe);
    async function draft(next: Values['variant']) {
      variant = next;
      const form = panel.locator('form');
      for (const [key, value] of [
        ['currency', 'EUR'],
        ['executorCost', '70.00'],
        ['fiscalCost', '10.00'],
        ['allocatedOverhead', '20.00'],
        ['proposedPrice', economics[next].price],
        ['targetProfitability', '20'],
      ] satisfies Array<[(typeof profitabilityMessages.keys)[number], string]>)
        await form.getByLabel(copy(key), { exact: true }).fill(value);
      await selectOption(
        form.getByLabel(copy('executorType'), { exact: true }),
        { value: 'PATENT_CONSULTANT' },
      );
      await selectOption(
        form.getByLabel(copy('pricingIntent'), { exact: true }),
        { value: 'ORDINARY' },
      );
      await form.getByRole('checkbox').check();
      mode = 'draft';
    }
    async function save(lost: boolean) {
      if (mode !== 'draft')
        throw new Error('Missing explicit confirmed-cost draft');
      const intended = {
        expectedLatestVersionNumber: versions.length || null,
        ...inputs(variant),
      };
      const before = writes.length;
      let receipt: Record<string, unknown> | undefined;
      const pattern = '**/api' + base;
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
            'The actual confirmed-cost Version committed; only its acknowledgement is lost.',
        });
        await route.fulfill({ status: 503, body: '{}' });
      };
      if (lost) await page.route(pattern, lose);
      const response = lost
        ? null
        : page.waitForResponse(
            (reply) =>
              reply.request().method() === 'POST' &&
              new URL(reply.url()).pathname === '/api' + base,
          );
      try {
        await panel
          .getByRole('button', { name: copy('save'), exact: true })
          .click();
        if (response) {
          const reply = await response;
          expect(reply.status()).toBe(201);
          receipt = accessObject(await reply.json());
        } else
          await expect(
            panel.getByRole('button', { name: copy('retry'), exact: true }),
          ).toBeVisible();
      } finally {
        if (lost) await removeRoute(page, pattern, lose);
      }
      const sent = writes[before];
      if (!sent || !receipt)
        throw new Error('Missing actual confirmed-cost receipt');
      expect(writes).toHaveLength(before + 1);
      expect(JSON.parse(sent.body)).toEqual(intended);
      expect(sent.key).toMatch(/^[0-9a-f-]{36}$/iu);
      expect(receipt.versionNumber).toBe(versions.length + 1);
      versions.push({ id: accessText(receipt.id), variant, decision: null });
      selected = versions.length;
      uncertain = lost ? sent : undefined;
      mode = lost ? 'uncertain' : 'ready';
      if (!lost)
        await expect(
          panel.getByText(copy('saved'), { exact: true }),
        ).toBeVisible();
    }
    async function retry() {
      if (!uncertain)
        throw new Error('Missing immutable estimate retry intention');
      const before = writes.length;
      const response = page.waitForResponse(
        (reply) =>
          reply.request().method() === 'POST' &&
          new URL(reply.url()).pathname.startsWith('/api' + base),
      );
      await panel
        .getByRole('button', { name: copy('retry'), exact: true })
        .evaluate((button) => {
          if (!(button instanceof HTMLButtonElement))
            throw new Error('Expected retry button');
          button.click();
          button.click();
        });
      expect((await response).status()).toBe(201);
      await expect(
        panel.getByRole('button', { name: copy('retry'), exact: true }),
      ).toHaveCount(0);
      expect(writes).toHaveLength(before + 1);
      expect(writes[before]).toEqual(uncertain);
      uncertain = undefined;
      mode = 'ready';
    }
    async function history(number: number) {
      await panel
        .getByRole('button', { name: copy('open') + ' ' + number, exact: true })
        .click();
      await expect(
        panel.getByRole('article', {
          name: copy('version') + ' ' + number,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        panel.getByRole('button', { name: copy('reload'), exact: true }),
      ).toBeEnabled();
      selected = number;
    }
    async function decide(stale: boolean) {
      const version = versions[selected - 1];
      if (!version || version.decision)
        throw new Error('Missing exact undecided native Version');
      if (stale) {
        await source.command(
          `${base}/versions/${version.id}/decision`,
          {
            expectedVersionNumber: selected,
            expectedDecision: null,
            code: 'MODIFY',
          },
          sequenceDirector,
        );
        version.decision = 'MODIFY';
      }
      const pattern = '**/api' + base + '/versions/' + version.id + '/decision';
      const conflict = async (route: Route) => {
        const reply = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(reply.status()).toBe(409);
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'Another human Director already decided this exact native Version.',
        });
        await route.fulfill({ response: reply });
      };
      if (stale) await page.route(pattern, conflict);
      const response = page.waitForResponse(
        (reply) =>
          reply.request().method() === 'POST' &&
          new URL(reply.url()).pathname.endsWith('/decision'),
      );
      try {
        await panel
          .getByRole('button', { name: copy('approve'), exact: true })
          .click();
        expect((await response).status()).toBe(stale ? 409 : 201);
        if (stale) {
          await expect(
            panel.getByText(copy('stale'), { exact: true }),
          ).toBeVisible();
          mode = 'stale';
        } else {
          version.decision = 'APPROVE';
          await expect(
            panel.getByText(copy('decided'), { exact: true }),
          ).toBeVisible();
        }
      } finally {
        if (stale) await removeRoute(page, pattern, conflict);
      }
    }
    async function reload() {
      await panel
        .getByRole('button', { name: copy('reload'), exact: true })
        .click();
      await expect(
        panel.getByRole('button', { name: copy('reload'), exact: true }),
      ).toBeEnabled();
      selected = 0;
      mode = 'ready';
    }
    const queue = page.locator('.profitability-decision-queue:visible');
    async function openQueue() {
      await browser.navigate('#overview');
      await expect(
        queue.locator('ol').getByRole('listitem').first(),
      ).toBeVisible();
      mode = 'queue';
    }
    async function reviewQueueVersion() {
      const number =
        versions.findIndex((version) => version.decision === null) + 1;
      const version = versions[number - 1];
      if (!version)
        throw new Error('Missing independently pending queue Version');
      const row = queue
        .locator('ol > li')
        .filter({ hasText: source.subject })
        .filter({
          has: page
            .getByRole('button')
            .filter({ hasText: new RegExp(' ' + number + '$') }),
        });
      const response = page.waitForResponse(
        (reply) =>
          reply.request().method() === 'GET' &&
          new URL(reply.url()).pathname ===
            '/api' + base + '/versions/' + version.id,
      );
      await row.getByRole('button').click();
      expect((await response).status()).toBe(200);
      await expect(
        queue.getByRole('article', {
          name: copy('version') + ' ' + number,
          exact: true,
        }),
      ).toBeVisible();
      selected = number;
      mode = 'queue-exact';
    }
    async function approveQueueVersion() {
      const version = versions[selected - 1];
      if (!version || version.decision !== null)
        throw new Error('Missing exact undecided queue selection');
      const response = page.waitForResponse(
        (reply) =>
          reply.request().method() === 'POST' &&
          new URL(reply.url()).pathname ===
            '/api' + base + '/versions/' + version.id + '/decision',
      );
      await queue
        .getByRole('button', { name: copy('approve'), exact: true })
        .click();
      const receipt = await response;
      expect(receipt.status()).toBe(201);
      const body: unknown = receipt.request().postDataJSON();
      expect(body).toEqual({
        expectedVersionNumber: selected,
        expectedDecision: null,
        code: 'APPROVE',
      });
      version.decision = 'APPROVE';
      await expect(
        queue.getByText(copy('decided'), { exact: true }),
      ).toBeVisible();
    }
    async function retireQueueRead(reply: 'authorized' | 'denied') {
      await replaceScopeBeforeFinancialReply({
        page,
        path: '/profitability-estimate-decision-queue',
        identity: accessIdentities.member,
        reply:
          reply === 'authorized'
            ? { kind: 'authorized' }
            : {
                kind: 'denied',
                revoke: () =>
                  source
                    .revoke('company-profitability-director', 'a')
                    .then(() => undefined),
                restore: () =>
                  source
                    .grant('company-profitability-director', 'a')
                    .then(() => undefined),
              },
        start: () =>
          queue
            .getByRole('button', {
              name:
                browser.locale() === 'ro'
                  ? 'Actualizează de la început'
                  : 'Обновить с начала',
              exact: true,
            })
            .click(),
        replace: () => browser.company('b'),
      });
      mode = 'away';
    }
    async function retireCurrentDirectorGrant() {
      let revoked = false;
      try {
        await replaceScopeBeforeFinancialReply({
          page,
          path: '/profitability-estimate-decision-queue',
          identity: accessIdentities.member,
          reply: { kind: 'authorized' },
          start: () =>
            queue
              .getByRole('button', {
                name:
                  browser.locale() === 'ro'
                    ? 'Actualizează de la început'
                    : 'Обновить с начала',
                exact: true,
              })
              .click(),
          replace: async () => {
            revoked = true;
            await source.revoke('company-profitability-director', 'a');
            await source.revoke('company-offer-approver', 'a');
            await publishNativeGrantLoss({
              page,
              path: '/offer-decision-queue',
              method: 'GET',
              companyId: source.companies.a.id,
              absentBundles: [
                'company_profitability_director',
                'company_offer_approver',
              ],
              start: () =>
                page
                  .locator('.offer-decision-queue')
                  .getByRole('button', {
                    name:
                      browser.locale() === 'ro'
                        ? 'Actualizează de la început'
                        : 'Обновить с начала',
                    exact: true,
                  })
                  .click(),
            });
            await expect(queue).toHaveCount(0);
            await expect(page).toHaveURL(/#overview$/u);
          },
        });
        await expect(queue).toHaveCount(0);
      } finally {
        if (revoked) {
          await source.grant('company-profitability-director', 'a');
          await source.grant('company-offer-approver', 'a');
        }
      }
      await browser.company('b');
      mode = 'away';
    }
    async function leaveQueue() {
      await browser.openRequest();
      await reload();
    }
    try {
      await page.goto('/#requests');
      await browser.open();
      await expect(
        panel.getByRole('button', { name: copy('save'), exact: true }),
      ).toBeVisible();
    } catch (error) {
      page.off('request', observe);
      await removeRoute(page, '**/api/**', identify);
      throw error;
    }
    return {
      actions(value) {
        if (mode === 'queue')
          return [
            {
              label: 'review-exact-native-queue-version',
              run: reviewQueueVersion,
            },
            {
              label: 'retire-native-queue-read-through-company-replacement',
              run: () => retireQueueRead('authorized'),
            },
            { label: 'return-from-native-decision-queue', run: leaveQueue },
            {
              label: 'retire-native-director-denial-before-company-recovery',
              run: () => retireQueueRead('denied'),
            },
            {
              label: 'retire-native-director-grant-in-current-company',
              run: retireCurrentDirectorGrant,
            },
          ];
        if (mode === 'queue-exact')
          return [
            ...(versions[selected - 1]?.decision === null
              ? [
                  {
                    label: 'approve-exact-native-queue-version',
                    run: approveQueueVersion,
                  },
                ]
              : []),
            { label: 'return-from-native-decision-queue', run: leaveQueue },
          ];
        if (mode === 'uncertain')
          return [
            { label: 'retry-exact-estimate-double-admission', run: retry },
          ];
        if (mode === 'stale')
          return [{ label: 'recover-native-estimate-history', run: reload }];
        if (mode === 'away')
          return [
            {
              label: 'return-to-native-estimate-company',
              run: async () => {
                await browser.company('a');
                await browser.openRequest();
                selected = 0;
                mode = 'ready';
              },
            },
          ];
        const actions: BrowserAction[] = [
          {
            label: `locale:${value.locale}`,
            run: async () => {
              await browser.language(value.locale);
              if (mode === 'draft')
                await expect(
                  panel.getByLabel(copy('proposedPrice'), { exact: true }),
                ).toHaveValue(economics[variant].price);
            },
          },
          {
            label: 'edit-explicit-cost-and-price',
            run: () => draft(value.variant),
          },
          {
            label: 'leave-native-estimate-company',
            run: async () => {
              await browser.company('b');
              mode = 'away';
            },
          },
        ];
        if (mode === 'draft')
          actions.push(
            { label: 'save-confirmed-native-estimate', run: () => save(false) },
            {
              label: 'lose-native-estimate-confirmation',
              run: () => save(true),
            },
          );
        else if (versions.length)
          actions.push({
            label: 'open-exact-earlier-estimate-version',
            run: () => history(1),
          });
        if (
          mode === 'ready' &&
          selected &&
          versions[selected - 1]?.decision === null
        )
          actions.push(
            {
              label: 'approve-exact-human-selected-version',
              run: () => decide(false),
            },
            {
              label: 'reject-native-stale-director-intention',
              run: () => decide(true),
            },
          );
        if (
          mode === 'ready' &&
          versions.some((version) => version.decision === null)
        )
          actions.push({
            label: 'open-native-director-decision-queue',
            run: openQueue,
          });
        return actions;
      },
      async verify() {
        if (mode === 'away') await expect(panel).not.toBeVisible();
        const history = await source.read(base);
        expect(history.latestVersionNumber).toBe(versions.length || null);
        if (!Array.isArray(history.items))
          throw new Error('Missing native economic history');
        expect(history.items).toHaveLength(versions.length);
        for (let number = 1; number <= versions.length; number++) {
          const expected = versions[number - 1];
          if (!expected)
            throw new Error(
              'Missing independently calculated economic expectation',
            );
          const actual = accessObject(history.items[versions.length - number]);
          const economic = economics[expected.variant];
          expect(actual).toMatchObject({
            id: expected.id,
            companyId: source.companies.a.id,
            opportunityId: source.opportunityId,
            clientRequestId: source.requestId,
            createdByWorkspaceMembershipId: source.membershipId,
            versionNumber: number,
            inputs: inputs(expected.variant),
            results: {
              totalCost: '100.00',
              profit: economic.profit,
              profitabilityPercent: economic.profitability,
              targetDifferencePercentagePoints: economic.difference,
            },
          });
          if (expected.decision === null) expect(actual.decision).toBeNull();
          else
            expect(actual.decision).toMatchObject({ code: expected.decision });
        }
      },
      async settle() {
        if (mode === 'queue' || mode === 'queue-exact') await leaveQueue();
        if (mode === 'away') {
          await browser.company('a');
          await browser.openRequest();
          mode = 'ready';
        }
        if (mode === 'uncertain') await retry();
        if (mode === 'stale') await reload();
        if (mode === 'draft' || !versions.length) {
          if (mode !== 'draft') await draft('a');
          await save(false);
        }
        await history(1);
      },
      async dispose() {
        page.off('request', observe);
        await removeRoute(page, '**/api/**', identify);
      },
      describe: () => ({
        opportunityId: source.opportunityId,
        versions,
        mode,
        selected,
        writes: writes.length,
      }),
    };
  },
};
