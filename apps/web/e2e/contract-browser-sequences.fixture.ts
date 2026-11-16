import * as fc from 'fast-check';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Download, Request, Route } from '@playwright/test';
import { resolveMessage } from '../src/localization/messages';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import { reportedSigningMessages } from '../src/contract/reported-signing.copy';
import { contractMessages } from '../src/contract/contract.copy';
import { modelContractMessages } from '../src/contract/model-contract.copy';
import { contractProjectsMessages } from '../src/contract/contract-projects.copy';
import { readModelContract } from '../src/contract/model-contract-response';
import { readContractProjectLink } from '../src/contract/contract-projects-response';
import {
  readReportedSigning,
  type ReportedSigningView,
} from '../src/contract/reported-signing-response';
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
import {
  prepareReceivedContractCase,
  modelContractIdentities,
  object,
  text,
  selectReceivedCompany,
  navigateReceived,
} from './received-contract.acceptance.fixture';
import { selectOption } from './select-option';
import { removeRoute } from './route-removal';
import { replaceSourceBeforePdfReply } from './document-held-download.fixture';

type Initial = 'unknown-dates' | 'reported-date';
type Values = { locale: InterfaceLocale; variant: 'a' | 'b' };
type Draft = {
  providerSignatory: {
    label: string;
    signedOn: string | null;
    mandate: { kind: 'UNKNOWN' };
  };
  clientSignatory: {
    label: string;
    signedOn: null;
    mandate: { kind: 'DECLARED_UNVERIFIED'; basis: string };
  };
  concordanceBasis: string;
  acceptanceBasis: string;
};
type Sent = {
  path: string;
  method: string;
  companyId: string | undefined;
  key: string | undefined;
  body: string | null;
};
type DeclarationIntent = {
  kind: 'declare';
  draft: Draft;
  sent: Sent;
  receipt: Record<string, unknown>;
};
type LinkIntent = {
  kind: 'link';
  sent: Sent;
  receipt: Record<string, unknown>;
};
type Phase =
  | { kind: 'editing'; draft: Draft | null }
  | { kind: 'uncertain'; intent: DeclarationIntent | LinkIntent }
  | { kind: 'declared' | 'linked' };
const origin = 'http://127.0.0.1:4174/api';
const warnings = ['ANNEX_SCOPE_REVIEWED', 'MODEL_WORDING_REVIEWED'];

/** The native recipe is the existing reported-signing journey, not a second business implementation. */
export const contractSigningSequenceAdapter: BrowserSequenceAdapter<
  Initial,
  Values
