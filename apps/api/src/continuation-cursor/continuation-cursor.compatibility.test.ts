import { describe, expect, it } from 'vitest';
import { paymentCursors } from '../payment/payment.cursor.js';
import { invoiceCursors } from '../invoice-record/invoice-record.cursor.js';
import { followUpCursors } from '../opportunity-follow-up/opportunity-follow-up.cursor.js';
import {
  BASELINE_BINDING,
  BASELINE_KEY,
  BASELINE_PAYMENT_CURSORS,
  BASELINE_INVOICE_CURSORS,
  BASELINE_FOLLOW_UP_CURSORS,
} from './continuation-cursor-baseline.test-support.js';

describe('continuation strings issued before codec extraction', () => {
  it.each(BASELINE_PAYMENT_CURSORS)(
    'keeps Payment $position.kind readable with its original text key',
    async ({ position, token }) => {
      const cursor = paymentCursors(async () => BASELINE_KEY);
      await expect(
        cursor.read({
          value: token,
          binding: BASELINE_BINDING,
          kind: position.kind,
        }),
      ).resolves.toEqual(position);
      await expect(
        cursor.issue({ binding: BASELINE_BINDING, position }),
      ).resolves.toBe(token);
    },
  );
  it.each(BASELINE_INVOICE_CURSORS)(
    'keeps Invoice Record $position.kind readable with its original text key',
    async ({ position, token }) => {
      const cursor = invoiceCursors(async () => BASELINE_KEY);
      await expect(
        cursor.read({
          value: token,
          binding: BASELINE_BINDING,
          kind: position.kind,
        }),
      ).resolves.toEqual(position);
      await expect(
        cursor.issue({ binding: BASELINE_BINDING, position }),
      ).resolves.toBe(token);
    },
  );
  it.each(BASELINE_FOLLOW_UP_CURSORS)(
    'keeps Opportunity follow-up $position.kind readable with its original text key',
    async ({ position, token }) => {
      const cursor = followUpCursors(async () => BASELINE_KEY);
      await expect(
        cursor.read({
          value: token,
          binding: BASELINE_BINDING,
          kind: position.kind,
        }),
      ).resolves.toEqual(position);
      await expect(
        cursor.issue({ binding: BASELINE_BINDING, position }),
      ).resolves.toBe(token);
    },
  );
});
