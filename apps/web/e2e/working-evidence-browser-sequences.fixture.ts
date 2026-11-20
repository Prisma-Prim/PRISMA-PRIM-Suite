import * as fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Route } from '@playwright/test';
import {
  readEvidenceCase,
  readEvidenceReceipt,
} from '../src/working-evidence/working-evidence-response';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import { prepareWorkingEvidenceCase } from './working-evidence-lifetime.acceptance.fixture';
import {
  expect,
  expectApiFailure,
  IDLE_DEADLINE_MILLISECONDS,
} from './ui-chaos.fixture';
import { selectOption } from './select-option';
import { removeRoute } from './route-removal';

const origin = 'http://127.0.0.1:4174';
const identity = (subject: string, displayName: string, email: string) => ({
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': subject,
  'x-test-display-name': displayName,
  'x-test-email': email,
});
const owner = identity(
  'workspace-owner',
  'Workspace Owner',
  'owner@example.test',
);
const member = identity(
  'local-demonstration-user',
  'Ada Ionescu',
  'ada@example.test',
);
const recorder = 'working-evidence-case-recorder';
type Variant = 'a' | 'b';
type Phase =
  | { kind: 'view' }
  | { kind: 'draft'; text: string }
  | { kind: 'uncertain'; text: string; body: string };
const variants = fc.constantFrom<Variant>('a', 'b');

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a native Working Evidence object.');
  return Object.fromEntries(Object.entries(value));
}

export const workingEvidenceSequenceAdapter: BrowserSequenceAdapter<
  Variant,
  Variant
