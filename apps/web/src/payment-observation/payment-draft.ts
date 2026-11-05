import type { PaymentValues } from './payment.types';
import { readPaymentValues } from './payment-contract';
import type { PaymentValuesDraft } from './ui';

export function paymentDraft(values?: PaymentValues): PaymentValuesDraft {
  if (!values)
    return {
      amount: '',
      currency: '',
      effectiveOn: '',
      method: '',
      externalReference: '',
      observationBasis: '',
    };
  const digits = values.amountMinor.padStart(3, '0');
  return {
    amount: `${digits.slice(0, -2)}.${digits.slice(-2)}`,
    currency: values.currency,
    effectiveOn: values.effectiveOn,
    method: values.method,
    externalReference: values.externalReference ?? '',
    observationBasis: values.observationBasis,
  };
}
export function paymentDraftValues(draft: PaymentValuesDraft): PaymentValues {
  if (!/^\d{1,14}(?:\.\d{1,2})?$/u.test(draft.amount))
    throw new Error('Invalid declared amount.');
  const [whole, fraction = ''] = draft.amount.split('.');
  const amountMinor = `${whole}${fraction.padEnd(2, '0')}`.replace(
    /^0+(?=\d)/u,
    '',
  );
  return readPaymentValues({
    amountMinor,
    currency: draft.currency,
    effectiveOn: draft.effectiveOn,
    method: draft.method,
    externalReference:
      draft.externalReference === '' ? null : draft.externalReference,
    observationBasis: draft.observationBasis,
  });
}
export function paymentLiteral(value: string, maximum: number): string {
  if (
    value.length > maximum ||
    value.trim() === '' ||
    /[\p{Cc}\uD800-\uDFFF]/u.test(value)
  )
    throw new Error('Invalid literal.');
  return value;
}
