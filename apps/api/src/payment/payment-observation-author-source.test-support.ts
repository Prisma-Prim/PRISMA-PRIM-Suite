import { expect } from 'vitest';
import {
  paymentJson,
  paymentNoticePdf,
  paymentRecord,
  paymentSourceRegistration,
  paymentText,
  type PaymentEvidenceFixture,
  type PaymentEvidenceIdentity,
} from '../documents/payment-evidence.test-support.js';
import type { PaymentSource, PaymentValues } from './payment.input.js';
import type { PaymentAction } from './payment.types.js';

export const authorSourceValues: PaymentValues = {
  amountMinor: '125500',
  currency: 'MDL',
  effectiveOn: '2026-01-15',
  method: '  Manual incoming notice  ',
  externalReference: '  FICT-PAY-1047 Ș Ю 😀  ',
  observationBasis: '  Human declaration — not bank or fiscal proof.  ',
};

export async function expectAuthorSourceStatus(
  response: Response,
  status: number,
) {
  expect(response.status, await response.clone().text()).toBe(status);
}

export async function authorSourceJson(response: Response, status = 200) {
  await expectAuthorSourceStatus(response, status);
  return paymentJson(response);
}

export function authorSourceItems(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Expected a public item array.');
  return value.map(paymentRecord);
}

export function authorSourceRevision(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Expected a native revision.');
  return value;
}