> = {
  caseId: 'working-evidence',
  initial: variants,
  values: variants,
  async open({ page, info, trial, initial }) {
    const narrow = info.project.name.endsWith('narrow');
    const suffix = `${trial}-${randomUUID().slice(0, 8)}`;
    const membership = process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID;
    if (!membership) throw new Error('Missing synthetic Workspace Membership.');
    async function command(
      path: string,
      headers: Record<string, string>,
      data: unknown,
      status = 201,
    ) {
      const reply = await page.request.post(`${origin}/api${path}`, {
        headers: { ...headers, 'idempotency-key': randomUUID() },
        data,
      });
      expect(reply.status()).toBe(status);
      return object(await reply.json());
    }
    async function company(suffix: string) {
      const created = await command('/companies', owner, {
        displayName: `Synthetic Evidence ${suffix}`,
      });
      const id = created.id;
      if (typeof id !== 'string')
        throw new Error('Missing synthetic Company identity.');
      await command('/company-context-assignments', owner, {
        companyId: id,
        workspaceMembershipId: membership,
      });
      return id;
    }
    const companyId = await company(suffix);
    const otherCompanyId = await company(`alternate ${suffix}`);
    for (const role of [
      'director-client',
      'project',
      'document-registrar',
      'working-evidence-case-reader',
      recorder,
      'received-audit-source-access',
      'document-content-reader',
      'document-content-uploader',
      'document-approver',
    ])
      await command(`/company-${role}-assignments`, owner, {
        companyId,
        workspaceMembershipId: membership,
      });
    const headers = { ...member, 'x-company-context-id': companyId };
    const source = await prepareWorkingEvidenceCase({
      page,
      suffix,
      headers,
      post: (path, data, status) => command(path, headers, data, status),
    });
    const root = `/api/working-evidence-cases/${source.caseId}`;
    const correctionPath = `**${root}/corrections`;
    const cases = page.locator('section.working-evidence');
    const article = cases.locator('.working-evidence-revision');
    const statement = 'Fictional old human statement';
    const field = () => cases.getByLabel('Human working statement');
    const correction = () =>
      cases.getByRole('button', {
        name: 'Correct complete revision',
        exact: true,
      });
    const button = (name: string) =>
      article.getByRole('button', { name, exact: true });
    let phase: Phase = { kind: 'view' };
    let current = { revisionId: source.revisionId, number: 1, statement };
    let editNumber = 0;
    let hasRecorder = true;

    async function chooseCompany(id: string) {
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await selectOption(
        page.getByRole('combobox', { name: 'Active Company', exact: true }),
        id,
      );
      if (narrow)
        await page.getByRole('button', { name: 'Close navigation' }).click();
    }
    async function openCase() {
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Projects', exact: true })
        .click();
      const projects = page.locator('.project-workspace');
      await projects
        .getByLabel('Find Projects', { exact: true })
        .fill(source.projectTitle);
      await projects
        .getByRole('button', {
          name: `${source.projectTitle} Client: Fictional lifetime Client ${suffix}`,
          exact: true,
        })
        .click();
      await projects
        .getByRole('tab', { name: 'Working Evidence Cases' })
        .click();
      await cases
        .getByRole('button', { name: source.caseTitle, exact: true })
        .click();
    }
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
    ).toBeVisible();
    await chooseCompany(companyId);
    await openCase();

    async function frozenStatement() {
      const download = page.waitForEvent('download');
      await button('Download frozen statement').click();
      const path = await (await download).path();
      if (!path) throw new Error('Missing native frozen statement.');
      const escaped = current.statement
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
      expect(await readFile(path, 'utf8')).toContain(escaped);
    }
    async function exactPdf() {
      const download = page.waitForEvent('download');
      await button('Open exact original PDF').click();
      const path = await (await download).path();
      if (!path) throw new Error('Missing exact original PDF.');
      expect(await readFile(path)).toEqual(source.original);
    }
    if (initial === 'b') await frozenStatement();

    async function adjust(variant: Variant) {
      if (phase.kind === 'view') await correction().click();
      const text = `Fictional human correction ${++editNumber} ${variant} <literal>`;
      await field().fill(text);
      await cases
        .getByLabel('Correction reason')
        .fill('Synthetic reviewed correction');
      phase = { kind: 'draft', text };
    }
    async function loseConfirmation() {
      if (phase.kind !== 'draft')
        throw new Error('Expected a Working Evidence draft.');
      const { text } = phase;
      let body: string | null = null;
      let receipt: ReturnType<typeof readEvidenceReceipt> | undefined;
      const intercept = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        body = route.request().postData();
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...member },
        });
        expect(response.status()).toBe(201);
        receipt = readEvidenceReceipt(await response.json());
        expectApiFailure({
          page,
          request: route.request(),
          reason:
            'The native Working Evidence correction committed and its receipt was deliberately lost.',
        });
        await route.abort('connectionfailed');
      };
      await page.route(correctionPath, intercept);
      try {
        await cases
          .getByRole('button', { name: 'Save complete revision', exact: true })
          .click();
        await expect(
          cases.getByRole('button', {
            name: 'Retry identical command',
            exact: true,
          }),
        ).toBeVisible();
        if (!receipt || !body)
          throw new Error('Missing native correction receipt or command body.');
        expect(receipt.revisionNumber).toBe(current.number + 1);
        current = {
          revisionId: receipt.revisionId,
          number: receipt.revisionNumber,
          statement: text,
        };
        phase = { kind: 'uncertain', text, body };
      } finally {
        await removeRoute(page, correctionPath, intercept);
      }
    }
    async function retryExact() {
      if (phase.kind !== 'uncertain')
        throw new Error('Expected an uncertain Working Evidence command.');
      const sent = page.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          request.url().endsWith(`${root}/corrections`),
      );
      await cases
        .getByRole('button', { name: 'Retry identical command', exact: true })
        .click();
      expect((await sent).postData()).toBe(phase.body);
      await expect(
        cases.getByText('Revision confirmed saved.', { exact: true }),
      ).toBeVisible();
      phase = { kind: 'view' };
    }
    async function leaveWithHeldStatement() {
      const statementPath = `**${root}/revisions/${current.revisionId}/statement`;
      let release: (() => void) | undefined;
      let finished: Promise<void> | undefined;
      let closing = false;
      const held = async (route: Route) => {
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...member },
        });
        expect(response.status()).toBe(200);
        if (closing) return route.fulfill({ response });
        finished = (async () => {
          await new Promise<void>((done) => {
            release = done;
          });
          try {
            await route.fulfill({ response });
          } catch (error) {
            if (!route.request().failure()?.errorText.includes('ERR_ABORTED'))
              throw error;
          }
        })();
        await finished;
      };
      await page.route(statementPath, held);
      try {
        await button('Open frozen statement').click();
        await expect
          .poll(() => typeof release, { timeout: IDLE_DEADLINE_MILLISECONDS })
          .toBe('function');
        await chooseCompany(otherCompanyId);
        await expect(cases).toHaveCount(0);
      } finally {
        closing = true;
        release?.();
        await finished;
        await removeRoute(page, statementPath, held);
      }
      await chooseCompany(companyId);
      await openCase();
      await expect(
        article.locator('iframe[title="Open frozen statement"]'),
      ).toHaveCount(0);
    }
    async function switchRecorder() {
      if (hasRecorder) {
        const reply = await page.request.delete(
          `${origin}/api/company-${recorder}-assignments/${membership}/${companyId}`,
          { headers: { ...owner, 'idempotency-key': randomUUID() } },
        );
        expect(reply.status()).toBe(200);
      } else
        await command(`/company-${recorder}-assignments`, owner, {
          companyId,
          workspaceMembershipId: membership,
        });
      hasRecorder = !hasRecorder;
      await page.reload();
      await openCase();
    }
    async function verify() {
      const response = await page.request.get(`${origin}${root}`, { headers });
      expect(response.status()).toBe(200);
      const { current: revision } = readEvidenceCase(await response.json());
      expect(revision).toMatchObject({
        caseId: source.caseId,
        revisionId: current.revisionId,
        revisionNumber: current.number,
        statement: current.statement,
      });
      if (phase.kind === 'view') {
        await expect(
          article.getByText(current.statement, { exact: true }),
        ).toBeVisible();
        if (hasRecorder) await expect(correction()).toBeEnabled();
        else await expect(correction()).toHaveCount(0);
        return;
      }
      await expect(field()).toHaveValue(phase.text);
      const save = cases.getByRole('button', {
        name: 'Save complete revision',
        exact: true,
      });
      const retry = cases.getByRole('button', {
        name: 'Retry identical command',
        exact: true,
      });
      if (phase.kind === 'uncertain') {
        await expect(field()).toBeDisabled();
        await expect(save).toBeDisabled();
        await expect(retry).toBeEnabled();
      } else {
        await expect(save).toBeEnabled();
        await expect(retry).toHaveCount(0);
        await expect(
          cases.getByRole('button', { name: 'Cancel', exact: true }),
        ).toBeEnabled();
      }
    }
    function actions(variant: Variant): BrowserAction[] {
      if (phase.kind === 'uncertain')
        return [
          {
            label: 'retry-identical-working-evidence-correction',
            run: retryExact,
          },
        ];
      if (phase.kind === 'draft')
        return [
          {
            label: 'edit-literal-working-evidence-draft',
            run: () => adjust(variant),
          },
          {
            label: 'correct-working-evidence-with-lost-acknowledgement',
            run: loseConfirmation,
          },
          {
            label: 'cancel-working-evidence-draft',
            async run() {
              await cases
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
              phase = { kind: 'view' };
            },
          },
        ];
      return [
        ...(hasRecorder
          ? [
              {
                label: 'start-human-working-evidence-correction',
                run: () => adjust(variant),
              },
            ]
          : []),
        { label: 'download-native-frozen-statement', run: frozenStatement },
        { label: 'download-exact-native-source-pdf', run: exactPdf },
        {
          label: 'retire-held-frozen-statement-on-company-replacement',
          run: leaveWithHeldStatement,
        },
        {
          label: 'change-working-evidence-recorder-grant',
          run: switchRecorder,
        },
      ];
    }
    return {
      actions,
      verify,
      async settle() {
        if (phase.kind === 'uncertain') await retryExact();
      },
      async dispose() {},
      describe: () => ({
        phase: phase.kind,
        revision: current.number,
        hasRecorder,
      }),
    };
  },
};
