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
import { preparePricingOwnerSource } from './pricing-owner-sequence-source.fixture';
import { commercialOwnerBrowser } from './commercial-owner-browser.fixture';
import {
  accessIdentities,
  accessObject,
  accessText,
} from './access-sequence-source.fixture';
import { removeRoute } from './route-removal';
import { resolveMessage } from '../src/localization/messages';
import { pricingConfigurationMessages } from '../src/pricing-configuration/pricing-configuration.copy';
import { pricingSnapshotMessages } from '../src/pricing-configuration/pricing-snapshot.copy';

type Values = { quantity: '1' | '3'; locale: 'ro' | 'ru' };
type Sent = { body: string; key: string };
type Stored = { id: string; quantity: Values['quantity']; rule: number };
const amounts = {
  '1': { subtotal: '100.01', taxTotal: '20.00', total: '120.01' },
  '3': { subtotal: '300.03', taxTotal: '60.01', total: '360.04' },
};
export const pricingOwnerSequenceAdapter: BrowserSequenceAdapter<
  'empty',
  Values
> = {
  caseId: 'pricing-snapshot-owner',
  initial: fc.constant('empty'),
  values: fc.record({
    quantity: fc.constantFrom('1', '3'),
    locale: fc.constantFrom('ro', 'ru'),
  }),
  async open({ page, info, trial }) {
    const source = await preparePricingOwnerSource(
      page,
      `${info.project.name}-${trial}-${randomUUID()}`,
    );
    const browser = commercialOwnerBrowser(
      page,
      info,
      source.companies,
      source.subject,
    );
    const panel = page.locator('.pricing-snapshot-panel:visible');
    const copy = (key: (typeof pricingSnapshotMessages.keys)[number]) =>
      resolveMessage(pricingSnapshotMessages, browser.locale(), key);
    const ruleCopy = (
      key: (typeof pricingConfigurationMessages.keys)[number],
    ) => resolveMessage(pricingConfigurationMessages, browser.locale(), key);
    const base = `/pricing/opportunities/${source.opportunityId}/snapshots`;
    const writes: Sent[] = [];
    const stored: Stored[] = [];
    let rule = 1;
    let quantity: Values['quantity'] = '1';
    let mode: 'ready' | 'draft' | 'uncertain' | 'stale' | 'away' = 'ready';
    let uncertain: Sent | undefined;
    const identify = (route: Route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...accessIdentities.member },
      });
    const observe = (request: Request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api' + base
      )
        writes.push({
          body: request.postData() ?? '',
          key: request.headers()['idempotency-key'] ?? '',
        });
    };
    await page.route('**/api/**', identify);
    page.on('request', observe);
    async function draft(value: Values['quantity']) {
      quantity = value;
      await panel
        .getByRole('checkbox', { name: source.offeringName, exact: true })
        .check();
      await panel.getByLabel(copy('quantity'), { exact: true }).fill(value);
      mode = 'draft';
    }
    async function calculate(lost: boolean) {
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
            'The native immutable monetary Snapshot committed; its receipt is deliberately lost.',
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
          .getByRole('button', { name: copy('calculate'), exact: true })
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
        throw new Error('Missing actual monetary Snapshot receipt');
      expect(writes).toHaveLength(before + 1);
      expect(JSON.parse(sent.body)).toEqual({
        pricingRuleVersionNumber: rule,
        lines: [
          { offeringId: source.offeringId, tariffVersionNumber: 1, quantity },
        ],
      });
      expect(sent.key).toMatch(/^[0-9a-f-]{36}$/iu);
      stored.push({ id: accessText(receipt.id), quantity, rule });
      uncertain = lost ? sent : undefined;
      mode = lost ? 'uncertain' : 'ready';
      if (!lost)
        await expect(
          panel.getByRole('button', { name: copy('calculate'), exact: true }),
        ).toBeEnabled();
    }
    async function retry() {
      if (!uncertain) throw new Error('Missing exact monetary retry intention');
      const before = writes.length;
      const response = page.waitForResponse(
        (reply) =>
          reply.request().method() === 'POST' &&
          new URL(reply.url()).pathname === '/api' + base,
      );
      await panel
        .getByRole('button', { name: copy('retry'), exact: true })
        .evaluate((button) => {
          if (!(button instanceof HTMLButtonElement))
            throw new Error('Expected Snapshot retry');
          button.click();
          button.click();
        });
      expect((await response).status()).toBe(201);
      await expect(
        panel.getByRole('button', { name: copy('calculate'), exact: true }),
      ).toBeEnabled();
      expect(writes).toHaveLength(before + 1);
      expect(writes[before]).toEqual(uncertain);
      uncertain = undefined;
      mode = 'ready';
    }
    async function history() {
      if (!stored.length) return;
      const expected = stored[0];
      if (!expected) throw new Error('Missing independent monetary history');
      const control = panel
        .getByRole('button', {
          name: new RegExp(
            '^' + copy('reopen').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') + ':',
          ),
        })
        .last();
      await control.click();
      await expect(panel.locator('.pricing-snapshot-detail')).toContainText(
        amounts[expected.quantity].total.replace(
          '.',
          browser.locale() === 'en' ? '.' : ',',
        ),
      );
    }
    async function retireSnapshotDenial() {
      const snapshot = stored[0];
      if (!snapshot)
        throw new Error('Missing exact immutable Snapshot to reopen');
      await replaceScopeBeforeFinancialReply({
        page,
        path: base + '/' + snapshot.id,
        identity: accessIdentities.member,
        reply: {
          kind: 'denied',
          revoke: () =>
            source.revoke('company-pricing-user', 'a').then(() => undefined),
          restore: () =>
            source.grant('company-pricing-user', 'a').then(() => undefined),
        },
        start: () =>
          panel
            .locator('.pricing-snapshot-history')
            .getByRole('button')
            .last()
            .click(),
        replace: () => browser.company('b'),
      });
      mode = 'away';
    }
    async function stale() {
      await draft('3');
      await browser.navigate('#pricing');
      const configuration = page.locator('.pricing-configuration:visible');
      const label = `Literal native Rule ${rule + 1} Ș Я`;
      await configuration
        .getByLabel(ruleCopy('label'), { exact: true })
        .fill(label);
      const instant = Date.now() + 4_000;
      const local = await page.evaluate((epoch) => {
        const date = new Date(epoch);
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      }, instant);
      await configuration
        .locator('input[type="datetime-local"]')
        .first()
        .fill(local);
      const confirmation = page.waitForResponse(
        (reply) =>
          reply.request().method() === 'POST' &&
          new URL(reply.url()).pathname ===
            '/api/pricing-configuration/rule-versions',
      );
      await configuration
        .getByRole('button', { name: ruleCopy('publish'), exact: true })
        .click();
      const published = await confirmation;
      expect(published.status()).toBe(201);
      const command: unknown = published.request().postDataJSON();
      expect(command).toMatchObject({
        label,
        expectedActiveVersionNumber: rule,
      });
      await expect
        .poll(
          async () =>
            accessObject(
              (await source.read('/pricing-configuration/rule-scope')).current,
            ).versionNumber,
        )
        .toBe(rule + 1);
      await browser.openRequest();
      await expect(
        panel.getByLabel(copy('quantity'), { exact: true }),
      ).toHaveValue('3');
      const pattern = '**/api' + base;
      const conflict = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const reply = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(reply.status()).toBe(409);
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'A native effective Rule successor invalidates this observed pricing intention.',
        });
        await route.fulfill({ response: reply });
      };
      await page.route(pattern, conflict);
      try {
        await panel
          .getByRole('button', { name: copy('calculate'), exact: true })
          .click();
        await expect(
          panel.getByText(copy('stale'), { exact: true }),
        ).toBeVisible();
        rule++;
        mode = 'stale';
      } finally {
        await removeRoute(page, pattern, conflict);
      }
    }
    async function retireCurrentPricingGrant() {
      const snapshot = stored[0];
      if (!snapshot) throw new Error('Missing exact immutable Snapshot');
      const oldest = panel
        .locator('.pricing-snapshot-history')
        .getByRole('button')
        .last();
      await expect(oldest).toBeVisible();
      await expect(oldest).toBeEnabled();
      let revoked = false;
      const calculate = page
        .locator('.pricing-snapshot-panel')
        .getByRole('button', {
          name: copy('calculate'),
          exact: true,
          includeHidden: true,
        });
      try {
        await replaceScopeBeforeFinancialReply({
          page,
          path: base + '/' + snapshot.id,
          identity: accessIdentities.member,
          reply: { kind: 'authorized' },
          start: () => oldest.click(),
          replace: async () => {
            revoked = true;
            await source.revoke('company-pricing-user', 'a');
            await source.revoke('company-pricing-configuration', 'a');
            await browser.navigate('#pricing');
            await publishNativeGrantLoss({
              page,
              path: '/pricing-configuration/rule-scope',
              method: 'GET',
              companyId: source.companies.a.id,
              absentBundles: [
                'company_pricing_user',
                'company_pricing_configuration',
              ],
              start: async () => {
                const reload = page
                  .locator('.pricing-configuration')
                  .getByRole('button', {
                    name: ruleCopy('reload'),
                    exact: true,
                  });
                await expect(reload).toBeVisible();
                await expect(reload).toBeEnabled();
                await reload.click();
              },
            });
            // Request source stays mounted behind the Pricing frame. Hidden controls
            // must be removed by revoked authority, not merely hidden by navigation.
            await expect(calculate).toHaveCount(0);
          },
        });
        await expect(calculate).toHaveCount(0);
      } finally {
        if (revoked) {
          await source.grant('company-pricing-user', 'a');
          await source.grant('company-pricing-configuration', 'a');
        }
      }
      await browser.company('b');
      mode = 'away';
    }
    async function reload() {
      await panel
        .getByRole('button', { name: copy('reload'), exact: true })
        .click();
      await expect(
        panel.getByRole('button', { name: copy('calculate'), exact: true }),
      ).toBeEnabled();
      mode = 'ready';
    }
    try {
      await page.goto('/#requests');
      await browser.open();
      await expect(
        panel.getByRole('button', { name: copy('calculate'), exact: true }),
      ).toBeVisible();
    } catch (error) {
      page.off('request', observe);
      await removeRoute(page, '**/api/**', identify);
      throw error;
    }
    return {
      actions(value) {
        if (mode === 'uncertain')
          return [
            {
              label: 'retry-exact-monetary-snapshot-double-admission',
              run: retry,
            },
          ];
        if (mode === 'stale')
          return [{ label: 'recover-native-effective-pricing', run: reload }];
        if (mode === 'away')
          return [
            {
              label: 'return-to-native-pricing-company',
              run: async () => {
                await browser.company('a');
                await browser.openRequest();
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
                  panel.getByLabel(copy('quantity'), { exact: true }),
                ).toHaveValue(quantity);
            },
          },
          {
            label: 'edit-literal-priced-quantity',
            run: () => draft(value.quantity),
          },
          {
            label: 'leave-native-pricing-company',
            run: async () => {
              await browser.company('b');
              mode = 'away';
            },
          },
        ];
        if (mode === 'draft')
          actions.push(
            {
              label: 'calculate-native-monetary-snapshot',
              run: () => calculate(false),
            },
            {
              label: 'lose-committed-monetary-receipt',
              run: () => calculate(true),
            },
          );
        else if (stored.length)
          actions.push(
            { label: 'reopen-exact-monetary-history', run: history },
            { label: 'conflict-with-native-effective-rule', run: stale },
          );
        if (mode === 'ready' && stored.length)
          actions.push(
            {
              label: 'retire-native-pricing-denial-before-company-recovery',
              run: retireSnapshotDenial,
            },
            {
              label: 'retire-native-pricing-grant-in-current-company',
              run: retireCurrentPricingGrant,
            },
          );
        return actions;
      },
      async verify() {
        if (mode === 'away') await expect(panel).not.toBeVisible();
        const history = await source.read(base);
        if (!Array.isArray(history.items))
          throw new Error('Missing native Pricing Snapshot history');
        expect(history.items).toHaveLength(stored.length);
        const exact = await Promise.all(
          stored.map((snapshot) => source.read(base + '/' + snapshot.id)),
        );
        for (let i = 0; i < stored.length; i++) {
          const expected = stored[i];
          if (!expected)
            throw new Error('Missing independent monetary expectation');
          expect(exact[i]).toMatchObject({
            id: expected.id,
            opportunityId: source.opportunityId,
            clientRequestId: source.requestId,
            calculatedByWorkspaceMembershipId: source.membershipId,
            currency: 'EUR',
            ...amounts[expected.quantity],
            pricingRuleVersion: { versionNumber: expected.rule },
          });
          const lines = accessObject(exact[i]).lines;
          if (!Array.isArray(lines))
            throw new Error('Missing preserved monetary line');
          expect(lines).toHaveLength(1);
          expect(lines[0]).toMatchObject({
            offeringId: source.offeringId,
            tariffVersionNumber: 1,
            quantity: expected.quantity,
            unitAmount: '100.0100',
            taxRatePercent: '20.00',
          });
        }
      },
      async settle() {
        if (mode === 'away') {
          await browser.company('a');
          await browser.openRequest();
          mode = 'ready';
        }
        if (mode === 'uncertain') await retry();
        if (mode === 'stale') await reload();
        if (!stored.length || mode === 'draft') {
          if (mode !== 'draft') await draft('3');
          await calculate(false);
        }
        await history();
      },
      async dispose() {
        page.off('request', observe);
        await removeRoute(page, '**/api/**', identify);
      },
      describe: () => ({
        opportunityId: source.opportunityId,
        stored,
        mode,
        rule,
        writes: writes.length,
      }),
    };
  },
};
