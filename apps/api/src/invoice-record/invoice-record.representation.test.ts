import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { invoiceText } from './invoice-record.input.js';
import {
  invoiceHistoryRevision,
  invoiceSnapshot,
} from './invoice-record.representation.js';
import type { InvoiceSourceSnapshot } from './invoice-record.types.js';

function snapshot(): InvoiceSourceSnapshot {
  return {
    source: {
      documentId: randomUUID(),
      documentVersionId: randomUUID(),
      representationId: randomUUID(),
    },
    originalClientId: randomUUID(),
    opportunityId: randomUUID(),
    contractId: randomUUID(),
    contractVersionId: randomUUID(),
    receivingPartyAdditionalId: null,
    byteLength: 27,
    sha256: 'a'.repeat(64),
    copiedContext: {
      companyLabel: '  Company\n' + 'C'.repeat(1001) + '  ',
      contractReference: 'Contract №17',
      contractVersionNumber: 1,
      receivingParty: {
        kind: 'PRIMARY',
        legalName: 'Legal\n' + 'N'.repeat(194),
        taxIdentifier: 'TAX\t' + 'T'.repeat(496),
        address: 'Address\n' + 'A'.repeat(1992),
      },
    },
  };
}

it('preserves native copied text literally, including historical surrounding spaces and both receiving-party kinds', () => {
  const primary = snapshot();
  expect(invoiceSnapshot(primary)).toEqual(primary);
  const additional = {
    ...primary,
    receivingPartyAdditionalId: randomUUID(),
    copiedContext: {
      ...primary.copiedContext,
      receivingParty: {
        ...primary.copiedContext.receivingParty,
        kind: 'ADDITIONAL',
      },
    },
  };
  expect(invoiceSnapshot(additional)).toEqual(additional);
});

it('retains native owner bounds and malformed-text refusals independently of strict manual grammar', () => {
  const original = snapshot();
  for (const changes of [
    { legalName: 'N'.repeat(201) },
    { taxIdentifier: 'T'.repeat(501) },
    { address: 'A'.repeat(2001) },
    { legalName: 'N\0name' },
    { taxIdentifier: '\ud800' },
    { address: ' \t\n ' },
  ])
    expect(() =>
      invoiceSnapshot({
        ...original,
        copiedContext: {
          ...original.copiedContext,
          receivingParty: {
            ...original.copiedContext.receivingParty,
            ...changes,
          },
        },
      }),
    ).toThrow();
  for (const label of ['\0Company', '\udfff', ' \t\n ', 42])
    expect(() =>
      invoiceSnapshot({
        ...original,
        copiedContext: { ...original.copiedContext, companyLabel: label },
      }),
    ).toThrow();
  expect(() => invoiceText('Manual\nline', 2000)).toThrow();
  expect(() => invoiceText('T'.repeat(201), 200)).toThrow();
});

it('reads captured Actor labels using native text grammar while retaining manual reason grammar', () => {
  const revision = {
    format: 'EXTERNAL_INVOICE_REVISION/1',
    recordId: randomUUID(),
    revision: 1,
    action: 'CREATE',
    commandId: randomUUID(),
    actor: {
      membershipId: randomUUID(),
      displayName: '  Native\nActor\t' + 'A'.repeat(1001) + '  ',
    },
    recordedAt: '2026-11-01T10:00:00.000Z',
    before: null,
    after: {
      entryState: 'RECORDED',
      values: {
        externalSystem: 'Synthetic',
        externalNumber: 'SYN-17',
        issuedOn: '2026-01-15',
        dueOn: null,
        currency: 'MDL',
        grossMinor: '100',
        netMinor: null,
        taxMinor: null,
      },
    },
    reason: null,
  };
  expect(invoiceHistoryRevision(revision)).toEqual(revision);
  for (const displayName of [' \t\n ', '\0Actor', '\ud800'])
    expect(() =>
      invoiceHistoryRevision({
        ...revision,
        actor: { ...revision.actor, displayName },
      }),
    ).toThrow();
  expect(() =>
    invoiceHistoryRevision({
      ...revision,
      revision: 2,
      action: 'WITHDRAW_ENTRY',
      before: revision.after,
      after: { ...revision.after, entryState: 'WITHDRAWN' },
      reason: 'Manual\nreason',
    }),
  ).toThrow();
});
