import { expect, it } from 'vitest';
import {
  readCurrent,
  readInventory,
  readSources,
  type CopiedContext,
} from './invoice-record-contract';
import { isInvoiceRevision, readReceipt } from './invoice-record-history';
import {
  capture,
  corrected,
  current,
  ids,
  initialFact,
  inventory,
  receipt,
  source,
  values,
} from './invoice-record.fixture';
import { isInvoiceValues } from './invoice-record-values';
import { invoiceRecordMessages } from './invoice-record-copy';

it('decodes literal native copied text and captured Actor labels without applying manual-entry bounds', () => {
  const kinds: CopiedContext['receivingParty']['kind'][] = [
    'PRIMARY',
    'ADDITIONAL',
  ];
  for (const kind of kinds) {
    const copiedContext: CopiedContext = {
      companyLabel: '  Native Company\n' + 'C'.repeat(1001) + '  ',
      contractReference: 'Native Contract №17',
      contractVersionNumber: 1,
      receivingParty: {
        kind,
        legalName: 'Legal\n' + 'N'.repeat(194),
        taxIdentifier: 'TAX\t' + 'T'.repeat(496),
        address: 'Address\n' + 'A'.repeat(1992),
      },
    };
    const historicalActor = {
      ...current.actor,
      displayName: 'Native\nActor\t' + 'A'.repeat(1001),
    };
    const decoded = readCurrent(
      {
        ...current,
        actor: historicalActor,
        record: { ...current.record, copiedContext },
        history: {
          ...current.history,
          items: current.history.items.map((item) => ({
            ...item,
            actor: historicalActor,
          })),
        },
      },
      ids.company,
      ids.record,
      capture,
    );
    expect(decoded?.record.copiedContext).toEqual(copiedContext);
    expect(decoded?.actor).toEqual(historicalActor);
    expect(decoded?.history.items[0]?.actor).toEqual(historicalActor);
    expect(
      readInventory(
        { ...inventory, items: [{ ...inventory.items[0], copiedContext }] },
        ids.company,
        capture,
      )?.items[0]?.copiedContext,
    ).toEqual(copiedContext);
    expect(
      readSources(
        {
          format: 'EXTERNAL_INVOICE_SOURCE_PAGE/1',
          companyId: ids.company,
          readCapture: capture,
          items: [{ ...source, copiedContext }],
          nextCursor: null,
        },
        ids.company,
        capture,
      )?.items[0]?.copiedContext,
    ).toEqual(copiedContext);
  }
});

it('rejects unknown persisted receipt/history information and contradictory before/after transitions', () => {
  expect(readReceipt(receipt('CREATE'))?.revision).toBe(1);
  expect(
    readReceipt({ ...receipt('CREATE'), addedFact: true }),
  ).toBeUndefined();
  expect(
    isInvoiceRevision({
      ...initialFact,
      format: 'EXTERNAL_INVOICE_REVISION/2',
    }),
  ).toBe(false);
  expect(
    isInvoiceRevision({
      ...initialFact,
      actor: { ...initialFact.actor, role: 'Owner' },
    }),
  ).toBe(false);
  const correct = corrected('Literal reason').history.items[0];
  expect(isInvoiceRevision(correct)).toBe(true);
  expect(
    isInvoiceRevision({
      ...correct,
      after: { entryState: 'RECORDED', values },
    }),
  ).toBe(false);
  expect(
    isInvoiceRevision({
      ...correct,
      action: 'WITHDRAW_ENTRY',
      after: {
        entryState: 'WITHDRAWN',
        values: { ...values, grossMinor: '125550' },
      },
    }),
  ).toBe(false);
});
it('binds consumed reads to Company/capture/record/history head and rejects disguised unavailable metadata', () => {
  expect(
    readCurrent(current, ids.company, ids.record, capture)?.record.values
      .netMinor,
  ).toBeNull();
  expect(
    readCurrent(current, ids.company, ids.record, 'replacement-capture'),
  ).toBeUndefined();
  expect(
    readCurrent(
      {
        ...current,
        liveSource: { kind: 'UNAVAILABLE', documentId: ids.document },
      },
      ids.company,
      ids.record,
      capture,
    ),
  ).toBeUndefined();
  expect(
    readCurrent(
      {
        ...current,
        history: {
          items: [
            {
              ...initialFact,
              after: {
                entryState: 'RECORDED',
                values: { ...values, taxMinor: null },
              },
            },
          ],
          nextCursor: null,
        },
      },
      ids.company,
      ids.record,
      capture,
    ),
  ).toBeUndefined();
  expect(
    readInventory(
      { ...inventory, items: [inventory.items[0], inventory.items[0]] },
      ids.company,
      capture,
    ),
  ).toBeUndefined();
});
it('accepts declared discrepancies, future and earlier due dates but refuses malformed grammar without repairing literals', () => {
  expect(
    isInvoiceValues({
      ...values,
      netMinor: '100000',
      taxMinor: '10000',
      grossMinor: '125550',
      issuedOn: '2099-01-15',
      dueOn: '2020-01-01',
    }),
  ).toBe(true);
  for (const invalid of [
    { grossMinor: '0' },
    { netMinor: '00' },
    { issuedOn: '2026-02-29' },
    { externalNumber: '\ud800' },
    { externalSystem: 'line\nfeed' },
    { extra: true },
  ])
    expect(isInvoiceValues({ ...values, ...invalid })).toBe(false);
  for (const currency of ['MDL', 'EUR', 'RON', 'USD'])
    expect(isInvoiceValues({ ...values, currency })).toBe(true);
});
it('provides every interface message in all four locales', () => {
  const expected = Object.keys(invoiceRecordMessages.en).sort();
  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    if (
      locale === 'ro' ||
      locale === 'ru' ||
      locale === 'fr' ||
      locale === 'en'
    )
      expect(Object.keys(invoiceRecordMessages[locale]).sort()).toEqual(
        expected,
      );
  }
});
