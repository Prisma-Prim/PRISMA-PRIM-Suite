import { describe, expect, it } from 'vitest';
import {
  captureExternalInvoiceGrant,
  externalInvoiceCapturedAuthority,
} from './external-invoice-captured-grants.js';

const reader = {
  bundle: 'company_invoice_reader',
  assignmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  permissionSetVersion: 'v1',
};
const recorder = {
  bundle: 'company_invoice_recorder',
  assignmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  permissionSetVersion: 'v1',
};
const family = {
  bundle: 'company_external_invoice_access',
  assignmentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  permissionSetVersion: 'v1',
};
describe('External invoice captured authority', () => {
  it('requires independent family access and permits either financial read alternative', () => {
    expect(
      externalInvoiceCapturedAuthority([reader, family], { manage: false }),
    ).toEqual({ family, finance: [reader] });
    expect(
      externalInvoiceCapturedAuthority([recorder, family], { manage: false }),
    ).toEqual({ family, finance: [recorder] });
    expect(
      externalInvoiceCapturedAuthority([reader, recorder, family], {
        manage: false,
      }),
    ).toEqual({ family, finance: [reader, recorder] });
    expect(
      externalInvoiceCapturedAuthority([reader, family], { manage: true }),
    ).toBeUndefined();
    expect(
      externalInvoiceCapturedAuthority([reader, recorder, family], {
        manage: true,
      }),
    ).toEqual({ family, finance: [recorder] });
    for (const grants of [[], [reader], [recorder], [family]])
      expect(
        externalInvoiceCapturedAuthority(grants, { manage: false }),
      ).toBeUndefined();
  });
  it.each([undefined, null, 'v2', 'v99', 1, {}, ['v1']])(
    'refuses unknown captured version %s',
    (permissionSetVersion) => {
      expect(
        captureExternalInvoiceGrant({ ...reader, permissionSetVersion }),
      ).toBeUndefined();
      expect(
        externalInvoiceCapturedAuthority(
          [{ ...reader, permissionSetVersion }, family],
          { manage: false },
        ),
      ).toBeUndefined();
    },
  );
  it.each([
    undefined,
    null,
    {},
    'finance.read',
    [reader, family, family],
    [reader, family, { ...recorder, assignmentId: reader.assignmentId }],
    [reader, { ...family, extra: true }],
    [reader, { ...family, assignmentId: '' }],
    [reader, { ...family, bundle: 'company_document_registrar' }],
  ])(
    'does not manufacture authority from malformed, duplicate or ordinary captures %s',
    (value) => {
      expect(
        externalInvoiceCapturedAuthority(value, { manage: false }),
      ).toBeUndefined();
    },
  );
});
