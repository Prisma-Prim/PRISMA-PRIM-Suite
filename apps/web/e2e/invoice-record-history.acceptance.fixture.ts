import { randomUUID } from 'node:crypto';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { invoiceRecordMessages } from '../src/invoice-record/invoice-record-copy';
import { enterClassicCompatibility } from './classic-compatibility';
import {
  invoiceApiOrigin,
  modelContractIdentities,
  object,
  prepareExternalInvoiceSourceCase,
  text,
} from './external-invoice-source.acceptance.fixture';
import { selectOption } from './select-option';

const copy = invoiceRecordMessages.en;
async function activate(control: Locator) {
  await expect(control).toBeEnabled();
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
async function menu(page: Page, open: boolean) {
  await expect(page.getByRole('banner')).toBeVisible();
  const control = page.getByRole('button', {
    name: open ? 'Open navigation' : 'Close navigation',
    exact: true,
  });
  if (await control.isVisible()) await activate(control);
}

/** Native business producers and HTTP effects; only response delivery is held. */
export async function exerciseInvoiceRecordHistoryOwnership({
  page,
  info,
  frame,
}: {
  page: Page;
  info: TestInfo;
  frame: 'prisme' | 'classic';
}) {
  const suffix = `history-${frame}-${info.project.name.endsWith('narrow') ? 'narrow' : 'desktop'}`;
  const ready = await prepareExternalInvoiceSourceCase(
    page,
    suffix,
    frame === 'prisme' ? 'PRIMARY' : 'ADDITIONAL',
  );
  for (const bundle of [
    'company-invoice-recorder',
    'company-external-invoice-access',
  ])
    await ready.command('/' + bundle + '-assignments', {
      workspaceMembershipId: ready.preparerId,
      companyId: ready.companyId,
    });
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: {
        ...route.request().headers(),
        ...modelContractIdentities.preparer,
      },
    }),
  );
  const headers = {
    ...modelContractIdentities.preparer,
    'x-company-context-id': ready.companyId,
  };

  for (const action of ['CORRECT', 'WITHDRAW_ENTRY'] as const)
    for (const state of ['sending', 'uncertain'] as const) {
      const label = `${action}-${state}`;
      const document = await ready.command(
        '/documents',
        {
          type: 'external-invoice',
          opportunityId: ready.opportunityId,
          contractId: ready.contractId,
          contractVersionId: ready.contractVersionId,
          title: `Fictional history source ${label} ${suffix}`,
          purpose: 'Native immutable-command recovery proof',
          sourceDescription: 'Fictional invoice; not a fiscal document',
          receivedOn: null,
        },
        modelContractIdentities.preparer,
        ready.companyId,
      );
      const documentId = text(document.id);
      const documentVersionId = text(object(document.version).id);
      const upload = await page.request.post(
        invoiceApiOrigin +
          `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-history.pdf`,
        {
          headers: {
            ...headers,
            'content-type': 'application/pdf',
            'idempotency-key': randomUUID(),
          },
          data: ready.pdfA,
        },
      );
      expect(upload.status()).toBe(201);
      const representationId = text(
        object(await upload.json()).representationId,
      );
      const designation = await page.request.post(
        invoiceApiOrigin +
          `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
        {
          headers: { ...headers, 'idempotency-key': randomUUID() },
          data: { expectedRevision: 2 },
        },
      );
      expect(designation.status()).toBe(200);
      let values = {
        externalSystem: ' Fictional manual process ',
        externalNumber: `SYN-HISTORY-${label}`,
        issuedOn: '2026-01-15',
        dueOn: null,
        currency: 'MDL',
        grossMinor: '125500',
        netMinor: null,
        taxMinor: '0',
      };
      const created = await ready.command(
        '/invoice-records',
        {
          source: { documentId, documentVersionId, representationId },
          values,
          acknowledgeExternalDeclaration: true,
          replacesWithdrawnRecordId: null,
        },
        modelContractIdentities.preparer,
        ready.companyId,
      );
      const recordId = text(created.recordId);
      for (let revision = 1; revision < 26; revision += 1) {
        values = { ...values, grossMinor: String(125500 + revision) };
        await ready.command(
          `/invoice-records/${recordId}/commands`,
          {
            action: 'CORRECT',
            expectedRevision: revision,
            values,
            reason: `Fictional history producer revision ${revision + 1}`,
          },
          modelContractIdentities.preparer,
          ready.companyId,
        );
      }
      const observed = await ready.read(
        '/invoice-records/' + recordId,
        ready.companyId,
      );
      expect(object(observed.record).revision).toBe(26);
      expect(object(observed.history).items).toHaveLength(25);
      expect(object(observed.history).nextCursor).toEqual(expect.any(String));

      await page.goto('/');
      await page.reload();
      await menu(page, true);
      await selectOption(page.getByLabel('Active Company', { exact: true }), {
        value: ready.companyId,
      });
      await menu(page, false);
      if (frame === 'classic') await enterClassicCompatibility(page);
      await menu(page, true);
      await activate(
        page
          .getByRole('navigation', { name: 'Primary navigation' })
          .getByRole('link', { name: copy.title, exact: true }),
      );
      await menu(page, false);
      const workspace = page.locator('.invoice-record-workspace');
      await activate(
        workspace.getByRole('button', {
          name: values.externalNumber,
          exact: false,
        }),
      );
      const detail = workspace.locator('.invoice-record-detail');
      const history = detail.getByRole('region', {
        name: copy.history,
        exact: true,
      });
      await expect(history.getByRole('listitem')).toHaveCount(25);

      const historyPath = `**/api/invoice-records/${recordId}/history?*`;
      let releaseHistory: (() => void) | undefined;
      let historyStatus: number | undefined;
      await page.route(historyPath, async (route) => {
        await new Promise<void>((resolve) => {
          releaseHistory = resolve;
        });
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...headers },
        });
        historyStatus = response.status();
        await route.fulfill({ response });
      });
      if (state === 'uncertain') {
        await activate(
          history.getByRole('button', { name: copy.more, exact: true }),
        );
        await expect.poll(() => typeof releaseHistory).toBe('function');
      }
      await activate(
        detail.getByRole('button', {
          name: action === 'CORRECT' ? copy.correct : copy.withdraw,
          exact: true,
        }),
      );
      const form = workspace.locator('.invoice-record-editor');
      const reason = `  Exact ${label} intent Ș Я é <script>  `;
      if (action === 'CORRECT')
        await form.getByLabel(copy.gross, { exact: true }).fill('1255.50');
      const reasonField = form.getByRole('textbox', {
        name: copy.reason,
        exact: true,
      });
      await reasonField.fill(reason);
      let releaseCommand: (() => void) | undefined;
      const attempts: { body: string | null; key: string | undefined }[] = [];
      const nativeReceipts: unknown[] = [];
      const commandPath = `**/api/invoice-records/${recordId}/commands`;
      await page.route(commandPath, async (route) => {
        attempts.push({
          body: route.request().postData(),
          key: route.request().headers()['idempotency-key'],
        });
        const response = await route.fetch({
          headers: { ...route.request().headers(), ...headers },
        });
        expect(response.status()).toBe(201);
        nativeReceipts.push(await response.json());
        if (attempts.length === 1) {
          if (state === 'sending')
            await new Promise<void>((resolve) => {
              releaseCommand = resolve;
            });
          await route.fulfill({ status: 503, body: '' });
        } else await route.fulfill({ response });
      });
      await activate(
        form.getByRole('button', {
          name:
            action === 'CORRECT' ? copy.saveCorrection : copy.confirmWithdraw,
          exact: true,
        }),
      );
      await expect.poll(() => nativeReceipts.length).toBe(1);
      if (state === 'sending') {
        await expect(
          form.getByText(copy.saving, { exact: true }),
        ).toBeVisible();
        await activate(
          history.getByRole('button', { name: copy.more, exact: true }),
        );
        await expect.poll(() => typeof releaseHistory).toBe('function');
      } else
        await expect(
          form.getByRole('button', { name: copy.retryCommand, exact: true }),
        ).toBeVisible();
      releaseHistory?.();
      await expect.poll(() => historyStatus).toBe(409);
      await expect(history).toContainText(copy.historyChanged);
      await expect(
        history.getByRole('button', { name: copy.reload, exact: true }),
      ).toBeDisabled();
      await expect(reasonField).toHaveValue(reason);
      await expect(reasonField).toBeDisabled();
      await expect(
        form.getByRole('button', { name: copy.cancel, exact: true }),
      ).toBeDisabled();
      await page.screenshot({
        path: info.outputPath(`invoice-history-${frame}-${label}-owned.png`),
        fullPage: true,
      });
      releaseCommand?.();
      await activate(
        form.getByRole('button', { name: copy.retryCommand, exact: true }),
      );
      await expect(
        detail.getByRole('heading', {
          name: `${copy.revision} 27 · ${action === 'CORRECT' ? copy.corrected : copy.entryWithdrawn}`,
          exact: true,
        }),
      ).toBeVisible();
      expect(attempts).toHaveLength(2);
      expect(attempts[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(JSON.parse(attempts[0]?.body ?? 'null')).toEqual(
        action === 'CORRECT'
          ? {
              action,
              expectedRevision: 26,
              values: { ...values, grossMinor: '125550' },
              reason,
            }
          : { action, expectedRevision: 26, reason },
      );
      expect(nativeReceipts).toHaveLength(2);
      expect(nativeReceipts[1]).toEqual(nativeReceipts[0]);
      const final = await ready.read(
        '/invoice-records/' + recordId,
        ready.companyId,
      );
      expect(object(final.record)).toMatchObject({
        revision: 27,
        entryState: action === 'CORRECT' ? 'RECORDED' : 'WITHDRAWN',
      });
      const facts = object(final.history).items;
      if (!Array.isArray(facts))
        throw new Error('Expected native history facts');
      expect(
        facts.filter((fact: unknown) => object(fact).reason === reason),
      ).toHaveLength(1);
      const reloaded = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/invoice-records/${recordId}` &&
          response.request().method() === 'GET',
      );
      await activate(
        detail.getByRole('button', { name: copy.reload, exact: true }),
      );
      expect((await reloaded).status()).toBe(200);
      await expect(
        detail.getByRole('heading', {
          name: `${copy.revision} 27 · ${action === 'CORRECT' ? copy.corrected : copy.entryWithdrawn}`,
          exact: true,
        }),
      ).toBeVisible();
      expect(attempts).toHaveLength(2);
      await page.unroute(commandPath);
      await page.unroute(historyPath);
    }
}
