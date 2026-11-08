import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { prepareReportedSigning } from '../contract/reported-contract-signing.test-support.js';
import {
  externalInvoiceEffects,
  fictionalInvoicePdf,
  openExternalInvoiceDocument,
} from '../documents/external-invoice.test-support.js';
import {
  responseRecord,
  responseString,
  type openEstimateOfferFixture,
} from '../offer/offer-estimate-preparation.test-support.js';

export type InvoiceRecordProofFixture = Awaited<
  ReturnType<typeof openEstimateOfferFixture>
>;

export function fictionalInvoiceValues() {
  return {
    externalSystem: ' Fictional manual process ',
    externalNumber: 'SYN-INV-001',
    issuedOn: '2026-01-15',
    dueOn: null,
    currency: 'MDL',
    grossMinor: '125500',
    netMinor: null,
    taxMinor: null,
  };
}

/**
 * All eligible source facts and assignments are produced by native commands.
 * A distinct `clientTaxId` prepares another Company in the same Workspace.
 */
export async function prepareInvoiceRecordSource(
  fixture: InvoiceRecordProofFixture,
  options: { clientTaxId?: string } = {},
) {
  const document = await openExternalInvoiceDocument(fixture, options);
  const documentVersionId = responseString(
    responseRecord(document.document.version),
    'id',
  );
  const bytes = await fictionalInvoicePdf();
  const upload = await document.upload(documentVersionId, 1, bytes);
  expect(upload.status).toBe(201);
  const representationId = responseString(
    responseRecord(await upload.json()),
    'representationId',
  );
  const designation = await document.mutate(
    `/versions/${documentVersionId}/official-designation`,
    { expectedRevision: 2 },
  );
  expect(designation.status).toBe(200);
  const source = {
    documentId: document.documentId,
    documentVersionId,
    representationId,
  };
  const createBody = {
    source,
    values: fictionalInvoiceValues(),
    acknowledgeExternalDeclaration: true,
    replacesWithdrawnRecordId: null,
  };
  const request = (path: string, init?: RequestInit) =>
    fixture.request({ ...document.target, path, init });
  const create = (body: unknown = createBody, key: string = randomUUID()) =>
    fixture.post({
      ...document.target,
      path: '/invoice-records',
      body,
      key,
    });
  const command = ({
    recordId,
    body,
    key = randomUUID(),
  }: {
    recordId: string;
    body: unknown;
    key?: string;
  }) =>
    fixture.post({
      ...document.target,
      path: `/invoice-records/${recordId}/commands`,
      body,
      key,
    });
  const read = async (path: string) => {
    const response = await request(path);
    expect(response.status).toBe(200);
    return responseRecord(await response.json());
  };
  return {
    ...document,
    source,
    bytes,
    createBody,
    create,
    command,
    request,
    read,
  };
}

/** Native persisted effects, including retained source bytes and Client fences. */
export async function invoiceRecordEffects(fixture: InvoiceRecordProofFixture) {
  const effects = await externalInvoiceEffects(fixture);
  for (const table of [
    'invoice_records',
    'invoice_record_commands',
    'invoice_record_history',
    'invoice_record_events',
    'invoice_record_cursor_keys',
  ]) {
    const result = await fixture.pool.query<{ facts: unknown }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
    );
    const row = result.rows[0];
    if (!row)
      throw new Error('Expected exact persisted Invoice Record effects.');
    effects[table] = row.facts;
  }
  return effects;
}

/** A different Company and uniquely identified Client, using the same native path. */
export async function prepareInvoiceRecordSourceInNewCompany(
  fixture: InvoiceRecordProofFixture,
  input: { clientTaxId: string },
) {
  const signed = await prepareReportedSigning(fixture, input);
  await fixture.command({
    ...signed.target,
    path: signed.path,
    body: signed.body,
  });
  const companyId = signed.target.companyId;
  for (const path of [
    '/company-invoice-recorder-assignments',
    '/company-external-invoice-access-assignments',
  ])
    await fixture.grant({
      path,
      companyId,
      membershipId: signed.f.ready.source.preparerMembershipId,
    });
  const document = responseRecord(
    await fixture.command({
      ...signed.target,
      path: '/documents',
      body: {
        type: 'external-invoice',
        opportunityId: signed.f.ready.source.opportunityId,
        contractId: signed.f.contractId,
        contractVersionId: signed.f.contractVersionId,
        title: 'Other Company fictional invoice — not a fiscal document',
        purpose: 'Prove Company-bound Invoice Record continuation',
        sourceDescription: 'Fictional manual process',
        receivedOn: null,
      },
    }),
  );
  return preserveInvoiceRecordPdf(fixture, { target: signed.target, document });
}

/** Another exact Document on the already genuine same-Company Contract. */
export async function prepareAdditionalInvoiceRecordSource(
  fixture: InvoiceRecordProofFixture,
  input: Pick<
    Awaited<ReturnType<typeof prepareInvoiceRecordSource>>,
    'target' | 'body'
  > & {
    title: string;
  },
) {
  const document = responseRecord(
    await fixture.command({
      ...input.target,
      path: '/documents',
      body: { ...input.body, title: input.title },
    }),
  );
  return preserveInvoiceRecordPdf(fixture, { target: input.target, document });
}

async function preserveInvoiceRecordPdf(
  fixture: InvoiceRecordProofFixture,
  input: {
    target: Awaited<ReturnType<typeof openExternalInvoiceDocument>>['target'];
    document: Record<string, unknown>;
  },
) {
  const documentId = responseString(input.document, 'id');
  const documentVersionId = responseString(
    responseRecord(input.document.version),
    'id',
  );
  const bytes = await fictionalInvoicePdf();
  const uploaded = await fixture.request({
    ...input.target,
    path: `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-invoice.pdf`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'idempotency-key': randomUUID(),
      },
      body: new Uint8Array(bytes),
    },
  });
  expect(uploaded.status).toBe(201);
  const representationId = responseString(
    responseRecord(await uploaded.json()),
    'representationId',
  );
  const designation = await fixture.post({
    ...input.target,
    path: `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
    body: { expectedRevision: 2 },
  });
  expect(designation.status).toBe(200);
  const source = { documentId, documentVersionId, representationId };
  const createBody = {
    source,
    values: fictionalInvoiceValues(),
    acknowledgeExternalDeclaration: true,
    replacesWithdrawnRecordId: null,
  };
  const create = (body: unknown = createBody, key: string = randomUUID()) =>
    fixture.post({
      ...input.target,
      path: '/invoice-records',
      body,
      key,
    });
  return {
    companyId: input.target.companyId,
    target: input.target,
    source,
    bytes,
    createBody,
    create,
  };
}
