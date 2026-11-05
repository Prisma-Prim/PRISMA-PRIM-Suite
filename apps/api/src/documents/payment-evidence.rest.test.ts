import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPaymentEvidenceFixture,
  paymentJson,
  paymentNoticePdf,
  paymentRecord,
  paymentSourceRegistration,
  paymentText,
  type PaymentEvidenceFixture,
  type PaymentEvidenceIdentity,
} from './payment-evidence.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Confidential Payment Evidence Source public REST', () => {
  let fixture: PaymentEvidenceFixture;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
  });
  beforeEach(async () => {
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it('keeps source metadata and Versions private from an ordinary Document and Evidence reader without Payment read', async () => {
    const { companyId, clientId } = fixture.ready;
    const registered = await fixture.call('/documents', {
      method: 'POST',
      key: 'fictional-source-confidentiality',
      body: {
        type: 'payment-evidence',
        clientId,
        payer: { kind: 'PRIMARY' },
        title: 'Fictional payment notice',
        purpose: 'Preserve a declared source without proving payment',
        sourceDescription: 'Fictional manual notice; no bank or fiscal proof',
        receivedOn: null,
      },
    });
    expect(registered.status, await registered.clone().text()).toBe(201);
    const document = await paymentJson(registered);
    expect(document).toMatchObject({
      type: 'payment-evidence',
      companyId,
      clientId,
      version: { status: 'draft', representation: null },
      paymentEvidenceSource: {
        format: 'PAYMENT_EVIDENCE_SOURCE/1',
        receivingCompanyLabel: 'Fictional Receiving Company',
        receivedOn: null,
        payer: {
          kind: 'AVAILABLE',
          party: {
            kind: 'PRIMARY',
            legalName: 'Fictional Payer Primary',
            taxId: 'FICT-PAYER-1045',
            legalAddress: '1045 Fictional Street',
          },
        },
      },
    });
    expect(document).not.toHaveProperty('projectAssociation');
    const documentId = paymentText(document.id);
    const versionId = paymentText(paymentRecord(document.version).id);

    // A successful family read proves that setup and native grant wiring work.
    const authorizedDetail = await fixture.call(`/documents/${documentId}`);
    expect(authorizedDetail.status).toBe(200);
    expect(await paymentJson(authorizedDetail)).toEqual(document);
    const authorizedVersions = await fixture.call(
      `/documents/${documentId}/versions`,
    );
    expect(authorizedVersions.status).toBe(200);
    expect(await authorizedVersions.text()).toContain(versionId);
    const authorizedList = await fixture.call('/documents');
    expect(authorizedList.status).toBe(200);
    expect(await authorizedList.text()).toContain(documentId);

    // An ordinary native Document remains visible to the independently invited actor.
    const ordinary = await fixture.call('/documents', {
      method: 'POST',
      body: {
        clientId,
        title: 'Fictional ordinary questionnaire',
        purpose: 'Positive control for ordinary native Document authority',
        url: 'https://example.test/fictional-questionnaire',
      },
    });
    expect(ordinary.status).toBe(201);
    const ordinaryId = paymentText((await paymentJson(ordinary)).id);
    const ordinaryDetail = await fixture.call(`/documents/${ordinaryId}`, {
      identity: 'ordinary',
    });
    expect(ordinaryDetail.status).toBe(200);
    expect(paymentText((await paymentJson(ordinaryDetail)).id)).toBe(
      ordinaryId,
    );

    const hiddenDetail = await fixture.call(`/documents/${documentId}`, {
      identity: 'ordinary',
    });
    expect(hiddenDetail.status).toBe(404);
    const hiddenVersions = await fixture.call(
      `/documents/${documentId}/versions`,
      { identity: 'ordinary' },
    );
    expect(hiddenVersions.status).toBe(404);
    const list = await fixture.call('/documents', { identity: 'ordinary' });
    expect(list.status).toBe(200);
    const listText = await list.text();
    expect(listText).toContain(ordinaryId);
    expect(listText).not.toContain(documentId);
    expect(listText).not.toContain('Fictional payment notice');
  });

  it('preserves corrected metadata, immutable uploads and exact formal Versions through two App restarts', async () => {
    const { clientId } = fixture.ready;
    const registered = await fixture.call('/documents', {
      method: 'POST',
      body: {
        type: 'payment-evidence',
        clientId,
        payer: { kind: 'PRIMARY' },
        title: 'Fictional payment notice',
        purpose: 'Initial declared source description',
        sourceDescription: 'Fictional manual notice; no bank or fiscal proof',
        receivedOn: null,
      },
    });
    expect(registered.status, await registered.clone().text()).toBe(201);
    const document = await paymentJson(registered);
    const documentId = paymentText(document.id);
    const firstVersionId = paymentText(paymentRecord(document.version).id);
    const source = paymentRecord(document.paymentEvidenceSource);
    const correctionBody = {
      expectedRevision: 1,
      title: 'Preserved fictional payment notice',
      purpose: 'Corrected description; source remains unverified',
    };
    const correction = await fixture.call(`/documents/${documentId}`, {
      method: 'PATCH',
      body: correctionBody,
      key: 'source-metadata-correction',
    });
    expect(correction.status).toBe(200);
    const correctionReceipt = await paymentJson(correction);
    expect(correctionReceipt).toMatchObject({
      outcome: 'corrected',
      revision: 2,
    });
    const correctionReplay = await fixture.call(`/documents/${documentId}`, {
      method: 'PATCH',
      body: correctionBody,
      key: 'source-metadata-correction',
    });
    expect(correctionReplay.status).toBe(200);
    expect(await paymentJson(correctionReplay)).toEqual(correctionReceipt);

    const pdfA = await paymentNoticePdf('A');
    const pdfB = await paymentNoticePdf('B');
    const pdfC = await paymentNoticePdf('C');
    expect(pdfA).not.toEqual(pdfB);
    expect(pdfB).not.toEqual(pdfC);
    const uploadA = {
      documentId,
      versionId: firstVersionId,
      revision: 2,
      bytes: pdfA,
      key: 'source-first-upload-A',
    };
    const firstUpload = await fixture.upload(uploadA);
    expect(firstUpload.status, await firstUpload.clone().text()).toBe(201);
    const receiptA = await paymentJson(firstUpload);
    const representationA = paymentText(receiptA.representationId);
    expect(receiptA).toMatchObject({
      action: 'representation_added',
      workingRevision: 3,
      versionId: firstVersionId,
    });
    const secondUpload = await fixture.upload({
      documentId,
      versionId: firstVersionId,
      revision: 3,
      bytes: pdfB,
      key: 'source-first-upload-B',
    });
    expect(secondUpload.status, await secondUpload.clone().text()).toBe(201);
    const receiptB = await paymentJson(secondUpload);
    const representationB = paymentText(receiptB.representationId);
    expect(representationB).not.toBe(representationA);
    expect(receiptB).toMatchObject({ workingRevision: 4 });
    const oldUploadReplay = await fixture.upload(uploadA);
    expect(oldUploadReplay.status).toBe(201);
    expect(await paymentJson(oldUploadReplay)).toEqual(receiptA);

    async function exactPdf(path: string, expected: Buffer) {
      const response = await fixture.call(path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/pdf');
      expect(response.headers.get('content-disposition')).toContain(
        'attachment',
      );
      expect(Buffer.from(await response.arrayBuffer()), path).toEqual(expected);
    }
    const firstContent = `/documents/${documentId}/versions/${firstVersionId}/content`;
    await exactPdf(firstContent, pdfB);
    await exactPdf(`${firstContent}/${representationA}`, pdfA);
    const firstHistoryResponse = await fixture.call(`${firstContent}/history`);
    expect(firstHistoryResponse.status).toBe(200);
    const firstHistory = await paymentJson(firstHistoryResponse);
    expect(firstHistory).toMatchObject({
      uploads: [
        {
          representationId: representationB,
          revision: 4,
          current: true,
          size: pdfB.length,
          sha256: createHash('sha256').update(pdfB).digest('hex'),
        },
        {
          representationId: representationA,
          revision: 3,
          current: false,
          size: pdfA.length,
          sha256: createHash('sha256').update(pdfA).digest('hex'),
        },
      ],
      nextBeforeRevision: null,
    });
    expect(firstHistory.uploads).toHaveLength(2);

    const firstDesignation = await fixture.call(
      `/documents/${documentId}/versions/${firstVersionId}/official-designation`,
      { method: 'POST', body: { expectedRevision: 4 } },
    );
    expect(firstDesignation.status).toBe(200);
    expect(await paymentJson(firstDesignation)).toMatchObject({
      action: 'designated_official',
      workingRevision: 5,
      versionId: firstVersionId,
    });
    const successor = await fixture.call(`/documents/${documentId}/versions`, {
      method: 'POST',
      body: { expectedRevision: 5 },
      key: 'source-empty-successor',
    });
    expect(successor.status).toBe(201);
    const successorReceipt = await paymentJson(successor);
    const secondVersionId = paymentText(successorReceipt.versionId);
    expect(successorReceipt).toMatchObject({
      action: 'drafted',
      workingRevision: 6,
      versionNumber: 2,
      sourceVersionNumber: 1,
    });

    await fixture.restart();
    const emptySuccessor = await fixture.call(
      `/documents/${documentId}/versions`,
    );
    expect(emptySuccessor.status).toBe(200);
    expect(await paymentJson(emptySuccessor)).toMatchObject({
      workingRevision: 6,
      versions: [
        {
          id: secondVersionId,
          status: 'draft',
          representations: [],
          pdfContent: { state: 'absent' },
        },
        {
          id: firstVersionId,
          status: 'official',
          frozen: {
            title: correctionBody.title,
            purpose: correctionBody.purpose,
          },
          pdfContent: { representationId: representationB },
        },
      ],
    });
    expect(
      (
        await fixture.call(
          `/documents/${documentId}/versions/${secondVersionId}/content`,
        )
      ).status,
    ).toBe(404);
    const thirdUpload = await fixture.upload({
      documentId,
      versionId: secondVersionId,
      revision: 6,
      bytes: pdfC,
      key: 'source-second-upload-C',
    });
    expect(thirdUpload.status, await thirdUpload.clone().text()).toBe(201);
    const representationC = paymentText(
      (await paymentJson(thirdUpload)).representationId,
    );
    const secondDesignation = await fixture.call(
      `/documents/${documentId}/versions/${secondVersionId}/official-designation`,
      { method: 'POST', body: { expectedRevision: 7 } },
    );
    expect(secondDesignation.status).toBe(200);
    expect(await paymentJson(secondDesignation)).toMatchObject({
      action: 'designated_official',
      workingRevision: 8,
      supersededVersionNumber: 1,
    });
    const versionsResponse = await fixture.call(
      `/documents/${documentId}/versions`,
    );
    expect(versionsResponse.status).toBe(200);
    const versions = await paymentJson(versionsResponse);
    expect(versions).toMatchObject({
      workingRevision: 8,
      versions: [
        {
          id: secondVersionId,
          status: 'official',
          pdfContent: { representationId: representationC },
        },
        {
          id: firstVersionId,
          status: 'superseded',
          supersededByVersionNumber: 2,
          pdfContent: { representationId: representationB },
        },
      ],
    });
    const historyResponse = await fixture.call(
      `/documents/${documentId}/correction-history`,
    );
    expect(historyResponse.status).toBe(200);
    const correctionHistory = await paymentJson(historyResponse);
    expect(correctionHistory).toMatchObject({
      corrections: [
        {
          revision: 2,
          changes: {
            title: {
              before: 'Fictional payment notice',
              after: correctionBody.title,
            },
            purpose: {
              before: 'Initial declared source description',
              after: correctionBody.purpose,
            },
          },
        },
      ],
      nextBeforeRevision: null,
    });
    expect(correctionHistory.corrections).toHaveLength(1);

    await fixture.restart();
    const reopened = await fixture.call(`/documents/${documentId}`);
    expect(reopened.status).toBe(200);
    expect(await paymentJson(reopened)).toMatchObject({
      title: correctionBody.title,
      purpose: correctionBody.purpose,
      paymentEvidenceSource: source,
      version: { id: secondVersionId, status: 'official' },
    });
    expect(
      await paymentJson(
        await fixture.call(`/documents/${documentId}/versions`),
      ),
    ).toEqual(versions);
    expect(
      await paymentJson(await fixture.call(`${firstContent}/history`)),
    ).toEqual(firstHistory);
    expect(
      await paymentJson(
        await fixture.call(`/documents/${documentId}/correction-history`),
      ),
    ).toEqual(correctionHistory);
    await exactPdf(`${firstContent}/${representationA}`, pdfA);
    await exactPdf(`${firstContent}/${representationB}`, pdfB);
    await exactPdf(firstContent, pdfB);
    await exactPdf(
      `/documents/${documentId}/versions/${secondVersionId}/content/${representationC}`,
      pdfC,
    );
    await exactPdf(
      `/documents/${documentId}/versions/${secondVersionId}/content`,
      pdfC,
    );
    expect(fixture.scanner.scanCount).toBe(3);
  });

  const independentReadRoles: PaymentEvidenceIdentity[] = [
    'reader',
    'confirmer',
    'reverser',
  ];
  it.each(independentReadRoles)(
    'lets %s read independently while refusing every source mutation without Recorder',
    async (identity) => {
      const { clientId, membershipIds } = fixture.ready;
      const registration = paymentSourceRegistration(clientId);
      const registered = await fixture.call('/documents', {
        method: 'POST',
        body: registration,
      });
      expect(registered.status).toBe(201);
      const document = await paymentJson(registered);
      const documentId = paymentText(document.id);
      const versionId = paymentText(paymentRecord(document.version).id);
      const pdf = await paymentNoticePdf('independent roles');
      const upload = await fixture.upload({
        documentId,
        versionId,
        revision: 1,
        bytes: pdf,
      });
      expect(upload.status).toBe(201);
      const representationId = paymentText(
        (await paymentJson(upload)).representationId,
      );

      // A separate official source makes successor denial independent of draft state.
      const successorRegistration = await fixture.call('/documents', {
        method: 'POST',
        body: {
          ...registration,
          title: 'Fictional official successor control',
        },
      });
      expect(successorRegistration.status).toBe(201);
      const officialSource = await paymentJson(successorRegistration);
      const officialDocumentId = paymentText(officialSource.id);
      const officialVersionId = paymentText(
        paymentRecord(officialSource.version).id,
      );
      expect(
        (
          await fixture.upload({
            documentId: officialDocumentId,
            versionId: officialVersionId,
            revision: 1,
            bytes: pdf,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await fixture.call(
            `/documents/${officialDocumentId}/versions/${officialVersionId}/official-designation`,
            { method: 'POST', body: { expectedRevision: 2 } },
          )
        ).status,
      ).toBe(200);

      // Every native action permission is present; only Recorder is absent.
      for (const path of [
        '/company-document-approver-assignments',
        '/company-document-content-uploader-assignments',
      ])
        expect(
          (await fixture.grant(path, membershipIds[identity])).status,
        ).toBe(201);
      const detail = await fixture.call(`/documents/${documentId}`, {
        identity,
      });
      expect(detail.status, identity).toBe(200);
      expect(await paymentJson(detail)).toMatchObject({
        id: documentId,
        paymentEvidenceSource: document.paymentEvidenceSource,
      });
      const versions = await fixture.call(`/documents/${documentId}/versions`, {
        identity,
      });
      expect(versions.status, identity).toBe(200);
      expect(await paymentJson(versions)).toMatchObject({
        workingRevision: 2,
        versions: [
          {
            id: versionId,
            pdfContent: { access: 'granted', representationId },
          },
        ],
      });
      const list = await fixture.call('/documents', { identity });
      expect(list.status, identity).toBe(200);
      expect(await list.text()).toContain(documentId);
      const bytes = await fixture.call(
        `/documents/${documentId}/versions/${versionId}/content`,
        { identity },
      );
      expect(bytes.status, identity).toBe(200);
      expect(Buffer.from(await bytes.arrayBuffer())).toEqual(pdf);
      const history = await fixture.call(
        `/documents/${documentId}/versions/${versionId}/content/history`,
        { identity },
      );
      expect(history.status, identity).toBe(200);
      expect(await paymentJson(history)).toMatchObject({
        uploads: [{ representationId }],
      });
      const registrationDenied = await fixture.call('/documents', {
        identity,
        method: 'POST',
        body: registration,
      });
      expect(registrationDenied.status, identity).toBe(403);
      const correctionDenied = await fixture.call(`/documents/${documentId}`, {
        identity,
        method: 'PATCH',
        body: { expectedRevision: 2, title: 'Forbidden source correction' },
      });
      expect(correctionDenied.status, identity).toBe(404);
      const successorDenied = await fixture.call(
        `/documents/${officialDocumentId}/versions`,
        {
          identity,
          method: 'POST',
          body: { expectedRevision: 3 },
        },
      );
      expect(successorDenied.status, identity).toBe(404);
      const designationDenied = await fixture.call(
        `/documents/${documentId}/versions/${versionId}/official-designation`,
        {
          identity,
          method: 'POST',
          body: { expectedRevision: 2 },
        },
      );
      expect(designationDenied.status, identity).toBe(404);
      const uploadDenied = await fixture.upload({
        identity,
        documentId,
        versionId,
        revision: 2,
        bytes: pdf,
      });
      expect(uploadDenied.status, identity).toBe(404);
      expect(fixture.scanner.scanCount).toBe(2);
      const unchangedOfficial = await fixture.call(
        `/documents/${officialDocumentId}/versions`,
      );
      expect(unchangedOfficial.status).toBe(200);
      const officialVersions = await paymentJson(unchangedOfficial);
      expect(officialVersions).toMatchObject({
        workingRevision: 3,
        versions: [{ id: officialVersionId, status: 'official' }],
      });
      expect(officialVersions.versions).toHaveLength(1);
      const unchangedInventory = await fixture.call('/documents');
      expect(unchangedInventory.status).toBe(200);
      expect(await unchangedInventory.json()).toHaveLength(2);
      const beforeDesignation = await fixture.call(
        `/documents/${documentId}/versions`,
      );
      expect(await paymentJson(beforeDesignation)).toMatchObject({
        workingRevision: 2,
        versions: [
          { id: versionId, status: 'draft', pdfContent: { representationId } },
        ],
      });
    },
  );

  it('lets a Recorder-only reader designate clean content as Approver after losing Content Reader and Uploader', async () => {
    const { clientId, membershipIds } = fixture.ready;
    const registration = paymentSourceRegistration(clientId);
    const registered = await fixture.call('/documents', {
      method: 'POST',
      body: registration,
    });
    expect(registered.status).toBe(201);
    const document = await paymentJson(registered);
    const documentId = paymentText(document.id);
    const versionId = paymentText(paymentRecord(document.version).id);
    const pdf = await paymentNoticePdf('independent roles');
    const upload = await fixture.upload({
      documentId,
      versionId,
      revision: 1,
      bytes: pdf,
    });
    expect(upload.status).toBe(201);
    const representationId = paymentText(
      (await paymentJson(upload)).representationId,
    );

    expect(
      (
        await fixture.revoke(
          '/company-payment-reader-assignments',
          membershipIds.owner,
        )
      ).status,
    ).toBe(200);
    expect((await fixture.call(`/documents/${documentId}`)).status).toBe(200);
    const beforeDesignation = await fixture.call(
      `/documents/${documentId}/versions`,
    );
    expect(await paymentJson(beforeDesignation)).toMatchObject({
      workingRevision: 2,
      versions: [
        { id: versionId, status: 'draft', pdfContent: { representationId } },
      ],
    });
    for (const path of [
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ])
      expect((await fixture.revoke(path, membershipIds.owner)).status).toBe(
        200,
      );
    expect((await fixture.call(`/documents/${documentId}`)).status).toBe(200);
    const withoutContent = await fixture.call(
      `/documents/${documentId}/versions`,
    );
    expect(withoutContent.status).toBe(200);
    const hiddenContent = await paymentJson(withoutContent);
    if (!Array.isArray(hiddenContent.versions))
      throw new Error('Expected native Versions.');
    expect(paymentRecord(hiddenContent.versions[0]).pdfContent).toEqual({
      state: 'stored',
      access: 'denied',
    });
    for (const suffix of ['', '/history', `/${representationId}`])
      expect(
        (
          await fixture.call(
            `/documents/${documentId}/versions/${versionId}/content${suffix}`,
          )
        ).status,
      ).toBe(403);
    const designated = await fixture.call(
      `/documents/${documentId}/versions/${versionId}/official-designation`,
      {
        method: 'POST',
        body: { expectedRevision: 2 },
      },
    );
    expect(designated.status, await designated.clone().text()).toBe(200);
    expect(await paymentJson(designated)).toMatchObject({
      action: 'designated_official',
      workingRevision: 3,
      versionId,
    });
    const officialWithoutContent = await fixture.call(
      `/documents/${documentId}/versions`,
    );
    expect(await paymentJson(officialWithoutContent)).toMatchObject({
      versions: [
        {
          id: versionId,
          status: 'official',
          pdfContent: { state: 'stored', access: 'denied' },
        },
      ],
    });
  });

  it.each(['PRIMARY', 'ADDITIONAL'])(
    'requires identity-read for a fresh %s payer and preserves exact replay and frozen identity after authority loss',
    async (payerKind) => {
      const { clientId, additionalLegalEntityId, membershipIds } =
        fixture.ready;
      const body = paymentSourceRegistration(
        clientId,
        payerKind === 'PRIMARY'
          ? { kind: 'PRIMARY' }
          : { kind: 'ADDITIONAL', legalEntityId: additionalLegalEntityId },
      );
      const key = `payer-${payerKind}-exact-registration`;
      expect(
        (
          await fixture.revoke(
            '/company-director-client-assignments',
            membershipIds.owner,
          )
        ).status,
      ).toBe(200);
      const minimalDirectory = await fixture.call('/clients');
      expect(minimalDirectory.status).toBe(200);
      expect(await minimalDirectory.text()).toContain(clientId);
      const denied = await fixture.call('/documents', {
        method: 'POST',
        body,
        key,
      });
      expect(denied.status, await denied.clone().text()).toBe(403);
      const emptyInventory = await fixture.call('/documents');
      expect(emptyInventory.status).toBe(200);
      expect(await emptyInventory.json()).toEqual([]);
      expect(
        (
          await fixture.grant(
            '/company-director-client-assignments',
            membershipIds.owner,
          )
        ).status,
      ).toBe(201);
      const registered = await fixture.call('/documents', {
        method: 'POST',
        body,
        key,
      });
      expect(registered.status, await registered.clone().text()).toBe(201);
      const original = await paymentJson(registered);
      const documentId = paymentText(original.id);
      const versionId = paymentText(paymentRecord(original.version).id);
      const originalSource = paymentRecord(original.paymentEvidenceSource);
      expect(originalSource.payer).toEqual(
        payerKind === 'PRIMARY'
          ? {
              kind: 'AVAILABLE',
              party: {
                kind: 'PRIMARY',
                legalName: 'Fictional Payer Primary',
                taxId: 'FICT-PAYER-1045',
                legalAddress: '1045 Fictional Street',
              },
            }
          : {
              kind: 'AVAILABLE',
              party: {
                kind: 'ADDITIONAL',
                legalEntityId: additionalLegalEntityId,
                legalName: 'Fictional Payer Additional',
                taxId: 'FICT-ADDITIONAL-1045',
                legalAddress: null,
              },
            },
      );
      const changedIntent = await fixture.call('/documents', {
        method: 'POST',
        key,
        body: { ...body, sourceDescription: 'A different declared source' },
      });
      expect(changedIntent.status).toBe(409);
      const pdf = await paymentNoticePdf('payer projection');
      expect(
        (
          await fixture.upload({
            documentId,
            versionId,
            revision: 1,
            bytes: pdf,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await fixture.revoke(
            '/company-director-client-assignments',
            membershipIds.owner,
          )
        ).status,
      ).toBe(200);
      const replay = await fixture.call('/documents', {
        method: 'POST',
        body,
        key,
      });
      expect(replay.status, await replay.clone().text()).toBe(201);
      const current = await paymentJson(replay);
      expect(current).toMatchObject({ id: documentId, clientId });
      const source = paymentRecord(current.paymentEvidenceSource);
      expect(source.payer).toEqual({ kind: 'UNAVAILABLE' });
      const { payer: originalPayer, ...originalContext } = originalSource;
      expect(originalPayer).toHaveProperty('kind', 'AVAILABLE');
      const { payer: unavailable, ...currentContext } = source;
      expect(unavailable).toEqual({ kind: 'UNAVAILABLE' });
      expect(currentContext).toEqual(originalContext);
      const detail = await fixture.call(`/documents/${documentId}`);
      expect(detail.status).toBe(200);
      expect(
        paymentRecord((await paymentJson(detail)).paymentEvidenceSource).payer,
      ).toEqual({ kind: 'UNAVAILABLE' });
      const newCopyDenied = await fixture.call('/documents', {
        method: 'POST',
        body,
        key: 'payer-new-copy-after-loss',
      });
      expect(newCopyDenied.status).toBe(403);
      const content = await fixture.call(
        `/documents/${documentId}/versions/${versionId}/content`,
      );
      expect(content.status).toBe(200);
      expect(Buffer.from(await content.arrayBuffer())).toEqual(pdf);
      const versions = await fixture.call(`/documents/${documentId}/versions`);
      expect(versions.status).toBe(200);
      expect(await paymentJson(versions)).toMatchObject({ workingRevision: 2 });
      const corrected = await fixture.call(`/documents/${documentId}`, {
        method: 'PATCH',
        body: {
          expectedRevision: 2,
          title: 'Source corrected without recopying payer',
        },
      });
      expect(corrected.status).toBe(200);
      const designated = await fixture.call(
        `/documents/${documentId}/versions/${versionId}/official-designation`,
        {
          method: 'POST',
          body: { expectedRevision: 3 },
        },
      );
      expect(designated.status).toBe(200);
      const successor = await fixture.call(
        `/documents/${documentId}/versions`,
        {
          method: 'POST',
          body: { expectedRevision: 4 },
        },
      );
      expect(successor.status).toBe(201);
      const nextVersionId = paymentText(
        (await paymentJson(successor)).versionId,
      );
      expect(
        (
          await fixture.upload({
            documentId,
            versionId: nextVersionId,
            revision: 5,
            bytes: pdf,
          })
        ).status,
      ).toBe(201);

      // The independent Company reader corrects both live identities while the original projection is unavailable.
      const liveDossier = await fixture.call(`/clients/${clientId}`, {
        identity: 'reader',
      });
      expect(liveDossier.status).toBe(200);
      const expectedVersion = (await paymentJson(liveDossier)).version;
      if (
        typeof expectedVersion !== 'number' ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 1
      )
        throw new Error('Expected the current native Client dossier version.');
      const clientCorrection = await fixture.call(`/clients/${clientId}`, {
        identity: 'reader',
        method: 'PATCH',
        body: {
          expectedVersion,
          displayName: 'Current fictional payer name',
          taxId: 'FICT-PAYER-NEW-1045',
          address: null,
        },
      });
      expect(
        clientCorrection.status,
        await clientCorrection.clone().text(),
      ).toBe(200);
      expect(await paymentJson(clientCorrection)).toMatchObject({
        version: expectedVersion + 1,
        displayName: 'Current fictional payer name',
        taxId: 'FICT-PAYER-NEW-1045',
        address: null,
      });
      const entityCorrection = await fixture.call(
        `/clients/${clientId}/legal-entities/${additionalLegalEntityId}`,
        {
          identity: 'reader',
          method: 'PATCH',
          body: {
            expectedClientVersion: expectedVersion + 1,
            changes: {
              legalName: 'Current fictional additional payer',
              taxId: null,
              legalAddress: 'Current fictional address',
            },
          },
        },
      );
      expect(
        entityCorrection.status,
        await entityCorrection.clone().text(),
      ).toBe(200);
      expect(await paymentJson(entityCorrection)).toMatchObject({
        clientVersion: expectedVersion + 2,
        legalEntity: {
          legalName: 'Current fictional additional payer',
          taxId: null,
          legalAddress: 'Current fictional address',
        },
      });
      expect(
        (
          await fixture.grant(
            '/company-director-client-assignments',
            membershipIds.owner,
          )
        ).status,
      ).toBe(201);
      const restored = await fixture.call(`/documents/${documentId}`);
      expect(restored.status).toBe(200);
      expect(
        paymentRecord((await paymentJson(restored)).paymentEvidenceSource),
      ).toEqual(originalSource);
      const replayAfterCorrection = await fixture.call('/documents', {
        method: 'POST',
        body,
        key,
      });
      expect(replayAfterCorrection.status).toBe(201);
      expect(await paymentJson(replayAfterCorrection)).toMatchObject({
        id: documentId,
        title: 'Source corrected without recopying payer',
        workingRevision: 6,
        paymentEvidenceSource: originalSource,
      });
    },
  );
});
