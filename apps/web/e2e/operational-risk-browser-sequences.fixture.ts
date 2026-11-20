import * as fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import type { Route } from '@playwright/test';
import { readRiskPage } from '../src/operational-risk/operational-risk.response';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import {
  ada,
  apiOrigin,
  createCompany,
  grant,
  navigate,
  object,
  owner,
  required,
  string,
} from './operational-risk.acceptance.fixture';
import { removeRoute } from './route-removal';
import { expectValue, selectOption } from './select-option';
import {
  expect,
  expectApiFailure,
  IDLE_DEADLINE_MILLISECONDS,
} from './ui-chaos.fixture';

type Variant = 'a' | 'b';
type Sent = {
  company: string | undefined;
  key: string | undefined;
  body: string | null;
};
type Phase =
  | { kind: 'list' }
  | { kind: 'draft'; literal: string }
  | { kind: 'uncertain'; literal: string; sent: Sent };

const variants = fc.constantFrom<Variant>('a', 'b');
const readerRole = 'company-operational-risk-reader-assignments';
const recorderRole = 'company-operational-risk-recorder-assignments';
const root = '/api/operational-risks';
const pattern = `**${root}`;
const heading = 'Operational risks';

export const operationalRiskSequenceAdapter: BrowserSequenceAdapter<
  Variant,
  Variant
