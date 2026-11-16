import * as fc from 'fast-check';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Request, Route } from '@playwright/test';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import { formatMessage, resolveMessage } from '../src/localization/messages';
import { documentPdfMessages } from '../src/documents/document-pdf.copy';
import { documentVersionsMessages } from '../src/documents/document-versions.copy';
import { companyContextMessages } from '../src/company/company-context.copy';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import { expect, expectApiFailure } from './ui-chaos.fixture';
import { removeRoute } from './route-removal';
import { replaceSourceBeforePdfReply } from './document-held-download.fixture';
import { expectValue, selectOption } from './select-option';
import {
  prepareDocumentSequenceSource,
  documentApiOrigin,
  documentIdentities,
  documentObject,
  documentText,
} from './document-sequence-source.fixture';

type Variant = 'a' | 'b';
type Values = { locale: InterfaceLocale; variant: Variant };
type Pdf = { id: string; variant: Variant; name: string };
type Version = {
  id: string;
  number: number;
  status: 'draft' | 'official' | 'superseded';
  references: string[];
  uploads: Pdf[];
};
type Sent = { url: string; key: string; body: Buffer | null };
type Plan =
  | { kind: 'pdf'; version: number; variant: Variant }
  | { kind: 'designation' | 'successor'; version: number };
type Intent = { plan: Plan; sent: Sent; receipt: Record<string, unknown> };

