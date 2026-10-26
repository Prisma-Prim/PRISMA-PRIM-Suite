import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { prepareModelContractSource } from '../contract/model-contract.test-fixture.js';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
type Fixture = Awaited<ReturnType<typeof openEstimateOfferFixture>>;

export async function prepareReceivedContractSource(
  fixture: Fixture,
  options: { clientTaxId?: string } = {},
) {
  const ready = await prepareModelContractSource(fixture, options);
  const contract = responseRecord(
    await ready.invoke(ready.path + '/from-approved-model', ready.intent),
  );
  for (const path of [
    '/company-document-registrar-assignments',
    '/company-received-contract-access-assignments',
  ])
    await fixture.grant({
      path,
      companyId: ready.source.companyId,
      membershipId: ready.source.preparerMembershipId,
    });
  return {
    ready,
    contractId: responseString(contract, 'id'),
    contractVersionId: responseString(responseRecord(contract.version), 'id'),
  };
}

export async function registerReceivedContract(
  fixture: Fixture,
  sourceOptions: { clientTaxId?: string } = {},
) {
  const selected = await prepareReceivedContractSource(fixture, sourceOptions);
  const { ready, contractId, contractVersionId } = selected;
  const options = {
    path: '/documents',
    companyId: ready.source.companyId,
    headers: ESTIMATE_OFFER_PREPARER,
    body: {
      type: 'received-contract',
      opportunityId: ready.source.opportunityId,
      contractId,
      contractVersionId,
      title: 'Received Contract DEMO',
      purpose: 'Preserve the external original',
      sourceDescription: 'Synthetic email source',
      receivedOn: '2026-10-25',
    },
    key: randomUUID(),
  };
  const document = responseRecord(await fixture.command(options));
  const path = '/documents/' + responseString(document, 'id');
  const call = (suffix: string, init: RequestInit = {}) =>
    fixture.request({
      path: path + suffix,
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      init,
    });
  const mutate = async (
    suffix: string,
    body: unknown,
    method = 'POST',
    key: string = randomUUID(),
  ) =>
    call(suffix, {
      method,
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  const upload = (
    versionId: string,
    revision: number,
    bytes: Buffer,
    key: string = randomUUID(),
  ) =>
    call(
      `/versions/${versionId}/content?expectedRevision=${revision}&fileName=received-demo.pdf`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/pdf', 'idempotency-key': key },
        body: new Uint8Array(bytes),
      },
    );
  return { ...selected, document, options, path, call, mutate, upload };
}

/** Opaque persisted facts for the required transaction/rollback integrity seam. */
export async function receivedContractEffects(
  pool: Pool,
  receivedRelationExists = true,
) {
  const effects: Record<string, unknown> = {};
  for (const table of [
    'working_documents',
    'received_contract_document_relations',
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
    if (
      table === 'received_contract_document_relations' &&
      !receivedRelationExists
    )
      continue;
    // All identifiers are literal test-owned tables. Ordering compares complete conserved rows.
    const result = await pool.query<{ facts: unknown }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS facts FROM ${table} t`,
    );
    effects[table] = result.rows[0]?.facts;
  }
  return effects;
}
