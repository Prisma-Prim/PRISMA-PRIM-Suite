import { describe, expect, it } from 'vitest';
import {
  paymentCapturedGrant,
  paymentReadGrant,
} from './payment-captured-grants.js';

describe('Payment independently consumed captured authority', () => {
  const reader = {
    bundle: 'company_payment_reader',
    assignmentId: '00000000-0000-4000-8000-000000001045',
    permissionSetVersion: 'v1',
  };
  it('retains a supported independent reader when an unconsumed Recorder version is unsupported', () => {
    const grants = [
      reader,
      {
        bundle: 'company_payment_recorder',
        assignmentId: '00000000-0000-4000-8000-000000001046',
        permissionSetVersion: 'future',
      },
    ];
    expect(paymentReadGrant(grants)).toEqual(reader);
    expect(
      paymentCapturedGrant(grants, 'company_payment_recorder'),
    ).toBeUndefined();
  });
  it('refuses a duplicate or malformed consumed identity rather than manufacturing evidence', () => {
    expect(paymentReadGrant([reader, reader])).toBeUndefined();
    expect(
      paymentReadGrant([{ ...reader, permissionSetVersion: null }]),
    ).toBeUndefined();
    expect(
      paymentReadGrant([{ ...reader, assignmentId: 'known-label' }]),
    ).toBeUndefined();
  });
});
