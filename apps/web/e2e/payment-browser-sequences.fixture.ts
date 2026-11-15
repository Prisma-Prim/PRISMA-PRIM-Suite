import * as fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import type { Route } from '@playwright/test';
import { expect, expectApiFailure } from './ui-chaos.fixture';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import { removeRoute } from './route-removal';
import { replaceScopeBeforeFinancialReply } from './financial-held-read.fixture';
import { selectOption } from './select-option';
import { resolveMessage } from '../src/localization/messages';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import {
  paymentIdentities,
  paymentObject,
  paymentText,
} from './payment-evidence-source.acceptance.fixture';
import {
  fillPaymentValues,
  createNativePayment,
  openPaymentObservation,
  preparePaymentObservationCase,
  paymentCompanyControl,
} from './payment-observation.acceptance.fixture';
import {
  paymentCopy,
  type PaymentLocale,
} from '../src/payment-observation/ui/payment-copy';

type Amount = { draft: string; minor: string };
type Values = { locale: PaymentLocale; amount: Amount };
type RootData = {
  id: string;
  amount: Amount;
  revision: number;
  method: string;
  externalReference: string | null;
  basis: string;
};
type DraftRoot = RootData & { state: 'DRAFT'; confirmation: null };
type Root =
  | DraftRoot
  | (RootData &
      (
        | { state: 'WITHDRAWN'; confirmation: null }
        | {
            state: 'CONFIRMED' | 'REVERSED';
            confirmation: { note: string; actorId: string; recordedAt: string };
          }
      ));
type State =
  | { kind: 'inventory'; root: Root | null }
  | { kind: 'draft'; amount: Amount }
  | {
      kind: 'uncertain';
      root: DraftRoot;
      receipt: unknown;
      original: { body: string; key: string };
    }
  | { kind: 'detail' | 'saved'; root: Root };
const basis =
  '  Human declaration <script>literalObservation()</script> Ș Ю 😀  ';
const method = '  Manual notice <literal> Ș Ю 😀  ';
const externalReference = '  FICT-OBS-1047 Ș Я é  ';

export const paymentSequenceAdapter: BrowserSequenceAdapter<
  'empty' | 'draft' | 'review' | 'confirmed',
  Values
