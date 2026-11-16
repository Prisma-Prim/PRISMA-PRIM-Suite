import * as fc from 'fast-check';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Locator, Request, Route } from '@playwright/test';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import { formatMessage, resolveMessage } from '../src/localization/messages';
import { paymentEvidenceMessages } from '../src/payment-evidence/payment-evidence.copy';
import { documentPdfMessages } from '../src/documents/document-pdf.copy';
import { documentVersionsMessages } from '../src/documents/document-versions.copy';
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
import { replaceSourceBeforePdfReply } from './document-held-download.fixture';
import { selectOption } from './select-option';
import {
  openPaymentEvidence,
  preparePaymentEvidenceCase,
  paymentIdentities,
  paymentApiOrigin,
  paymentObject,
  paymentText,
} from './payment-evidence-source.acceptance.fixture';

type Payer = 'PRIMARY' | 'ADDITIONAL';
type Variant = 'a' | 'b' | 'c';
type Values = { locale: InterfaceLocale; variant: Variant; payer: Payer };
type Pdf = { id: string; variant: Variant; name: string };
type Version = {
  id: string;
  number: number;
  status: 'draft' | 'official' | 'superseded';
  uploads: Pdf[];
  frozen: { title: string; purpose: string } | null;
};
type Evidence = {
  id: string;
  index: number;
  payer: Payer;
  title: string;
  purpose: string;
  sourceDescription: string;
  receivedOn: string | null;
  registeredAt: string;
  registeredBy: Record<string, unknown>;
  revision: number;
  corrections: number;
  versions: Version[];
};
type Plan =
  | { kind: 'registration'; payer: Payer; index: number }
  | { kind: 'correction'; evidence: Evidence; title: string; purpose: string }
  | { kind: 'pdf'; evidence: Evidence; version: Version; variant: Variant }
  | { kind: 'designation' | 'successor'; evidence: Evidence; version: Version };
type Sent = { method: string; url: string; key: string; body: Buffer | null };
type Intent = { plan: Plan; sent: Sent; receipt: Record<string, unknown> };
type Fault = 'none' | 'lost-receipt' | 'failed-read';

/** Native source preparation learned from the desktop/narrow source journey. */
export const paymentEvidenceSequenceAdapter: BrowserSequenceAdapter<
  Payer,
  Values
