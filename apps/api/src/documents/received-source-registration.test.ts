import { describe, expect, it } from 'vitest';
import { readExternalInvoiceRegistration } from './external-invoice.js';
import { readPaymentEvidenceRegistration } from './payment-evidence.js';
import { readReceivedAddendumRegistration } from './received-addendum.js';
import { readReceivedContractRegistration } from './received-contract.js';

const id = (digit: string) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-a${digit.repeat(3)}-${digit.repeat(12)}`;
const metadata = {
  title: ' Title ',
  purpose: ' Purpose ',
  sourceDescription: ' Source ',
  receivedOn: '2026-10-25',
};

/**
 * The parsed command is hashed, in its field order, into the registration
 * fingerprint stored with every Document. A different order would turn every
 * stored retry into an Idempotency-Key conflict.
 */
describe('Received source registration fingerprint input', () => {
  it.each([
    [
      'received-contract',
      () =>
        readReceivedContractRegistration({
          type: 'received-contract',
          opportunityId: id('1'),
          contractId: id('2'),
          contractVersionId: id('3'),
          ...metadata,
        }),
      `{"type":"received-contract","selection":{"opportunityId":"${id('1')}","contractId":"${id('2')}","contractVersionId":"${id('3')}"},"title":"Title","purpose":"Purpose","sourceDescription":"Source","receivedOn":"2026-10-25"}`,
    ],
    [
      'received-addendum',
      () =>
        readReceivedAddendumRegistration({
          type: 'received-addendum',
          parentContractId: id('4'),
          parentContractVersionId: id('5'),
          ...metadata,
        }),
      `{"type":"received-addendum","selection":{"parentContractId":"${id('4')}","parentContractVersionId":"${id('5')}"},"title":"Title","purpose":"Purpose","sourceDescription":"Source","receivedOn":"2026-10-25"}`,
    ],
    [
      'external-invoice',
      () =>
        readExternalInvoiceRegistration({
          type: 'external-invoice',
          opportunityId: id('1'),
          contractId: id('2'),
          contractVersionId: id('3'),
          ...metadata,
        }),
      `{"type":"external-invoice","selection":{"opportunityId":"${id('1')}","contractId":"${id('2')}","contractVersionId":"${id('3')}"},"title":"Title","purpose":"Purpose","sourceDescription":"Source","receivedOn":"2026-10-25"}`,
    ],
    [
      'payment-evidence',
      () =>
        readPaymentEvidenceRegistration({
          type: 'payment-evidence',
          clientId: id('6'),
          payer: { kind: 'ADDITIONAL', legalEntityId: id('7') },
          ...metadata,
        }),
      `{"type":"payment-evidence","clientId":"${id('6')}","payer":{"kind":"ADDITIONAL","legalEntityId":"${id('7')}"},"title":"Title","purpose":"Purpose","sourceDescription":"Source","receivedOn":"2026-10-25"}`,
    ],
  ])('keeps the %s field order', (_type, read, serialized) => {
    expect(JSON.stringify(read())).toBe(serialized);
  });
});