> = {
  caseId: 'contract-signing',
  initial: fc.constantFrom<Initial>('unknown-dates', 'reported-date'),
  values: fc.record({
    locale: fc.constantFrom<InterfaceLocale>('en', 'ro', 'ru', 'fr'),
    variant: fc.constantFrom<'a' | 'b'>('a', 'b'),
  }),
  async open({ page, info, trial, initial }) {
    const narrow = info.project.name.endsWith('narrow');
    const suffix = `${trial}-${randomUUID()}`;
    const ready = await prepareReceivedContractCase(page, suffix);
    for (const bundle of [
      'company-received-contract-access',
      'company-contract-approver',
      'company-project',
      'company-task-manager',
      'company-project-template-user',
      'company-contract-signature-declarer',
    ])
      await ready.command('/' + bundle + '-assignments', {
        companyId: ready.companyId,
        workspaceMembershipId: ready.preparerId,
      });
    const root = `/contracts/opportunities/${ready.opportunityId}`;
    await ready.command(
      `${root}/versions/${ready.contractVersionId}/approve`,
      {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: warnings,
        reviewBasis:
          'Synthetic source and thirteen activities deliberately reviewed',
      },
      modelContractIdentities.preparer,
      ready.companyId,
    );
    const document = await ready.command(
      '/documents',
      {
        type: 'received-contract',
        opportunityId: ready.opportunityId,
        contractId: ready.contractId,
        contractVersionId: ready.contractVersionId,
        title: 'Sequence received Contract',
        purpose: 'Preserve the exact synthetic received PDF',
        sourceDescription: 'Synthetic action sequence source',
        receivedOn: null,
      },
      modelContractIdentities.preparer,
      ready.companyId,
    );
    const documentId = text(document.id);
    const documentVersionId = text(object(document.version).id);
    const headers = {
      ...modelContractIdentities.preparer,
      'x-company-context-id': ready.companyId,
    };
    const upload = await page.request.post(
      `${origin}/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=sequence-signing.pdf`,
      {
        headers: {
          ...headers,
          'idempotency-key': randomUUID(),
          'content-type': 'application/pdf',
        },
        data: ready.pdfA,
      },
    );
    expect(upload.status()).toBe(201);
    const uploadBody = object(await upload.json());
    const representationId = text(uploadBody.representationId);
    const designated = await page.request.post(
      `${origin}/documents/${documentId}/versions/${documentVersionId}/official-designation`,
      {
        headers: { ...headers, 'idempotency-key': randomUUID() },
        data: { expectedRevision: 2 },
      },
    );
    expect(designated.status()).toBe(200);
    const projectTitle = 'Sequence thirteen-Task Project ' + suffix;
    const project = await ready.command(
      '/projects/from-template',
      {
        title: projectTitle,
        clientAccountId: ready.clientId,
        templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
        templateVersion: 1,
      },
      modelContractIdentities.preparer,
      ready.companyId,
    );
    const projectId = text(project.id);
    const tasksBefore = await ready.read(
      `/projects/${projectId}/tasks`,
      ready.companyId,
    );
    expect(tasksBefore.tasks).toHaveLength(13);
    const offerBefore = await ready.read(
      `/offers/opportunities/${ready.opportunityId}`,
      ready.companyId,
    );
    const offerHtml = text(
      object(object(object(offerBefore.offer).version).representation).html,
    );
    const baseline = readModelContract(
      (await ready.read(root, ready.companyId)).contract,
    );
    expect(baseline.revision).toBe(2);
    expect(baseline.version.versionNumber).toBe(1);
    expect(baseline.version.signature).toBeNull();
    expect(baseline.version.decision?.kind).toBe('APPROVE');
    const decision = baseline.version.decision;
    if (decision?.kind !== 'APPROVE')
      throw new Error('The native recipe requires an exact reviewed approval.');
    const approvalDecisionId = decision.id;
    const declarationPath =
      root + `/versions/${ready.contractVersionId}/signing-declarations`;
    const linkPath = root + '/projects';
    const pdfPath = `/documents/${documentId}/versions/${documentVersionId}/content/${representationId}`;
    let locale: InterfaceLocale = 'en';
    let phase: Phase = { kind: 'editing', draft: null };
    let declaration: ReportedSigningView | null = null;
    let link: ReturnType<typeof readContractProjectLink> | null = null;
    const sent: Sent[] = [];
    let contentAllowed = true;
    let denialExercised = false;
    let declarerLossExercised = false;
    const heldReplies = new Set<200 | 403>();
    const panel = page.locator('.model-contract-panel');
    const word = (key: (typeof reportedSigningMessages.keys)[number]) =>
      resolveMessage(reportedSigningMessages, locale, key);
    const projectWord = (key: (typeof contractProjectsMessages.keys)[number]) =>
      resolveMessage(contractProjectsMessages, locale, key);
    const form = () =>
      panel.getByRole('region', { name: word('title'), exact: true });
    const projects = () =>
      panel.getByRole('region', { name: projectWord('title'), exact: true });
    const scope = (url: URL) => url.pathname.startsWith('/api/');
    const identityRoute = (route: Route) =>
      route.fallback({
        headers: {
          ...route.request().headers(),
          ...modelContractIdentities.preparer,
        },
      });
    const observe = (request: Request) => {
      const path = new URL(request.url()).pathname;
      if (
        request.method() === 'POST' &&
        ['/api' + declarationPath, '/api' + linkPath].includes(path)
      )
        sent.push({
          path,
          method: request.method(),
          companyId: request.headers()['x-company-context-id'],
          key: request.headers()['idempotency-key'],
          body: request.postData(),
        });
    };
    const idle = observeApiRequests(page, (request) =>
      new URL(request.url()).pathname.startsWith('/api/'),
    );
    let disposed = false;
    async function dispose() {
      if (disposed) return;
      disposed = true;
      idle.dispose();
      page.off('request', observe);
      await removeRoute(page, scope, identityRoute);
    }
    async function settle() {
      await expect
        .poll(idle.isIdle, {
          timeout: IDLE_DEADLINE_MILLISECONDS,
          message:
            'Contract sequence API work must finish before its invariant checks',
        })
        .toBe(true);
    }
    async function openCase() {
      const desiredLocale = locale;
      await page.goto('/');
      await selectOption(page.locator('#interface-locale'), { value: 'en' });
      locale = 'en';
      await selectReceivedCompany(page, ready.companyName, narrow);
      await navigateReceived(page, 'Client Requests', narrow);
      const workspace = page.locator('.commercial-intake-workspace');
      await workspace
        .getByRole('button')
        .filter({ has: page.getByText(ready.subject, { exact: true }) })
        .click();
      if (declaration)
        await expect(
          panel.getByRole('heading', { name: word('recorded'), exact: true }),
        ).toBeVisible();
      else
        await expect(
          form().getByRole('button', { name: word('load'), exact: true }),
        ).toBeEnabled();
      await panel
        .getByRole('button', {
          name: resolveMessage(contractMessages, locale, 'openDocument'),
          exact: true,
        })
        .click();
      await selectOption(page.locator('#interface-locale'), {
        value: desiredLocale,
      });
      locale = desiredLocale;
      await settle();
    }
    async function edit(variant: Values['variant']) {
      const draft: Draft = {
        providerSignatory: {
          label: `  Sequence provider ${variant} — Știință 😀  `,
          signedOn: initial === 'reported-date' ? '2026-01-01' : null,
          mandate: { kind: 'UNKNOWN' },
        },
        clientSignatory: {
          label: ` Sequence Client ${variant} / Компания `,
          signedOn: null,
          mandate: {
            kind: 'DECLARED_UNVERIFIED',
            basis: `  Literal ${variant} mandate\nNo inferred authority  `,
          },
        },
        concordanceBasis: ` Exact synthetic PDF / approved Contract / Offer ${variant} `,
        acceptanceBasis: ` Reported case acceptance ${variant}; signatures remain unverified `,
      };
      const declarationForm = form();
      const loading = declarationForm.getByRole('button', {
        name: word('load'),
        exact: true,
      });
      const response = page.waitForResponse(
        (value) =>
          value.request().method() === 'GET' &&
          new URL(value.url()).pathname ===
            '/api' + declarationPath + '/pdf-candidates',
      );
      await loading.click();
      expect((await response).status()).toBe(200);
      await expect(loading).toBeEnabled();
      await settle();
      const selector = declarationForm.getByLabel(word('choosePdf'), {
        exact: true,
      });
      await selectOption(selector, { value: representationId });
      await expect(selector).toHaveAttribute('data-value', representationId);
      const provider = declarationForm.getByRole('group', {
        name: word('provider'),
        exact: true,
      });
      const client = declarationForm.getByRole('group', {
        name: word('client'),
        exact: true,
      });
      await provider
        .getByLabel(word('label'), { exact: true })
        .fill(draft.providerSignatory.label);
      await provider
        .getByLabel(word('signedOn'), { exact: true })
        .fill(draft.providerSignatory.signedOn ?? '');
      await client
        .getByLabel(word('label'), { exact: true })
        .fill(draft.clientSignatory.label);
      await selectOption(client.getByLabel(word('mandate'), { exact: true }), {
        value: 'DECLARED_UNVERIFIED',
      });
      await client
        .getByLabel(word('mandateBasis'), { exact: true })
        .fill(draft.clientSignatory.mandate.basis);
      await declarationForm
        .getByLabel(word('concordance'), { exact: true })
        .fill(draft.concordanceBasis);
      await declarationForm
        .getByLabel(word('acceptance'), { exact: true })
        .fill(draft.acceptanceBasis);
      for (const checkbox of await declarationForm.getByRole('checkbox').all())
        await checkbox.check();
      phase = { kind: 'editing', draft };
    }
    function validateSent(
      submission: Sent,
      kind: 'declare' | 'link',
      draft?: Draft,
    ) {
      expect(submission.path).toBe(
        '/api' + (kind === 'declare' ? declarationPath : linkPath),
      );
      expect(submission.method).toBe('POST');
      expect(submission.companyId).toBe(ready.companyId);
      expect(submission.key).toMatch(/^[0-9a-f-]{36}$/iu);
      if (submission.body === null)
        throw new Error('Missing the actual native command body.');
      expect(JSON.parse(submission.body)).toEqual(
        kind === 'declare'
          ? {
              expectedContractRevision: 2,
              documentId,
              documentVersionId,
              representationId,
              ...draft,
              acknowledgedWarningCodes: warnings,
            }
          : { projectId, expectedContractRevision: 3 },
      );
    }
    function accept(
      kind: 'declare' | 'link',
      receipt: Record<string, unknown>,
      draft?: Draft,
    ) {
      if (kind === 'declare') {
        if (!draft)
          throw new Error(
            'A declaration requires its independent literal plan.',
          );
        const result = readReportedSigning(receipt, {
          contractId: ready.contractId,
          versionId: ready.contractVersionId,
          versionNumber: 1,
          createdRevision: 1,
          checksum: baseline.version.representation.sha256,
          approvalDecisionId,
        });
        expect(result).toMatchObject({
          ...draft,
          revision: 3,
          actorWorkspaceMembershipId: ready.preparerId,
          acknowledgedWarningCodes: warnings,
        });
        expect(result.pdf).toMatchObject({
          access: 'granted',
          reference: {
            documentId,
            documentVersionId,
            representationId,
            sha256: createHash('sha256').update(ready.pdfA).digest('hex'),
            fileName: 'sequence-signing.pdf',
            size: ready.pdfA.length,
          },
        });
        declaration = result;
      } else {
        const result = readContractProjectLink(receipt);
        expect(result).toMatchObject({
          contractId: ready.contractId,
          projectId,
          revision: 4,
        });
        link = result;
      }
    }
    async function submit(kind: 'declare' | 'link', lost: boolean) {
      const draft = phase.kind === 'editing' ? phase.draft : null;
      if (kind === 'declare' && !draft)
        throw new Error('Complete the actual declaration first.');
      if (kind === 'link')
        await projects()
          .locator(`input[type="radio"][value="${projectId}"]`)
          .check();
      const path = kind === 'declare' ? declarationPath : linkPath;
      const button =
        kind === 'declare'
          ? form().getByRole('button', { name: word('submit'), exact: true })
          : projects().getByRole('button', {
              name: projectWord('link'),
              exact: true,
            });
      await expect(button).toBeEnabled();
      const pattern = (url: URL) => url.pathname === '/api' + path;
      let receipt: Record<string, unknown> | undefined;
      const lose = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const response = await route.fetch({
          headers: {
            ...route.request().headers(),
            ...modelContractIdentities.preparer,
          },
        });
        expect(response.status()).toBe(201);
        receipt = object(await response.json());
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'The native Contract command committed; its conserved receipt is deliberately lost.',
        });
        await route.abort('connectionfailed');
      };
      const before = sent.length;
      if (lost) await page.route(pattern, lose);
      const response = lost
        ? null
        : page.waitForResponse(
            (value) =>
              value.request().method() === 'POST' &&
              new URL(value.url()).pathname === '/api' + path,
          );
      try {
        await button.click();
        if (response) {
          const native = await response;
          expect(native.status()).toBe(201);
          receipt = object(await native.json());
        } else {
          await expect(
            panel.getByRole('button', {
              name: kind === 'declare' ? word('retry') : projectWord('retry'),
              exact: true,
            }),
          ).toBeVisible();
        }
      } finally {
        if (lost) await removeRoute(page, pattern, lose);
      }
      if (!receipt) throw new Error('Missing the native conserved receipt.');
      expect(sent).toHaveLength(before + 1);
      const submission = sent[before];
      if (!submission)
        throw new Error('Missing the native browser submission.');
      validateSent(submission, kind, draft ?? undefined);
      accept(kind, receipt, draft ?? undefined);
      phase = lost
        ? {
            kind: 'uncertain',
            intent:
              kind === 'declare'
                ? {
                    kind,
                    draft: draft ?? missingDraft(),
                    sent: submission,
                    receipt,
                  }
                : { kind, sent: submission, receipt },
          }
        : { kind: kind === 'declare' ? 'declared' : 'linked' };
      await settle();
    }
    async function retry() {
      if (phase.kind !== 'uncertain')
        throw new Error(
          'An exact retry requires the conserved original intent.',
        );
      const intent = phase.intent;
      const before = sent.length;
      const response = page.waitForResponse(
        (value) =>
          value.request().method() === 'POST' &&
          new URL(value.url()).pathname === intent.sent.path,
      );
      const button = panel.getByRole('button', {
        name: intent.kind === 'declare' ? word('retry') : projectWord('retry'),
        exact: true,
      });
      await expect(button).toBeEnabled();
      await button.evaluate((element) => {
        if (!(element instanceof HTMLButtonElement))
          throw new Error('Expected the displayed native retry button.');
        element.click();
        element.click();
      });
      const native = await response;
      expect(native.status()).toBe(201);
      expect(object(await native.json())).toEqual(intent.receipt);
      await expect(button).toHaveCount(0);
      await settle();
      expect(sent).toHaveLength(before + 1);
      expect(sent[before]).toEqual(intent.sent);
      phase = { kind: intent.kind === 'declare' ? 'declared' : 'linked' };
    }
    async function failIndependentReadThenRecover() {
      const before = sent.length;
      let failures = 0;
      const pattern = (url: URL) => url.pathname === '/api' + root;
      const fail = async (route: Route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        const response = await route.fetch({
          headers: {
            ...route.request().headers(),
            ...modelContractIdentities.preparer,
          },
        });
        expect(response.status()).toBe(200);
        failures += 1;
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'A genuine independent Contract read is lost after the matching command was confirmed.',
        });
        await route.abort('connectionfailed');
      };
      const reload = panel.getByRole('button', {
        name: resolveMessage(contractMessages, locale, 'refresh'),
        exact: true,
      });
      const error = panel.getByText(
        resolveMessage(modelContractMessages, locale, 'refreshFailed'),
        { exact: true },
      );
      await page.route(pattern, fail);
      try {
        await reload.click();
        await expect(error).toBeVisible();
        await settle();
        expect(failures).toBe(1);
        await verify();
        expect(sent).toHaveLength(before);
      } finally {
        await removeRoute(page, pattern, fail);
      }
      const response = page.waitForResponse(
        (value) =>
          value.request().method() === 'GET' &&
          new URL(value.url()).pathname === '/api' + root,
      );
      await reload.click();
      expect((await response).status()).toBe(200);
      await expect(error).toHaveCount(0);
      await settle();
      expect(sent).toHaveLength(before);
    }
    async function download() {
      const pending = page.waitForEvent('download');
      const response = page.waitForResponse(
        (value) =>
          value.request().method() === 'GET' &&
          new URL(value.url()).pathname === '/api' + pdfPath,
      );
      await panel
        .getByRole('button', { name: word('download'), exact: true })
        .click();
      expect((await response).status()).toBe(200);
      const saved = await pending;
      expect(saved.suggestedFilename()).toBe('sequence-signing.pdf');
      const path = await saved.path();
      if (!path) throw new Error('Missing the exact received PDF download.');
      expect(await readFile(path)).toEqual(ready.pdfA);
    }
    async function restoreIndependentAuthority() {
      for (const bundle of [
        'company-contract-signature-declarer',
        'company-document-content-reader',
      ])
        await ready.command('/' + bundle + '-assignments', {
          companyId: ready.companyId,
          workspaceMembershipId: ready.preparerId,
        });
      contentAllowed = true;
      await openCase();
      await download();
    }
    async function denyIndependentPdf() {
      await ready.revoke('company-contract-signature-declarer');
      await ready.revoke('company-document-content-reader');
      const pattern = (url: URL) => url.pathname === '/api' + pdfPath;
      const denial = async (route: Route) => {
        const response = await route.fetch({
          headers: {
            ...route.request().headers(),
            ...modelContractIdentities.preparer,
          },
        });
        expect(response.status()).toBe(403);
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'The real independent PDF Reader and Declarer grants were revoked, while the Project command remains authorized.',
        });
        await route.fulfill({ response });
      };
      await page.route(pattern, denial);
      try {
        await panel
          .getByRole('button', { name: word('download'), exact: true })
          .click();
        await expect(
          panel.getByText(word('pdfDenied'), { exact: true }).first(),
        ).toBeVisible();
        await settle();
      } finally {
        await removeRoute(page, pattern, denial);
      }
      contentAllowed = false;
      denialExercised = true;
      await panel
        .getByRole('button', {
          name: resolveMessage(contractMessages, locale, 'refresh'),
          exact: true,
        })
        .click();
      await expect(
        panel.getByRole('heading', { name: word('recorded'), exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByText('sequence-signing.pdf', { exact: false }),
      ).toHaveCount(0);
      if (phase.kind === 'uncertain') {
        expect(phase.intent.kind).toBe('link');
        await expect(
          projects().getByRole('button', {
            name: projectWord('retry'),
            exact: true,
          }),
        ).toBeEnabled();
      }
    }
    async function downloadSurvivesDeclarerLoss() {
      let release: (() => void) | undefined;
      const pattern = (url: URL) => url.pathname === '/api' + pdfPath;
      const hold = async (route: Route) => {
        const response = await route.fetch({
          headers: {
            ...route.request().headers(),
            ...modelContractIdentities.preparer,
          },
        });
        expect(response.status()).toBe(200);
        expect(await response.body()).toEqual(ready.pdfA);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await route.fulfill({ response });
      };
      const candidates = (url: URL) =>
        url.pathname === '/api' + declarationPath + '/pdf-candidates';
      const refusal = async (route: Route) => {
        const response = await route.fetch({
          headers: {
            ...route.request().headers(),
            ...modelContractIdentities.preparer,
          },
        });
        expect(response.status()).toBe(403);
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'The Declarer grant was genuinely revoked after an independently authorized PDF had been captured.',
        });
        await route.fulfill({ response });
      };
      const downloads: Download[] = [];
      const collect = (value: Download) => {
        downloads.push(value);
      };
      page.on('download', collect);
      await page.route(pattern, hold);
      try {
        await panel
          .getByRole('button', { name: word('download'), exact: true })
          .click();
        await expect.poll(() => Boolean(release)).toBe(true);
        await ready.revoke('company-contract-signature-declarer');
        await page.route(candidates, refusal);
        try {
          await form()
            .getByRole('button', { name: word('load'), exact: true })
            .click();
          await expect(form()).toHaveCount(0);
          await expect(
            panel.getByRole('button', { name: word('download'), exact: true }),
          ).toBeVisible();
        } finally {
          await removeRoute(page, candidates, refusal);
        }
        release?.();
        await expect.poll(() => downloads.length).toBe(1);
        const saved = downloads[0];
        if (!saved)
          throw new Error('Missing independently live received-PDF download.');
        expect(saved.suggestedFilename()).toBe('sequence-signing.pdf');
        const path = await saved.path();
        if (!path)
          throw new Error('Missing independently conserved PDF bytes.');
        expect(await readFile(path)).toEqual(ready.pdfA);
      } finally {
        release?.();
        page.off('download', collect);
        await removeRoute(page, pattern, hold);
      }
      await ready.command('/company-contract-signature-declarer-assignments', {
        companyId: ready.companyId,
        workspaceMembershipId: ready.preparerId,
      });
      phase = { kind: 'editing', draft: null };
      declarerLossExercised = true;
      await openCase();
    }
    async function retireHeldPdf(status: 200 | 403) {
      let restoredReader: string | null = null;
      await replaceSourceBeforePdfReply({
        page,
        companyId: ready.companyId,
        path: '/api' + pdfPath,
        identity: modelContractIdentities.preparer,
        status,
        beforeRead: async () => {
          if (status === 403)
            await ready.revoke('company-document-content-reader');
        },
        afterCapture: async (response) => {
          if (status === 200) expect(await response.body()).toEqual(ready.pdfA);
          else
            restoredReader = text(
              (
                await ready.command(
                  '/company-document-content-reader-assignments',
                  {
                    companyId: ready.companyId,
                    workspaceMembershipId: ready.preparerId,
                  },
                )
              ).id,
            );
        },
        start: () =>
          panel
            .getByRole('button', { name: word('download'), exact: true })
            .click(),
        replace: async () => {
          const previousLocale = locale;
          await selectOption(page.locator('#interface-locale'), {
            value: 'en',
          });
          locale = 'en';
          await selectReceivedCompany(page, ready.otherCompanyName, narrow);
          await expect(
            page
              .getByRole('banner')
              .getByText(ready.otherCompanyName, { exact: true }),
          ).toBeVisible();
          await selectReceivedCompany(page, ready.companyName, narrow);
          await expect(
            page
              .getByRole('banner')
              .getByText(ready.companyName, { exact: true }),
          ).toBeVisible();
          locale = previousLocale;
          if (phase.kind === 'editing')
            phase = { kind: 'editing', draft: null };
          await openCase();
        },
      });
      if (restoredReader) {
        const actor = await ready.read(
          '/access/current-actor',
          ready.companyId,
        );
        const grants = object(actor.activeCompany).grants;
        if (!Array.isArray(grants))
          throw new Error('Missing current native Reader captures.');
        expect(
          grants
            .map(object)
            .find((grant) => grant.bundle === 'company_document_content_reader')
            ?.assignmentId,
        ).toBe(restoredReader);
      }
      heldReplies.add(status);
    }
    async function verify() {
      await settle();
      await expect(panel.locator('iframe')).toHaveAttribute('sandbox', '');
      await expect(panel.locator('iframe')).toHaveAttribute(
        'srcdoc',
        baseline.version.representation.html,
      );
      const previews = await page.locator('iframe').evaluateAll((frames) =>
        frames.map((frame) => ({
          sandbox: frame.getAttribute('sandbox'),
          html: frame.getAttribute('srcdoc'),
        })),
      );
      for (const preview of previews) {
        expect(preview.sandbox).toBe('');
        expect([offerHtml, baseline.version.representation.html]).toContain(
          preview.html,
        );
      }
      const actual = readModelContract(
        (await ready.read(root, ready.companyId)).contract,
      );
      expect(actual.revision).toBe(2 + (declaration ? 1 : 0) + (link ? 1 : 0));
      expect(actual.version.representation).toEqual(
        baseline.version.representation,
      );
      expect(actual.version.modelGeneration).toEqual(
        baseline.version.modelGeneration,
      );
      expect(actual.version.recipient).toEqual(baseline.version.recipient);
      expect(actual.version.decision).toEqual(baseline.version.decision);
      expect(actual.version.executionState).toBe(
        declaration ? 'EXECUTED' : 'NOT_EXECUTED',
      );
      expect(actual.version.signature).toEqual(
        declaration && !contentAllowed
          ? { ...declaration, pdf: { access: 'denied' } }
          : declaration,
      );
      if (!contentAllowed) {
        expect(actual.version.signature?.pdf).toEqual({ access: 'denied' });
        await expect(
          panel.getByText('sequence-signing.pdf', { exact: false }),
        ).toHaveCount(0);
      }
      expect(actual.linkedProjects).toHaveLength(link ? 1 : 0);
      if (link)
        expect(actual.linkedProjects[0]).toMatchObject({
          id: projectId,
          title: projectTitle,
          link,
        });
      expect(
        await ready.read(
          `/offers/opportunities/${ready.opportunityId}`,
          ready.companyId,
        ),
      ).toEqual(offerBefore);
      expect(
        await ready.read(`/projects/${projectId}/tasks`, ready.companyId),
      ).toEqual(tasksBefore);
      const history = await ready.read(root + '/versions', ready.companyId);
      expect(history.items).toHaveLength(1);
      expect(
        object(Array.isArray(history.items) ? history.items[0] : undefined),
      ).toMatchObject({ id: ready.contractVersionId, versionNumber: 1 });
      const bytes = await page.request.get(origin + pdfPath, { headers });
      expect(bytes.status()).toBe(contentAllowed ? 200 : 403);
      if (contentAllowed) expect(await bytes.body()).toEqual(ready.pdfA);
      else {
        const refusal = await bytes.text();
        for (const secret of [
          documentId,
          documentVersionId,
          representationId,
          createHash('sha256').update(ready.pdfA).digest('hex'),
          'sequence-signing.pdf',
        ])
          expect(refusal).not.toContain(secret);
      }
      if (phase.kind === 'editing' && phase.draft) {
        const provider = form().getByRole('group', {
          name: word('provider'),
          exact: true,
        });
        const client = form().getByRole('group', {
          name: word('client'),
          exact: true,
        });
        await expect(
          provider.getByLabel(word('label'), { exact: true }),
        ).toHaveValue(phase.draft.providerSignatory.label);
        await expect(
          provider.getByLabel(word('signedOn'), { exact: true }),
        ).toHaveValue(phase.draft.providerSignatory.signedOn ?? '');
        await expect(
          client.getByLabel(word('label'), { exact: true }),
        ).toHaveValue(phase.draft.clientSignatory.label);
        await expect(
          client.getByLabel(word('mandateBasis'), { exact: true }),
        ).toHaveValue(phase.draft.clientSignatory.mandate.basis);
        await expect(
          form().getByLabel(word('concordance'), { exact: true }),
        ).toHaveValue(phase.draft.concordanceBasis);
        await expect(
          form().getByLabel(word('acceptance'), { exact: true }),
        ).toHaveValue(phase.draft.acceptanceBasis);
      }
      if (phase.kind === 'uncertain')
        await expect(
          panel.getByRole('button', {
            name:
              phase.intent.kind === 'declare'
                ? word('retry')
                : projectWord('retry'),
            exact: true,
          }),
        ).toBeVisible();
      if (phase.kind === 'declared' || phase.kind === 'linked')
        await expect(
          panel.getByText(word('confirmed'), { exact: true }).first(),
        ).toBeVisible();
    }
    try {
      await page.route(scope, identityRoute);
      page.on('request', observe);
      await openCase();
      await verify();
    } catch (error) {
      try {
        await dispose();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          'Contract preparation and disposal failed',
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
        if (!contentAllowed) {
          actions.push(
            phase.kind === 'uncertain'
              ? {
                  label: 'retry-exact-contract-command-with-double-admission',
                  run: retry,
                }
              : {
                  label: 'restore-independent-authority-and-original-pdf',
                  run: restoreIndependentAuthority,
                },
          );
          return actions;
        }
        if (
          !denialExercised &&
          (phase.kind === 'declared' ||
            phase.kind === 'linked' ||
            (phase.kind === 'uncertain' && phase.intent.kind === 'link'))
        )
          actions.push({
            label: 'revoke-independent-pdf-and-declarer-authority',
            run: denyIndependentPdf,
          });
        if (phase.kind === 'declared' || phase.kind === 'linked')
          actions.push({
            label: 'fail-independent-read-then-recover-confirmed-contract',
            run: failIndependentReadThenRecover,
          });
        if (phase.kind === 'uncertain')
          actions.push({
            label: 'retry-exact-contract-command-with-double-admission',
            run: retry,
          });
        else if (phase.kind === 'editing') {
          actions.push({
            label: 'edit-literal-reported-signing',
            run: () => edit(value.variant),
          });
          if (phase.draft)
            actions.push(
              {
                label: 'declare-signing-none',
                run: () => submit('declare', false),
              },
              {
                label: 'declare-signing-lost-receipt',
                run: () => submit('declare', true),
              },
              { label: 'download-exact-signing-pdf', run: download },
            );
        } else if (phase.kind === 'declared')
          actions.push(
            {
              label: 'link-existing-thirteen-task-project-none',
              run: () => submit('link', false),
            },
            {
              label: 'link-existing-thirteen-task-project-lost-receipt',
              run: () => submit('link', true),
            },
            { label: 'download-exact-signing-pdf', run: download },
          );
        else
          actions.push({ label: 'download-exact-signing-pdf', run: download });
        if (phase.kind === 'editing' && phase.draft && !declarerLossExercised)
          actions.push({
            label: 'held-pdf-survives-independent-declarer-loss',
            run: downloadSurvivesDeclarerLoss,
          });
        if (
          (phase.kind === 'editing' && phase.draft) ||
          phase.kind === 'declared' ||
          phase.kind === 'linked'
        )
          for (const status of [200, 403] satisfies Array<200 | 403>)
            if (!heldReplies.has(status))
              actions.push({
                label: `retire-held-pdf-${status}-after-company-aba`,
                run: () => retireHeldPdf(status),
              });
        return actions;
      },
      verify,
      settle,
      dispose,
      describe: () => ({
        phase: phase.kind,
        locale,
        initial,
        contentAllowed,
        heldReplies: [...heldReplies],
        declared: declaration !== null,
        linked: link !== null,
        revision: 2 + (declaration ? 1 : 0) + (link ? 1 : 0),
        projectId,
        documentId,
        documentVersionId,
        representationId,
      }),
    };
  },
};
function missingDraft(): never {
  throw new Error('Missing the independently planned declaration draft.');
}
