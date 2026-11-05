import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import {
  paymentJson,
  paymentRecord,
  paymentText,
  type PaymentEvidenceFixture,
} from './payment-evidence.test-support.js';

export function paymentSourceBody(
  fixture: PaymentEvidenceFixture,
  payer: 'PRIMARY' | 'ADDITIONAL' = 'PRIMARY',
) {
  return {
    type: 'payment-evidence',
    clientId: fixture.ready.clientId,
    payer:
      payer === 'PRIMARY'
        ? { kind: 'PRIMARY' }
        : {
            kind: 'ADDITIONAL',
            legalEntityId: fixture.ready.additionalLegalEntityId,
          },
    title: 'Fictional payment notice — not bank or fiscal proof',
    purpose: 'Preserve the declared source without a monetary observation',
    sourceDescription:
      'Fictional manual notice FICT-PAY-001; no bank or fiscal proof',
    receivedOn: null,
  };
}

/** Positive Sources and their exact Versions always originate at native HTTP. */
export async function registerPaymentSource(
  fixture: PaymentEvidenceFixture,
  payer: 'PRIMARY' | 'ADDITIONAL' = 'PRIMARY',
) {
  const body = paymentSourceBody(fixture, payer);
  const key = randomUUID();
  const response = await fixture.call('/documents', {
    method: 'POST',
    key,
    body,
  });
  expect(response.status, await response.clone().text()).toBe(201);
  const document = await paymentJson(response);
  expect(document.type).toBe('payment-evidence');
  return {
    document,
    body,
    key,
    documentId: paymentText(document.id),
    versionId: paymentText(paymentRecord(document.version).id),
  };
}

/** Complete affected native rows, including bytes, receipts/events and Client-use fences. */
export async function paymentEvidenceEffects(pool: Pool) {
  const result: Record<string, unknown> = {};
  for (const table of [
    'working_documents',
    'payment_evidence_document_sources',
    'document_versions',
    'document_representations',
    'document_pdfs',
    'document_version_commands',
    'document_correction_commands',
    'document_registration_events',
    'document_project_events',
    'activity_log_events',
    'client_accounts',
    'client_company_relationships',
    'client_legal_entities',
    'company_role_assignments',
    'knowledge_sources',
    'knowledge_passages',
    'knowledge_source_events',
    'knowledge_source_commands',
    'knowledge_interactions',
    'invoice_records',
    'invoice_record_commands',
    'invoice_record_history',
    'invoice_record_events',
  ]) {
    result[table] = (
      await pool.query<{ facts: unknown }>(
        `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS facts FROM ${table} t`,
      )
    ).rows[0]?.facts;
  }
  return result;
}
