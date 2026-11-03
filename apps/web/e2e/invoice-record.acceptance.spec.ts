import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  prepareExternalInvoiceSourceCase,
  modelContractIdentities,
  object,
  text,
  invoiceApiOrigin,
} from './external-invoice-source.acceptance.fixture';
import { enterClassicCompatibility } from './classic-compatibility';
import { selectOption } from './select-option';
import { invoiceRecordMessages } from '../src/invoice-record/invoice-record-copy';
import { sourceKey } from '../src/invoice-record/invoice-record-contract';
import { exerciseInvoiceRecordHistoryOwnership } from './invoice-record-history.acceptance.fixture';
const en = invoiceRecordMessages.en;
async function activate(control: Locator) {
  await expect(control).toBeEnabled();
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
async function menu(page: Page, open: boolean) {
  // A completed reload can precede the shell and its navigation control.
  await expect(page.getByRole('banner')).toBeVisible();
  const button = page.getByRole('button', {
    name: open ? 'Open navigation' : 'Close navigation',
    exact: true,
  });
  if (await button.isVisible()) await activate(button);
}
for (const frame of ['prisme', 'classic'] as const) {
  test(`keeps unresolved native Invoice commands through changed history in ${frame}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await exerciseInvoiceRecordHistoryOwnership({ page, info, frame });
  });
  test(`keeps actual copied Invoice Records and exact-source lifetimes in ${frame}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const partyKind = frame === 'prisme' ? 'PRIMARY' : 'ADDITIONAL',
      suffix = `record-${frame}-${info.project.name.endsWith('narrow') ? 'narrow' : 'desktop'}`;
    const ready = await prepareExternalInvoiceSourceCase(
      page,
      suffix,
      partyKind,
    );
    let identity = modelContractIdentities.owner;
    await page.route('**/api/**', (route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...identity },
      }),
    );
    async function administer(
      bundle: 'invoice-recorder' | 'external-invoice-access',
      action: 'grant' | 'revoke',
    ) {
      identity = modelContractIdentities.owner;
      await page.goto('/#access');
      await page.reload();
      const admin = page.locator('.company-access');
      await expect(admin).toBeVisible();
      await selectOption(admin.getByLabel('Workspace member'), {
        value: ready.preparerId,
      });
      await selectOption(admin.getByLabel('Company', { exact: true }), {
        value: ready.companyId,
      });
      await selectOption(admin.getByLabel('Access bundle'), { value: bundle });
      await activate(
        admin.getByRole('button', {
          name: action === 'grant' ? 'Grant access' : 'Revoke access',
          exact: true,
        }),
      );
      await expect(
        admin.getByText(
          action === 'grant' ? 'Granted — captured version v1' : 'Not granted',
          { exact: true },
        ),
      ).toBeVisible();
    }
    await administer('invoice-recorder', 'grant');
    await administer('external-invoice-access', 'grant');
    const documentTitle = 'Fictional exact financial PDF ' + suffix;
    const document = await ready.command(
      '/documents',
      {
        type: 'external-invoice',
        opportunityId: ready.opportunityId,
        contractId: ready.contractId,
        contractVersionId: ready.contractVersionId,
        title: documentTitle,
        purpose: 'Unverified manual Invoice Record source',
        sourceDescription: 'Fictional provider invoice; not a fiscal document',
        receivedOn: null,
      },
      modelContractIdentities.preparer,
      ready.companyId,
    );
    const documentId = text(document.id),
      documentVersionId = text(object(document.version).id),
      sourceHeaders = {
        ...modelContractIdentities.preparer,
        'x-company-context-id': ready.companyId,
      };
    const upload = await page.request.post(
      invoiceApiOrigin +
        `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-invoice.pdf`,
      {
        headers: {
          ...sourceHeaders,
          'content-type': 'application/pdf',
          'idempotency-key': randomUUID(),
        },
        data: ready.pdfA,
      },
    );
    expect(upload.status()).toBe(201);
    const representationId = text(object(await upload.json()).representationId),
      source = { documentId, documentVersionId, representationId };
    const designation = await page.request.post(
      invoiceApiOrigin +
        `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
      {
        headers: { ...sourceHeaders, 'idempotency-key': randomUUID() },
        data: { expectedRevision: 2 },
      },
    );
    expect(designation.status()).toBe(200);
    if (frame === 'classic') {
      // The App deliberately selects preserved V1 after a real V2 designation.
      // Equal bytes do not make the two native Representation identities equal.
      const successor = await ready.command(
        `/documents/${documentId}/versions`,
        { expectedRevision: 3 },
        modelContractIdentities.preparer,
        ready.companyId,
      );
      const successorVersionId = text(successor.versionId);
      const successorUpload = await page.request.post(
        invoiceApiOrigin +
          `/documents/${documentId}/versions/${successorVersionId}/content?expectedRevision=4&fileName=fictional-equal-bytes-successor.pdf`,
        {
          headers: {
            ...sourceHeaders,
            'content-type': 'application/pdf',
            'idempotency-key': randomUUID(),
          },
          data: ready.pdfA,
        },
      );
      expect(successorUpload.status()).toBe(201);
      expect(
        text(object(await successorUpload.json()).representationId),
      ).not.toBe(representationId);
      const supersession = await page.request.post(
        invoiceApiOrigin +
          `/documents/${documentId}/versions/${successorVersionId}/official-designation`,
        {
          headers: { ...sourceHeaders, 'idempotency-key': randomUUID() },
          data: { expectedRevision: 5 },
        },
      );
      expect(supersession.status()).toBe(200);
    }
    identity = modelContractIdentities.preparer;
    await page.goto('/');
    await page.reload();
    await menu(page, true);
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      value: ready.companyId,
    });
    await menu(page, false);
    if (frame === 'classic') await enterClassicCompatibility(page);
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    await menu(page, true);
    await activate(nav.getByRole('link', { name: en.title, exact: true }));
    await menu(page, false);
    const workspace = page.locator('.invoice-record-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace).toBeFocused();
    await expect(workspace).toContainText(ready.companyName);
    await activate(
      workspace.getByRole('button', { name: en.create, exact: true }),
    );
    const form = workspace.locator('.invoice-record-editor');
    await selectOption(form.getByLabel(en.chooseSource), {
      value: sourceKey(source),
    });
    await form
      .getByLabel(en.system, { exact: true })
      .fill(' Fictional manual process ');
    await form.getByLabel(en.number, { exact: true }).fill('SYN-INV-001');
    await form.getByLabel(en.issued, { exact: true }).fill('2026-01-15');
    await selectOption(form.getByLabel(en.currency, { exact: true }), {
      value: 'MDL',
    });
    await form.getByLabel(en.gross, { exact: true }).fill('1255.00');
    await form.getByLabel(en.net, { exact: true }).fill('0');
    let sourceReads = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/invoice-records/sources')
        sourceReads++;
    });
    for (const locale of ['ro', 'ru', 'fr', 'en'] as const) {
      const copy = invoiceRecordMessages[locale];
      await selectOption(page.locator('#interface-locale'), { value: locale });
      await expect(form.getByLabel(copy.system, { exact: true })).toHaveValue(
        ' Fictional manual process ',
      );
      await expect(form.getByLabel(copy.gross, { exact: true })).toHaveValue(
        '1255.00',
      );
      await expect(form.getByLabel(copy.net, { exact: true })).toHaveValue('0');
      await page.screenshot({
        path: info.outputPath(`invoice-record-${suffix}-${locale}-form.png`),
        fullPage: true,
      });
    }
    expect(sourceReads).toBe(0);
    await form.getByLabel(en.acknowledge, { exact: true }).check();
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/invoice-records' &&
        response.request().method() === 'POST',
    );
    await activate(form.getByRole('button', { name: en.save, exact: true }));
    const saveResponse = await saved;
    expect(saveResponse.status()).toBe(201);
    const receipt = object(await saveResponse.json()),
      recordId = text(receipt.recordId);
    const sent: unknown = saveResponse.request().postDataJSON();
    expect(sent).toEqual({
      source,
      values: {
        externalSystem: ' Fictional manual process ',
        externalNumber: 'SYN-INV-001',
        issuedOn: '2026-01-15',
        dueOn: null,
        currency: 'MDL',
        grossMinor: '125500',
        netMinor: '0',
        taxMinor: null,
      },
      acknowledgeExternalDeclaration: true,
      replacesWithdrawnRecordId: null,
    });
    await expect(
      workspace.getByRole('button', { name: en.correct, exact: true }),
    ).toBeVisible();
    for (const locale of ['ro', 'ru', 'fr', 'en'] as const) {
      await selectOption(page.locator('#interface-locale'), { value: locale });
      await expect(workspace).toContainText('SYN-INV-001');
      await page.screenshot({
        path: info.outputPath(`invoice-record-${suffix}-${locale}-record.png`),
        fullPage: true,
      });
    }
    await selectOption(page.locator('#interface-locale'), { value: 'en' });
    const downloaded = page.waitForEvent('download');
    await activate(
      workspace.getByRole('button', { name: en.download, exact: true }),
    );
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe('fictional-invoice.pdf');
    const path = await download.path();
    if (!path) throw new Error('The native exact PDF download is unavailable.');
    expect(
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    ).toBe(createHash('sha256').update(ready.pdfA).digest('hex'));
    await activate(
      workspace.getByRole('button', { name: en.correct, exact: true }),
    );
    await form.getByLabel(en.gross, { exact: true }).fill('1255.50');
    await form.getByLabel(en.net, { exact: true }).fill('1000.00');
    await form.getByLabel(en.tax, { exact: true }).fill('100.00');
    await form.getByLabel(en.due, { exact: true }).fill('2025-01-01');
    await form
      .getByLabel(en.reason, { exact: true })
      .fill('  Correct only the unverified transcription.  ');
    await activate(
      form.getByRole('button', { name: en.saveCorrection, exact: true }),
    );
    await expect(
      workspace.getByRole('button', { name: en.withdraw, exact: true }),
    ).toBeVisible();
    const before = await ready.read(
      '/invoice-records/' + recordId,
      ready.companyId,
    );
    expect(object(before.record)).toMatchObject({
      revision: 2,
      values: {
        grossMinor: '125550',
        netMinor: '100000',
        taxMinor: '10000',
        dueOn: '2025-01-01',
      },
      copiedContext: { receivingParty: { kind: partyKind } },
    });
    expect(before.liveSource).toMatchObject({
      kind: 'AVAILABLE',
      documentId,
      documentVersionId,
      versionNumber: 1,
      versionState: frame === 'classic' ? 'superseded' : 'official',
      content: { kind: 'AVAILABLE', representationId },
    });
    await activate(
      workspace.getByRole('button', { name: en.withdraw, exact: true }),
    );
    const reason =
      '  Withdraw PRISMA entry only; source rights may disappear.  ';
    const withdrawal = workspace.getByRole('region', {
      name: en.withdraw,
      exact: true,
    });
    const withdrawalReason = withdrawal.getByRole('textbox', {
      name: en.reason,
      exact: true,
    });
    await withdrawalReason.fill(reason);
    const revoked = await page.request.delete(
      invoiceApiOrigin +
        '/company-external-invoice-access-assignments/' +
        ready.preparerId +
        '/' +
        ready.companyId,
      {
        headers: {
          ...modelContractIdentities.owner,
          'x-company-context-id': ready.companyId,
          'idempotency-key': randomUUID(),
        },
      },
    );
    expect(revoked.status()).toBe(200);
    await activate(
      workspace.getByRole('button', { name: en.download, exact: true }),
    );
    await expect(
      workspace.getByText(en.sourceUnavailable, { exact: true }).first(),
    ).toBeVisible();
    const unavailableSource = workspace.locator('.invoice-record-source');
    await expect(unavailableSource).not.toContainText(documentTitle);
    await expect(unavailableSource).not.toContainText('fictional-invoice.pdf');
    await expect(unavailableSource).not.toContainText('Version 1');
    await expect(
      workspace.getByRole('button', { name: en.download, exact: true }),
    ).toHaveCount(0);
    await expect(withdrawalReason).toHaveValue(reason);
    await page.screenshot({
      path: info.outputPath(
        `invoice-record-${suffix}-source-unavailable-withdrawal.png`,
      ),
      fullPage: true,
    });
    const afterSourceRefusal = await ready.read(
      '/invoice-records/' + recordId,
      ready.companyId,
    );
    expect(afterSourceRefusal.record).toEqual(before.record);
    expect(afterSourceRefusal.history).toEqual(before.history);
    expect(afterSourceRefusal.liveSource).toEqual({ kind: 'UNAVAILABLE' });
    const withdrawalResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/invoice-records/${recordId}/commands` &&
        response.request().method() === 'POST',
    );
    await activate(
      withdrawal.getByRole('button', { name: en.confirmWithdraw, exact: true }),
    );
    const withdrawalResult = await withdrawalResponse;
    expect(withdrawalResult.status()).toBe(201);
    const withdrawalIntent: unknown = withdrawalResult.request().postDataJSON();
    expect(withdrawalIntent).toEqual({
      action: 'WITHDRAW_ENTRY',
      expectedRevision: 2,
      reason,
    });
    await expect(
      workspace.getByText(en.withdrawn, { exact: true }).first(),
    ).toBeVisible();
    const terminal = await ready.read(
      '/invoice-records/' + recordId,
      ready.companyId,
    );
    expect(object(terminal.record)).toMatchObject({
      revision: 3,
      entryState: 'WITHDRAWN',
      values: object(before.record).values,
    });
    expect(terminal.liveSource).toEqual({ kind: 'UNAVAILABLE' });
    expect(object(terminal.history).items).toHaveLength(3);
    expect(object(terminal.history).items).toContainEqual(
      expect.objectContaining({
        revision: 3,
        action: 'WITHDRAW_ENTRY',
        reason,
      }),
    );
    await page.reload();
    await menu(page, true);
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      value: ready.companyId,
    });
    await activate(
      page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: en.title, exact: true }),
    );
    await menu(page, false);
    await expect(
      workspace.getByRole('button', { name: 'SYN-INV-001', exact: false }),
    ).toBeVisible();
    await activate(
      workspace.getByRole('button', { name: 'SYN-INV-001', exact: false }),
    );
    await expect(
      workspace.getByText(en.withdrawn, { exact: true }).first(),
    ).toBeVisible();
    // Restore the separate source authority through the real administration UI.
    // The withdrawn financial root remains immutable; replacement selects a new
    // exact preserved file and explicitly names the old PRISMA entry.
    await administer('external-invoice-access', 'grant');
    const correctedDocument = await ready.command(
      '/documents',
      {
        type: 'external-invoice',
        opportunityId: ready.opportunityId,
        contractId: ready.contractId,
        contractVersionId: ready.contractVersionId,
        title: 'Fictional corrected financial PDF ' + suffix,
        purpose:
          'Explicit replacement source; not an external fiscal correction',
        sourceDescription: 'Distinct fictional preserved file B',
        receivedOn: null,
      },
      modelContractIdentities.preparer,
      ready.companyId,
    );
    const correctedDocumentId = text(correctedDocument.id),
      correctedVersionId = text(object(correctedDocument.version).id);
    const correctedUpload = await page.request.post(
      invoiceApiOrigin +
        `/documents/${correctedDocumentId}/versions/${correctedVersionId}/content?expectedRevision=1&fileName=fictional-corrected-invoice.pdf`,
      {
        headers: {
          ...sourceHeaders,
          'content-type': 'application/pdf',
          'idempotency-key': randomUUID(),
        },
        data: ready.pdfB,
      },
    );
    expect(correctedUpload.status()).toBe(201);
    const correctedRepresentationId = text(
      object(await correctedUpload.json()).representationId,
    );
    expect(
      (
        await page.request.post(
          invoiceApiOrigin +
            `/documents/${correctedDocumentId}/versions/${correctedVersionId}/official-designation`,
          {
            headers: { ...sourceHeaders, 'idempotency-key': randomUUID() },
            data: { expectedRevision: 2 },
          },
        )
      ).status(),
    ).toBe(200);
    identity = modelContractIdentities.preparer;
    await page.goto('/');
    await page.reload();
    await menu(page, true);
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      value: ready.companyId,
    });
    await menu(page, false);
    if (frame === 'classic') await enterClassicCompatibility(page);
    await menu(page, true);
    await activate(nav.getByRole('link', { name: en.title, exact: true }));
    await menu(page, false);
    await activate(
      workspace.getByRole('button', { name: 'SYN-INV-001', exact: false }),
    );
    await activate(
      workspace.getByRole('button', { name: en.replace, exact: true }),
    );
    await expect(form).toContainText(en.replacementMeaning);
    const correctedSource = {
      documentId: correctedDocumentId,
      documentVersionId: correctedVersionId,
      representationId: correctedRepresentationId,
    };
    await selectOption(form.getByLabel(en.chooseSource), {
      value: sourceKey(correctedSource),
    });
    await form
      .getByLabel(en.system, { exact: true })
      .fill('Fictional manual process');
    await form
      .getByLabel(en.number, { exact: true })
      .fill('SYN-INV-REPLACEMENT');
    await form.getByLabel(en.issued, { exact: true }).fill('2026-01-15');
    await selectOption(form.getByLabel(en.currency, { exact: true }), {
      value: 'MDL',
    });
    await form.getByLabel(en.gross, { exact: true }).fill('1255.50');
    await form.getByLabel(en.acknowledge, { exact: true }).check();
    const replacementResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/invoice-records' &&
        response.request().method() === 'POST',
    );
    await activate(form.getByRole('button', { name: en.save, exact: true }));
    const replaced = await replacementResponse;
    expect(replaced.status()).toBe(201);
    expect(replaced.request().postDataJSON()).toMatchObject({
      source: correctedSource,
      replacesWithdrawnRecordId: recordId,
    });
    const replacementId = text(object(await replaced.json()).recordId);
    const replacement = await ready.read(
      '/invoice-records/' + replacementId,
      ready.companyId,
    );
    expect(object(replacement.record)).toMatchObject({
      id: replacementId,
      revision: 1,
      entryState: 'RECORDED',
      replacesWithdrawnRecordId: recordId,
      values: { externalNumber: 'SYN-INV-REPLACEMENT', grossMinor: '125550' },
    });
    expect(replacement.liveSource).toMatchObject({
      kind: 'AVAILABLE',
      documentId: correctedDocumentId,
      documentVersionId: correctedVersionId,
      content: {
        kind: 'AVAILABLE',
        representationId: correctedRepresentationId,
      },
    });
    await activate(
      workspace.getByRole('button', { name: en.predecessor, exact: true }),
    );
    await expect(
      workspace.getByText(en.withdrawn, { exact: true }).first(),
    ).toBeVisible();
    await activate(
      workspace.getByRole('button', { name: en.successor, exact: true }),
    );
    await expect(
      workspace.getByRole('button', { name: en.predecessor, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`invoice-record-${suffix}-linked-replacement.png`),
      fullPage: true,
    });
    const conserved = await ready.read(
      '/invoice-records/' + recordId,
      ready.companyId,
    );
    expect(conserved.record).toEqual({
      ...object(terminal.record),
      replacementRecordId: replacementId,
    });
    expect(conserved.history).toEqual(terminal.history);
    const leaked = await page.evaluate(() =>
      JSON.stringify({
        url: location.href,
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      }),
    );
    for (const value of [
      recordId,
      documentId,
      documentVersionId,
      representationId,
      'SYN-INV-001',
      reason,
      '125550',
      replacementId,
      correctedDocumentId,
      correctedVersionId,
      correctedRepresentationId,
      'SYN-INV-REPLACEMENT',
    ])
      expect(leaked).not.toContain(value);
  });
}