> = {
  caseId: 'payment-observation',
  initial: fc.constantFrom('empty', 'draft', 'review', 'confirmed'),
  values: fc.record({
    locale: fc.constantFrom<PaymentLocale>('en', 'ro', 'ru', 'fr'),
    amount: fc.constantFrom(
      { draft: '1255.00', minor: '125500' },
      { draft: '42.50', minor: '4250' },
      { draft: '999.99', minor: '99999' },
    ),
  }),
  async open({ page, info, trial, initial }) {
    const ready = await preparePaymentObservationCase(
      page,
      `Generated-${info.project.name}-${trial}-${randomUUID()}`,
    );
    let role: 'reader' | 'confirmer' | 'reverser' =
      initial === 'review'
        ? 'confirmer'
        : initial === 'confirmed'
          ? 'reverser'
          : 'reader';
    const seeded =
      initial === 'empty' ? null : await createNativePayment(ready);
    let seededRoot: Root | null = seeded
      ? {
          id: seeded.id,
          revision: 1,
          state: 'DRAFT',
          confirmation: null,
          amount: { draft: '1255.00', minor: '125500' },
          method: 'Manual native preparation',
          externalReference: null,
          basis: 'Fictional declaration',
        }
      : null;
    if (seededRoot && initial === 'confirmed') {
      const note = '  Native independent preparation Ș Я é  ';
      await ready.command(
        `/payments/${seededRoot.id}/commands`,
        {
          action: 'CONFIRM',
          expectedRevision: 1,
          acknowledgeReviewedObservation: true,
          confirmationNote: note,
        },
        ready.companyId,
        paymentIdentities.confirmer,
      );
      const confirmed = paymentObject(
        paymentObject(
          (
            await ready.read(
              '/payments/' + seededRoot.id,
              ready.companyId,
              paymentIdentities.confirmer,
            )
          ).payment,
        ).confirmation,
      );
      seededRoot = {
        ...seededRoot,
        revision: 2,
        state: 'CONFIRMED',
        confirmation: {
          note,
          actorId: ready.memberships.confirmer,
          recordedAt: paymentText(confirmed.recordedAt),
        },
      };
    }
    const otherCompanyId = paymentText(
      (
        await ready.command('/companies', {
          displayName: `Other fictional generated payment ${info.project.name}-${trial}`,
        })
      ).id,
    );
    for (const workspaceMembershipId of Object.values(ready.memberships))
      await ready.command('/company-context-assignments', {
        companyId: otherCompanyId,
        workspaceMembershipId,
      });
    const identify = (route: Route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...paymentIdentities[role] },
      });
    await page.route('**/api/**', identify);
    const narrow = info.project.name.endsWith('narrow');
    const workspace = page.locator('.payment-observation').first();
    const panel = workspace.locator('.payment-observation-panel');
    let locale: PaymentLocale = 'en';
    let state: State = { kind: 'inventory', root: seededRoot };
    try {
      await openPaymentObservation(page, ready, narrow);
      if (seededRoot) {
        await workspace
          .getByRole('button', {
            name:
              paymentCopy.en.values +
              ' · ' +
              paymentCopy.en.revision +
              ' ' +
              seededRoot.revision,
            exact: true,
          })
          .click();
        state = { kind: 'detail', root: seededRoot };
      }
    } catch (error) {
      await removeRoute(page, '**/api/**', identify);
      throw error;
    }
    const sent: { body: string; key: string }[] = [];
    const observe = (request: import('@playwright/test').Request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/api/payments')
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
    async function chooseCompany(id: string) {
      await expect(page.getByRole('banner')).toBeVisible();
      if (narrow)
        await page
          .getByRole('button', {
            name: resolveMessage(prismeMessages, locale, 'openNavigation'),
            exact: true,
          })
          .click();
      await selectOption(paymentCompanyControl(page, locale), { value: id });
      if (narrow)
        await page
          .getByRole('button', {
            name: resolveMessage(prismeMessages, locale, 'closeNavigation'),
            exact: true,
          })
          .click();
    }
    async function showRoot(root: Root) {
      await workspace
        .getByRole('button', {
          name:
            paymentCopy[locale].values +
            ' · ' +
            paymentCopy[locale].revision +
            ' ' +
            root.revision,
          exact: true,
        })
        .click();
    }

    return {
      actions(value) {
        const current = state;
        const copy = paymentCopy[locale];
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
              label: 'open-recorded-observation',
              async run() {
                await workspace
                  .getByRole('button', {
                    name:
                      copy.values + ' · ' + copy.revision + ' ' + root.revision,
                    exact: true,
                  })
                  .click();
                state = { kind: 'detail', root };
              },
            });
          } else
            actions.push({
              label: 'start-literal-draft',
              async run() {
                await workspace
                  .getByRole('button', {
                    name: copy.newObservation,
                    exact: true,
                  })
                  .click();
                await workspace
                  .getByRole('button', {
                    name: copy.selectSource + ' 1',
                    exact: true,
                  })
                  .click();
                await fillPaymentValues(panel, locale, value.amount.draft);
                await panel
                  .getByLabel(copy.externalReference, { exact: true })
                  .fill(externalReference);
                await panel.getByRole('checkbox').check();
                state = { kind: 'draft', amount: value.amount };
              },
            });
        }
        if (current.kind === 'draft') {
          actions.push(
            {
              label: 'edit-literal-amount',
              async run() {
                await panel
                  .getByLabel(copy.amount, { exact: true })
                  .fill(value.amount.draft);
                state = { kind: 'draft', amount: value.amount };
              },
            },
            {
              label: 'close-unsubmitted-draft',
              async run() {
                await panel
                  .getByRole('button', { name: copy.close, exact: true })
                  .click();
                state = { kind: 'inventory', root: null };
              },
            },
            {
              label: 'submit-and-lose-committed-reply',
              async run() {
                let receipt: unknown;
                let dropped = false;
                drop = async (route) => {
                  if (route.request().method() !== 'POST' || dropped)
                    return route.fallback();
                  dropped = true;
                  const response = await route.fetch();
                  expect(response.status()).toBe(201);
                  receipt = await response.json();
                  expectApiFailure({
                    page,
                    request: route.request(),
                    reason:
                      'Generated native create commits before its receipt is dropped.',
                  });
                  await route.abort('connectionfailed');
                };
                await page.route('**/api/payments', drop);
                await panel
                  .getByRole('button', { name: copy.create, exact: true })
                  .click();
                await expect(panel.getByRole('alert')).toHaveText(
                  copy.uncertain,
                );
                const original = sent[0];
                if (!original)
                  throw new Error('Native original request was not observed');
                expect(sent).toHaveLength(1);
                state = {
                  kind: 'uncertain',
                  root: {
                    id: paymentText(paymentObject(receipt).paymentId),
                    amount: current.amount,
                    revision: 1,
                    state: 'DRAFT',
                    confirmation: null,
                    method,
                    externalReference,
                    basis,
                  },
                  receipt,
                  original,
                };
              },
            },
          );
        }
        if (current.kind === 'uncertain')
          actions.push({
            label: 'retry-identically-with-double-click',
            async run() {
              if (!drop)
                throw new Error('Original reply-loss control is missing');
              await removeRoute(page, '**/api/payments', drop);
              drop = undefined;
              const replay = page.waitForResponse(
                (response) =>
                  response.request().method() === 'POST' &&
                  new URL(response.url()).pathname === '/api/payments',
              );
              await panel
                .getByRole('button', { name: copy.retrySame, exact: true })
                .evaluate((button) => {
                  if (!(button instanceof HTMLButtonElement))
                    throw new Error('Expected retry button');
                  button.click();
                  button.click();
                });
              expect(await (await replay).json()).toEqual(current.receipt);
              await expect(panel).toHaveCount(0);
              expect(sent).toHaveLength(2);
              expect(sent[1]).toEqual(current.original);
              state = { kind: 'detail', root: current.root };
            },
          });
        if (current.kind === 'detail')
          actions.push({
            label: 'return-to-inventory',
            async run() {
              await workspace
                .getByRole('button', { name: copy.back, exact: true })
                .click();
              state = { kind: 'inventory', root: current.root };
            },
          });
        if (current.kind === 'detail') {
          const root = current.root;
          for (const reply of ['authorized', 'denied'] as const)
            actions.push({
              label: `company-roundtrip-with-late-${reply}-payment-read`,
              async run() {
                const bundles =
                  role === 'reader'
                    ? [
                        'company-payment-reader',
                        'company-payment-recorder',
                        'company-payment-confirmer',
                      ]
                    : role === 'confirmer'
                      ? ['company-payment-confirmer']
                      : ['company-payment-reverser'];
                await replaceScopeBeforeFinancialReply({
                  page,
                  path: '/payments/' + root.id,
                  identity: paymentIdentities[role],
                  reply:
                    reply === 'authorized'
                      ? { kind: 'authorized' }
                      : {
                          kind: 'denied',
                          async revoke() {
                            for (const bundle of bundles)
                              await ready.revoke(
                                bundle,
                                ready.memberships[role],
                              );
                          },
                          async restore() {
                            for (const bundle of bundles)
                              await ready.grant(
                                bundle,
                                ready.memberships[role],
                              );
                          },
                        },
                  start: async () => {
                    await workspace
                      .getByRole('button', { name: copy.reload, exact: true })
                      .click();
                  },
                  async replace() {
                    if (role !== 'reverser') {
                      await page.goto('/#clients');
                      await expect(
                        page
                          .locator('.client-workspace')
                          .getByText(ready.clientName, { exact: true })
                          .first(),
                      ).toBeVisible();
                    }
                    await chooseCompany(otherCompanyId);
                    await expect(workspace).toHaveCount(0);
                    await chooseCompany(ready.companyId);
                    await page.goto('/#payments');
                    await expect(workspace).toBeVisible();
                    state = { kind: 'inventory', root };
                  },
                });
              },
            });

          if (root.state === 'DRAFT' && role === 'reader') {
            actions.push({
              label: 'correct-draft-with-failed-refresh',
              async run() {
                await workspace
                  .getByRole('button', { name: copy.correct, exact: true })
                  .click();
                const amount =
                  value.amount.minor === root.amount.minor
                    ? { draft: '77.00', minor: '7700' }
                    : value.amount;
                await panel
                  .getByLabel(copy.amount, { exact: true })
                  .fill(amount.draft);
                await panel
                  .getByRole('textbox', { name: copy.reason, exact: true })
                  .fill('  Literal generated correction Ș Ю é  ');
                readPattern = `**/api/payments/${root.id}`;
                refuseRead = async (route) => {
                  if (route.request().method() !== 'GET')
                    return route.fallback();
                  expectApiFailure({
                    page,
                    request: route.request(),
                    reason:
                      'Only the independent Payment read fails after a committed correction.',
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
                      `/api/payments/${root.id}/commands`,
                );
                await panel
                  .getByRole('button', { name: copy.correct, exact: true })
                  .click();
                expect((await saved).status()).toBe(201);
                await expect(panel.getByRole('alert')).toHaveText(
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
              label: 'withdraw-draft',
              async run() {
                await workspace
                  .getByRole('button', { name: copy.withdraw, exact: true })
                  .click();
                await panel
                  .getByRole('textbox', { name: copy.reason, exact: true })
                  .fill('  Literal withdrawal Ș Ю é  ');
                const saved = page.waitForResponse(
                  (response) =>
                    response.request().method() === 'POST' &&
                    new URL(response.url()).pathname ===
                      `/api/payments/${root.id}/commands`,
                );
                await panel
                  .getByRole('button', { name: copy.withdraw, exact: true })
                  .click();
                expect((await saved).status()).toBe(201);
                await expect(panel).toHaveCount(0);
                state = {
                  kind: 'detail',
                  root: {
                    ...root,
                    state: 'WITHDRAWN',
                    confirmation: null,
                    revision: root.revision + 1,
                  },
                };
              },
            });
            actions.push({
              label: 'change-to-independent-confirmer',
              async run() {
                role = 'confirmer';
                await page.reload();
                await chooseCompany(ready.companyId);
                await showRoot(root);
                state = { kind: 'detail', root };
              },
            });
          }
          if (root.state === 'CONFIRMED' && role !== 'reverser')
            actions.push({
              label: 'change-to-independent-reverser',
              async run() {
                role = 'reverser';
                await page.reload();
                await chooseCompany(ready.companyId);
                await showRoot(root);
                state = { kind: 'detail', root };
              },
            });
          if (root.state === 'CONFIRMED' && role === 'reverser')
            actions.push({
              label: 'reverse-without-source-permission',
              async run() {
                await expect(
                  workspace.getByRole('button', {
                    name: copy.download,
                    exact: true,
                  }),
                ).toHaveCount(0);
                await workspace
                  .getByRole('button', { name: copy.reverse, exact: true })
                  .click();
                await panel
                  .getByRole('textbox', { name: copy.reason, exact: true })
                  .fill('  Human reversal, no bank refund Ș Ю é  ');
                const saved = page.waitForResponse(
                  (response) =>
                    response.request().method() === 'POST' &&
                    new URL(response.url()).pathname ===
                      `/api/payments/${root.id}/commands`,
                );
                await panel
                  .getByRole('button', { name: copy.reverse, exact: true })
                  .click();
                expect((await saved).status()).toBe(201);
                await expect(panel).toHaveCount(0);
                state = {
                  kind: 'detail',
                  root: {
                    ...root,
                    state: 'REVERSED',
                    revision: root.revision + 1,
                  },
                };
              },
            });
        }
        if (current.kind === 'saved')
          actions.push({
            label: 'retry-only-payment-read',
            async run() {
              if (!refuseRead)
                throw new Error('No failed Payment read control.');
              await removeRoute(page, readPattern, refuseRead);
              refuseRead = undefined;
              const count = sent.length;
              await panel
                .getByRole('button', { name: copy.retryRead, exact: true })
                .click();
              await expect(panel).toHaveCount(0);
              expect(sent).toHaveLength(count);
              state = { kind: 'detail', root: current.root };
            },
          });
        if (
          current.kind === 'detail' &&
          current.root.state === 'DRAFT' &&
          role === 'confirmer'
        ) {
          const root = current.root;
          actions.push({
            label: 'independent-native-confirmation',
            async run() {
              await workspace
                .getByRole('button', { name: copy.confirm, exact: true })
                .click();
              const note = '  Generated independent review Ș Я é  ';
              await panel
                .getByRole('textbox', {
                  name: copy.confirmationNote,
                  exact: true,
                })
                .fill(note);
              await panel.getByRole('checkbox').check();
              const confirmed = page.waitForResponse(
                (response) =>
                  response.request().method() === 'POST' &&
                  new URL(response.url()).pathname ===
                    `/api/payments/${root.id}/commands`,
              );
              await panel
                .getByRole('button', { name: copy.confirm, exact: true })
                .click();
              const response = await confirmed;
              expect(response.status()).toBe(201);
              await expect(panel).toHaveCount(0);
              const currentRead = await ready.read(
                '/payments/' + root.id,
                ready.companyId,
                paymentIdentities.confirmer,
              );
              const confirmation = paymentObject(
                paymentObject(currentRead.payment).confirmation,
              );
              expect(confirmation).toMatchObject({
                note,
                actor: { membershipId: ready.memberships.confirmer },
              });
              state = {
                kind: 'detail',
                root: {
                  ...root,
                  state: 'CONFIRMED',
                  revision: root.revision + 1,
                  confirmation: {
                    note,
                    actorId: ready.memberships.confirmer,
                    recordedAt: paymentText(confirmation.recordedAt),
                  },
                },
              };
            },
          });
        }
        return actions;
      },
      async verify() {
        const copy = paymentCopy[locale];
        const root =
          state.kind === 'inventory'
            ? state.root
            : state.kind === 'draft'
              ? null
              : state.root;
        await expect(workspace).toBeVisible();
        if (state.kind === 'draft' || state.kind === 'uncertain') {
          const amount =
            state.kind === 'draft' ? state.amount : state.root.amount;
          await expect(
            panel.getByLabel(copy.amount, { exact: true }),
          ).toHaveValue(amount.draft);
          await expect(
            panel.getByLabel(copy.externalReference, { exact: true }),
          ).toHaveValue(externalReference);
          await expect(
            panel.getByRole('textbox', {
              name: copy.observationBasis,
              exact: true,
            }),
          ).toHaveValue(basis);
          if (state.kind === 'uncertain') {
            await expect(panel.getByRole('alert')).toHaveText(copy.uncertain);
            await expect(
              panel.getByRole('button', { name: copy.retrySame, exact: true }),
            ).toBeEnabled();
          }
        } else if (state.kind === 'saved') {
          await expect(panel.getByRole('alert')).toHaveText(copy.refreshFailed);
          await expect(
            panel.getByRole('button', { name: copy.retrySame, exact: true }),
          ).toHaveCount(0);
          await expect(
            panel.getByRole('button', { name: copy.retryRead, exact: true }),
          ).toBeEnabled();
        } else await expect(panel).toHaveCount(0);
        if (state.kind === 'inventory') {
          await expect(
            workspace.getByRole('button', { name: copy.back, exact: true }),
          ).toHaveCount(0);
          if (state.root)
            await expect(
              workspace.getByRole('button', {
                name:
                  copy.values +
                  ' · ' +
                  copy.revision +
                  ' ' +
                  state.root.revision,
                exact: true,
              }),
            ).toBeVisible();
          else
            await expect(
              workspace.getByText(copy.empty, { exact: true }),
            ).toBeVisible();
        }
        if (state.kind === 'detail') {
          const root = state.root;
          const summary = workspace
            .locator('.payment-observation-summary')
            .first();
          await expect(
            summary.getByRole('heading', {
              name: copy.states[root.state],
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            summary.locator('.payment-observation-revision-number'),
          ).toHaveText(copy.revision + ' ' + root.revision);
          await expect(
            summary.locator('.payment-observation-amount'),
          ).toHaveText(
            root.amount.draft.replace('.', locale === 'en' ? '.' : ',') +
              ' MDL',
          );
          await expect(
            summary.getByText(root.method, { exact: true }),
          ).toBeVisible();
          await expect(
            summary.getByText(root.basis, { exact: true }),
          ).toBeVisible();
          const declaredValues = summary.locator('dl').filter({
            has: page.getByText(copy.externalReference, { exact: true }),
          });
          await expect(
            declaredValues.getByText(
              root.externalReference ?? copy.notRecorded,
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            summary.getByText(ready.primaryParty.legalName, { exact: true }),
          ).toBeVisible();
          if (root.confirmation)
            await expect(
              summary.locator('.payment-observation-confirmation'),
            ).toContainText(root.confirmation.note.trim());
          if (role === 'reader' && root.state === 'DRAFT')
            await expect(
              workspace.getByRole('button', {
                name: copy.confirm,
                exact: true,
              }),
            ).toHaveCount(0);
          if (role === 'reverser')
            await expect(
              workspace.getByRole('button', {
                name: copy.download,
                exact: true,
              }),
            ).toHaveCount(0);
        }
        if (role !== 'reader')
          await expect(
            workspace.getByRole('button', {
              name: copy.newObservation,
              exact: true,
            }),
          ).toHaveCount(0);
        const inventory = await ready.read(
          '/payments',
          ready.companyId,
          paymentIdentities[role],
        );
        expect(inventory.items).toHaveLength(root ? 1 : 0);
        if (root) {
          const current = await ready.read(
            '/payments/' + root.id,
            ready.companyId,
            paymentIdentities[role],
          );
          expect(current).toMatchObject({
            payment: {
              id: root.id,
              revision: root.revision,
              state: root.state,
              values: {
                amountMinor: root.amount.minor,
                method: root.method,
                externalReference: root.externalReference,
                observationBasis: root.basis,
                currency: 'MDL',
                effectiveOn: '2026-01-15',
              },
            },
            liveSource:
              role === 'reverser'
                ? { kind: 'UNAVAILABLE' }
                : {
                    documentId: ready.source.documentId,
                    documentVersionId: ready.source.documentVersionId,
                    content: {
                      representationId: ready.source.representationId,
                    },
                  },
          });
          expect(paymentObject(current.payment).confirmation).toEqual(
            root.confirmation === null
              ? null
              : {
                  actor: {
                    membershipId: root.confirmation.actorId,
                    displayName:
                      paymentIdentities.confirmer['x-test-display-name'],
                  },
                  recordedAt: root.confirmation.recordedAt,
                  note: root.confirmation.note,
                },
          );
        }
      },
      async settle() {},
      async dispose() {
        if (drop) await removeRoute(page, '**/api/payments', drop);
        if (refuseRead) await removeRoute(page, readPattern, refuseRead);
        await removeRoute(page, '**/api/**', identify);
        page.off('request', observe);
      },
      describe() {
        return { locale, role, phase: state.kind, requests: sent.length };
      },
    };
  },
};
