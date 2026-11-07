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
const otherAssignmentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
// An assignment id must be exactly one UUID.
const malformedAssignmentIds = [
  '',
  'not-a-uuid',
  `x${recorder.assignmentId}`,
  `${recorder.assignmentId}x`,
];
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
  it.each([undefined, null, {}, 'finance.read'])(
    'does not manufacture authority from a capture that is not a list %s',
    (value) => {
      expect(
        externalInvoiceCapturedAuthority(value, { manage: false }),
      ).toBeUndefined();
    },
  );
  // Each case adds one faulty grant to the valid [reader, family] capture, so
  // only the rule it breaks can refuse it.
  it.each<[string, unknown]>([
    ['a null grant', null],
    ['a grant that is not an object', 'company_invoice_recorder'],
    ['an extra field', { ...recorder, extra: true }],
    [
      'an ordinary bundle',
      { ...recorder, bundle: 'company_document_registrar' },
    ],
    ['a duplicate bundle', { ...family, assignmentId: otherAssignmentId }],
    [
      'a duplicate assignment',
      { ...recorder, assignmentId: reader.assignmentId },
    ],
    [
      'a duplicate assignment in upper case',
      { ...recorder, assignmentId: reader.assignmentId.toUpperCase() },
    ],
    ...malformedAssignmentIds.map((assignmentId): [string, unknown] => [
      `the assignment id ${JSON.stringify(assignmentId)}`,
      { ...recorder, assignmentId },
    ]),
  ])('refuses the whole capture when it holds %s', (_case, faulty) => {
    expect(
      externalInvoiceCapturedAuthority([reader, family], { manage: false }),
    ).toEqual({ family, finance: [reader] });
    expect(
      externalInvoiceCapturedAuthority([reader, family, faulty], {
        manage: false,
      }),
    ).toBeUndefined();
  });
  it.each(malformedAssignmentIds)(
    'refuses to capture the assignment id %j',
    (assignmentId) => {
      expect(captureExternalInvoiceGrant(recorder)).toEqual(recorder);
      expect(
        captureExternalInvoiceGrant({ ...recorder, assignmentId }),
      ).toBeUndefined();
    },
  );
});