/** Uses native Source registration, scanned PDF upload and optional designation. */
export async function prepareAuthorSource(
  fixture: PaymentEvidenceFixture,
  options: {
    payerKind?: 'PRIMARY' | 'ADDITIONAL';
    official?: boolean;
    bytes?: Buffer;
  } = {},
) {
  const payer: Parameters<typeof paymentSourceRegistration>[1] =
    options.payerKind === 'ADDITIONAL'
      ? {
          kind: 'ADDITIONAL',
          legalEntityId: fixture.ready.additionalLegalEntityId,
        }
      : { kind: 'PRIMARY' };
  const document = await authorSourceJson(
    await fixture.call('/documents', {
      method: 'POST',
      body: paymentSourceRegistration(fixture.ready.clientId, payer),
    }),
    201,
  );
  const documentId = paymentText(document.id);
  const documentVersionId = paymentText(paymentRecord(document.version).id);
  const bytes = options.bytes ?? (await paymentNoticePdf());
  const uploaded = await authorSourceJson(
    await fixture.upload({
      documentId,
      versionId: documentVersionId,
      revision: 1,
      bytes,
    }),
    201,
  );
  const source: PaymentSource = {
    documentId,
    documentVersionId,
    representationId: paymentText(uploaded.representationId),
  };
  if (options.official !== false)
    await authorSourceJson(
      await fixture.call(
        `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
        { method: 'POST', body: { expectedRevision: 2 } },
      ),
    );
  return { source, bytes, workingRevision: options.official === false ? 2 : 3 };
}

export function authorSourceCreateBody(source: PaymentSource) {
  return {
    source,
    values: authorSourceValues,
    acknowledgeObservedDeclaration: true,
    replacesClosedPaymentId: null,
  };
}

/** Checks the closed receipt without consuming a permissive domain decoder. */
export async function authorSourceReceipt(
  response: Response,
  expected: { action: PaymentAction; revision: number },
) {
  const body = await authorSourceJson(response, 201);
  expect(Object.keys(body).sort()).toEqual(
    [
      'format',
      'commandId',
      'paymentId',
      'revision',
      'action',
      'recordedAt',
    ].sort(),
  );
  expect(body).toEqual({
    format: 'PAYMENT_COMMAND/1',
    commandId: expect.any(String),
    paymentId: expect.any(String),
    revision: expected.revision,
    action: expected.action,
    recordedAt: expect.any(String),
  });
  expect(paymentText(body.commandId)).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  );
  expect(paymentText(body.paymentId)).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  );
  expect(new Date(paymentText(body.recordedAt)).toISOString()).toBe(
    body.recordedAt,
  );
  return { body, paymentId: paymentText(body.paymentId) };
}

export async function createAuthorSourceObservation(
  fixture: PaymentEvidenceFixture,
  source: PaymentSource,
  options: { key?: string; identity?: PaymentEvidenceIdentity } = {},
) {
  return authorSourceReceipt(
    await fixture.call('/payments', {
      ...options,
      method: 'POST',
      body: authorSourceCreateBody(source),
    }),
    { action: 'CREATE', revision: 1 },
  );
}

/** Corrects live Client facts through their owner; Source's copy must stay fixed. */
export async function correctLiveAuthorSourcePayer(
  fixture: PaymentEvidenceFixture,
  payerKind: 'PRIMARY' | 'ADDITIONAL',
) {
  const clientId = fixture.ready.clientId;
  const current = await authorSourceJson(
    await fixture.call(`/clients/${clientId}`, { identity: 'reader' }),
  );
  const version = authorSourceRevision(current.version);
  if (payerKind === 'PRIMARY')
    return authorSourceJson(
      await fixture.call(`/clients/${clientId}`, {
        method: 'PATCH',
        identity: 'reader',
        body: {
          expectedVersion: version,
          displayName: 'Corrected live fictional payer',
          taxId: null,
          address: 'Current fictional address',
        },
      }),
    );
  return authorSourceJson(
    await fixture.call(
      `/clients/${clientId}/legal-entities/${fixture.ready.additionalLegalEntityId}`,
      {
        method: 'PATCH',
        identity: 'reader',
        body: {
          expectedClientVersion: version,
          changes: {
            legalName: 'Corrected live fictional additional payer',
            taxId: null,
            legalAddress: 'Current fictional address',
          },
        },
      },
    ),
  );
}

/** Every Document has an eligible official tuple and an ineligible clean draft tuple. */
export async function prepareAuthorSourceWithDraft(
  fixture: PaymentEvidenceFixture,
  bytes: Buffer,
) {
  const prepared = await prepareAuthorSource(fixture, { bytes });
  const drafted = await authorSourceJson(
    await fixture.call(`/documents/${prepared.source.documentId}/versions`, {
      method: 'POST',
      body: { expectedRevision: 3 },
    }),
    201,
  );
  const documentVersionId = paymentText(drafted.versionId);
  const uploaded = await authorSourceJson(
    await fixture.upload({
      documentId: prepared.source.documentId,
      versionId: documentVersionId,
      revision: 4,
      bytes,
    }),
    201,
  );
  const draft: PaymentSource = {
    documentId: prepared.source.documentId,
    documentVersionId,
    representationId: paymentText(uploaded.representationId),
  };
  return { official: prepared.source, draft };
}

/** Native rows prove absence of read effects; positive fixtures always originate at HTTP. */
export async function authorSourceReadEffects(fixture: PaymentEvidenceFixture) {
  const tables = [
    'payments',
    'payment_commands',
    'payment_history',
    'payment_events',
    'working_documents',
    'payment_evidence_document_sources',
    'document_versions',
    'document_representations',
    'document_pdfs',
    'document_version_commands',
    'document_correction_commands',
    'document_registration_events',
    'client_accounts',
    'client_company_relationships',
    'client_legal_entities',
    'activity_log_events',
  ];
  if (tables.some((table) => !/^[a-z_]+$/u.test(table)))
    throw new Error('Fixed native effect tables are required.');
  const fields = tables.map(
    (table) =>
      `'${table}',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ${table} t)`,
  );
  const row = (
    await fixture.pool.query<{ snapshot: unknown }>(
      `SELECT jsonb_build_object(${fields.join(',')}) snapshot`,
    )
  ).rows[0];
  if (!row)
    throw new Error('A complete native read-effect snapshot is required.');
  return { snapshot: row.snapshot, scans: fixture.scanner.scanCount };
}

/** A losing replacement contributes no row, key, source change or second Client fence. */
export async function expectSingleAuthorSourceReplacementEffects(
  fixture: PaymentEvidenceFixture,
  input: {
    before: Awaited<ReturnType<typeof authorSourceReadEffects>>;
    winner: Awaited<ReturnType<typeof authorSourceReceipt>>;
    predecessorId: string;
    winnerKey: string;
    loserKey: string;
    winnerMembershipId: string;
  },
) {
  const after = await authorSourceReadEffects(fixture);
  const previous = paymentRecord(input.before.snapshot);
  const current = paymentRecord(after.snapshot);
  const commandId = paymentText(input.winner.body.commandId);
  const additions = [
    { table: 'payments', field: 'id', value: input.winner.paymentId },
    { table: 'payment_commands', field: 'id', value: commandId },
    { table: 'payment_history', field: 'command_id', value: commandId },
    { table: 'payment_events', field: 'command_id', value: commandId },
  ];
  for (const addition of additions) {
    const beforeRows = authorSourceItems(previous[addition.table]);
    const afterRows = authorSourceItems(current[addition.table]);
    expect(afterRows).toHaveLength(beforeRows.length + 1);
    expect(
      afterRows.filter((row) => row[addition.field] !== addition.value),
    ).toEqual(beforeRows);
  }
  const commands = authorSourceItems(current.payment_commands);
  const command = commands.find((row) => row.id === commandId);
  expect(command).toMatchObject({
    payment_id: input.winner.paymentId,
    idempotency_key: input.winnerKey,
    actor_membership_id: input.winnerMembershipId,
    response: input.winner.body,
  });
  expect(
    commands.filter((row) => row.idempotency_key === input.loserKey),
  ).toEqual([]);
  expect(
    authorSourceItems(current.payments).filter(
      (row) => row.replaces_closed_payment_id === input.predecessorId,
    ),
  ).toEqual([
    expect.objectContaining({
      id: input.winner.paymentId,
      revision: 1,
      state: 'DRAFT',
    }),
  ]);

  const beforeClients = authorSourceItems(previous.client_accounts);
  const afterClients = authorSourceItems(current.client_accounts);
  expect(afterClients).toHaveLength(beforeClients.length);
  for (const client of beforeClients) {
    const actual = afterClients.find((row) => row.id === client.id);
    expect(actual).toEqual(
      client.id === fixture.ready.clientId
        ? {
            ...client,
            version: authorSourceRevision(client.version) + 1,
            updated_at: expect.any(String),
          }
        : client,
    );
  }
  for (const [table, rows] of Object.entries(previous))
    if (
      table !== 'client_accounts' &&
      !additions.some((addition) => addition.table === table)
    )
      expect(current[table]).toEqual(rows);
  expect(after.scans).toBe(input.before.scans);
  return after;
}
