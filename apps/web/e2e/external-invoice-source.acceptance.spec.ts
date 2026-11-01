import { expect, test, type Locator } from '@playwright/test';
import {
  prepareExternalInvoiceSourceCase,
  modelContractIdentities,
  object,
  text,
} from './external-invoice-source.acceptance.fixture';
import { selectOption } from './select-option';
import { enterClassicCompatibility } from './classic-compatibility';
import {
  exactReceivedDownload,
  openReceivedDocuments,
} from './received-contract.acceptance.fixture';

for (const partyKind of ['PRIMARY', 'ADDITIONAL'] as const) {
  test(`preserves the actual ${partyKind} declared invoice source through native admin, exact immutable uploads, formal Versions and independent denial`, async ({
    page,
  }, info) => {
    // The existing received-Contract source journey uses the same bounded budget.
    test.setTimeout(180_000);
    const narrow = info.project.name.endsWith('narrow');
    const suffix = `invoice-${partyKind.toLowerCase()}-${narrow ? 'narrow' : 'desktop'}`;
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
    const before = object(
      (await ready.read('/access/current-actor', ready.companyId))
        .activeCompany,
    );
    expect(before.externalInvoiceGrants ?? []).toEqual([]);

    async function administer(
      bundle: 'invoice-reader' | 'invoice-recorder' | 'external-invoice-access',
      action: 'grant' | 'revoke',
    ) {
      identity = modelContractIdentities.owner;
      await page.goto('/#access');
      // A fragment navigation keeps the previous App Actor. Rehydrate the
      // actual Owner session before invoking its assignment administration.
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
      await admin
        .getByRole('button', {
          name: action === 'grant' ? 'Grant access' : 'Revoke access',
          exact: true,
        })
        .click();
      await expect(
        admin.getByText(
          action === 'grant' ? 'Granted — captured version v1' : 'Not granted',
          { exact: true },
        ),
      ).toBeVisible();
    }
    for (const bundle of [
      'invoice-reader',
      'invoice-recorder',
      'external-invoice-access',
    ] as const)
      await administer(bundle, 'grant');
    const granted = object(
      (await ready.read('/access/current-actor', ready.companyId))
        .activeCompany,
    );
    expect(granted.externalInvoiceGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bundle: 'company_invoice_reader',
          permissionSetVersion: 'v1',
        }),
        expect.objectContaining({
          bundle: 'company_invoice_recorder',
          permissionSetVersion: 'v1',
        }),
        expect.objectContaining({
          bundle: 'company_external_invoice_access',
          permissionSetVersion: 'v1',
        }),
      ]),
    );
    const selector = await ready.read(
      '/documents/external-invoice-sources',
      ready.companyId,
    );
    if (!Array.isArray(selector.sources))
      throw new Error('Expected exact native source discovery');
    expect(selector.sources).toHaveLength(1);
    expect(selector.sources[0]).toMatchObject({
      contractId: ready.contractId,
      contractVersionId: ready.contractVersionId,
      contractVersionNumber: 2,
      recordedRecipient: ready.expectedParty,
    });
    expect(selector.sources).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contractVersionId: ready.initialVersionId }),
      ]),
    );

    identity = modelContractIdentities.preparer;
    let documents = await openReceivedDocuments(
      page,
      ready.companyName,
      narrow,
    );
    await selectOption(documents.getByLabel('Document family'), {
      value: 'external-invoice',
    });
    const initialPicker = documents.getByLabel(
      'Exact declared Contract Version and receiving party',
      { exact: true },
    );
    await expect(initialPicker).toBeEnabled();
    await selectOption(initialPicker, { value: ready.contractVersionId });
    const pickerId = await initialPicker.getAttribute('id');
    if (!pickerId) throw new Error('Missing labeled exact-Version picker');
    const picker = page.locator(`[id="${pickerId}"]`);
    await expect(
      documents
        .getByRole('region', { name: 'Recorded receiving party', exact: true })
        .getByText(ready.expectedParty.legalName, { exact: true }),
    ).toBeVisible();
    await expect(
      documents.getByText(
        partyKind === 'PRIMARY'
          ? 'Primary Client Legal Entity'
          : 'Additional Client Legal Entity',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(documents.getByLabel('Client', { exact: true })).toHaveCount(
      0,
    );
    await expect(documents.getByLabel('External HTTPS link')).toHaveCount(0);
    const title = 'Fictional external invoice ' + suffix;
    const literal =
      ' Fictional manual process\n<script>literalInvoice()</script> Ș Я é ' +
      'long literal source '.repeat(8);
    await documents.getByLabel('Title', { exact: true }).fill(title);
    await documents
      .getByLabel('Purpose', { exact: true })
      .fill('Preserve this exact fictional external original');
    await documents
      .getByLabel('Declared external source', { exact: true })
      .fill(literal);
    const receivedOn = partyKind === 'PRIMARY' ? '2026-01-15' : null;
    const receivedDateId = await documents
      .getByLabel('Received on (not recorded if blank)', { exact: true })
      .getAttribute('id');
    if (!receivedDateId) throw new Error('Missing labeled received-date field');
    const receivedDateField = page.locator(`[id="${receivedDateId}"]`);
    if (receivedOn) await receivedDateField.fill(receivedOn);
    const sourceId = await documents
      .getByLabel('Declared external source', { exact: true })
      .getAttribute('id');
    if (!sourceId) throw new Error('Missing labeled exact-source field');
    const literalField = page.locator(`[id="${sourceId}"]`);
    await literalField.focus();
    await expect(literalField).toBeFocused();
    const traffic: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/documents'))
        traffic.push(request.method() + ' ' + request.url());
    });
    const beforePresentation = traffic.length;
    for (const { locale, label } of [
      {
        locale: 'ro',
        label: 'Versiunea exactă declarată a Contractului și destinatarul',
      },
      { locale: 'ru', label: 'Точная заявленная версия Договора и получатель' },
      {
        locale: 'fr',
        label: 'Version exacte déclarée du Contrat et destinataire',
      },
      {
        locale: 'en',
        label: 'Exact declared Contract Version and receiving party',
      },
    ]) {
      await selectOption(page.locator('#interface-locale'), { value: locale });
      await expect(literalField).toHaveValue(literal);
      await expect(receivedDateField).toHaveValue(receivedOn ?? '');
      await expect(picker).toHaveAccessibleName(label);
      await expect(picker).toHaveAttribute(
        'data-value',
        ready.contractVersionId,
      );
      await page.screenshot({
        path: info.outputPath(`${suffix}-${locale}-draft.png`),
        fullPage: true,
      });
    }
    await enterClassicCompatibility(page);
    await expect(literalField).toHaveValue(literal);
    await page.screenshot({
      path: info.outputPath(`${suffix}-classic-draft.png`),
      fullPage: true,
    });
    await documents.screenshot({
      path: info.outputPath(`${suffix}-classic-documents-draft.png`),
    });
    await page.getByRole('button', { name: 'Try Prisme', exact: true }).click();
    expect(traffic).toHaveLength(beforePresentation);
    const registeredResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/documents' &&
        response.request().method() === 'POST',
    );
    await documents
      .getByRole('button', {
        name: 'Register external invoice PDF',
        exact: true,
      })
      .click();
    const registered = await registeredResponse;
    expect(registered.status()).toBe(201);
    const saved = object(await registered.json()),
      documentId = text(saved.id),
      versionId = text(object(saved.version).id);
    expect(object(saved.externalInvoiceRelation)).toMatchObject({
      contractVersionId: ready.contractVersionId,
      recordedRecipient: ready.expectedParty,
      sourceDescription: literal.trim(),
      receivedOn,
    });
    await expect(
      documents.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      documents.getByText(literal.trim(), { exact: true }),
    ).toBeVisible();
    if (receivedOn) {
      const beforeDatePresentation = traffic.length;
      const recordedDate = documents.locator(`time[datetime="${receivedOn}"]`);
      for (const { locale, expected } of [
        { locale: 'ro', expected: '15 ian. 2026' },
        { locale: 'ru', expected: '15 янв. 2026 г.' },
        { locale: 'fr', expected: '15 janv. 2026' },
        { locale: 'en', expected: 'Jan 15, 2026' },
      ]) {
        await selectOption(page.locator('#interface-locale'), {
          value: locale,
        });
        await expect(recordedDate).toHaveText(expected);
        await expect(recordedDate).toHaveAttribute('datetime', receivedOn);
        await page.screenshot({
          path: info.outputPath(`${suffix}-${locale}-received-date.png`),
          fullPage: true,
        });
      }
      expect(traffic).toHaveLength(beforeDatePresentation);
    }
    await expect(
      documents.getByRole('button', { name: 'Add reference', exact: true }),
    ).toHaveCount(0);
    const version = (number: number) =>
      documents.locator('.working-document-version').filter({
        has: page.getByRole('heading', {
          name: `Version ${number}`,
          exact: true,
        }),
      });
    async function upload(owner: Locator, name: string, bytes: Buffer) {
      await owner
        .getByLabel('Choose the PDF file')
        .setInputFiles({ name, mimeType: 'application/pdf', buffer: bytes });
      await owner
        .getByRole('button', { name: 'Preserve PDF', exact: true })
        .click();
      await expect(owner.getByText(name, { exact: true })).toBeVisible();
    }
    await upload(version(1), 'fictional-invoice-a.pdf', ready.pdfA);
    await upload(version(1), 'fictional-invoice-a-again.pdf', ready.pdfA);
    const history = await ready.read(
      `/documents/${documentId}/versions/${versionId}/content/history`,
      ready.companyId,
    );
    if (!Array.isArray(history.uploads) || history.uploads.length !== 2)
      throw new Error('Expected two independently identified native uploads');
    const latest = object(history.uploads[0]),
      earlier = object(history.uploads[1]);
    expect(latest.representationId).not.toBe(earlier.representationId);
    expect(latest.sha256).toBe(earlier.sha256);
    await exactReceivedDownload(
      page,
      version(1).getByRole('button', {
        name: 'Download Version 1 PDF',
        exact: true,
      }),
      ready.pdfA,
    );
    await version(1)
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    await documents
      .getByRole('button', {
        name: 'Confirm official designation',
        exact: true,
      })
      .click();
    await documents
      .getByRole('button', { name: 'Start new draft', exact: true })
      .click();
    await expect(
      version(2).getByText('This Version has no preserved PDF yet.', {
        exact: true,
      }),
    ).toBeVisible();
    await upload(version(2), 'fictional-invoice-b.pdf', ready.pdfB);
    await version(2)
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    await documents
      .getByRole('button', {
        name: 'Confirm official designation',
        exact: true,
      })
      .click();
    documents = await openReceivedDocuments(page, ready.companyName, narrow);
    await documents.getByRole('button', { name: title, exact: true }).click();
    await expect(version(1).getByText('Superseded by Version 2')).toBeVisible();
    await version(1)
      .getByRole('button', { name: 'PDF history', exact: true })
      .click();
    const uploadRows = version(1)
      .getByRole('list', { name: 'PDF history', exact: true })
      .getByRole('listitem');
    await expect(uploadRows).toHaveCount(2);
    await exactReceivedDownload(
      page,
      uploadRows
        .nth(1)
        .getByRole('button', { name: 'Download Version 1 PDF', exact: true }),
      ready.pdfA,
    );
    await exactReceivedDownload(
      page,
      version(2).getByRole('button', {
        name: 'Download Version 2 PDF',
        exact: true,
      }),
      ready.pdfB,
    );
    const conserved = await ready.read(
      '/documents/' + documentId,
      ready.companyId,
    );
    expect(conserved.externalInvoiceRelation).toEqual(
      saved.externalInvoiceRelation,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`${suffix}-preserved.png`),
      fullPage: true,
    });

    // Losing related Contract/Opportunity read does not erase independently readable native facts or bytes.
    await ready.revoke('company-contract-preparer');
    await ready.revoke('company-contract-approver');
    await ready.revoke('company-commercial-intake');
    documents = await openReceivedDocuments(page, ready.companyName, narrow);
    await documents.getByRole('button', { name: title, exact: true }).click();
    await expect(
      documents.getByText(
        'The declared invoice source and receiving party are unavailable under your current access.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      documents.getByText(literal.trim(), { exact: true }),
    ).toHaveCount(0);
    await expect(
      documents.getByRole('region', {
        name: 'Declared invoice source and recorded receiving party',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      documents.getByRole('region', {
        name: 'Recorded receiving party',
        exact: true,
      }),
    ).toHaveCount(0);
    const unavailableRelation = await ready.read(
      '/documents/' + documentId,
      ready.companyId,
    );
    // The closed unavailable projection withholds source/date/party/registrar facts.
    expect(unavailableRelation.externalInvoiceRelation).toEqual({
      access: 'denied',
    });
    expect(unavailableRelation).not.toHaveProperty('createdByMembershipId');
    await expect(
      documents.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      documents.getByText(text(saved.clientDisplayName), { exact: true }),
    ).toBeVisible();
    await expect(
      version(1).getByRole('heading', { name: 'Version 1', exact: true }),
    ).toBeVisible();
    await expect(
      version(2).getByRole('heading', { name: 'Version 2', exact: true }),
    ).toBeVisible();
    await exactReceivedDownload(
      page,
      version(2).getByRole('button', {
        name: 'Download Version 2 PDF',
        exact: true,
      }),
      ready.pdfB,
    );
    // Existing native preservation remains usable after unrelated source-read loss.
    await documents
      .getByRole('button', { name: 'Start new draft', exact: true })
      .click();
    await expect(
      version(3).getByText('This Version has no preserved PDF yet.', {
        exact: true,
      }),
    ).toBeVisible();
    await documents
      .getByRole('button', { name: 'Edit reference', exact: true })
      .click();
    await documents
      .getByRole('textbox', { name: 'Purpose', exact: true })
      .fill('Native correction while the declared source is unavailable');
    const correctionResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/documents/${documentId}` &&
        response.request().method() === 'PATCH',
    );
    // Native Versions keep their old rows during refresh. Use the completed
    // correction's revision before starting the next distinct upload intent.
    const correctedVersions = page.waitForResponse(async (response) => {
      if (
        new URL(response.url()).pathname !==
          `/api/documents/${documentId}/versions` ||
        response.request().method() !== 'GET' ||
        response.status() !== 200
      )
        return false;
      const receipt = object(await (await correctionResponse).json());
      return object(await response.json()).workingRevision === receipt.revision;
    });
    await documents
      .getByRole('button', { name: 'Save correction', exact: true })
      .click();
    const correctionReceipt = await correctionResponse;
    expect(correctionReceipt.status()).toBe(200);
    expect(object(await correctionReceipt.json())).toMatchObject({
      documentId,
      outcome: 'corrected',
    });
    await correctedVersions;
    await expect(
      documents.getByText(
        'Native correction while the declared source is unavailable',
        { exact: true },
      ),
    ).toBeVisible();
    await upload(
      version(3),
      'fictional-invoice-after-source-loss.pdf',
      ready.pdfA,
    );
    await version(3)
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    await documents
      .getByRole('button', {
        name: 'Confirm official designation',
        exact: true,
      })
      .click();
    await expect(
      documents.getByText(
        'The declared invoice source and receiving party are unavailable under your current access.',
        { exact: true },
      ),
    ).toBeVisible();
    await ready.revoke('company-document-content-reader');
    documents = await openReceivedDocuments(page, ready.companyName, narrow);
    await documents.getByRole('button', { name: title, exact: true }).click();
    await expect(
      documents.getByText('fictional-invoice-b.pdf', { exact: true }),
    ).toHaveCount(0);
    await expect(
      documents.getByRole('button', { name: /Download Version/u }),
    ).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`${suffix}-independent-redaction.png`),
      fullPage: true,
    });
    await administer('invoice-recorder', 'revoke');
    identity = modelContractIdentities.preparer;
    documents = await openReceivedDocuments(page, ready.companyName, narrow);
    await expect(
      documents.getByRole('button', { name: title, exact: true }),
    ).toBeVisible();
    await administer('invoice-reader', 'revoke');
    identity = modelContractIdentities.preparer;
    documents = await openReceivedDocuments(page, ready.companyName, narrow);
    await expect(
      documents.getByRole('button', { name: title, exact: true }),
    ).toHaveCount(0);
    await expect(
      documents.getByRole('button', {
        name: 'Fictional Contract declaration PDF ' + suffix,
        exact: true,
      }),
    ).toBeVisible();
    await administer('external-invoice-access', 'revoke');
  });
}
