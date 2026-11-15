import * as fc from 'fast-check';
import type { Route } from '@playwright/test';
import { expect, expectApiFailure } from './ui-chaos.fixture';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import { prepareInvoiceSequenceSource } from './invoice-sequence-source.fixture';
import {
  modelContractIdentities,
  object,
  text,
} from './external-invoice-source.acceptance.fixture';
import { selectOption } from './select-option';
import { removeRoute } from './route-removal';
import { replaceScopeBeforeFinancialReply } from './financial-held-read.fixture';
import { randomUUID } from 'node:crypto';
import { invoiceApiOrigin } from './external-invoice-source.acceptance.fixture';
import { invoiceRecordMessages } from '../src/invoice-record/invoice-record-copy';
import { sourceKey } from '../src/invoice-record/invoice-record-contract';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import { resolveMessage } from '../src/localization/messages';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import { companyContextMessages } from '../src/company/company-context.copy';

type Amount = { draft: string; minor: string };
type Values = { locale: InterfaceLocale; amount: Amount };
type Root = {
  id: string;
  revision: number;
  entryState: 'RECORDED' | 'WITHDRAWN';
  amount: Amount;
};
type State =
  | { kind: 'inventory'; root: Root | null }
  | { kind: 'draft'; amount: Amount }
  | {
      kind: 'uncertain';
      root: Root;
      receipt: unknown;
      original: { body: string; key: string };
    }
  | { kind: 'detail' | 'saved'; root: Root };
const system = '  Manual process <literal> Ș Ю é  ';
const reference = '  SYN-GENERATED-1047 Ș Ю  ';

export const invoiceSequenceAdapter: BrowserSequenceAdapter<
  'empty' | 'recorded',
  Values
