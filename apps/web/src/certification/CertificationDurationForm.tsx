import type { FormEvent } from 'react';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import {
  CONFIRMED_DURATION_FIELDS,
  INCREASE_FACTORS,
  REDUCTION_FACTORS,
  type DurationResult,
  type IncreaseFactor,
  type ReductionFactor,
} from './certification-duration';
import {
  draftNeedsJustification,
  factorText,
  studiesTotal,
  type DurationDraft,
} from './certification-duration-draft';
import {
  CERTIFICATION_LIMITS,
  FOOD_CHAIN_SUBCATEGORIES,
  type ApplicationFacts,
} from './certification-response';
import { DurationResultView, factorLabel } from './CertificationDurationViews';
import { NumberField } from './CertificationForms';

export type DurationFormProps = {
  idPrefix: string;
  facts: ApplicationFacts;
  draft: DurationDraft;
  /** A confirmed determination exists: saving records a corrected version. */
  correcting: boolean;
  disabled: boolean;
  computing: boolean;
  submitting: boolean;
  /** Saving waits for a reload of the outdated Case; the draft stays editable. */
  submitBlocked: boolean;
  /** The last computation, and whether it still matches the typed inputs. */
  proposal: { result: DurationResult; current: boolean } | undefined;
  /** Why the inputs were not sent, or why the computation failed. */
  inputsRefusal?: { id: string; message: CertificationMessageKey };
  /** The feedback element describing the current confirmation refusal. */
  feedbackId?: string;
  onChange: (draft: DurationDraft) => void;
  onCompute: (event: FormEvent) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel?: () => void;
};

/**
 * The duration inputs, their computed proposal and the confirmation form.
 * A confirmation is offered only for a computation of the inputs as typed.
 */
