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
import { removeRoute } from './route-removal';
import { resolveMessage, formatMessage } from '../src/localization/messages';
import { estimateOfferMessages } from '../src/offer/offer-estimate.copy';
import { offerPreparationMessages } from '../src/offer/offer-preparation.copy';
import { profitabilityMessages } from '../src/profitability-estimate/profitability.copy';
import { commercialRequestMessages } from '../src/commercial-intake/commercial-request.copy';

type Values = { variant: 'a' | 'b'; locale: 'ro' | 'ru' };
type Sent = { body: string; key: string };
type Stored = { id: string; note: string };
type Mode = 'ready' | 'draft' | 'uncertain' | 'stale' | 'away';
export const offerOwnerSequenceAdapter: BrowserSequenceAdapter<
  'empty',
  Values
> = {
  caseId: 'offer-version-owner',
  initial: fc.constant('empty'),
  values: fc.record({
    variant: fc.constantFrom('a', 'b'),
    locale: fc.constantFrom('ro', 'ru'),
  }),
  async open({ page, info, trial }) {
    const source = await prepareCommercialOwnerSource(
      page,
      `${info.project.name}-${trial}-${randomUUID()}`,
      ['company-offer-preparer', 'company-profitability-contributor'],
    );
    const estimatePath = `/opportunities/${source.opportunityId}/profitability-estimates`;
    const estimate = await source.command(estimatePath, {
      expectedLatestVersionNumber: null,
      currency: 'EUR',
      executorType: 'PATENT_CONSULTANT',
      executorCost: '70.00',
      fiscalCost: '10.00',
      allocatedOverhead: '20.00',
      directCosts: [],
      targetProfitability: '20',
      proposedPrice: '125.00',
      pricingIntent: { kind: 'ORDINARY' },
      costConfirmation: true,
    });
    const estimateId = accessText(estimate.id);
    const decision = await source.command(
      `${estimatePath}/versions/${estimateId}/decision`,
      { expectedVersionNumber: 1, expectedDecision: null, code: 'APPROVE' },
      sequenceDirector,
    );
    expect(accessObject(decision.decision).code).toBe('APPROVE');
    const base = `/offers/opportunities/${source.opportunityId}`;
    const browser = commercialOwnerBrowser(
      page,
      info,
      source.companies,
      source.subject,
    );
    const panel = page.locator('.offer-panel:visible');
    const preparation = panel.locator('.estimate-offer-preparation');
    const copy = (key: (typeof estimateOfferMessages.keys)[number]) =>
      resolveMessage(estimateOfferMessages, browser.locale(), key);
    const word = (key: (typeof offerPreparationMessages.keys)[number]) =>
      resolveMessage(offerPreparationMessages, browser.locale(), key);
    const stored: Stored[] = [];
    const writes: Sent[] = [];
    let mode: Mode = 'ready';
    let literal = '';
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
    const body = () => ({
      ...(stored.length ? { expectedOfferRevision: stored.length } : {}),
      estimateVersionId: estimateId,
      estimateVersionNumber: 1,
      recipient: { kind: 'PRIMARY' },
      validityDays: 30,
      scopeNote: literal,
      commercialConditions: null,
    });
    async function draft(variant: Values['variant']) {
      if (mode === 'stale') await reload();
      if (!(await preparation.isVisible()))
        await panel
          .getByRole('button', { name: copy('prepare'), exact: true })
          .click();
      await preparation
        .getByLabel(copy('source'), { exact: true })
        .selectOption(estimateId);
      literal = `  Literal ${variant} Ș Я <b>001</b> 😀\n  scope  `;
      await preparation
        .getByRole('textbox', { name: word('scopeNote'), exact: true })
        .fill(literal);
      mode = 'draft';
    }
    async function submit(lost: boolean) {
      if (mode !== 'draft') throw new Error('Missing Offer draft');
      const intended = body();
      const endpoint =
        '/api' +
        base +
        (stored.length
          ? '/versions/from-approved-estimate'
          : '/from-approved-estimate');
      const before = writes.length;
      let receipt: Record<string, unknown> | undefined;
      const lose = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(response.status()).toBe(201);
        receipt = accessObject(await response.json());
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'The native Offer version committed, but its confirmation is deliberately lost.',
        });
        await route.fulfill({ status: 503, body: '{}' });
      };
      if (lost) await page.route('**' + endpoint, lose);
      const response = lost
        ? null
        : page.waitForResponse(
            (reply) =>
              reply.request().method() === 'POST' &&
              new URL(reply.url()).pathname === endpoint,
          );
      try {
        await preparation
          .getByRole('button', { name: copy('create'), exact: true })
          .click();
        if (response) {
          const result = await response;
          expect(result.status()).toBe(201);
          receipt = accessObject(await result.json());
        } else
          await expect(
            preparation.getByRole('button', {
              name: copy('retry'),
              exact: true,
            }),
          ).toBeVisible();
      } finally {
        if (lost) await removeRoute(page, '**' + endpoint, lose);
      }
      const sent = writes[before];
      if (!sent || !receipt)
        throw new Error('Missing actual Offer confirmation');
      expect(writes).toHaveLength(before + 1);
      expect(JSON.parse(sent.body)).toEqual(intended);
      expect(sent.key).toMatch(/^[0-9a-f-]{36}$/iu);
      const version = accessObject(receipt.version);
      expect(version.versionNumber).toBe(stored.length + 1);
      stored.push({ id: accessText(version.id), note: literal });
      uncertain = lost ? sent : undefined;
      mode = lost ? 'uncertain' : 'ready';
      if (!lost) await expect(preparation).toHaveCount(0);
    }
    async function retry() {
      if (!uncertain) throw new Error('Missing exact uncertain Offer command');
      const before = writes.length;
      const response = page.waitForResponse(
        (reply) =>
          reply.request().method() === 'POST' &&
          new URL(reply.url()).pathname.startsWith('/api' + base),
      );
      await preparation
        .getByRole('button', { name: copy('retry'), exact: true })
        .evaluate((button) => {
          if (!(button instanceof HTMLButtonElement))
            throw new Error('Expected retry button');
          button.click();
          button.click();
        });
      expect((await response).status()).toBe(201);
      await expect(preparation).toHaveCount(0);
      expect(writes).toHaveLength(before + 1);
      expect(writes[before]).toEqual(uncertain);
      uncertain = undefined;
      mode = 'ready';
    }
    async function reload() {
      if (await preparation.isVisible()) {
        await preparation
          .getByRole('button', {
            name: copy('cancel'),
            exact: true,
          })
          .click();
        await expect(preparation).toHaveCount(0);
      }
      const back = page
        .locator('.commercial-intake-workspace:visible')
        .getByRole('button', {
          name: resolveMessage(
            commercialRequestMessages,
            browser.locale(),
            'back',
          ),
          exact: true,
        });
      await expect(back).toBeVisible();
      await back.click();
      await browser.openRequest();
      const latest = stored.at(-1);
      if (!latest) throw new Error('Missing native Offer successor');
      await expect(panel.locator('.offer-summary')).toContainText(latest.note);
      mode = 'ready';
    }
    async function history() {
      const first = stored[0];
      if (!first) return;
      const history = panel.locator('.offer-version-history');
      const oldest = history.getByRole('button', {
        name: formatMessage(word('historyOpen'), { number: '1' }),
        exact: true,
      });
      await expect(oldest).toBeVisible();
      if (stored.length > 1) {
        await oldest.click();
        await expect(panel.locator('.offer-summary')).toContainText(first.note);
        const latest = history.getByRole('button', {
          name: formatMessage(word('historyOpen'), {
            number: String(stored.length),
          }),
          exact: true,
        });
        await latest.click();
        await expect(oldest).toBeEnabled();
      }
    }
    async function stale() {
      await draft('b');
      const receipt = await source.command(
        base + '/versions/from-approved-estimate',
        { ...body(), scopeNote: 'Independent native successor Ș Я' },
      );
      stored.push({
        id: accessText(accessObject(receipt.version).id),
        note: 'Independent native successor Ș Я',
      });
      const pattern = '**/api' + base + '/versions/from-approved-estimate';
      const conflict = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(response.status()).toBe(409);
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'A native concurrent successor invalidates this observed Offer revision.',
        });
        await route.fulfill({ response });
      };
      await page.route(pattern, conflict);
      try {
        await preparation
          .getByRole('button', { name: copy('create'), exact: true })
          .click();
        await expect(
          preparation.getByText(copy('stale'), { exact: true }),
        ).toBeVisible();
        mode = 'stale';
      } finally {
        await removeRoute(page, pattern, conflict);
      }
    }
    async function retireSourceDenial() {
      await replaceScopeBeforeFinancialReply({
        page,
        path: estimatePath + '/versions/' + estimateId,
        identity: accessIdentities.member,
        reply: {
          kind: 'denied',
          revoke: () =>
            source
              .revoke('company-profitability-contributor', 'a')
              .then(() => undefined),
          restore: () =>
            source
              .grant('company-profitability-contributor', 'a')
              .then(() => undefined),
        },
        start: () =>
          panel
            .locator('.offer-estimate-source')
            .getByRole('button', { name: copy('sourceDetails'), exact: true })
            .click(),
        replace: () => browser.company('b'),
      });
      mode = 'away';
    }
    async function retireCurrentSourceGrant() {
      let revoked = false;
      try {
        await replaceScopeBeforeFinancialReply({
          page,
          path: estimatePath + '/versions/' + estimateId,
          identity: accessIdentities.member,
          reply: { kind: 'authorized' },
          start: () =>
            panel
              .locator('.offer-estimate-source')
              .getByRole('button', {
                name: copy('sourceDetails'),
                exact: true,
              })
              .click(),
          replace: async () => {
            revoked = true;
            await source.revoke('company-profitability-contributor', 'a');
            await publishNativeGrantLoss({
              page,
              path: estimatePath,
              method: 'GET',
              companyId: source.companies.a.id,
              absentBundles: ['company_profitability_contributor'],
              start: () =>
                page
                  .locator(
                    '.commercial-intake-workspace:visible .profitability-estimate',
                  )
                  .getByRole('button', {
                    name: resolveMessage(
                      profitabilityMessages,
                      browser.locale(),
                      'reload',
                    ),
                    exact: true,
                  })
                  .click(),
            });
            await expect(panel.locator('.offer-estimate-source')).toHaveCount(
              0,
            );
            await expect(panel.locator('.offer-summary')).toBeVisible();
          },
        });
        await expect(panel.locator('.offer-estimate-source')).toHaveCount(0);
        await expect(panel.locator('.offer-summary')).toBeVisible();
      } finally {
        if (revoked)
          await source.grant('company-profitability-contributor', 'a');
      }
      await browser.company('b');
      mode = 'away';
    }
    async function independentSourceWrite() {
      let captured: (() => void) | undefined;
      let release: (() => void) | undefined;
      const observed = new Promise<void>((resolve) => {
        captured = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const pattern = '**/api' + estimatePath + '/versions/' + estimateId;
      let first = true;
      const hold = async (route: Route) => {
        if (route.request().method() !== 'GET' || !first)
          return route.fallback();
        first = false;
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...accessIdentities.member },
        });
        expect(response.status()).toBe(200);
        captured?.();
        await gate;
        await route.fulfill({ response });
      };
      await page.route(pattern, hold);
      try {
        await panel
          .locator('.offer-estimate-source')
          .getByRole('button', { name: copy('sourceDetails'), exact: true })
          .click();
        await observed;
        await draft('a');
        await submit(false);
      } finally {
        release?.();
        await removeRoute(page, pattern, hold);
      }
    }
    try {
      await page.goto('/#requests');
      await browser.open();
      await expect(
        panel.getByRole('button', { name: copy('prepare'), exact: true }),
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
              label: 'retry-exact-offer-command-with-double-admission',
              run: retry,
            },
          ];
        if (mode === 'stale')
          return [{ label: 'recover-current-native-offer', run: reload }];
        if (mode === 'away')
          return [
            {
              label: 'return-to-native-offer-company',
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
                  preparation.getByRole('textbox', {
                    name: word('scopeNote'),
                    exact: true,
                  }),
                ).toHaveValue(literal);
            },
          },
          {
            label: 'leave-native-offer-company',
            run: async () => {
              await browser.company('b');
              mode = 'away';
            },
          },
          {
            label: 'edit-literal-native-offer',
            run: () => draft(value.variant),
          },
        ];
        if (mode === 'draft')
          actions.push(
            { label: 'create-native-offer-version', run: () => submit(false) },
            {
              label: 'lose-committed-native-offer-receipt',
              run: () => submit(true),
            },
          );
        else if (stored.length)
          actions.push(
            { label: 'reopen-native-offer-history', run: history },
            { label: 'native-stale-offer-revision', run: stale },
            {
              label: 'write-during-independent-native-estimate-read',
              run: independentSourceWrite,
            },
          );
        if (mode === 'ready' && stored.length)
          actions.push(
            {
              label: 'retire-native-source-denial-before-company-recovery',
              run: retireSourceDenial,
            },
            {
              label: 'retire-native-source-grant-in-current-company',
              run: retireCurrentSourceGrant,
            },
          );
        return actions;
      },
      async verify() {
        if (mode === 'away') await expect(panel).not.toBeVisible();
        const current = await source.read(base);
        if (!stored.length) {
          expect(current.offer).toBeNull();
          return;
        }
        const offer = accessObject(current.offer);
        expect(offer.revision).toBe(stored.length);
        const history = await source.read(base + '/versions');
        expect(history.versions).toBeInstanceOf(Array);
        if (!Array.isArray(history.versions))
          throw new Error('Missing native Offer history');
        expect(history.versions).toHaveLength(stored.length);
        const exact = await Promise.all(
          stored.map((version) =>
            source.read(base + '/versions/' + version.id),
          ),
        );
        for (let i = 0; i < stored.length; i++) {
          const expected = stored[i];
          if (!expected)
            throw new Error('Missing independent Offer expectation');
          const version = accessObject(accessObject(exact[i]?.offer).version);
          expect(version).toMatchObject({
            id: expected.id,
            versionNumber: i + 1,
            scopeNote: expected.note,
            validityDays: 30,
            provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT',
            recipient: {
              kind: 'PRIMARY',
              legalName: source.clientName,
              taxId: source.taxId,
              legalAddress: '42 Fictional Street',
            },
            priceSource: {
              estimateVersionId: estimateId,
              estimateVersionNumber: 1,
              amount: '125.00',
              currency: 'EUR',
            },
          });
        }
        if (mode === 'draft' || mode === 'uncertain')
          await expect(
            preparation.getByRole('textbox', {
              name: word('scopeNote'),
              exact: true,
            }),
          ).toHaveValue(literal);
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
          if (mode !== 'draft') await draft('a');
          await submit(false);
        }
        await history();
      },
      async dispose() {
        page.off('request', observe);
        await removeRoute(page, '**/api/**', identify);
      },
      describe: () => ({
        opportunityId: source.opportunityId,
        versions: stored,
        mode,
        writes: writes.length,
      }),
    };
  },
};
