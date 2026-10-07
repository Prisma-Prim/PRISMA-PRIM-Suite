import { useId, useState } from 'react';
import { Select } from '../presentation/Select';
import {
  costCategories,
  executorTypes,
  isCostCategory,
  isExecutorType,
  validCurrency,
  validMoney,
  validTarget,
  type CostCategory,
  type EstimateInputs,
} from './profitability-contract';
import { useProfitabilityCopy } from './profitability.copy';

type DraftLine = {
  key: string;
  category: CostCategory;
  label: string;
  amount: string;
};
export function ProfitabilityForm({
  initialInputs,
  confirmationRevision,
  disabled,
  invalid,
  errorId,
  onInvalid,
  onSubmit,
}: {
  initialInputs?: EstimateInputs;
  confirmationRevision: number;
  disabled: boolean;
  invalid: boolean;
  errorId: string;
  onInvalid: () => void;
  onSubmit: (inputs: EstimateInputs) => void;
}) {
  const copy = useProfitabilityCopy();
  const fieldId = useId();
  const [currency, setCurrency] = useState(initialInputs?.currency ?? '');
  const [executorType, setExecutorType] = useState(
    initialInputs?.executorType ?? '',
  );
  const [executorCost, setExecutorCost] = useState(
    initialInputs?.executorCost ?? '',
  );
  const [fiscalCost, setFiscalCost] = useState(initialInputs?.fiscalCost ?? '');
  const [allocatedOverhead, setAllocatedOverhead] = useState(
    initialInputs?.allocatedOverhead ?? '',
  );
  const [targetProfitability, setTargetProfitability] = useState(
    initialInputs?.targetProfitability ?? '',
  );
  const [proposedPrice, setProposedPrice] = useState(
    initialInputs?.proposedPrice ?? '',
  );
  const [pricingKind, setPricingKind] = useState<'ORDINARY' | 'STRATEGIC' | ''>(
    initialInputs?.pricingIntent.kind ?? '',
  );
  const [reason, setReason] = useState(
    initialInputs?.pricingIntent.kind === 'STRATEGIC'
      ? initialInputs.pricingIntent.reason
      : '',
  );
  const [lines, setLines] = useState<DraftLine[]>(
    initialInputs?.directCosts ?? [],
  );
  const [confirmation, setConfirmation] = useState({
    revision: confirmationRevision,
    confirmed: false,
  });
  // A reloaded head requires fresh confirmation without discarding the draft.
  const confirmed =
    confirmation.revision === confirmationRevision && confirmation.confirmed;
  function setConfirmed(value: boolean) {
    setConfirmation({ revision: confirmationRevision, confirmed: value });
  }
  function edit() {
    setConfirmed(false);
  }
  function updateLine(
    key: string,
    patch: Partial<Pick<DraftLine, 'category' | 'label' | 'amount'>>,
  ) {
    edit();
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  function textInput(
    label:
      | 'currency'
      | 'executorCost'
      | 'fiscalCost'
      | 'allocatedOverhead'
      | 'targetProfitability'
      | 'proposedPrice',
    value: string,
    setter: (value: string) => void,
  ) {
    return (
      <label htmlFor={`${fieldId}-${label}`}>
        {copy(label)}
        <input
          id={`${fieldId}-${label}`}
          value={value}
          onChange={(event) => {
            edit();
            setter(event.target.value);
          }}
          type="text"
          inputMode={label === 'currency' ? 'text' : 'decimal'}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={`${fieldId}-canonical${invalid ? ` ${errorId}` : ''}`}
        />
      </label>
    );
  }
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (
          disabled ||
          !validCurrency(currency) ||
          !isExecutorType(executorType) ||
          !validMoney(executorCost) ||
          !validMoney(fiscalCost) ||
          !validMoney(allocatedOverhead) ||
          !validMoney(proposedPrice, true) ||
          !validTarget(targetProfitability) ||
          !confirmed ||
          pricingKind === '' ||
          (pricingKind === 'STRATEGIC' && !reason.trim()) ||
          lines.some(
            (line) => !line.label.trim() || !validMoney(line.amount, true),
          )
        ) {
          onInvalid();
          return;
        }
        onSubmit({
          currency,
          executorType,
          executorCost,
          fiscalCost,
          allocatedOverhead,
          proposedPrice,
          targetProfitability,
          directCosts: lines.map((line) => ({ ...line, currency })),
          pricingIntent:
            pricingKind === 'STRATEGIC'
              ? { kind: 'STRATEGIC', reason }
              : { kind: 'ORDINARY' },
          costConfirmation: true,
        });
      }}
    >
      <fieldset disabled={disabled} className="profitability-fields">
        <legend>{copy(initialInputs ? 'correction' : 'title')}</legend>
        <p id={`${fieldId}-canonical`}>{copy('canonical')}</p>
        {initialInputs ? <p>{copy('freshConfirmation')}</p> : null}
        <div className="profitability-grid">
          {textInput('currency', currency, setCurrency)}
          <div>
            <label htmlFor={`${fieldId}-executor`}>
              {copy('executorType')}
            </label>
            <Select
              id={`${fieldId}-executor`}
              value={executorType}
              placeholder={copy('choose')}
              options={executorTypes.map((value) => ({
                value,
                label: copy(value),
              }))}
              onValueChange={(value) => {
                edit();
                if (isExecutorType(value)) setExecutorType(value);
              }}
              disabled={disabled}
              required
              invalid={invalid}
              describedBy={invalid ? errorId : undefined}
            />
          </div>
          {textInput('executorCost', executorCost, setExecutorCost)}
          {textInput('fiscalCost', fiscalCost, setFiscalCost)}
          {textInput(
            'allocatedOverhead',
            allocatedOverhead,
            setAllocatedOverhead,
          )}
          {textInput('proposedPrice', proposedPrice, setProposedPrice)}
          {textInput(
            'targetProfitability',
            targetProfitability,
            setTargetProfitability,
          )}
          <div>
            <label htmlFor={`${fieldId}-intent`}>{copy('pricingIntent')}</label>
            <Select
              id={`${fieldId}-intent`}
              value={pricingKind}
              placeholder={copy('choose')}
              options={['ORDINARY', 'STRATEGIC'].map((value) => ({
                value,
                label: copy(value === 'ORDINARY' ? 'ORDINARY' : 'STRATEGIC'),
              }))}
              onValueChange={(value) => {
                edit();
                if (value === 'ORDINARY' || value === 'STRATEGIC')
                  setPricingKind(value);
              }}
              disabled={disabled}
              required
              invalid={invalid}
              describedBy={invalid ? errorId : undefined}
            />
          </div>
        </div>
        {pricingKind === 'STRATEGIC' ? (
          <label htmlFor={`${fieldId}-reason`}>
            {copy('reason')}
            <textarea
              id={`${fieldId}-reason`}
              value={reason}
              onChange={(event) => {
                edit();
                setReason(event.target.value);
              }}
              required
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
            />
          </label>
        ) : null}
        <h4>{copy('directCosts')}</h4>
        {lines.length === 0 ? <p>{copy('noDirect')}</p> : null}
        {lines.map((line, index) => (
          <fieldset className="profitability-cost" key={line.key}>
            <legend>
              {copy('directCosts')} {index + 1}
            </legend>
            <label htmlFor={`${fieldId}-${line.key}-category`}>
              {copy('category')}
            </label>
            <Select
              id={`${fieldId}-${line.key}-category`}
              value={line.category}
              options={costCategories.map((value) => ({
                value,
                label: copy(value),
              }))}
              disabled={disabled}
              onValueChange={(value) => {
                if (isCostCategory(value))
                  updateLine(line.key, { category: value });
              }}
            />
            <label htmlFor={`${fieldId}-${line.key}-label`}>
              {copy('label')}
              <input
                id={`${fieldId}-${line.key}-label`}
                value={line.label}
                required
                onChange={(event) =>
                  updateLine(line.key, { label: event.target.value })
                }
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
              />
            </label>
            <label htmlFor={`${fieldId}-${line.key}-amount`}>
              {copy('amount')} ({currency})
              <input
                id={`${fieldId}-${line.key}-amount`}
                value={line.amount}
                required
                inputMode="decimal"
                onChange={(event) =>
                  updateLine(line.key, { amount: event.target.value })
                }
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                edit();
                setLines((current) =>
                  current.filter((item) => item.key !== line.key),
                );
              }}
            >
              {copy('removeCost')}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() => {
            edit();
            setLines((current) => [
              ...current,
              {
                key: crypto.randomUUID(),
                category: 'OTHER',
                label: '',
                amount: '',
              },
            ]);
          }}
        >
          {copy('addCost')}
        </button>
        <label className="profitability-confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
          />
          {copy('confirmation')}
        </label>
        <button type="submit">{copy('save')}</button>
      </fieldset>
    </form>
  );
}