> = {
  caseId: 'operational-risk',
  initial: variants,
  values: variants,
  async open({ page, info, trial, initial }) {
    const narrow = info.project.name.endsWith('narrow');
    const membershipId = required('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
    const companies = {
      a: {
        ...(await createCompany(
          page.request,
          `Synthetic Risk sequence A ${trial} ${randomUUID()}`,
        )),
        records: new Map<string, string>(),
        recorder: true,
      },
      b: {
        ...(await createCompany(
          page.request,
          `Synthetic Risk sequence B ${trial} ${randomUUID()}`,
        )),
        records: new Map<string, string>(),
        recorder: true,
      },
    };
    const headersFor = (companyId: string) => ({
      ...ada,
      'x-company-context-id': companyId,
    });
    for (const [variant, { id, records }] of Object.entries(companies)) {
      for (const path of [
        'company-context-assignments',
        readerRole,
        recorderRole,
      ])
        await grant({
          request: page.request,
          path,
          companyId: id,
          workspaceMembershipId: membershipId,
        });
      const process = `Synthetic existing Risk ${variant.toUpperCase()}`;
      const seeded = await page.request.post(`${apiOrigin}${root}`, {
        headers: { ...headersFor(id), 'idempotency-key': randomUUID() },
        data: {
          process,
          cause: 'Synthetic cause',
          effect: 'Synthetic effect',
          plannedMeasure: 'Synthetic measure',
        },
      });
      expect(seeded.status()).toBe(201);
      records.set(string(object(object(await seeded.json()).risk).id), process);
    }

    let active = initial;
    let phase: Phase = { kind: 'list' };
    let editCount = 0;
    let writes = 0;
    let capture:
      { sent: Sent[]; lose: boolean; createdId?: string } | undefined;
    const scope = () => companies[active];
    const risks = page.locator('.risk-workspace');
    const region = risks.getByRole('region', {
      name: 'Recorded risks',
      exact: true,
    });
    const processField = risks.getByLabel(/^Process \/ activity/u);
    const newButton = risks.getByRole('button', {
      name: 'Record a risk',
      exact: true,
    });
    const retry = risks.getByRole('button', {
      name: 'Retry the same record',
      exact: true,
    });
    const record = risks.getByRole('button', { name: 'Record', exact: true });

    const track = async (route: Route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.fallback();
      writes++;
      if (!capture) throw new Error('Unexpected generated Risk write.');
      capture.sent.push({
        company: request.headers()['x-company-context-id'],
        key: request.headers()['idempotency-key'],
        body: request.postData(),
      });
      const response = await route.fetch({
        headers: { ...request.headers(), ...ada },
      });
      if (capture.lose) {
        expect(response.status()).toBe(201);
        capture.lose = false;
        capture.createdId = string(
          object(object(await response.json()).risk).id,
        );
        expectApiFailure({
          page,
          request,
          reason:
            'The native Risk intake committed and its acknowledgement was deliberately lost.',
        });
        return route.abort('connectionfailed');
      }
      return route.fulfill({ response });
    };
    const activeCompany = page.getByRole('combobox', {
      name: 'Active Company',
      exact: true,
    });
    async function selectCompany(next: Variant) {
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await selectOption(activeCompany, companies[next].id);
      await expectValue(activeCompany, companies[next].id);
      if (narrow)
        await page.getByRole('button', { name: 'Close navigation' }).click();
      await navigate(page, heading, narrow);
      active = next;
      phase = { kind: 'list' };
    }
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
    ).toBeVisible();
    await selectCompany(initial);
    await page.route(pattern, track);

    async function edit(variant: Variant) {
      if (phase.kind === 'list') await newButton.click();
      const literal = `Synthetic generated Risk ${active}-${++editCount}-${variant}\n<literal>`;
      await processField.fill(literal);
      await risks.getByLabel(/^Possible cause/u).fill(' Synthetic cause ');
      await risks.getByLabel(/^Possible effect/u).fill(' Synthetic effect ');
      await risks.getByLabel(/^Planned measure/u).fill(' Synthetic measure ');
      phase = { kind: 'draft', literal };
    }
    async function loseReceipt() {
      if (phase.kind !== 'draft') throw new Error('Risk draft is required.');
      const { literal } = phase;
      const sent: Sent[] = [];
      const intent: NonNullable<typeof capture> = { sent, lose: true };
      capture = intent;
      await record.click();
      await expect(retry).toBeVisible();
      const first = sent[0];
      if (!first?.key || !first.body || !intent.createdId)
        throw new Error(
          'Native Risk commit did not expose a captured command.',
        );
      expect(sent).toHaveLength(1);
      expect(first.company).toBe(scope().id);
      expect(object(JSON.parse(first.body)).process).toBe(literal);
      scope().records.set(intent.createdId, literal);
      phase = { kind: 'uncertain', literal, sent: first };
    }
    async function retryExact() {
      if (phase.kind !== 'uncertain')
        throw new Error('A frozen Risk command is required.');
      const before = writes;
      const sent: Sent[] = [];
      capture = { sent, lose: false };
      await retry.evaluate((button) => {
        if (!(button instanceof HTMLButtonElement))
          throw new Error('Missing Risk retry control.');
        button.click();
        button.click();
      });
      await expect(risks.getByText('Recorded.', { exact: true })).toBeVisible();
      expect(writes - before).toBe(1);
      expect(sent).toEqual([phase.sent]);
      capture = undefined;
      phase = { kind: 'list' };
    }
    async function switchCompany(held: boolean) {
      const next = active === 'a' ? 'b' : 'a';
      if (!held) return selectCompany(next);
      const oldCompany = scope().id;
      let release: (() => void) | undefined;
      let finished: Promise<void> | undefined;
      let closing = false;
      const hold = async (route: Route) => {
        const request = route.request();
        if (
          request.method() !== 'GET' ||
          request.headers()['x-company-context-id'] !== oldCompany ||
          finished
        )
          return route.fallback();
        const response = await route.fetch({
          headers: { ...request.headers(), ...ada },
        });
        expect(response.status()).toBe(200);
        if (closing) return route.fulfill({ response });
        finished = (async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          try {
            await route.fulfill({ response });
          } catch (error) {
            if (!request.failure()?.errorText.includes('ERR_ABORTED'))
              throw error;
          }
        })();
        await finished;
      };
      await page.route(pattern, hold);
      try {
        await region
          .getByRole('button', { name: 'Reload', exact: true })
          .click();
        await expect
          .poll(() => typeof release, { timeout: IDLE_DEADLINE_MILLISECONDS })
          .toBe('function');
        await selectCompany(next);
        await expect(region.locator('.risk-list strong')).toHaveCount(
          scope().records.size,
        );
      } finally {
        closing = true;
        release?.();
        await finished;
        await removeRoute(page, pattern, hold);
      }
    }
    async function toggleRecorder() {
      const company = scope();
      if (company.recorder) {
        const removed = await page.request.delete(
          `${apiOrigin}/api/${recorderRole}/${membershipId}/${company.id}`,
          { headers: { ...owner, 'idempotency-key': randomUUID() } },
        );
        expect(removed.status()).toBe(200);
      } else {
        await grant({
          request: page.request,
          path: recorderRole,
          companyId: company.id,
          workspaceMembershipId: membershipId,
        });
      }
      company.recorder = !company.recorder;
      await page.reload();
    }
    async function verify() {
      await expect(
        risks.getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible();
      const { id, records, recorder } = scope();
      const native = await page.request.get(`${apiOrigin}${root}`, {
        headers: headersFor(id),
      });
      expect(native.status()).toBe(200);
      const rows = readRiskPage({ value: await native.json(), companyId: id });
      expect(rows.items.map((row) => [row.id, row.process]).sort()).toEqual(
        [...records].sort(),
      );
      const listed = region.locator('.risk-list strong');
      const visible = phase.kind === 'uncertain' ? new Map(records) : records;
      if (phase.kind === 'uncertain') {
        for (const [id, literal] of visible) {
          if (literal === phase.literal) visible.delete(id);
        }
      }
      await expect(listed).toHaveCount(visible.size);
      expect((await listed.allTextContents()).sort()).toEqual(
        [...visible.values()].sort(),
      );
      await expect(newButton).toHaveCount(recorder ? 1 : 0);
      if (phase.kind !== 'list') {
        await expect(processField).toHaveValue(phase.literal);
        if (phase.kind === 'uncertain') {
          await expect(processField).toBeDisabled();
          await expect(retry).toBeEnabled();
        } else await expect(processField).toBeEnabled();
      } else await expect(processField).toHaveCount(0);
      await expect(risks.locator('script')).toHaveCount(0);
    }
    function actions(variant: Variant): BrowserAction[] {
      if (phase.kind === 'uncertain')
        return [
          { label: 'retry-exact-risk-with-double-admission', run: retryExact },
        ];
      if (phase.kind === 'draft')
        return [
          { label: 'edit-literal-risk-facts', run: () => edit(variant) },
          { label: 'record-risk-with-lost-receipt', run: loseReceipt },
          {
            label: 'cancel-risk-draft',
            async run() {
              await risks
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
              phase = { kind: 'list' };
            },
          },
          {
            label: 'change-locale-with-risk-draft',
            async run() {
              if (phase.kind !== 'draft')
                throw new Error('Risk draft is required.');
              await selectOption(page.locator('#interface-locale'), 'fr');
              await expect(
                risks.getByLabel(/^Processus \/ activité/u),
              ).toHaveValue(phase.literal);
              await selectOption(page.locator('#interface-locale'), 'en');
            },
          },
        ];
      return [
        ...(scope().recorder
          ? [{ label: 'start-literal-risk-draft', run: () => edit(variant) }]
          : []),
        { label: 'switch-risk-company', run: () => switchCompany(false) },
        {
          label: 'retire-held-risk-read-on-company-switch',
          run: () => switchCompany(true),
        },
        {
          label: 'change-independent-risk-recorder-grant',
          run: toggleRecorder,
        },
      ];
    }
    return {
      actions,
      verify,
      async settle() {
        if (phase.kind === 'uncertain') await retryExact();
      },
      async dispose() {
        await removeRoute(page, pattern, track);
      },
      describe: () => ({
        active,
        phase: phase.kind,
        recorder: scope().recorder,
        a: companies.a.records.size,
        b: companies.b.records.size,
        writes,
      }),
    };
  },
};
