import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import {
  prepareReceivedContractCase,
  modelContractIdentities,
  object,
  text,
} from './received-contract.acceptance.fixture';
export { modelContractIdentities, object, text };
const origin = 'http://127.0.0.1:4174/api';
/** Genuine Company-model V1→V2 before reported execution; all business setup uses native HTTP. */
export async function prepareReceivedAddendumCase(page: Page, suffix: string) {
  const ready = await prepareReceivedContractCase(page, 'addendum-' + suffix);
  for (const bundle of [
    'company-received-contract-access',
    'company-received-addendum-access',
    'company-contract-signature-declarer',
    'company-contract-approver',
  ])
    await ready.command('/' + bundle + '-assignments', {
      companyId: ready.companyId,
      workspaceMembershipId: ready.preparerId,
    });
  const path = `/contracts/opportunities/${ready.opportunityId}`;
  const v2 = await ready.command(
      path + '/versions/from-approved-model',
      { ...ready.intent, expectedContractRevision: 1 },
      modelContractIdentities.preparer,
      ready.companyId,
    ),
    parentContractId = text(v2.id),
    parentContractVersionId = text(object(v2.version).id);
  const warnings = ['MODEL_WORDING_REVIEWED', 'ANNEX_SCOPE_REVIEWED'];
  await ready.command(
    `${path}/versions/${parentContractVersionId}/approve`,
    {
      expectedContractRevision: 2,
      acknowledgedWarningCodes: warnings,
      reviewBasis: 'Fictional exact V2 wording review',
    },
    modelContractIdentities.reader,
    ready.companyId,
  );
  const own = await ready.command(
      '/documents',
      {
        type: 'received-contract',
        opportunityId: ready.opportunityId,
        contractId: parentContractId,
        contractVersionId: parentContractVersionId,
        title: 'Fictional parent own signing PDF',
        purpose: 'Preserve exact own parent copy',
        sourceDescription: 'Fictional parent source',
      },
      modelContractIdentities.preparer,
      ready.companyId,
    ),
    ownDocumentId = text(own.id),
    ownVersionId = text(object(own.version).id);
  const headers = {
    ...modelContractIdentities.preparer,
    'x-company-context-id': ready.companyId,
  };
  const upload = await page.request.post(
    origin +
      `/documents/${ownDocumentId}/versions/${ownVersionId}/content?expectedRevision=1&fileName=fictional-parent-signing.pdf`,
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
  const designated = await page.request.post(
    origin +
      `/documents/${ownDocumentId}/versions/${ownVersionId}/official-designation`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { expectedRevision: 2 },
    },
  );
  expect(designated.status()).toBe(200);
  const signingPath = `${path}/versions/${parentContractVersionId}/signing-declarations`;
  async function executeParent() {
    const candidates = await ready.read(
      signingPath + '/pdf-candidates',
      ready.companyId,
    );
    if (!Array.isArray(candidates.items) || candidates.items.length !== 1)
      throw new Error('Exact native own signing PDF required');
    const pdf = object(candidates.items[0]);
    await ready.command(
      signingPath,
      {
        expectedContractRevision: 3,
        documentId: ownDocumentId,
        documentVersionId: ownVersionId,
        representationId: text(pdf.representationId),
        providerSignatory: {
          label: 'Fictional provider',
          signedOn: null,
          mandate: { kind: 'UNKNOWN' },
        },
        clientSignatory: {
          label: 'Fictional Client',
          signedOn: null,
          mandate: { kind: 'UNKNOWN' },
        },
        concordanceBasis: 'Fictional exact parent and own PDF comparison',
        acceptanceBasis: 'Fictional reported acceptance',
        acknowledgedWarningCodes: warnings,
      },
      modelContractIdentities.preparer,
      ready.companyId,
    );
  }
  const [addendumA, addendumB] = await Promise.all(
    ['a', 'b'].map((letter) =>
      readFile(
        new URL(
          `../../api/test-support/fixtures/received-addendum-fictional-${letter}.pdf`,
          import.meta.url,
        ),
      ),
    ),
  );
  if (!addendumA || !addendumB)
    throw new Error('Distinct fictional Addendum originals required');
  return {
    ...ready,
    parentContractId,
    parentContractVersionId,
    executeParent,
    addendumA,
    addendumB,
    headers,
  };
}
