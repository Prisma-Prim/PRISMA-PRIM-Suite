import { describe, expect, it } from 'vitest';
import {
  normalizeLegalEntityCorrection,
  normalizeLegalEntityRegistration,
  readStoredLegalEntityResult,
} from './client-legal-entity-validation.js';

const stored = {
  clientVersion: 2,
  legalEntity: {
    id: '00000000-0000-4000-8000-000000003931',
    legalName: 'Demo Logistic SRL',
    taxId: '1012600000002',
    legalAddress: null,
    createdAt: '2026-09-26T08:00:00.000Z',
  },
};

function rejection(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) return error.message;
  }
  throw new Error('Expected a rejection.');
}

describe('Client legal entity request normalization', () => {
  it('trims registration values and turns empty optional text into null', () => {
    expect(
      normalizeLegalEntityRegistration({
        expectedClientVersion: 3,
        legalName: '  GRUP Demo SA — Sucursala Bălți ',
        taxId: ' 1002600000001 ',
        legalAddress: '   ',
      }),
    ).toEqual({
      expectedClientVersion: 3,
      values: {
        legalName: 'GRUP Demo SA — Sucursala Bălți',
        taxId: '1002600000001',
        legalAddress: null,
      },
    });
    expect(
      normalizeLegalEntityRegistration({
        expectedClientVersion: 1,
        legalName: 'Demo',
        taxId: null,
      }).values,
    ).toEqual({ legalName: 'Demo', taxId: null, legalAddress: null });
  });

  it('keeps only the submitted correction fields and preserves an explicit clear', () => {
    expect(
      normalizeLegalEntityCorrection({
        expectedClientVersion: 2,
        changes: { taxId: '  ', legalAddress: ' Str. Demo 5 ' },
      }),
    ).toEqual({
      expectedClientVersion: 2,
      changes: { taxId: null, legalAddress: 'Str. Demo 5' },
    });
  });

  it('accepts the exact bounds and rejects every malformed request', () => {
    expect(
      normalizeLegalEntityRegistration({
        expectedClientVersion: 2_147_483_646,
        legalName: 'N'.repeat(200),
        taxId: 'T'.repeat(500),
        legalAddress: 'A'.repeat(2_000),
      }).values.legalName,
    ).toHaveLength(200);
    const registrations: [unknown, string][] = [
      [null, 'Client legal entity request must be an object.'],
      [['Demo'], 'Client legal entity request must be an object.'],
      [
        { expectedClientVersion: 1, legalName: 'Demo', kind: 'branch' },
        'Unknown Client legal entity field.',
      ],
      [
        { expectedClientVersion: '1', legalName: 'Demo' },
        'Expected Client version must be an integer between 1 and 2147483646.',
      ],
      [
        { expectedClientVersion: 2_147_483_647, legalName: 'Demo' },
        'Expected Client version must be an integer between 1 and 2147483646.',
      ],
      [{ expectedClientVersion: 1 }, 'Client legal entity name is required.'],
      [
        { expectedClientVersion: 1, legalName: ' ' },
        'Client legal entity name is required.',
      ],
      [
        { expectedClientVersion: 1, legalName: 'N'.repeat(201) },
        'Client legal entity name is too long.',
      ],
      [
        { expectedClientVersion: 1, legalName: 'Demo', taxId: 7 },
        'Client legal entity tax ID must be text or null.',
      ],
      [
        { expectedClientVersion: 1, legalName: 'Demo', taxId: 'T'.repeat(501) },
        'Client legal entity tax ID is too long.',
      ],
      [
        {
          expectedClientVersion: 1,
          legalName: 'Demo',
          legalAddress: 'A'.repeat(2_001),
        },
        'Client legal entity address is too long.',
      ],
    ];
    for (const [value, message] of registrations)
      expect(
        rejection(() => normalizeLegalEntityRegistration(value)),
        JSON.stringify(value)?.slice(0, 80),
      ).toBe(message);

    const corrections: [unknown, string][] = [
      [
        { expectedClientVersion: 1, changes: {} },
        'At least one Client legal entity field is required.',
      ],
      [
        { expectedClientVersion: 1, changes: ['legalName'] },
        'Client legal entity changes must be an object.',
      ],
      [
        { expectedClientVersion: 1, legalName: 'Demo' },
        'Unknown Client legal entity field.',
      ],
      [
        { expectedClientVersion: 1, changes: { createdAt: 'now' } },
        'Unknown Client legal entity field.',
      ],
      [
        { expectedClientVersion: 1, changes: { legalName: null } },
        'Client legal entity name is required.',
      ],
      [
        { changes: { legalName: 'Demo' } },
        'Expected Client version must be an integer between 1 and 2147483646.',
      ],
    ];
    for (const [value, message] of corrections)
      expect(
        rejection(() => normalizeLegalEntityCorrection(value)),
        JSON.stringify(value),
      ).toBe(message);
  });
});

describe('Stored Client legal entity results', () => {
  it('returns the stored shape exactly', () => {
    expect(readStoredLegalEntityResult(structuredClone(stored))).toEqual(
      stored,
    );
  });

  it('fails closed on any shape this module never writes', () => {
    for (const value of [
      null,
      { ...stored, clientVersion: 1 },
      { ...stored, clientVersion: '2' },
      { ...stored, extra: true },
      { clientVersion: 2 },
      { ...stored, legalEntity: { ...stored.legalEntity, legalName: ' Demo' } },
      { ...stored, legalEntity: { ...stored.legalEntity, legalName: '' } },
      { ...stored, legalEntity: { ...stored.legalEntity, taxId: '' } },
      { ...stored, legalEntity: { ...stored.legalEntity, legalAddress: 7 } },
      { ...stored, legalEntity: { ...stored.legalEntity, createdAt: 'later' } },
      { ...stored, legalEntity: { ...stored.legalEntity, branch: true } },
    ])
      expect(
        rejection(() => readStoredLegalEntityResult(value)),
        JSON.stringify(value),
      ).toBe('Invalid stored Client legal entity result.');
  });
});
