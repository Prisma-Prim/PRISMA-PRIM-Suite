import { useId } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import {
  decimalToMinor,
  displayMoney,
  minorToDecimal,
} from './invoice-record-money';
import { isInvoiceValues, type InvoiceValues } from './invoice-record-values';
import type { CopiedContext } from './invoice-record-contract';

export type InvoiceDraft = {
  externalSystem: string;
  externalNumber: string;
  issuedOn: string;
  dueOn: string;
  currency: string;
  gross: string;
  net: string;
  tax: string;
};
export function invoiceDraft(values?: InvoiceValues): InvoiceDraft {
  return values
    ? {
        externalSystem: values.externalSystem,
        externalNumber: values.externalNumber,
        issuedOn: values.issuedOn,
        dueOn: values.dueOn ?? '',
        currency: values.currency,
        gross: minorToDecimal(values.grossMinor),
        net: values.netMinor === null ? '' : minorToDecimal(values.netMinor),
        tax: values.taxMinor === null ? '' : minorToDecimal(values.taxMinor),
      }
    : {
        externalSystem: '',
        externalNumber: '',
        issuedOn: '',
        dueOn: '',
        currency: '',
        gross: '',
        net: '',
        tax: '',
      };
}
export function draftValues(draft: InvoiceDraft): InvoiceValues | undefined {
  const values = {
    externalSystem: draft.externalSystem,
    externalNumber: draft.externalNumber,
    issuedOn: draft.issuedOn,
    dueOn: draft.dueOn === '' ? null : draft.dueOn,
    currency: draft.currency,
    grossMinor: decimalToMinor(draft.gross),
    netMinor: draft.net === '' ? null : decimalToMinor(draft.net),
    taxMinor: draft.tax === '' ? null : decimalToMinor(draft.tax),
  };
  return isInvoiceValues(values) ? values : undefined;
}
export function InvoiceValueFields({
  draft,
  setDraft,
  disabled,
}: {
  draft: InvoiceDraft;
  setDraft: (draft: InvoiceDraft) => void;
  disabled: boolean;
}) {
  const copy = useInvoiceRecordCopy();
  const id = useId();
  const fields = [
    { key: 'externalSystem', label: copy.system, maximum: 120 },
    { key: 'externalNumber', label: copy.number, maximum: 200 },
    { key: 'issuedOn', label: copy.issued },
    { key: 'dueOn', label: copy.due },
    { key: 'gross', label: copy.gross },
    { key: 'net', label: copy.net },
    { key: 'tax', label: copy.tax },
  ] satisfies { key: keyof InvoiceDraft; label: string; maximum?: number }[];
  return (
    <fieldset disabled={disabled} className="invoice-record-fields">
      <legend>{copy.description}</legend>
      {fields.map((field) => (
        <label key={field.key} htmlFor={`${id}-${field.key}`}>
          {field.label}
          <input
            id={`${id}-${field.key}`}
            autoComplete="off"
            value={draft[field.key]}
            maxLength={field.maximum}
            inputMode={
              ['gross', 'net', 'tax'].includes(field.key)
                ? 'decimal'
                : undefined
            }
            placeholder={
              ['issuedOn', 'dueOn'].includes(field.key)
                ? 'YYYY-MM-DD'
                : undefined
            }
            onChange={(event) =>
              setDraft({ ...draft, [field.key]: event.target.value })
            }
          />
        </label>
      ))}
      <div>
        <label htmlFor={`${id}-currency`}>{copy.currency}</label>
        <Select
          id={`${id}-currency`}
          value={draft.currency}
          onValueChange={(currency) => setDraft({ ...draft, currency })}
          options={['MDL', 'EUR', 'RON', 'USD'].map((value) => ({
            value,
            label: value,
          }))}
          placeholder={copy.chooseCurrency}
          disabled={disabled}
        />
      </div>
      <p className="invoice-record-wide">{copy.moneyHelp}</p>
    </fieldset>
  );
}
export function InvoiceValuesView({ values }: { values: InvoiceValues }) {
  const copy = useInvoiceRecordCopy();
  const { locale } = useInterfaceLocale();
  const amount = (minor: string | null) =>
    minor === null
      ? copy.unknown
      : displayMoney({ minor, currency: values.currency, locale });
  // Calendar literals are displayed without Date construction or timezone conversion.
  return (
    <dl className="invoice-record-facts">
      <dt>{copy.system}</dt>
      <dd>{values.externalSystem}</dd>
      <dt>{copy.number}</dt>
      <dd>{values.externalNumber}</dd>
      <dt>{copy.issued}</dt>
      <dd>
        <time dateTime={values.issuedOn}>{values.issuedOn}</time>
      </dd>
      <dt>{copy.due}</dt>
      <dd>
        {values.dueOn === null ? (
          copy.unknown
        ) : (
          <time dateTime={values.dueOn}>{values.dueOn}</time>
        )}
      </dd>
      <dt>{copy.gross}</dt>
      <dd>{amount(values.grossMinor)}</dd>
      <dt>{copy.net}</dt>
      <dd>{amount(values.netMinor)}</dd>
      <dt>{copy.tax}</dt>
      <dd>{amount(values.taxMinor)}</dd>
    </dl>
  );
}
export function InvoiceContextView({ context }: { context: CopiedContext }) {
  const copy = useInvoiceRecordCopy();
  const party = context.receivingParty;
  return (
    <dl className="invoice-record-facts">
      <dt>{copy.company}</dt>
      <dd>{context.companyLabel}</dd>
      <dt>{copy.contract}</dt>
      <dd>
        {context.contractReference} · {copy.version}{' '}
        {context.contractVersionNumber}
      </dd>
      <dt>{copy.party}</dt>
      <dd>
        {party.legalName} ·{' '}
        {party.kind === 'PRIMARY' ? copy.primary : copy.additional}
      </dd>
      <dt>{copy.taxIdentifier}</dt>
      <dd>{party.taxIdentifier ?? copy.unknown}</dd>
      <dt>{copy.address}</dt>
      <dd>{party.address ?? copy.unknown}</dd>
    </dl>
  );
}