export function DurationForm({
  idPrefix,
  facts,
  draft,
  correcting,
  disabled,
  computing,
  submitting,
  submitBlocked,
  proposal,
  inputsRefusal,
  feedbackId,
  onChange,
  onCompute,
  onSubmit,
  onCancel,
}: DurationFormProps) {
  const copy = useCertificationCopy();
  const id = (name: string) => `${idPrefix}-${name}`;
  const set = (patch: Partial<DurationDraft>) =>
    onChange({ ...draft, ...patch });
  const inputsInvalid = inputsRefusal !== undefined;
  const confirmable =
    proposal?.current === true && proposal.result.kind !== 'refused'
      ? proposal.result
      : undefined;
  return (
    <>
      <p>{copy('durationHelp')}</p>
      <form
        className="certification-form"
        aria-label={copy('durationInputs')}
        noValidate
        onSubmit={onCompute}
      >
        <div className="certification-field">
          <label htmlFor={id('primary')}>{copy('primarySubcategory')}</label>
          <Select
            id={id('primary')}
            value={draft.primary ?? ''}
            placeholder={copy('selectPrimarySubcategory')}
            disabled={disabled}
            required
            invalid={inputsInvalid}
            describedBy={
              [id('primary-help'), inputsRefusal?.id]
                .filter(Boolean)
                .join(' ') || undefined
            }
            options={facts.foodChainSubcategories.map((code) => ({
              value: code,
              label: code,
            }))}
            onValueChange={(value) =>
              set({
                primary:
                  FOOD_CHAIN_SUBCATEGORIES.find((code) => code === value) ??
                  null,
              })
            }
          />
          <small id={id('primary-help')}>
            {copy('primarySubcategoryHelp')}
          </small>
        </div>
        <fieldset>
          <legend>{copy('haccpStudiesPerSubcategory')}</legend>
          <div className="certification-numbers">
            {draft.haccpStudies.map((entry, index) => (
              <NumberField
                key={entry.code}
                id={id(`studies-${entry.code}`)}
                label={formatMessage(copy('haccpStudiesFor'), {
                  code: entry.code,
                })}
                value={entry.count}
                disabled={disabled}
                invalid={inputsInvalid}
                describedBy={
                  [id('studies-total'), inputsRefusal?.id]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                onChange={(count) =>
                  set({
                    haccpStudies: draft.haccpStudies.map((study, position) =>
                      position === index ? { ...study, count } : study,
                    ),
                  })
                }
              />
            ))}
          </div>
          <p id={id('studies-total')} aria-live="polite">
            {formatMessage(copy('haccpStudiesTotal'), {
              total: studiesTotal(draft),
              declared: facts.haccpStudyCount,
            })}
          </p>
        </fieldset>
        <FactorFields
          legend={copy('increaseFactors')}
          help={{ id: id('increase-help'), text: copy('increaseFactorsHelp') }}
          idPrefix={id('increase')}
          factors={INCREASE_FACTORS}
          texts={draft.increases}
          disabled={disabled}
          feedbackId={inputsRefusal?.id}
          onChange={(increases) => set({ increases })}
        />
        <FactorFields
          legend={copy('reductionFactors')}
          help={{
            id: id('reduction-help'),
            text: copy('reductionFactorsHelp'),
          }}
          idPrefix={id('reduction')}
          factors={REDUCTION_FACTORS}
          texts={draft.reductions}
          disabled={disabled}
          feedbackId={inputsRefusal?.id}
          onChange={(reductions) => set({ reductions })}
        />
        {inputsRefusal && (
          <p role="alert" id={inputsRefusal.id}>
            {copy(inputsRefusal.message)}
          </p>
        )}
        <div className="certification-actions">
          <button
            type="submit"
            className={confirmable ? undefined : 'certification-primary'}
            disabled={disabled}
          >
            {computing ? copy('computing') : copy('computeProposal')}
          </button>
        </div>
      </form>
      {proposal && (
        <section aria-labelledby={id('proposal-title')}>
          <h6 id={id('proposal-title')}>{copy('proposalTitle')}</h6>
          {!proposal.current && (
            <p className="certification-note">{copy('proposalOutdated')}</p>
          )}
          <DurationResultView result={proposal.result} />
        </section>
      )}
      {confirmable && (
        <ConfirmationForm
          idPrefix={idPrefix}
          draft={draft}
          correcting={correcting}
          justificationRequired={draftNeedsJustification(draft, confirmable)}
          disabled={disabled}
          submitting={submitting}
          submitBlocked={submitBlocked}
          feedbackId={feedbackId}
          onChange={onChange}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
      {!confirmable && onCancel && (
        <div className="certification-actions">
          <button type="button" disabled={submitting} onClick={onCancel}>
            {copy('cancel')}
          </button>
        </div>
      )}
    </>
  );
}

function FactorFields<Factor extends IncreaseFactor | ReductionFactor>({
  legend,
  help,
  idPrefix,
  factors,
  texts,
  disabled,
  feedbackId,
  onChange,
}: {
  legend: string;
  help: { id: string; text: string };
  idPrefix: string;
  factors: readonly Factor[];
  texts: Partial<Record<Factor, string>>;
  disabled: boolean;
  feedbackId: string | undefined;
  onChange: (texts: Partial<Record<Factor, string>>) => void;
}) {
  const copy = useCertificationCopy();
  return (
    <fieldset>
      <legend>{legend}</legend>
      <small id={help.id}>{help.text}</small>
      <div className="certification-numbers">
        {factors.map((factor) => (
          <NumberField
            key={factor}
            id={`${idPrefix}-${factor}`}
            label={copy(factorLabel(factor))}
            value={factorText(texts, factor)}
            disabled={disabled}
            invalid={feedbackId !== undefined}
            describedBy={[help.id, feedbackId].filter(Boolean).join(' ')}
            onChange={(value) => onChange({ ...texts, [factor]: value })}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ConfirmationForm({
  idPrefix,
  draft,
  correcting,
  justificationRequired,
  disabled,
  submitting,
  submitBlocked,
  feedbackId,
  onChange,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  draft: DurationDraft;
  correcting: boolean;
  justificationRequired: boolean;
  disabled: boolean;
  submitting: boolean;
  submitBlocked: boolean;
  feedbackId: string | undefined;
  onChange: (draft: DurationDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel?: () => void;
}) {
  const copy = useCertificationCopy();
  const id = (name: string) => `${idPrefix}-${name}`;
  const invalid = feedbackId !== undefined;
  const describedBy = (extra: string) =>
    [extra, feedbackId].filter(Boolean).join(' ');
  return (
    <form
      className="certification-form"
      aria-label={copy(correcting ? 'correctDuration' : 'confirmDuration')}
      noValidate
      onSubmit={onSubmit}
    >
      {correcting && <p>{copy('correctionHelp')}</p>}
      <p id={id('confirm-help')}>{copy('confirmHelp')}</p>
      <div className="certification-numbers">
        {CONFIRMED_DURATION_FIELDS.map((field) => (
          <NumberField
            key={field}
            id={id(`confirmed-${field}`)}
            label={copy(field)}
            value={draft.confirmed[field]}
            decimal
            disabled={disabled}
            invalid={invalid}
            describedBy={describedBy(id('confirm-help'))}
            onChange={(value) =>
              onChange({
                ...draft,
                confirmed: { ...draft.confirmed, [field]: value },
              })
            }
          />
        ))}
      </div>
      <div className="certification-field">
        <label htmlFor={id('justification')}>{copy('justification')}</label>
        <textarea
          id={id('justification')}
          value={draft.justification}
          maxLength={CERTIFICATION_LIMITS.justification}
          disabled={disabled}
          required={justificationRequired}
          aria-invalid={invalid}
          aria-describedby={describedBy(id('justification-hint'))}
          onChange={(event) =>
            onChange({ ...draft, justification: event.target.value })
          }
        />
        <small id={id('justification-hint')}>
          {copy(
            justificationRequired ? 'justificationRequiredHint' : 'optional',
          )}
        </small>
      </div>
      {correcting && (
        <>
          <label htmlFor={id('reason')}>{copy('correctionReason')}</label>
          <textarea
            id={id('reason')}
            value={draft.reason}
            maxLength={CERTIFICATION_LIMITS.reason}
            disabled={disabled}
            required
            aria-invalid={invalid}
            aria-describedby={feedbackId}
            onChange={(event) =>
              onChange({ ...draft, reason: event.target.value })
            }
          />
        </>
      )}
      <div className="certification-actions">
        <button
          type="submit"
          className="certification-primary"
          disabled={disabled || submitBlocked}
        >
          {submitting
            ? copy('saving')
            : copy(correcting ? 'saveCorrection' : 'confirmDuration')}
        </button>
        {onCancel && (
          <button type="button" disabled={submitting} onClick={onCancel}>
            {copy('cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
