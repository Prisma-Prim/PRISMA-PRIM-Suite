import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect } from './ui-chaos.fixture';
import {
  prepareExternalInvoiceSourceCase,
  modelContractIdentities,
  invoiceApiOrigin,
  object,
  text,
} from './external-invoice-source.acceptance.fixture';

/** The native commercial Contract remains an Invoice prerequisite only. */
export async function prepareInvoiceSequenceSource(page: Page, suffix: string) {
  const ready = await prepareExternalInvoiceSourceCase(page, suffix, 'PRIMARY');
  for (const bundle of [
    'company-invoice-recorder',
    'company-external-invoice-access',
  ])
    await ready.command('/' + bundle + '-assignments', {
      companyId: ready.companyId,
      workspaceMembershipId: ready.preparerId,
    });
  await ready.command('/company-context-assignments', {
    companyId: ready.otherCompanyId,
    workspaceMembershipId: ready.preparerId,
  });
  const document = await ready.command(
    '/documents',
    {
      type: 'external-invoice',
      opportunityId: ready.opportunityId,
      contractId: ready.contractId,
      contractVersionId: ready.contractVersionId,
      title: 'Fictional generated financial source ' + suffix,
      purpose: 'Unverified manual transcription',
      sourceDescription: 'Fictional provider invoice, no fiscal validation',
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
    invoiceApiOrigin +
      `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-sequence-invoice.pdf`,
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
  const representationId = text(object(await upload.json()).representationId);
  const official = await page.request.post(
    invoiceApiOrigin +
      `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { expectedRevision: 2 },
    },
  );
  expect(official.status()).toBe(200);
  return {
    ...ready,
    clientName: 'Fictional invoice Client ' + suffix,
    source: { documentId, documentVersionId, representationId },
  };
}