function createDocumentAdapter(
  mode: 'versions' | 'pdf',
): BrowserSequenceAdapter<Variant, Values> {
  return {
    caseId: mode === 'versions' ? 'document-version' : 'document-pdf',
    initial: fc.constantFrom<Variant>('a', 'b'),
    values: fc.record({
      locale: fc.constantFrom<InterfaceLocale>('en', 'ro', 'ru', 'fr'),
      variant: fc.constantFrom<Variant>('a', 'b'),
    }),
    async open({ page, info, trial, initial }) {
      const source = await prepareDocumentSequenceSource(
        page,
        `${info.project.name}-${trial}-${randomUUID()}`,
      );
      let locale: InterfaceLocale = 'en';
      let revision = 1;
      const versions: Version[] = [
        {
          id: source.firstVersionId,
          number: 1,
          status: 'draft',
          references: [source.reference],
          uploads: [],
        },
      ];
      let selected: Variant | null = null;
      let intent: Intent | null = null;
      let failedRead = false;
      let failedReads = 0;
      const sent: Sent[] = [];
      const contentReads: string[] = [];
      const documents = page.locator('.working-documents');
      const pdfWord = (key: (typeof documentPdfMessages)['keys'][number]) =>
        resolveMessage(documentPdfMessages, locale, key);
      const word = (key: (typeof documentVersionsMessages)['keys'][number]) =>
        resolveMessage(documentVersionsMessages, locale, key);
      const row = (number: number) =>
        documents.locator('.working-document-version').filter({
          has: page.getByRole('heading', {
            name: formatMessage(word('version'), { number }),
            exact: true,
          }),
        });
      const bytes = (variant: Variant) =>
        variant === 'a' ? source.pdfA : source.pdfB;
      const filename = (variant: Variant) =>
        `fictional-sequence-${variant}.pdf`;
      const draft = () =>
        versions.find((version) => version.status === 'draft');
      const official = () =>
        versions.find((version) => version.status === 'official');
      const identify = (route: Route) =>
        route.fallback({
          headers: {
            ...route.request().headers(),
            ...documentIdentities.member,
          },
        });
      const observe = (request: Request) => {
        const path = new URL(request.url()).pathname;
        if (
          request.method() === 'GET' &&
          path.startsWith(`/api/documents/${source.documentId}/versions/`) &&
          path.includes('/content/')
        )
          contentReads.push(path);
        if (
          request.method() === 'POST' &&
          new URL(request.url()).pathname.startsWith(
            `/api/documents/${source.documentId}/versions`,
          )
        )
          sent.push({
            url: request.url(),
            key: request.headers()['idempotency-key'] ?? '',
            body: request.postDataBuffer(),
          });
      };
      await page.route('**/api/**', identify);
      page.on('request', observe);
      async function chooseCompany(company: 'a' | 'b', closeNavigation = true) {
        const narrow = info.project.name.endsWith('narrow');
        const close = page.getByRole('button', {
          name: resolveMessage(prismeMessages, locale, 'closeNavigation'),
          exact: true,
        });
        if (narrow && !(await close.isVisible()))
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
        await selectOption(control, { value: source.companies[company].id });
        await expect(control).toBeEnabled();
        await expectValue(control, source.companies[company].id);
        if (narrow && closeNavigation) await close.click();
      }
      async function reopen() {
        await page.evaluate(() => {
          location.hash = 'documents';
        });
        await expect(documents).toBeVisible();
        if (
          !(await documents
            .getByRole('heading', { name: source.title, exact: true })
            .isVisible())
        )
          await documents
            .getByRole('button', { name: source.title, exact: true })
            .click();
        await expect(
          documents.getByRole('heading', { name: source.title, exact: true }),
        ).toBeVisible();
        await expect(
          documents.locator('.working-document-version'),
        ).toHaveCount(versions.length);
      }
      const denyRead = async (route: Route) => {
        if (route.request().method() !== 'GET' || !failedRead)
          return route.fallback();
        failedReads += 1;
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'Confirmed native Document change; its independent Versions refresh deliberately fails.',
        });
        await route.fulfill({ status: 503, body: '' });
      };
      const versionsPattern = `**/api/documents/${source.documentId}/versions`;
      await page.route(versionsPattern, denyRead);
      if (mode === 'versions') {
        const stored = await page.request.post(
          `${documentApiOrigin}/documents/${source.documentId}/versions/${source.firstVersionId}/content?expectedRevision=1&fileName=${filename(initial)}`,
          {
            headers: {
              ...source.headers,
              'content-type': 'application/pdf',
              'idempotency-key': randomUUID(),
            },
            data: bytes(initial),
          },
        );
        expect(stored.status()).toBe(201);
        apply(
          { kind: 'pdf', version: 1, variant: initial },
          documentObject(await stored.json()),
        );
      }
      await page.goto('/');
      await chooseCompany('a');
      await reopen();

      function pathFor(plan: Plan) {
        const version = versions.find((entry) => entry.number === plan.version);
        if (!version) throw new Error('Expected an existing model Version');
        const base = `/api/documents/${source.documentId}/versions`;
        return plan.kind === 'pdf'
          ? `${base}/${version.id}/content`
          : plan.kind === 'designation'
            ? `${base}/${version.id}/official-designation`
            : base;
      }
      function apply(plan: Plan, receipt: Record<string, unknown>) {
        expect(receipt.documentId).toBe(source.documentId);
        expect(receipt.workingRevision).toBe(revision + 1);
        const version = versions.find((entry) => entry.number === plan.version);
        if (!version) throw new Error('Expected the command target Version');
        switch (plan.kind) {
          case 'pdf':
            expect(receipt.action).toBe('representation_added');
            expect(receipt.versionId).toBe(version.id);
            expect(receipt.versionNumber).toBe(version.number);
            version.uploads.push({
              id: documentText(receipt.representationId),
              variant: plan.variant,
              name: filename(plan.variant),
            });
            break;
          case 'designation': {
            expect(receipt.action).toBe('designated_official');
            expect(receipt.versionId).toBe(version.id);
            expect(receipt.versionNumber).toBe(version.number);
            const previous = official();
            expect(receipt.supersededVersionNumber).toBe(
              previous?.number ?? null,
            );
            if (previous) previous.status = 'superseded';
            version.status = 'official';
            break;
          }
          case 'successor': {
            expect(receipt.action).toBe('drafted');
            expect(receipt.sourceVersionNumber).toBe(version.number);
            const number =
              Math.max(...versions.map((entry) => entry.number)) + 1;
            expect(receipt.versionNumber).toBe(number);
            versions.push({
              id: documentText(receipt.versionId),
              number,
              status: 'draft',
              references: [source.reference],
              uploads: [],
            });
            break;
          }
          default: {
            const exhaustive: never = plan;
            return exhaustive;
          }
        }
        revision += 1;
      }
      async function clickPlan(plan: Plan) {
        if (plan.kind === 'pdf')
          await row(plan.version)
            .getByRole('button', { name: pdfWord('save'), exact: true })
            .click();
        else if (plan.kind === 'successor')
          await row(plan.version)
            .getByRole('button', { name: word('startDraft'), exact: true })
            .click();
        else {
          await row(plan.version)
            .getByRole('button', { name: word('designate'), exact: true })
            .click();
          await documents
            .getByRole('button', { name: word('confirm'), exact: true })
            .click();
        }
      }
      async function chooseFile(variant: Variant) {
        const current = draft();
        if (!current) throw new Error('Expected an editable draft');
        await row(current.number)
          .getByLabel(pdfWord('fileLabel'))
          .setInputFiles({
            name: filename(variant),
            mimeType: 'application/pdf',
            buffer: bytes(variant),
          });
        selected = variant;
      }
      async function appendOfficialReference(variant: Variant) {
        const current = official();
        if (!current) throw new Error('Expected an official reference target');
        const path = `/api/documents/${source.documentId}/versions/${current.id}/representations`;
        const url = `https://example.test/generated-official-${variant}-${revision}`;
        const form = variant === 'a' ? 'editable' : 'other';
        const before = sent.length;
        await selectOption(row(current.number).getByLabel(word('form')), {
          value: form,
        });
        await row(current.number)
          .getByLabel(word('url'), { exact: true })
          .fill(url);
        await row(current.number)
          .getByRole('button', { name: word('appendReference'), exact: true })
          .click();
        const completed = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === path,
        );
        await documents
          .getByRole('button', { name: word('confirmAppend'), exact: true })
          .click();
        const response = await completed;
        expect(response.status()).toBe(201);
        const receipt = documentObject(await response.json());
        expect(receipt).toMatchObject({
          action: 'representation_added',
          documentId: source.documentId,
          versionId: current.id,
          versionNumber: current.number,
          workingRevision: revision + 1,
          appendedAfterDesignation: true,
        });
        expect(sent).toHaveLength(before + 1);
        expect(sent[before]?.body?.toString('utf8')).toBe(
          JSON.stringify({ expectedRevision: revision, form, url }),
        );
        expect(sent[before]?.key).toMatch(/^[0-9a-f-]{36}$/iu);
        current.references.push(url);
        revision += 1;
      }
      async function commit(
        plan: Plan,
        fault: 'none' | 'lost-receipt' | 'failed-read',
      ) {
        const path = pathFor(plan);
        const before = sent.length;
        let nativeReceipt: Record<string, unknown> | null = null;
        const pattern = `**${path}${plan.kind === 'pdf' ? '?*' : ''}`;
        const lose = async (route: Route) => {
          if (route.request().method() !== 'POST') return route.fallback();
          const response = await route.fetch({
            headers: {
              ...route.request().headers(),
              ...documentIdentities.member,
            },
          });
          expect([200, 201]).toContain(response.status());
          nativeReceipt = documentObject(await response.json());
          expectApiFailure({
            page,
            request: route.request(),
            reason:
              'Native Document command committed; its durable receipt is deliberately lost.',
          });
          await route.abort('connectionfailed');
        };
        if (fault === 'lost-receipt') await page.route(pattern, lose);
        if (fault === 'failed-read') failedRead = true;
        const response =
          fault === 'lost-receipt'
            ? null
            : page.waitForResponse(
                (reply) =>
                  reply.request().method() === 'POST' &&
                  new URL(reply.url()).pathname === path,
              );
        try {
          await clickPlan(plan);
          if (response) {
            const reply = await response;
            expect([200, 201]).toContain(reply.status());
            nativeReceipt = documentObject(await reply.json());
          } else
            await expect(
              documents.getByRole('button', {
                name:
                  plan.kind === 'pdf' ? pdfWord('retry') : word('retryCommand'),
                exact: true,
              }),
            ).toBeVisible();
        } finally {
          if (fault === 'lost-receipt') await removeRoute(page, pattern, lose);
        }
        if (!nativeReceipt)
          throw new Error('Expected a genuine native command receipt');
        expect(sent).toHaveLength(before + 1);
        const submitted = sent[before];
        if (!submitted) throw new Error('Expected the actual browser command');
        expect(submitted.key).toMatch(/^[0-9a-f-]{36}$/iu);
        if (plan.kind === 'pdf') {
          expect(submitted.body).toEqual(bytes(plan.variant));
          expect(
            new URL(submitted.url).searchParams.get('expectedRevision'),
          ).toBe(String(revision));
          expect(new URL(submitted.url).searchParams.get('fileName')).toBe(
            filename(plan.variant),
          );
        } else
          expect(submitted.body?.toString('utf8')).toBe(
            JSON.stringify({ expectedRevision: revision }),
          );
        apply(plan, nativeReceipt);
        selected = null;
        if (fault === 'lost-receipt')
          intent = { plan, sent: submitted, receipt: nativeReceipt };
        if (fault === 'failed-read') {
          await expect(
            documents.getByRole('button', { name: word('retry'), exact: true }),
          ).toBeVisible();
          expect(failedReads).toBeGreaterThan(0);
          await expect(
            documents.getByRole('button', {
              name: pdfWord('retry'),
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            documents.getByRole('button', {
              name: word('retryCommand'),
              exact: true,
            }),
          ).toHaveCount(0);
        }
      }
      async function retry() {
        const current = intent;
        if (!current)
          throw new Error('Expected an exact Document retry intention');
        const before = sent.length;
        const response = page.waitForResponse(
          (reply) =>
            reply.request().method() === 'POST' &&
            reply.url() === current.sent.url,
        );
        await documents
          .getByRole('button', {
            name:
              current.plan.kind === 'pdf'
                ? pdfWord('retry')
                : word('retryCommand'),
            exact: true,
          })
          .evaluate((button) => {
            if (!(button instanceof HTMLButtonElement))
              throw new Error('Expected a Document retry control');
            button.click();
            button.click();
          });
        expect(await (await response).json()).toEqual(current.receipt);
        expect(sent).toHaveLength(before + 1);
        expect(sent[before]).toEqual(current.sent);
        intent = null;
      }
      async function download(
        version: Version,
        pdf: Pdf,
        control = row(version.number)
          .getByRole('button', {
            name: formatMessage(pdfWord('download'), {
              version: version.number,
            }),
            exact: true,
          })
          .first(),
      ) {
        const before = contentReads.length;
        const saving = page.waitForEvent('download');
        await control.click();
        const result = await saving;
        expect(result.suggestedFilename()).toBe(pdf.name);
        const file = await result.path();
        if (!file) throw new Error('Expected the native browser PDF download');
        expect(await readFile(file)).toEqual(bytes(pdf.variant));
        expect(contentReads.slice(before)).toEqual([
          `/api/documents/${source.documentId}/versions/${version.id}/content/${pdf.id}`,
        ]);
      }
      async function replaceCompanySource() {
        failedRead = false;
        await chooseCompany('b', false);
        await chooseCompany('a');
        selected = null;
        intent = null;
        await reopen();
        await expect(
          documents.getByRole('button', {
            name: pdfWord('retry'),
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          documents.getByRole('button', {
            name: word('retryCommand'),
            exact: true,
          }),
        ).toHaveCount(0);
      }
      async function retireHeldDownload(
        version: Version,
        pdf: Pdf,
        status: 200 | 403,
      ) {
        let restoredReader: string | null = null;
        await replaceSourceBeforePdfReply({
          page,
          companyId: source.companyId,
          path: `/api/documents/${source.documentId}/versions/${version.id}/content/${pdf.id}`,
          identity: documentIdentities.member,
          status,
          beforeRead: async () => {
            if (status === 403)
              await source.revoke('company-document-content-reader', 'a');
          },
          afterCapture: async (response) => {
            if (status === 200)
              expect(await response.body()).toEqual(bytes(pdf.variant));
            else
              restoredReader = documentText(
                (await source.grant('company-document-content-reader', 'a')).id,
              );
          },
          start: () =>
            row(version.number)
              .getByRole('button', {
                name: formatMessage(pdfWord('download'), {
                  version: version.number,
                }),
                exact: true,
              })
              .first()
              .click(),
          replace: replaceCompanySource,
        });
        if (restoredReader) {
          const actor = await source.read(
            '/access/current-actor',
            source.companyId,
            'member',
          );
          const grants = documentObject(actor.activeCompany).grants;
          if (!Array.isArray(grants))
            throw new Error('Expected current native PDF Reader grants');
          const reader = grants
            .map(documentObject)
            .find(
              (grant) => grant.bundle === 'company_document_content_reader',
            );
          expect(reader?.assignmentId).toBe(restoredReader);
        }
      }
      async function historicalDownload(version: Version) {
        const history = row(version.number).getByRole('list', {
          name: pdfWord('history'),
          exact: true,
        });
        if (!(await history.isVisible()))
          await row(version.number)
            .getByRole('button', { name: pdfWord('history'), exact: true })
            .click();
        await expect(history.getByRole('listitem')).toHaveCount(
          version.uploads.length,
        );
        const oldest = version.uploads[0];
        if (!oldest) throw new Error('Expected the original historical PDF');
        const original = history
          .getByRole('listitem')
          .nth(version.uploads.length - 1);
        await expect(
          original.getByText(oldest.name, { exact: true }),
        ).toBeVisible();
        await download(
          version,
          oldest,
          original.getByRole('button', {
            name: formatMessage(pdfWord('download'), {
              version: version.number,
            }),
            exact: true,
          }),
        );
      }
      async function verify() {
        const actual = await source.versions();
        expect(actual.revision).toBe(revision);
        expect(actual.versions).toHaveLength(versions.length);
        expect(
          actual.versions.filter((version) => version.status === 'draft'),
        ).toHaveLength(draft() ? 1 : 0);
        expect(
          actual.versions.filter((version) => version.status === 'official'),
        ).toHaveLength(official() ? 1 : 0);
        for (const expected of versions) {
          const current = actual.versions.find(
            (version) => version.id === expected.id,
          );
          if (!current) throw new Error('Missing the native model Version');
          expect(current.number).toBe(expected.number);
          expect(current.status).toBe(expected.status);
          if (!Array.isArray(current.representations))
            throw new Error('Expected native Version references');
          expect(
            current.representations.map(
              (reference) => documentObject(reference).url,
            ),
          ).toEqual(expected.references);
          if (expected.status !== 'draft')
            expect(documentObject(current.frozen).title).toBe(source.title);
          const pdf = documentObject(current.pdfContent);
          const last = expected.uploads.at(-1);
          if (!last) expect(pdf).toEqual({ state: 'absent' });
          else {
            expect(pdf.representationId).toBe(last.id);
            expect(pdf.fileName).toBe(last.name);
            expect(pdf.sha256).toBe(
              createHash('sha256').update(bytes(last.variant)).digest('hex'),
            );
            const history = await page.request.get(
              `${documentApiOrigin}/documents/${source.documentId}/versions/${expected.id}/content/history`,
              { headers: source.headers },
            );
            expect(history.status()).toBe(200);
            const uploads = documentObject(await history.json()).uploads;
            if (!Array.isArray(uploads))
              throw new Error('Expected native PDF history');
            expect(
              uploads.map((upload) => documentObject(upload).representationId),
            ).toEqual(
              [...expected.uploads].reverse().map((upload) => upload.id),
            );
            for (const upload of expected.uploads) {
              const original = await page.request.get(
                `${documentApiOrigin}/documents/${source.documentId}/versions/${expected.id}/content/${upload.id}`,
                { headers: source.headers },
              );
              expect(original.status()).toBe(200);
              expect(await original.body()).toEqual(bytes(upload.variant));
            }
          }
          if (!intent && !failedRead) {
            await expect(row(expected.number)).toBeVisible();
            await expect(
              row(expected.number).locator('.working-document-version-status'),
            ).toHaveText(
              word(
                expected.status === 'draft'
                  ? 'statusDraft'
                  : expected.status === 'official'
                    ? 'statusOfficial'
                    : 'statusSuperseded',
              ),
            );
            const references = row(expected.number).locator(
              '.working-document-version-references a',
            );
            await expect(references).toHaveCount(expected.references.length);
            expect(
              await references.evaluateAll((links) =>
                links.map((link) => link.getAttribute('href')),
              ),
            ).toEqual(expected.references);
            if (last)
              await expect(
                row(expected.number)
                  .getByText(last.name, { exact: true })
                  .first(),
              ).toBeVisible();
          }
        }
      }
      if (mode === 'pdf') await chooseFile(initial);
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
          actions.push({
            label: 'company-a-b-a-retires-source-intent',
            run: replaceCompanySource,
          });
          if (intent)
            actions.push({
              label: 'retry-exact-command-with-double-admission',
              run: retry,
            });
          else if (failedRead)
            actions.push({
              label: 'retry-confirmed-read-without-writing',
              run: async () => {
                const before = sent.length;
                failedRead = false;
                await documents
                  .getByRole('button', { name: word('retry'), exact: true })
                  .click();
                await expect(
                  documents.locator('.working-document-version'),
                ).toHaveCount(versions.length);
                expect(sent).toHaveLength(before);
              },
            });
          else {
            actions.push({
              label: 'navigate-away-and-reopen-native-document',
              run: async () => {
                await page.evaluate(() => {
                  location.hash = 'overview';
                });
                await expect(documents).not.toBeVisible();
                await reopen();
              },
            });
            const currentDraft = draft();
            const currentOfficial = official();
            if (mode === 'pdf' && currentDraft) {
              actions.push({
                label: 'choose-exact-pdf-bytes',
                run: () => chooseFile(value.variant),
              });
              const variant = selected;
              if (variant)
                for (const fault of [
                  'none',
                  'lost-receipt',
                  'failed-read',
                ] satisfies Array<'none' | 'lost-receipt' | 'failed-read'>)
                  actions.push({
                    label: `preserve-pdf-${fault}`,
                    run: () =>
                      commit(
                        { kind: 'pdf', version: currentDraft.number, variant },
                        fault,
                      ),
                  });
            }
            if (mode === 'versions') {
              const plan: Plan | null = currentDraft
                ? { kind: 'designation', version: currentDraft.number }
                : currentOfficial && versions.length < 4
                  ? { kind: 'successor', version: currentOfficial.number }
                  : null;
              if (plan)
                for (const fault of [
                  'none',
                  'lost-receipt',
                  'failed-read',
                ] satisfies Array<'none' | 'lost-receipt' | 'failed-read'>)
                  actions.push({
                    label: `${plan.kind}-${fault}`,
                    run: () => commit(plan, fault),
                  });
              if (currentOfficial && currentOfficial.references.length < 10)
                actions.push({
                  label: 'append-reference-to-exact-official-version',
                  run: () => appendOfficialReference(value.variant),
                });
            }
            const downloadable = versions.find(
              (version) => version.uploads.length > 0,
            );
            const pdf = downloadable?.uploads.at(-1);
            if (downloadable && pdf)
              actions.push({
                label: 'download-native-immutable-pdf',
                run: () => download(downloadable, pdf),
              });
            if (downloadable && pdf)
              for (const status of [200, 403] satisfies Array<200 | 403>)
                actions.push({
                  label: `retire-held-native-pdf-${status}`,
                  run: () => retireHeldDownload(downloadable, pdf, status),
                });
            const historical = versions.find(
              (version) => version.uploads.length > 1,
            );
            if (historical)
              actions.push({
                label: 'download-exact-historical-pdf',
                run: () => historicalDownload(historical),
              });
          }
          return actions;
        },
        verify,
        async settle() {
          if (intent) await retry();
          if (failedRead) {
            failedRead = false;
            await documents
              .getByRole('button', { name: word('retry'), exact: true })
              .click();
          }
          await verify();
        },
        async dispose() {
          page.off('request', observe);
          await removeRoute(page, versionsPattern, denyRead);
          await removeRoute(page, '**/api/**', identify);
        },
        describe: () => ({
          revision,
          locale,
          selected,
          intent: intent?.plan.kind ?? null,
          failedRead,
          failedReads,
          writes: sent.length,
          versions: versions.map((version) => ({
            number: version.number,
            status: version.status,
            pdfs: version.uploads.map((pdf) => pdf.variant),
          })),
        }),
      };
    },
  };
}

export const documentVersionSequenceAdapter = createDocumentAdapter('versions');
export const documentPdfSequenceAdapter = createDocumentAdapter('pdf');
