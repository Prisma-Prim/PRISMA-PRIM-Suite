import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { prepareReportedSigning } from '../contract/reported-contract-signing.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  responseRecord,
  type openEstimateOfferFixture,
} from '../offer/offer-estimate-preparation.test-support.js';

type Fixture = Awaited<ReturnType<typeof openEstimateOfferFixture>>;
/** Genuine native synthetic declaration followed by explicit independent grants. */
export async function prepareExternalInvoiceSource(fixture: Fixture) {
  const signed = await prepareReportedSigning(fixture);
  await fixture.command({
    ...signed.target,
    path: signed.path,
    body: signed.body,
  });
  const companyId = signed.target.companyId;
  const membershipId = signed.f.ready.source.preparerMembershipId;
  for (const path of [
    '/company-invoice-recorder-assignments',
    '/company-external-invoice-access-assignments',
  ])
    await fixture.grant({ path, companyId, membershipId });
  const selection = {
    opportunityId: signed.f.ready.source.opportunityId,
    contractId: signed.f.contractId,
    contractVersionId: signed.f.contractVersionId,
  };
  const body = {
    type: 'external-invoice',
    ...selection,
    title: 'Fictional external invoice — not a fiscal document',
    purpose: 'Preserve exact externally issued source',
    sourceDescription: 'Fictional manual process',
    receivedOn: null,
  };
  const key = randomUUID();
  const request = (value: unknown = body, requestKey: string = key) =>
    fixture.post({
      companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      path: '/documents',
      body: value,
      key: requestKey,
    });
  const register = async () =>
    responseRecord(
      await fixture.command({
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        path: '/documents',
        body,
        key,
      }),
    );
  return {
    ...signed,
    companyId,
    membershipId,
    selection,
    body,
    key,
    request,
    register,
  };
}

export async function openExternalInvoiceDocument(fixture: Fixture) {
  const ready = await prepareExternalInvoiceSource(fixture);
  const document = await ready.register();
  if (typeof document.id !== 'string')
    throw new Error('Expected Document identity.');
  const documentId = document.id;
  const target = {
    companyId: ready.companyId,
    headers: ESTIMATE_OFFER_PREPARER,
  };
  const call = (suffix: string, init: RequestInit = {}) =>
    fixture.request({
      ...target,
      path: `/documents/${documentId}${suffix}`,
      init,
    });
  const mutate = (suffix: string, body: unknown, key: string = randomUUID()) =>
    call(suffix, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  const upload = (
    versionId: string,
    revision: number,
    bytes: Uint8Array,
    key: string = randomUUID(),
  ) =>
    call(
      `/versions/${versionId}/content?expectedRevision=${revision}&fileName=fictional-invoice.pdf`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/pdf', 'idempotency-key': key },
        body: new Uint8Array(bytes),
      },
    );
  return { ...ready, document, documentId, target, call, mutate, upload };
}

export async function fictionalInvoicePdf(reference = 'SYN-INV-001') {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date('2026-01-15T00:00:00.000Z'));
  pdf.setModificationDate(new Date('2026-01-15T00:00:00.000Z'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([600, 500]);
  [
    'Fictional external invoice — not a fiscal document',
    'Fictional manual process',
    reference,
    '1255.50 MDL',
    'Issue date 2026-01-15',
  ].forEach((text, index) =>
    page.drawText(text, { font, size: 14, x: 30, y: 450 - index * 30 }),
  );
  return Buffer.from(await pdf.save());
}

/** Complete native rows, including immutable byte bodies, for atomic-failure tests. */
export async function externalInvoiceEffects(fixture: Fixture) {
  const result: Record<string, unknown> = {};
  for (const table of [
    'working_documents',
    'external_invoice_document_relations',
    'document_versions',
    'document_representations',
    'document_pdfs',
    'document_version_commands',
    'document_correction_commands',
    'document_registration_events',
    'document_project_events',
    'activity_log_events',
    'client_accounts',
  ]) {
    const rows = await fixture.pool.query<{ facts: unknown }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
    );
    result[table] = rows.rows[0]?.facts;
  }
  return result;
}