> = {
  caseId: 'payment-evidence',
  initial: fc.constantFrom<Payer>('PRIMARY', 'ADDITIONAL'),
  values: fc.record({
    locale: fc.constantFrom<InterfaceLocale>('en', 'ro', 'ru', 'fr'),
    variant: fc.constantFrom<Variant>('a', 'b', 'c'),
    payer: fc.constantFrom<Payer>('PRIMARY', 'ADDITIONAL'),
  }),
  async open({ page, info, trial, initial }) {
    const ready = await preparePaymentEvidenceCase(
      page,
      `${trial}-${randomUUID()}`,
    );
    for (const bundle of [
      'company-payment-reader',
      'company-payment-recorder',
      'company-payment-evidence-access',
    ])
      await ready.grant(bundle);
    const actor = await ready.read('/access/current-actor', ready.companyId);
    const records: Evidence[] = [];
    let current: Evidence | undefined;
    let selectedVersion = 1;
    let selectedFile: Variant | null = null;
    let locale: InterfaceLocale = 'en';
    let intent: Intent | null = null;
    let failedRead: ReturnType<typeof observeApiRequests> | null = null;
    let failedReads = 0;
    let payerAvailable = true;
    const sent: Sent[] = [];
    const contentReads: string[] = [];
    const source = page.locator('.payment-evidence-source');
    const word = (key: (typeof paymentEvidenceMessages)['keys'][number]) =>
      resolveMessage(paymentEvidenceMessages, locale, key);
    const pdfWord = (key: (typeof documentPdfMessages)['keys'][number]) =>
      resolveMessage(documentPdfMessages, locale, key);
    const versionWord = (
      key: (typeof documentVersionsMessages)['keys'][number],
    ) => resolveMessage(documentVersionsMessages, locale, key);
    const bytes = (variant: Variant) =>
      variant === 'a' ? ready.pdfA : variant === 'b' ? ready.pdfB : ready.pdfC;
    const filename = (variant: Variant) => `fictional-evidence-${variant}.pdf`;
    const title = (index: number) =>
      `Fictional evidence ${index} <literal> Ș Я é`;
    const purpose = (index: number) =>
      `Human-declared source ${index}; no Payment is recorded.`;
    const declaration = (index: number) =>
      `Fictional notice ${index} <script>literalEvidence()</script> Ș Я é`;
    const receivedOn = (payer: Payer) =>
      payer === 'PRIMARY' ? null : '2026-01-15';
    const party = (payer: Payer) =>
      payer === 'PRIMARY' ? ready.primaryParty : ready.additionalParty;
    const headers = {
      ...paymentIdentities.owner,
      'x-company-context-id': ready.companyId,
    };
    const identify = (route: Route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...paymentIdentities.owner },
      });
    const observe = (request: Request) => {
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/documents')) return;
      if (
        request.method() === 'GET' &&
        /\/content\/[0-9a-f-]{36}$/iu.test(path)
      )
        contentReads.push(path);
      if (request.method() === 'POST' || request.method() === 'PATCH')
        sent.push({
          method: request.method(),
          url: request.url(),
          key: request.headers()['idempotency-key'] ?? '',
          body: request.postDataBuffer(),
        });
    };
    const denyRead = async (route: Route) => {
      const path = new URL(route.request().url()).pathname;
      if (
        route.request().method() !== 'GET' ||
        !failedRead ||
        !current ||
        ![
          `/api/documents/${current.id}`,
          `/api/documents/${current.id}/versions`,
        ].includes(path)
      )
        return route.fallback();
      failedReads += 1;
      expectApiFailure({
        page,
        request: route.request(),
        reason:
          'A native Evidence save is confirmed; only its independent source/Versions refresh deliberately fails.',
      });
      await route.fulfill({ status: 503, body: '' });
    };
    function selectedEvidence() {
      if (!current)
        throw new Error('Expected the selected native Evidence source');
      return current;
    }
    function versionLabel(number: number) {
      return formatMessage(versionWord('version'), { number });
    }
    function downloadLabel(number: number) {
      return formatMessage(pdfWord('download'), { version: number });
    }
    function pathFor(plan: Plan) {
      if (plan.kind === 'registration') return '/api/documents';
      const base = `/api/documents/${plan.evidence.id}`;
      if (plan.kind === 'correction') return base;
      if (plan.kind === 'successor') return `${base}/versions`;
      return `${base}/versions/${plan.version.id}/${plan.kind === 'pdf' ? 'content' : 'official-designation'}`;
    }
    function retryLabel(plan: Plan) {
      switch (plan.kind) {
        case 'registration':
          return word('retryRegistration');
        case 'correction':
          return word('retryCorrection');
        case 'pdf':
          return pdfWord('retry');
        case 'designation':
        case 'successor':
          return versionWord('retryCommand');
        default: {
          const exhaustive: never = plan;
          return exhaustive;
        }
      }
    }
    async function doubleClick(control: Locator) {
      await expect(control).toBeEnabled();
      await control.evaluate((button) => {
        if (!(button instanceof HTMLButtonElement))
          throw new Error('Expected a native Evidence command button');
        button.click();
        button.click();
      });
    }
    async function selectVersion(version: Version) {
      await source
        .getByRole('button', {
          name: versionLabel(version.number),
          exact: true,
        })
        .click();
      selectedVersion = version.number;
      selectedFile = null;
      await expect(
        source.getByRole('region', {
          name: versionLabel(version.number),
          exact: true,
        }),
      ).toBeVisible();
    }
    async function prepare(plan: Plan) {
      if (plan.kind === 'registration') {
        const form = source.getByRole('form', {
          name: word('register'),
          exact: true,
        });
        if (!(await form.isVisible()))
          await source
            .getByRole('button', { name: word('register'), exact: true })
            .click();
        await selectOption(form.getByLabel(word('client'), { exact: true }), {
          value: ready.clientId,
        });
        await expect(
          form.getByLabel(word('payer'), { exact: true }),
        ).toBeEnabled();
        await selectOption(form.getByLabel(word('payer'), { exact: true }), {
          value: plan.payer === 'PRIMARY' ? 'PRIMARY' : ready.legalEntityId,
        });
        await form
          .getByLabel(word('titleLabel'), { exact: true })
          .fill(title(plan.index));
        await form
          .getByLabel(word('purpose'), { exact: true })
          .fill(purpose(plan.index));
        await form
          .getByLabel(word('sourceDescription'), { exact: true })
          .fill(declaration(plan.index));
        await form
          .getByLabel(word('receivedOn'), { exact: true })
          .fill(receivedOn(plan.payer) ?? '');
      } else if (plan.kind === 'correction') {
        await source
          .getByRole('button', { name: word('edit'), exact: true })
          .click();
        const form = source.locator('.working-document-correction');
        await form
          .getByLabel(word('titleLabel'), { exact: true })
          .fill(plan.title);
        await form
          .getByLabel(word('purpose'), { exact: true })
          .fill(plan.purpose);
      } else {
        if (selectedVersion !== plan.version.number)
          await selectVersion(plan.version);
        if (plan.kind === 'pdf') {
          await source
            .locator('.payment-evidence-pdf-upload')
            .getByLabel(pdfWord('fileLabel'), { exact: true })
            .setInputFiles({
              name: filename(plan.variant),
              mimeType: 'application/pdf',
              buffer: bytes(plan.variant),
            });
          selectedFile = plan.variant;
        }
      }
    }
    async function clickPlan(plan: Plan) {
      switch (plan.kind) {
        case 'registration':
          await doubleClick(
            source.getByRole('button', { name: word('save'), exact: true }),
          );
          return;
        case 'correction':
          await doubleClick(
            source.getByRole('button', {
              name: word('saveCorrection'),
              exact: true,
            }),
          );
          return;
        case 'pdf':
          await doubleClick(
            source.getByRole('button', { name: pdfWord('save'), exact: true }),
          );
          return;
        case 'successor':
          await doubleClick(
            source.getByRole('button', {
              name: versionWord('startDraft'),
              exact: true,
            }),
          );
          return;
        case 'designation':
          await source
            .getByRole('button', {
              name: versionWord('designate'),
              exact: true,
            })
            .click();
          await doubleClick(
            source.getByRole('button', {
              name: versionWord('confirm'),
              exact: true,
            }),
          );
          return;
        default: {
          const exhaustive: never = plan;
          return exhaustive;
        }
      }
    }
    function apply(plan: Plan, receipt: Record<string, unknown>) {
      if (plan.kind === 'registration') {
        const savedSource = paymentObject(receipt.paymentEvidenceSource);
        const version = paymentObject(receipt.version);
        expect(receipt).toMatchObject({
          companyId: ready.companyId,
          clientId: ready.clientId,
          title: title(plan.index),
          purpose: purpose(plan.index),
          workingRevision: 1,
        });
        expect(savedSource).toMatchObject({
          format: 'PAYMENT_EVIDENCE_SOURCE/1',
          receivingCompanyLabel: ready.companyName,
          sourceDescription: declaration(plan.index),
          receivedOn: receivedOn(plan.payer),
          registeredBy: {
            workspaceMembershipId: ready.ownerId,
            internalUserId: actor.internalUserId,
          },
          payer: { kind: 'AVAILABLE', party: party(plan.payer) },
        });
        expect(version.status).toBe('draft');
        expect(version.representation).toBeNull();
        current = {
          id: paymentText(receipt.id),
          index: plan.index,
          payer: plan.payer,
          title: title(plan.index),
          purpose: purpose(plan.index),
          sourceDescription: declaration(plan.index),
          receivedOn: receivedOn(plan.payer),
          registeredAt: paymentText(savedSource.registeredAt),
          registeredBy: paymentObject(savedSource.registeredBy),
          revision: 1,
          corrections: 0,
          versions: [
            {
              id: paymentText(version.id),
              number: 1,
              status: 'draft',
              uploads: [],
              frozen: null,
            },
          ],
        };
        records.push(current);
        selectedVersion = 1;
        return;
      }
      const evidence = plan.evidence;
      expect(receipt.documentId).toBe(evidence.id);
      if (plan.kind === 'correction') {
        expect(receipt).toMatchObject({
          outcome: 'corrected',
          revision: evidence.revision + 1,
        });
        evidence.title = plan.title;
        evidence.purpose = plan.purpose;
        evidence.corrections += 1;
      } else {
        expect(receipt.workingRevision).toBe(evidence.revision + 1);
        switch (plan.kind) {
          case 'pdf':
            expect(receipt).toMatchObject({
              action: 'representation_added',
              versionId: plan.version.id,
              versionNumber: plan.version.number,
            });
            plan.version.uploads.push({
              id: paymentText(receipt.representationId),
              variant: plan.variant,
              name: filename(plan.variant),
            });
            break;
          case 'designation': {
            const previous = evidence.versions.find(
              (version) => version.status === 'official',
            );
            expect(receipt).toMatchObject({
              action: 'designated_official',
              versionId: plan.version.id,
              versionNumber: plan.version.number,
              supersededVersionNumber: previous?.number ?? null,
            });
            if (previous) previous.status = 'superseded';
            plan.version.status = 'official';
            plan.version.frozen = {
              title: evidence.title,
              purpose: evidence.purpose,
            };
            break;
          }
          case 'successor': {
            const number = evidence.versions.length + 1;
            expect(receipt).toMatchObject({
              action: 'drafted',
              sourceVersionNumber: plan.version.number,
              versionNumber: number,
            });
            evidence.versions.push({
              id: paymentText(receipt.versionId),
              number,
              status: 'draft',
              uploads: [],
              frozen: null,
            });
            break;
          }
          default: {
            const exhaustive: never = plan;
            return exhaustive;
          }
        }
      }
      evidence.revision += 1;
    }
    function checkSubmission(plan: Plan, submission: Sent) {
      expect(submission.key).toMatch(/^[0-9a-f-]{36}$/iu);
      expect(new URL(submission.url).pathname).toBe(pathFor(plan));
      if (plan.kind === 'pdf') {
        expect(submission.body).toEqual(bytes(plan.variant));
        expect(new URL(submission.url).searchParams.get('fileName')).toBe(
          filename(plan.variant),
        );
        expect(
          new URL(submission.url).searchParams.get('expectedRevision'),
        ).toBe(String(plan.evidence.revision));
      } else {
        const body: unknown = JSON.parse(
          submission.body?.toString('utf8') ?? 'null',
        );
        expect(body).toEqual(
          plan.kind === 'registration'
            ? {
                type: 'payment-evidence',
                clientId: ready.clientId,
                payer:
                  plan.payer === 'PRIMARY'
                    ? { kind: 'PRIMARY' }
                    : {
                        kind: 'ADDITIONAL',
                        legalEntityId: ready.legalEntityId,
                      },
                title: title(plan.index),
                purpose: purpose(plan.index),
                sourceDescription: declaration(plan.index),
                receivedOn: receivedOn(plan.payer),
              }
            : plan.kind === 'correction'
              ? {
                  expectedRevision: plan.evidence.revision,
                  title: plan.title,
                  purpose: plan.purpose,
                }
              : { expectedRevision: plan.evidence.revision },
        );
      }
    }
    async function commit(plan: Plan, fault: Fault) {
      await prepare(plan);
      const admission = source.getByRole('button', {
        name:
          plan.kind === 'registration'
            ? word('save')
            : plan.kind === 'correction'
              ? word('saveCorrection')
              : plan.kind === 'pdf'
                ? pdfWord('save')
                : plan.kind === 'designation'
                  ? versionWord('designate')
                  : versionWord('startDraft'),
        exact: true,
      });
      await expect(admission).toBeEnabled();
      const path = pathFor(plan);
      const method = plan.kind === 'correction' ? 'PATCH' : 'POST';
      const before = sent.length;
      let nativeReceipt: Record<string, unknown> | null = null;
      const pattern = (url: URL) => url.pathname === path;
      const lose = async (route: Route) => {
        if (route.request().method() !== method) return route.fallback();
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...paymentIdentities.owner },
        });
        expect(response.status()).toBe(
          plan.kind === 'correction' || plan.kind === 'designation' ? 200 : 201,
        );
        nativeReceipt = paymentObject(await response.json());
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'The native Evidence command committed; its actual durable receipt is deliberately lost.',
        });
        await route.abort('connectionfailed');
      };
      if (fault === 'lost-receipt') await page.route(pattern, lose);
      if (fault === 'failed-read')
        failedRead = observeApiRequests(
          page,
          (request) =>
            request.method() === 'GET' &&
            [
              `/api/documents/${selectedEvidence().id}`,
              `/api/documents/${selectedEvidence().id}/versions`,
            ].includes(new URL(request.url()).pathname),
        );
      const response =
        fault === 'lost-receipt'
          ? null
          : page.waitForResponse(
              (reply) =>
                reply.request().method() === method &&
                new URL(reply.url()).pathname === path,
            );
      try {
        await clickPlan(plan);
        if (response) {
          const reply = await response;
          expect(reply.status()).toBe(
            plan.kind === 'correction' || plan.kind === 'designation'
              ? 200
              : 201,
          );
          nativeReceipt = paymentObject(await reply.json());
        } else
          await expect(
            source.getByRole('button', { name: retryLabel(plan), exact: true }),
          ).toBeVisible();
      } finally {
        if (fault === 'lost-receipt') await removeRoute(page, pattern, lose);
      }
      if (!nativeReceipt)
        throw new Error('Expected the actual native Evidence receipt');
      expect(sent).toHaveLength(before + 1);
      const submission = sent[before];
      if (!submission) throw new Error('Expected the observed browser command');
      checkSubmission(plan, submission);
      apply(plan, nativeReceipt);
      selectedFile = null;
      if (fault === 'lost-receipt')
        intent = { plan, sent: submission, receipt: nativeReceipt };
      if (fault === 'failed-read') {
        await expect(
          source
            .getByText(word('confirmedRefreshFailed'), { exact: true })
            .first(),
        ).toBeVisible();
        expect(failedReads).toBeGreaterThan(0);
        await expect(
          source.getByRole('button', { name: retryLabel(plan), exact: true }),
        ).toHaveCount(0);
      }
    }
    async function retry() {
      const pending = intent;
      if (!pending) throw new Error('Expected a sealed Evidence retry');
      const before = sent.length;
      const response = page.waitForResponse(
        (reply) =>
          reply.request().method() === pending.sent.method &&
          reply.url() === pending.sent.url,
      );
      await doubleClick(
        source.getByRole('button', {
          name: retryLabel(pending.plan),
          exact: true,
        }),
      );
      const reply = await response;
      expect(reply.status()).toBe(
        pending.plan.kind === 'correction' ||
          pending.plan.kind === 'designation'
          ? 200
          : 201,
      );
      expect(await reply.json()).toEqual(pending.receipt);
      expect(sent).toHaveLength(before + 1);
      expect(sent[before]).toEqual(pending.sent);
      intent = null;
    }
    async function retryRead() {
      const reads = failedRead;
      if (!reads)
        throw new Error('Expected the owned failed Evidence read phase');
      await expect
        .poll(() => reads.isIdle(), {
          timeout: IDLE_DEADLINE_MILLISECONDS,
          message:
            'The independent Evidence source/Versions failures must settle before read recovery',
        })
        .toBe(true);
      const before = sent.length;
      failedRead = null;
      try {
        // A successful parent read can refresh both children and remove their
        // retry controls. Recover independent children before starting it.
        const pdfRetry = source.getByRole('button', {
          name: pdfWord('reload'),
          exact: true,
        });
        if (await pdfRetry.isVisible()) await pdfRetry.click();
        const versionRetry = source
          .locator('.payment-evidence-versions')
          .getByRole('button', { name: versionWord('retry'), exact: true });
        if (await versionRetry.isVisible()) await versionRetry.click();
        const detailRetry = source
          .getByRole('button', { name: word('refresh'), exact: true })
          .last();
        await detailRetry.click();
        await expect(
          source.getByText(word('confirmedRefreshFailed'), { exact: true }),
        ).toHaveCount(0);
        await expect
          .poll(() => reads.isIdle(), {
            timeout: IDLE_DEADLINE_MILLISECONDS,
            message:
              'The recovered Evidence projections must settle before a new fault or command',
          })
          .toBe(true);
      } finally {
        reads.dispose();
      }
      expect(sent).toHaveLength(before);
    }
    async function openRecord(evidence: Evidence) {
      await source
        .locator('.payment-evidence-inventory li')
        .filter({
          has: page
            .getByText(evidence.title, { exact: true })
            .or(page.getByText(title(evidence.index), { exact: true })),
        })
        .getByRole('button', { name: word('open'), exact: true })
        .click();
      current = evidence;
      selectedVersion = evidence.versions.length;
      selectedFile = null;
      await expect(
        source.getByRole('heading', { name: evidence.title, exact: true }),
      ).toBeVisible();
    }
    async function download(
      evidence: Evidence,
      version: Version,
      pdf: Pdf,
      control?: Locator,
    ) {
      if (selectedVersion !== version.number) await selectVersion(version);
      const before = contentReads.length;
      const pending = page.waitForEvent('download');
      await (
        control ??
        source
          .locator('.payment-evidence-pdf-read')
          .getByRole('button', {
            name: downloadLabel(version.number),
            exact: true,
          })
          .first()
      ).click();
      const result = await pending;
      expect(result.suggestedFilename()).toBe(pdf.name);
      const file = await result.path();
      if (!file)
        throw new Error('Expected the exact native Evidence PDF download');
      expect(await readFile(file)).toEqual(bytes(pdf.variant));
      expect(contentReads.slice(before)).toEqual([
        `/api/documents/${evidence.id}/versions/${version.id}/content/${pdf.id}`,
      ]);
    }
    async function history(evidence: Evidence, version: Version) {
      await selectVersion(version);
      await source
        .getByRole('button', { name: pdfWord('history'), exact: true })
        .click();
      const list = source.getByRole('list', {
        name: pdfWord('history'),
        exact: true,
      });
      await expect(list.getByRole('listitem')).toHaveCount(
        version.uploads.length,
      );
      const original = version.uploads[0];
      if (!original)
        throw new Error('Expected an original historical Evidence PDF');
      const item = list.getByRole('listitem').last();
      await expect(
        item.getByText(original.name, { exact: true }),
      ).toBeVisible();
      await download(
        evidence,
        version,
        original,
        item.getByRole('button', {
          name: downloadLabel(version.number),
          exact: true,
        }),
      );
    }
    async function heldDownload(
      evidence: Evidence,
      version: Version,
      pdf: Pdf,
      status: 200 | 403,
    ) {
      await selectVersion(version);
      await expect(
        source.getByRole('button', {
          name: downloadLabel(version.number),
          exact: true,
        }),
      ).toBeEnabled();
      await replaceSourceBeforePdfReply({
        page,
        companyId: ready.companyId,
        path: `/api/documents/${evidence.id}/versions/${version.id}/content/${pdf.id}`,
        identity: paymentIdentities.owner,
        status,
        beforeRead: async () => {
          if (status === 403)
            await ready.revoke('company-document-content-reader');
        },
        afterCapture: async (response) => {
          if (status === 200)
            expect(await response.body()).toEqual(bytes(pdf.variant));
          else await ready.grant('company-document-content-reader');
        },
        start: () =>
          source
            .getByRole('button', {
              name: downloadLabel(version.number),
              exact: true,
            })
            .click(),
        replace: () => openRecord(evidence),
      });
    }
    async function togglePayer() {
      if (payerAvailable) await ready.revoke('company-director-client');
      else await ready.grant('company-director-client');
      payerAvailable = !payerAvailable;
      await source
        .getByRole('button', { name: word('refresh'), exact: true })
        .click();
      if (!payerAvailable)
        await expect(
          source.getByText(word('payerUnavailable'), { exact: true }),
        ).toBeVisible();
      else
        await expect(
          source.getByRole('region', { name: word('payer'), exact: true }),
        ).toBeVisible();
    }
    async function verify() {
      for (const evidence of records) {
        const actual = await ready.read(
          `/documents/${evidence.id}`,
          ready.companyId,
        );
        expect(actual).toMatchObject({
          id: evidence.id,
          companyId: ready.companyId,
          clientId: ready.clientId,
          type: 'payment-evidence',
          title: evidence.title,
          purpose: evidence.purpose,
          workingRevision: evidence.revision,
        });
        expect(actual).not.toHaveProperty('projectAssociation');
        expect(actual.paymentEvidenceSource).toEqual({
          format: 'PAYMENT_EVIDENCE_SOURCE/1',
          receivingCompanyLabel: ready.companyName,
          sourceDescription: evidence.sourceDescription,
          receivedOn: evidence.receivedOn,
          registeredAt: evidence.registeredAt,
          registeredBy: evidence.registeredBy,
          payer: payerAvailable
            ? { kind: 'AVAILABLE', party: party(evidence.payer) }
            : { kind: 'UNAVAILABLE' },
        });
        const corrections = await ready.read(
          `/documents/${evidence.id}/correction-history`,
          ready.companyId,
        );
        expect(corrections.corrections).toHaveLength(evidence.corrections);
        const pageOfVersions = await ready.read(
          `/documents/${evidence.id}/versions`,
          ready.companyId,
        );
        expect(pageOfVersions.workingRevision).toBe(evidence.revision);
        if (!Array.isArray(pageOfVersions.versions))
          throw new Error('Expected the native Evidence Versions');
        const actualVersions = pageOfVersions.versions.map(paymentObject);
        expect(actualVersions).toHaveLength(evidence.versions.length);
        expect(
          actualVersions.filter((version) => version.status === 'draft'),
        ).toHaveLength(
          evidence.versions.some((version) => version.status === 'draft')
            ? 1
            : 0,
        );
        expect(
          actualVersions.filter((version) => version.status === 'official'),
        ).toHaveLength(
          evidence.versions.some((version) => version.status === 'official')
            ? 1
            : 0,
        );
        for (const version of evidence.versions) {
          const actualVersion = actualVersions.find(
            (entry) => entry.id === version.id,
          );
          if (!actualVersion)
            throw new Error(
              'Missing an independently modeled Evidence Version',
            );
          expect(actualVersion.number).toBe(version.number);
          expect(actualVersion.status).toBe(version.status);
          expect(actualVersion.representations).toEqual([]);
          if (version.frozen)
            expect(actualVersion.frozen).toMatchObject(version.frozen);
          const latest = version.uploads.at(-1);
          if (!latest)
            expect(actualVersion.pdfContent).toEqual({ state: 'absent' });
          else
            expect(actualVersion.pdfContent).toMatchObject({
              state: 'stored',
              access: 'granted',
              representationId: latest.id,
              fileName: latest.name,
              size: bytes(latest.variant).length,
              sha256: createHash('sha256')
                .update(bytes(latest.variant))
                .digest('hex'),
            });
          const stored = await ready.read(
            `/documents/${evidence.id}/versions/${version.id}/content/history`,
            ready.companyId,
          );
          if (!Array.isArray(stored.uploads))
            throw new Error('Expected the native Evidence PDF history');
          expect(
            stored.uploads.map(
              (upload) => paymentObject(upload).representationId,
            ),
          ).toEqual([...version.uploads].reverse().map((pdf) => pdf.id));
          for (const pdf of version.uploads) {
            const original = await page.request.get(
              `${paymentApiOrigin}/documents/${evidence.id}/versions/${version.id}/content/${pdf.id}`,
              { headers },
            );
            expect(original.status()).toBe(200);
            expect(await original.body()).toEqual(bytes(pdf.variant));
          }
        }
      }
      const evidence = selectedEvidence();
      if (intent) {
        await expect(
          source.getByRole('button', {
            name: retryLabel(intent.plan),
            exact: true,
          }),
        ).toBeVisible();
        return;
      }
      if (failedRead) return;
      await expect(
        source.getByRole('heading', { name: evidence.title, exact: true }),
      ).toBeVisible();
      await expect(
        source.getByText(evidence.sourceDescription, { exact: true }),
      ).toBeVisible();
      await expect(
        source.getByRole('button', {
          name: versionWord('appendReference'),
          exact: true,
        }),
      ).toHaveCount(0);
      for (const version of evidence.versions) {
        const button = source.getByRole('button', {
          name: versionLabel(version.number),
          exact: true,
        });
        await expect(button).toBeVisible();
        await expect(button.locator('..')).toContainText(
          versionWord(
            version.status === 'draft'
              ? 'statusDraft'
              : version.status === 'official'
                ? 'statusOfficial'
                : 'statusSuperseded',
          ),
        );
      }
      const selected = evidence.versions.find(
        (version) => version.number === selectedVersion,
      );
      if (!selected) throw new Error('Expected the selected model Version');
      const latest = selected.uploads.at(-1);
      if (latest)
        await expect(
          source
            .locator('.payment-evidence-pdf-read')
            .getByText(latest.name, { exact: true })
            .first(),
        ).toBeVisible();
      else
        await expect(
          source.getByText(pdfWord('absent'), { exact: true }),
        ).toBeVisible();
      if (selected.status === 'draft' && !latest)
        await expect(
          source.getByRole('button', {
            name: versionWord('designate'),
            exact: true,
          }),
        ).toBeDisabled();
      if (payerAvailable)
        await expect(
          source
            .getByRole('region', { name: word('payer'), exact: true })
            .getByText(party(evidence.payer).legalName, { exact: true }),
        ).toBeVisible();
      else
        await expect(
          source.getByText(word('payerUnavailable'), { exact: true }),
        ).toBeVisible();
      expect(await page.evaluate(() => 'literalEvidence' in window)).toBe(
        false,
      );
    }
    async function dispose() {
      failedRead?.dispose();
      failedRead = null;
      page.off('request', observe);
      const removals = await Promise.allSettled([
        removeRoute(page, '**/api/documents/**', denyRead),
        removeRoute(page, '**/api/**', identify),
      ]);
      const errors = removals.flatMap((removal) =>
        removal.status === 'rejected' ? [removal.reason] : [],
      );
      if (errors.length)
        throw new AggregateError(errors, 'Evidence sequence disposal failed');
    }
    try {
      await page.route('**/api/**', identify);
      await page.route('**/api/documents/**', denyRead);
      page.on('request', observe);
      await openPaymentEvidence(
        page,
        ready,
        info.project.name.endsWith('narrow'),
      );
      await commit({ kind: 'registration', payer: initial, index: 1 }, 'none');
    } catch (error) {
      try {
        await dispose();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          'Evidence source preparation and disposal failed',
          { cause: cleanup },
        );
      }
      throw error;
    }
    return {
      actions(value) {
        const actions: BrowserAction[] = [
          {
            label: 'change-interface-locale',
            run: async () => {
              await selectOption(page.locator('#interface-locale'), {
                value: value.locale,
              });
              locale = value.locale;
            },
          },
        ];
        if (intent)
          actions.push({
            label: 'retry-exact-evidence-command-with-double-admission',
            run: retry,
          });
        else if (failedRead)
          actions.push({
            label: 'retry-confirmed-evidence-read-without-writing',
            run: retryRead,
          });
        else {
          const evidence = selectedEvidence();
          actions.push(
            {
              label: 'reselect-source-retires-old-selection',
              run: () => openRecord(evidence),
            },
            { label: 'toggle-only-native-payer-projection', run: togglePayer },
          );
          if (records.length < 3 && payerAvailable)
            for (const fault of ['none', 'lost-receipt'] satisfies Fault[])
              actions.push({
                label: `register-another-evidence-${fault}`,
                run: () =>
                  commit(
                    {
                      kind: 'registration',
                      payer: value.payer,
                      index: records.length + 1,
                    },
                    fault,
                  ),
              });
          for (const other of records)
            if (other !== evidence)
              actions.push({
                label: `select-evidence-${other.index}`,
                run: () => openRecord(other),
              });
          const draft = evidence.versions.find(
            (version) => version.status === 'draft',
          );
          const official = evidence.versions.find(
            (version) => version.status === 'official',
          );
          if (draft) {
            actions.push({
              label: 'choose-exact-evidence-pdf',
              run: async () => {
                await selectVersion(draft);
                await source
                  .getByLabel(pdfWord('fileLabel'), { exact: true })
                  .setInputFiles({
                    name: filename(value.variant),
                    mimeType: 'application/pdf',
                    buffer: bytes(value.variant),
                  });
                selectedFile = value.variant;
              },
            });
            for (const fault of [
              'none',
              'lost-receipt',
              'failed-read',
            ] satisfies Fault[]) {
              actions.push({
                label: `preserve-evidence-pdf-${fault}`,
                run: () =>
                  commit(
                    {
                      kind: 'pdf',
                      evidence,
                      version: draft,
                      variant: selectedFile ?? value.variant,
                    },
                    fault,
                  ),
              });
              actions.push({
                label: `correct-literal-evidence-metadata-${fault}`,
                run: () =>
                  commit(
                    {
                      kind: 'correction',
                      evidence,
                      title: `${title(evidence.index)} correction ${evidence.revision}`,
                      purpose: `Literal purpose ${value.variant} Ș Я é <script>literalEvidence()</script>`,
                    },
                    fault,
                  ),
              });
              if (draft.uploads.length)
                actions.push({
                  label: `designate-evidence-${fault}`,
                  run: () =>
                    commit(
                      { kind: 'designation', evidence, version: draft },
                      fault,
                    ),
                });
            }
          } else if (official && evidence.versions.length < 4)
            for (const fault of [
              'none',
              'lost-receipt',
              'failed-read',
            ] satisfies Fault[])
              actions.push({
                label: `start-empty-evidence-successor-${fault}`,
                run: () =>
                  commit(
                    { kind: 'successor', evidence, version: official },
                    fault,
                  ),
              });
          for (const version of evidence.versions)
            actions.push({
              label: `select-native-evidence-version-${version.number}`,
              run: () => selectVersion(version),
            });
          const downloadable = evidence.versions.find(
            (version) => version.uploads.length,
          );
          const pdf = downloadable?.uploads.at(-1);
          if (downloadable && pdf) {
            actions.push(
              {
                label: 'download-exact-native-evidence-pdf',
                run: () => download(evidence, downloadable, pdf),
              },
              {
                label: 'download-original-evidence-history-tuple',
                run: () => history(evidence, downloadable),
              },
            );
            for (const status of [200, 403] satisfies Array<200 | 403>)
              actions.push({
                label: `retire-held-evidence-pdf-${status}`,
                run: () => heldDownload(evidence, downloadable, pdf, status),
              });
          }
        }
        return actions;
      },
      verify,
      async settle() {
        if (intent) await retry();
        if (failedRead) await retryRead();
        await verify();
      },
      dispose,
      describe: () => ({
        locale,
        selectedSource: current?.index ?? null,
        selectedVersion,
        selectedFile,
        payerAvailable,
        pending: intent?.plan.kind ?? null,
        failedRead: failedRead !== null,
        failedReads,
        writes: sent.length,
        sources: records.map((evidence) => ({
          index: evidence.index,
          payer: evidence.payer,
          revision: evidence.revision,
          corrections: evidence.corrections,
          versions: evidence.versions.map((version) => ({
            number: version.number,
            status: version.status,
            pdfs: version.uploads.map((pdf) => pdf.variant),
          })),
        })),
      }),
    };
  },
};