> = {
  caseId: 'invoice-record',
  initial: fc.constantFrom('empty', 'recorded'),
  values: fc.record({
    locale: fc.constantFrom<InterfaceLocale>('en', 'ro', 'ru', 'fr'),
    amount: fc.constantFrom(
      { draft: '1255.00', minor: '125500' },
      { draft: '42.50', minor: '4250' },
      { draft: '999.99', minor: '99999' },
    ),
  }),
  async open({ page, info, trial, initial }) {
    const ready = await prepareInvoiceSequenceSource(
      page,
      `Generated-${info.project.name}-${trial}`,
    );
    const initialAmount = { draft: '1255.00', minor: '125500' };
    const seeded: Root | null =
      initial === 'recorded'
        ? {
            id: text(
              (
                await ready.command(
                  '/invoice-records',
                  {
                    source: ready.source,
                    values: {
                      externalSystem: system,
                      externalNumber: reference,
                      issuedOn: '2026-01-15',
                      dueOn: null,
                      currency: 'MDL',
                      grossMinor: initialAmount.minor,
                      netMinor: '0',
                      taxMinor: null,
                    },
                    acknowledgeExternalDeclaration: true,
                    replacesWithdrawnRecordId: null,
                  },
                  modelContractIdentities.preparer,
                  ready.companyId,
                )
              ).recordId,
            ),
            revision: 1,
            entryState: 'RECORDED',
            amount: initialAmount,
          }
        : null;
    const identify = (route: Route) =>
      route.fallback({
        headers: {
          ...route.request().headers(),
          ...modelContractIdentities.preparer,
        },
      });
    await page.route('**/api/**', identify);
    let locale: InterfaceLocale = 'en';
    const narrow = info.project.name.endsWith('narrow');
    async function company(id: string) {
      await expect(page.getByRole('banner')).toBeVisible();
      if (narrow)
        await page
          .getByRole('button', {
            name: resolveMessage(prismeMessages, locale, 'openNavigation'),
            exact: true,
          })
          .click();
      await selectOption(
        page.getByRole('combobox', {
          name: resolveMessage(companyContextMessages, locale, 'activeCompany'),
          exact: true,
        }),
        { value: id },
      );
      if (narrow)
        await page
          .getByRole('button', {
            name: resolveMessage(prismeMessages, locale, 'closeNavigation'),
            exact: true,
          })
          .click();
    }
    await page.goto('/#invoice-records');
    try {
      await company(ready.companyId);
      await page.goto('/#invoice-records');
      await expect(page.locator('.invoice-record-workspace')).toBeVisible();
      if (seeded)
        await page
          .locator('.invoice-record-row')
          .filter({ hasText: reference })
          .click();
    } catch (error) {
      await removeRoute(page, '**/api/**', identify);
      throw error;
    }
    const workspace = page.locator('.invoice-record-workspace');
    const form = workspace.locator('.invoice-record-editor');
    let state: State = seeded
      ? { kind: 'detail', root: seeded }
      : { kind: 'inventory', root: null };
    const sent: { body: string; key: string }[] = [];
    const observe = (request: import('@playwright/test').Request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/api/invoice-records')
      )
        sent.push({
          body: request.postData() ?? '',
          key: request.headers()['idempotency-key'] ?? '',
        });
    };
    page.on('request', observe);
    let drop: ((route: Route) => Promise<void>) | undefined;
    let refuseRead: ((route: Route) => Promise<void>) | undefined;
    let readPattern = '';
    return {
      actions(value) {
        const current = state;
        const copy = invoiceRecordMessages[locale];
        const nextLocale =
          value.locale === locale
            ? locale === 'en'
              ? 'fr'
              : 'en'
            : value.locale;
        const actions: BrowserAction[] = [
          {
            label: `locale:${nextLocale}`,
            async run() {
              await selectOption(page.locator('#interface-locale'), {
                value: nextLocale,
              });
              locale = nextLocale;
            },
          },
        ];
        if (current.kind === 'inventory') {
          if (current.root) {
            const root = current.root;
            actions.push({
              label: 'open-recorded-invoice',
              async run() {
                await workspace
                  .locator('.invoice-record-row')
                  .filter({ hasText: reference })
                  .click();
                state = { kind: 'detail', root };
              },
            });
          } else
            actions.push({
              label: 'start-literal-invoice',
              async run() {
                await workspace
                  .getByRole('button', { name: copy.create, exact: true })
                  .click();
                await selectOption(
                  form.getByLabel(copy.chooseSource, { exact: true }),
                  { value: sourceKey(ready.source) },
                );
                await form
                  .getByLabel(copy.system, { exact: true })
                  .fill(system);
                await form
                  .getByLabel(copy.number, { exact: true })
                  .fill(reference);
                await form
                  .getByLabel(copy.issued, { exact: true })
                  .fill('2026-01-15');
                await selectOption(
                  form.getByLabel(copy.currency, { exact: true }),
                  { value: 'MDL' },
                );
                await form
                  .getByLabel(copy.gross, { exact: true })
                  .fill(value.amount.draft);
                await form.getByLabel(copy.net, { exact: true }).fill('0');
                await form
                  .getByLabel(copy.acknowledge, { exact: true })
                  .check();
                state = { kind: 'draft', amount: value.amount };
              },
            });
        }
        if (current.kind === 'draft')
          actions.push(
            {
              label: 'edit-literal-gross',
              async run() {
                await form
                  .getByLabel(copy.gross, { exact: true })
                  .fill(value.amount.draft);
                state = { kind: 'draft', amount: value.amount };
              },
            },
            {
              label: 'cancel-unsubmitted-invoice',
              async run() {
                await form
                  .getByRole('button', { name: copy.cancel, exact: true })
                  .click();
                state = { kind: 'inventory', root: null };
              },
            },
            {
              label: 'commit-invoice-and-lose-reply',
              async run() {
                let receipt: unknown;
                let dropped = false;
                drop = async (route) => {
                  if (route.request().method() !== 'POST' || dropped)
                    return route.fallback();
                  dropped = true;
                  const response = await route.fetch({
                    headers: {
                      ...route.request().headers(),
                      ...modelContractIdentities.preparer,
                    },
                  });
                  expect(response.status()).toBe(201);
                  receipt = await response.json();
                  expectApiFailure({
                    page,
                    request: route.request(),
                    reason:
                      'Native Invoice committed before its generated reply loss.',
                  });
                  await route.abort('connectionfailed');
                };
                await page.route('**/api/invoice-records', drop);
                await form
                  .getByRole('button', { name: copy.save, exact: true })
                  .click();
                await expect(form.getByRole('alert')).toHaveText(
                  copy.uncertain,
                );
                const original = sent[0];
                if (!original)
                  throw new Error('No native Invoice create request observed.');
                expect(sent).toHaveLength(1);
                state = {
                  kind: 'uncertain',
                  root: {
                    id: text(object(receipt).recordId),
                    revision: 1,
                    entryState: 'RECORDED',
                    amount: current.amount,
                  },
                  original,
                  receipt,
                };
              },
            },
          );
        if (current.kind === 'uncertain')
          actions.push({
            label: 'retry-identical-invoice-with-double-click',
            async run() {
              if (!drop) throw new Error('No retained reply-loss route.');
              await removeRoute(page, '**/api/invoice-records', drop);
              drop = undefined;
              const replay = page.waitForResponse(
                (response) =>
                  response.request().method() === 'POST' &&
                  new URL(response.url()).pathname === '/api/invoice-records',
              );
              await form
                .getByRole('button', { name: copy.retryCommand, exact: true })
                .evaluate((button) => {
                  if (!(button instanceof HTMLButtonElement))
                    throw new Error('Expected Invoice retry button.');
                  button.click();
                  button.click();
                });
              expect(await (await replay).json()).toEqual(current.receipt);
              await expect(form).toHaveCount(0);
              expect(sent).toHaveLength(2);
              expect(sent[1]).toEqual(current.original);
              state = { kind: 'detail', root: current.root };
            },
          });
        if (current.kind === 'detail') {
          const root = current.root;
          for (const reply of ['authorized', 'denied'] as const)
            actions.push({
              label: `company-roundtrip-with-late-${reply}-invoice-read`,
              async run() {
                await replaceScopeBeforeFinancialReply({
                  page,
                  path: '/invoice-records/' + root.id,
                  identity: modelContractIdentities.preparer,
                  reply:
                    reply === 'authorized'
                      ? { kind: 'authorized' }
                      : {
                          kind: 'denied',
                          async revoke() {
                            const response = await page.request.delete(
                              `${invoiceApiOrigin}/company-invoice-recorder-assignments/${ready.preparerId}/${ready.companyId}`,
                              {
                                headers: {
                                  ...modelContractIdentities.owner,
                                  'idempotency-key': randomUUID(),
                                },
                              },
                            );
                            expect(response.status()).toBe(200);
                          },
                          async restore() {
                            await ready.command(
                              '/company-invoice-recorder-assignments',
                              {
                                companyId: ready.companyId,
                                workspaceMembershipId: ready.preparerId,
                              },
                            );
                          },
                        },
                  start: async () => {
                    await workspace
                      .getByRole('button', { name: copy.reload, exact: true })
                      .click();
                  },
                  async replace() {
                    await page.goto('/#clients');
                    await expect(
                      page
                        .locator('.client-workspace')
                        .getByText(ready.clientName, { exact: true })
                        .first(),
                    ).toBeVisible();
                    await company(ready.otherCompanyId);
                    await expect(workspace).toHaveCount(0);
                    await company(ready.companyId);
                    await page.goto('/#invoice-records');
                    await expect(workspace).toBeVisible();
                    state = { kind: 'inventory', root };
                  },
                });
              },
            });
          actions.push({
            label: 'back-to-invoice-inventory',
            async run() {
              await workspace
                .getByRole('button', { name: copy.back, exact: true })
                .click();
              state = { kind: 'inventory', root: current.root };
            },
          });
          if (current.root.entryState === 'RECORDED') {
            const root = current.root;
            actions.push({
              label: 'correct-invoice-with-failed-refresh',
              async run() {
                await workspace
                  .getByRole('button', { name: copy.correct, exact: true })
                  .click();
                const amount =
                  value.amount.minor === root.amount.minor
                    ? { draft: '77.00', minor: '7700' }
                    : value.amount;
                await form
                  .getByLabel(copy.gross, { exact: true })
                  .fill(amount.draft);
                await form
                  .getByLabel(copy.reason, { exact: true })
                  .fill('  Literal generated correction Ș Ю é  ');
                readPattern = `**/api/invoice-records/${root.id}`;
                refuseRead = async (route) => {
                  if (route.request().method() !== 'GET')
                    return route.fallback();
                  expectApiFailure({
                    page,
                    request: route.request(),
                    reason:
                      'Only the independent Invoice read fails after a native correction.',
                  });
                  await route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: '{}',
                  });
                };
                await page.route(readPattern, refuseRead);
                const count = sent.length;
                const saved = page.waitForResponse(
                  (response) =>
                    response.request().method() === 'POST' &&
                    new URL(response.url()).pathname ===
                      `/api/invoice-records/${root.id}/commands`,
                );
                await form
                  .getByRole('button', {
                    name: copy.saveCorrection,
                    exact: true,
                  })
                  .click();
                expect((await saved).status()).toBe(201);
                await expect(workspace.getByRole('alert')).toContainText(
                  copy.refreshFailed,
                );
                expect(sent).toHaveLength(count + 1);
                state = {
                  kind: 'saved',
                  root: { ...root, revision: root.revision + 1, amount },
                };
              },
            });
            actions.push({
              label: 'withdraw-invoice-entry',
              async run() {
                await workspace
                  .getByRole('button', { name: copy.withdraw, exact: true })
                  .click();
                await form
                  .getByLabel(copy.reason, { exact: true })
                  .fill('  Withdraw only the PRISMA entry Ș Ю é  ');
                const saved = page.waitForResponse(
                  (response) =>
                    response.request().method() === 'POST' &&
                    new URL(response.url()).pathname ===
                      `/api/invoice-records/${root.id}/commands`,
                );
                await form
                  .getByRole('button', {
                    name: copy.confirmWithdraw,
                    exact: true,
                  })
                  .click();
                expect((await saved).status()).toBe(201);
                await expect(form).toHaveCount(0);
                state = {
                  kind: 'detail',
                  root: {
                    ...root,
                    revision: root.revision + 1,
                    entryState: 'WITHDRAWN',
                  },
                };
              },
            });
          }
        }
        if (current.kind === 'saved')
          actions.push({
            label: 'retry-only-invoice-read',
            async run() {
              if (!refuseRead)
                throw new Error('No failed Invoice read control.');
              await removeRoute(page, readPattern, refuseRead);
              refuseRead = undefined;
              const count = sent.length;
              await workspace
                .getByRole('button', { name: copy.retry, exact: true })
                .click();
              await expect(
                workspace.getByRole('button', {
                  name: copy.correct,
                  exact: true,
                }),
              ).toBeVisible();
              expect(sent).toHaveLength(count);
              state = { kind: 'detail', root: current.root };
            },
          });
        return actions;
      },
      async verify() {
        const copy = invoiceRecordMessages[locale];
        const root =
          state.kind === 'draft'
            ? null
            : state.kind === 'inventory'
              ? state.root
              : state.root;
        await expect(workspace).toBeVisible();
        await expect(workspace).toContainText(ready.companyName);
        if (state.kind === 'draft' || state.kind === 'uncertain') {
          await expect(
            form.getByLabel(copy.system, { exact: true }),
          ).toHaveValue(system);
          await expect(
            form.getByLabel(copy.number, { exact: true }),
          ).toHaveValue(reference);
          await expect(
            form.getByLabel(copy.gross, { exact: true }),
          ).toHaveValue(
            state.kind === 'draft'
              ? state.amount.draft
              : state.root.amount.draft,
          );
          await expect(form.getByLabel(copy.net, { exact: true })).toHaveValue(
            '0',
          );
          await expect(form.getByLabel(copy.tax, { exact: true })).toHaveValue(
            '',
          );
          if (state.kind === 'uncertain')
            await expect(form.getByRole('alert')).toHaveText(copy.uncertain);
        } else await expect(form).toHaveCount(0);
        if (state.kind === 'saved') {
          await expect(workspace.getByRole('alert')).toContainText(
            copy.refreshFailed,
          );
          await expect(
            workspace.getByRole('button', { name: copy.correct, exact: true }),
          ).toHaveCount(0);
        }
        if (state.kind === 'inventory') {
          await expect(workspace.locator('.invoice-record-row')).toHaveCount(
            state.root ? 1 : 0,
          );
          await expect(workspace.locator('.invoice-record-detail')).toHaveCount(
            0,
          );
        }
        if (state.kind === 'detail') {
          await expect(
            workspace.getByRole('heading', {
              name: reference.trim(),
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            workspace.locator('.invoice-record-detail > header'),
          ).toContainText(
            (state.root.entryState === 'RECORDED'
              ? copy.recorded
              : copy.withdrawn) +
              ' · ' +
              copy.revision +
              ' ' +
              state.root.revision,
          );
          await expect(
            workspace
              .locator('.invoice-record-detail > .invoice-record-facts')
              .filter({ has: page.getByText(copy.system, { exact: true }) }),
          ).toContainText(system.trim());
        }
        const inventory = await ready.read('/invoice-records', ready.companyId);
        expect(inventory.items).toHaveLength(root ? 1 : 0);
        if (root) {
          const current = await ready.read(
            '/invoice-records/' + root.id,
            ready.companyId,
          );
          expect(current).toMatchObject({
            record: {
              id: root.id,
              revision: root.revision,
              entryState: root.entryState,
              values: {
                externalSystem: system,
                externalNumber: reference,
                issuedOn: '2026-01-15',
                dueOn: null,
                currency: 'MDL',
                grossMinor: root.amount.minor,
                netMinor: '0',
                taxMinor: null,
              },
              copiedContext: {
                companyLabel: ready.companyName,
                receivingParty: { kind: 'PRIMARY' },
              },
            },
            liveSource: {
              documentId: ready.source.documentId,
              documentVersionId: ready.source.documentVersionId,
              content: { representationId: ready.source.representationId },
            },
          });
        }
      },
      async settle() {},
      async dispose() {
        if (drop) await removeRoute(page, '**/api/invoice-records', drop);
        if (refuseRead) await removeRoute(page, readPattern, refuseRead);
        await removeRoute(page, '**/api/**', identify);
        page.off('request', observe);
      },
      describe() {
        return { locale, phase: state.kind, writes: sent.length };
      },
    };
  },
};
