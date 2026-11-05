import { Select } from '../../presentation/Select';
import type { PaymentCurrency } from '../payment.types';
import { paymentCopy, type PaymentLocale } from './payment-copy';
import './payment-observation.css';

export interface PaymentValuesDraft {
  amount: string;
  currency: '' | PaymentCurrency;
  effectiveOn: string;
  method: string;
  externalReference: string;
  observationBasis: string;
}

export function PaymentValuesFields({
  locale,
  value,
  onChange,
  disabled = false,
  idPrefix,
  errorId,
}: {
  locale: PaymentLocale;
  value: PaymentValuesDraft;
  onChange: (value: PaymentValuesDraft) => void;
  disabled?: boolean;
  idPrefix: string;
  errorId?: string;
}) {
  const copy = paymentCopy[locale];
  const moneyHelpId = `${idPrefix}-money-help`;
  const referenceHelpId = `${idPrefix}-reference-help`;
  const describe = (helpId: string) =>
    errorId ? `${helpId} ${errorId}` : helpId;

  return (
    <fieldset
      className="payment-observation-fields"
      disabled={disabled}
      aria-describedby={errorId}
    >
      <legend>{copy.values}</legend>
      <label htmlFor={`${idPrefix}-amount`}>
        {copy.amount}
        <input
          id={`${idPrefix}-amount`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required
          value={value.amount}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={describe(moneyHelpId)}
          onChange={(event) =>
            onChange({ ...value, amount: event.target.value })
          }
        />
      </label>
      <div className="payment-observation-field">
        <label htmlFor={`${idPrefix}-currency`}>{copy.currency}</label>
        <Select
          id={`${idPrefix}-currency`}
          value={value.currency}
          options={['MDL', 'EUR', 'RON', 'USD'].map((currency) => ({
            value: currency,
            label: currency,
          }))}
          placeholder={copy.chooseCurrency}
          unavailableMessage={copy.unavailable}
          required
          disabled={disabled}
          invalid={errorId !== undefined}
          describedBy={describe(moneyHelpId)}
          onValueChange={(currency) => {
            if (
              currency === '' ||
              currency === 'MDL' ||
              currency === 'EUR' ||
              currency === 'RON' ||
              currency === 'USD'
            )
              onChange({ ...value, currency });
          }}
        />
      </div>
      <p
        id={moneyHelpId}
        className="payment-observation-wide payment-observation-help"
      >
        {copy.moneyHelp}
      </p>
      <label htmlFor={`${idPrefix}-effective-on`}>
        {copy.effectiveOn}
        <input
          id={`${idPrefix}-effective-on`}
          type="text"
          autoComplete="off"
          placeholder="YYYY-MM-DD"
          required
          value={value.effectiveOn}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          onChange={(event) =>
            onChange({ ...value, effectiveOn: event.target.value })
          }
        />
      </label>
      <label htmlFor={`${idPrefix}-method`}>
        {copy.method}
        <input
          id={`${idPrefix}-method`}
          type="text"
          autoComplete="off"
          required
          maxLength={120}
          value={value.method}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          onChange={(event) =>
            onChange({ ...value, method: event.target.value })
          }
        />
      </label>
      <label
        htmlFor={`${idPrefix}-external-reference`}
        className="payment-observation-wide"
      >
        {copy.externalReference}
        <input
          id={`${idPrefix}-external-reference`}
          type="text"
          autoComplete="off"
          maxLength={200}
          value={value.externalReference}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={describe(referenceHelpId)}
          onChange={(event) =>
            onChange({ ...value, externalReference: event.target.value })
          }
        />
      </label>
      <p
        id={referenceHelpId}
        className="payment-observation-wide payment-observation-help"
      >
        {copy.referenceHelp}
      </p>
      <label htmlFor={`${idPrefix}-basis`} className="payment-observation-wide">
        {copy.observationBasis}
        <textarea
          id={`${idPrefix}-basis`}
          autoComplete="off"
          required
          maxLength={2000}
          value={value.observationBasis}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          onChange={(event) =>
            onChange({ ...value, observationBasis: event.target.value })
          }
        />
      </label>
    </fieldset>
  );
}
