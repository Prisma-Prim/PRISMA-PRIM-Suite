import type { FormEvent } from 'react';
import { formatMessage } from '../localization/messages';
import { useCertificationCopy } from './certification.copy';
import { latestBusinessDate } from './certification-attribution';
import type { ApplicationDraft, ReviewDraft } from './certification-draft';
import {
  CERTIFICATION_LIMITS,
  FOOD_CHAIN_SUBCATEGORIES,
  REVIEW_CRITERIA,
  type CertificationAttachment,
} from './certification-response';
import { ActingFieldset } from './CertificationAttribution';

type FormProps<Draft> = {
  idPrefix: string;
  draft: Draft;
  disabled: boolean;
  submitting: boolean;
  /** Saving waits for a reload of the outdated Case; the draft stays editable. */
  submitBlocked: boolean;
  /** The feedback element describing the current refusal, when one is shown. */
  feedbackId?: string;
  onChange: (draft: Draft) => void;
  onSubmit: (event: FormEvent) => void;
};

/** Every application fact; sites and languages are editable bounded lists. */
export function ApplicationForm({
  idPrefix,
  draft,
  disabled,
  feedbackId,
  correcting,
  submitting,
  submitBlocked,
  onChange,
  onSubmit,
  onCancel,
}: FormProps<ApplicationDraft> & {
  correcting: boolean;
  onCancel?: () => void;
}) {
  const copy = useCertificationCopy();
  const id = (name: string) => `${idPrefix}-${name}`;
  const set = (patch: Partial<ApplicationDraft>) =>
    onChange({ ...draft, ...patch });
  const invalid = feedbackId !== undefined;
  const describedBy = (extra?: string) =>
    [extra, feedbackId].filter(Boolean).join(' ') || undefined;
  return (
    <form
      className="certification-form"
      aria-label={copy(correcting ? 'correctApplication' : 'recordApplication')}
      noValidate
      onSubmit={onSubmit}
    >
      {correcting && <p>{copy('correctionHelp')}</p>}
      <label htmlFor={id('submitted-on')}>
        {copy('applicationSubmittedOn')}
      </label>
      <input
        id={id('submitted-on')}
        type="date"
        value={draft.submittedOn}
        max={latestBusinessDate()}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy(id('submitted-on-help'))}
        onChange={(event) => set({ submittedOn: event.target.value })}
      />
      <small id={id('submitted-on-help')}>
        {copy('applicationSubmittedOnHelp')}
      </small>
      <label htmlFor={id('legal-name')}>{copy('declaredLegalName')}</label>
      <input
        id={id('legal-name')}
        value={draft.declaredLegalName}
        maxLength={CERTIFICATION_LIMITS.declaredLegalName}
        disabled={disabled}
        required
        aria-invalid={invalid}
        aria-describedby={describedBy()}
        onChange={(event) => set({ declaredLegalName: event.target.value })}
      />
      <label htmlFor={id('address')}>{copy('declaredAddress')}</label>
      <textarea
        id={id('address')}
        value={draft.declaredAddress}
        maxLength={CERTIFICATION_LIMITS.declaredAddress}
        disabled={disabled}
        required
        aria-invalid={invalid}
        aria-describedby={describedBy()}
        onChange={(event) => set({ declaredAddress: event.target.value })}
      />
      <fieldset>
        <legend>{copy('sites')}</legend>
        {draft.sites.map((site, index) => {
          const number = index + 1;
          const update = (patch: Partial<typeof site>) =>
            set({
              sites: draft.sites.map((entry, position) =>
                position === index ? { ...entry, ...patch } : entry,
              ),
            });
          return (
            <fieldset key={index} className="certification-list-entry">
              <legend>{formatMessage(copy('site'), { number })}</legend>
              <label htmlFor={id(`site-${index}-address`)}>
                {copy('siteAddress')}
              </label>
              <input
                id={id(`site-${index}-address`)}
                value={site.address}
                maxLength={CERTIFICATION_LIMITS.siteText}
                disabled={disabled}
                required
                aria-invalid={invalid}
                aria-describedby={describedBy()}
                onChange={(event) => update({ address: event.target.value })}
              />
              <label htmlFor={id(`site-${index}-activity`)}>
                {copy('siteActivity')}
              </label>
              <input
                id={id(`site-${index}-activity`)}
                value={site.activity}
                maxLength={CERTIFICATION_LIMITS.siteText}
                disabled={disabled}
                required
                aria-invalid={invalid}
                aria-describedby={describedBy()}
                onChange={(event) => update({ activity: event.target.value })}
              />
              {draft.sites.length > 1 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    set({
                      sites: draft.sites.filter(
                        (_entry, position) => position !== index,
                      ),
                    })
                  }
                >
                  {formatMessage(copy('removeSite'), { number })}
                </button>
              )}
            </fieldset>
          );
        })}
        {draft.sites.length < CERTIFICATION_LIMITS.sites && (
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              set({ sites: [...draft.sites, { address: '', activity: '' }] })
            }
          >
            {copy('addSite')}
          </button>
        )}
      </fieldset>
      <label htmlFor={id('scope')}>{copy('requestedScope')}</label>
      <textarea
        id={id('scope')}
        value={draft.requestedScope}
        maxLength={CERTIFICATION_LIMITS.requestedScope}
        disabled={disabled}
        required
        aria-invalid={invalid}
        aria-describedby={describedBy()}
        onChange={(event) => set({ requestedScope: event.target.value })}
      />
      <fieldset className="certification-subcategories">
        <legend>{copy('foodChainSubcategories')}</legend>
        {FOOD_CHAIN_SUBCATEGORIES.map((code) => (
          <label key={code} className="certification-choice">
            <input
              type="checkbox"
              checked={draft.foodChainSubcategories.includes(code)}
              disabled={disabled}
              onChange={(event) =>
                set({
                  // Keep the reference order so equal selections serialize equally.
                  foodChainSubcategories: FOOD_CHAIN_SUBCATEGORIES.filter(
                    (candidate) =>
                      candidate === code
                        ? event.target.checked
                        : draft.foodChainSubcategories.includes(candidate),
                  ),
                })
              }
            />
            {code}
          </label>
        ))}
      </fieldset>
      <div className="certification-numbers">
        <NumberField
          id={id('haccp')}
          label={copy('haccpStudyCount')}
          value={draft.haccpStudyCount}
          disabled={disabled}
          invalid={invalid}
          describedBy={describedBy()}
          onChange={(value) => set({ haccpStudyCount: value })}
        />
        <NumberField
          id={id('headcount')}
          label={copy('totalHeadcount')}
          value={draft.totalHeadcount}
          disabled={disabled}
          invalid={invalid}
          describedBy={describedBy()}
          onChange={(value) => set({ totalHeadcount: value })}
        />
        <NumberField
          id={id('fte')}
          label={copy('effectiveFte')}
          value={draft.effectiveFte}
          decimal
          disabled={disabled}
          invalid={invalid}
          describedBy={describedBy(id('fte-help'))}
          help={{ id: id('fte-help'), text: copy('effectiveFteHelp') }}
          onChange={(value) => set({ effectiveFte: value })}
        />
        <NumberField
          id={id('shifts')}
          label={copy('shiftCount')}
          value={draft.shiftCount}
          disabled={disabled}
          invalid={invalid}
          describedBy={describedBy()}
          onChange={(value) => set({ shiftCount: value })}
        />
      </div>
      <OptionalText
        id={id('seasonal')}
        label={copy('seasonalActivity')}
        hint={copy('optional')}
        value={draft.seasonalActivity}
        disabled={disabled}
        feedbackId={feedbackId}
        onChange={(value) => set({ seasonalActivity: value })}
      />
      <OptionalText
        id={id('systems')}
        label={copy('otherCertifiedSystems')}
        hint={copy('optional')}
        value={draft.otherCertifiedSystems}
        disabled={disabled}
        feedbackId={feedbackId}
        onChange={(value) => set({ otherCertifiedSystems: value })}
      />
      <OptionalText
        id={id('outsourced')}
        label={copy('outsourcedProcesses')}
        hint={copy('optional')}
        value={draft.outsourcedProcesses}
        disabled={disabled}
        feedbackId={feedbackId}
        onChange={(value) => set({ outsourcedProcesses: value })}
      />
      <fieldset>
        <legend>{copy('consultantUsed')}</legend>
        {(['yes', 'no'] as const).map((choice) => (
          <label key={choice} className="certification-choice">
            <input
              type="radio"
              name={id('consultant')}
              value={choice}
              checked={draft.consultantUsed === choice}
              disabled={disabled}
              onChange={() => set({ consultantUsed: choice })}
            />
            {copy(choice)}
          </label>
        ))}
        {draft.consultantUsed === 'yes' && (
          <>
            <label htmlFor={id('consultant-name')}>
              {copy('consultantName')}
            </label>
            <input
              id={id('consultant-name')}
              value={draft.consultantName}
              maxLength={CERTIFICATION_LIMITS.consultantName}
              disabled={disabled}
              required
              aria-invalid={invalid}
              aria-describedby={describedBy()}
              onChange={(event) => set({ consultantName: event.target.value })}
            />
          </>
        )}
      </fieldset>
      <fieldset>
        <legend>{copy('auditLanguages')}</legend>
        {draft.auditLanguages.map((language, index) => {
          const number = index + 1;
          return (
            <div key={index} className="certification-list-entry">
              <label htmlFor={id(`language-${index}`)}>
                {formatMessage(copy('auditLanguage'), { number })}
              </label>
              <input
                id={id(`language-${index}`)}
                value={language}
                maxLength={CERTIFICATION_LIMITS.auditLanguage}
                disabled={disabled}
                required
                aria-invalid={invalid}
                aria-describedby={describedBy()}
                onChange={(event) =>
                  set({
                    auditLanguages: draft.auditLanguages.map(
                      (entry, position) =>
                        position === index ? event.target.value : entry,
                    ),
                  })
                }
              />
              {draft.auditLanguages.length > 1 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    set({
                      auditLanguages: draft.auditLanguages.filter(
                        (_entry, position) => position !== index,
                      ),
                    })
                  }
                >
                  {formatMessage(copy('removeLanguage'), { number })}
                </button>
              )}
            </div>
          );
        })}
        {draft.auditLanguages.length < CERTIFICATION_LIMITS.auditLanguages && (
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              set({ auditLanguages: [...draft.auditLanguages, ''] })
            }
          >
            {copy('addLanguage')}
          </button>
        )}
      </fieldset>
      <div className="certification-field">
        <label htmlFor={id('period')}>{copy('preferredAuditPeriod')}</label>
        <input
          id={id('period')}
          value={draft.preferredAuditPeriod}
          maxLength={CERTIFICATION_LIMITS.preferredAuditPeriod}
          disabled={disabled}
          aria-describedby={describedBy(id('period-hint'))}
          onChange={(event) =>
            set({ preferredAuditPeriod: event.target.value })
          }
        />
        <small id={id('period-hint')}>{copy('optional')}</small>
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
            aria-describedby={describedBy()}
            onChange={(event) => set({ reason: event.target.value })}
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
            : copy(correcting ? 'saveCorrection' : 'recordApplication')}
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

function OptionalText({
  id,
  label,
  hint,
  value,
  disabled,
  feedbackId,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  disabled: boolean;
  feedbackId: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="certification-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        maxLength={CERTIFICATION_LIMITS.optionalText}
        disabled={disabled}
        aria-describedby={[`${id}-hint`, feedbackId].filter(Boolean).join(' ')}
        onChange={(event) => onChange(event.target.value)}
      />
      <small id={`${id}-hint`}>{hint}</small>
    </div>
  );
}

export function NumberField({
  id,
  label,
  value,
  decimal = false,
  disabled,
  invalid,
  describedBy,
  help,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  decimal?: boolean;
  disabled: boolean;
  invalid: boolean;
  describedBy: string | undefined;
  help?: { id: string; text: string };
  onChange: (value: string) => void;
}) {
  return (
    <div className="certification-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode={decimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={value}
        disabled={disabled}
        required
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {help && <small id={help.id}>{help.text}</small>}
    </div>
  );
}

/** Four explicit yes/no answers with notes, then an explicit outcome. */
export function ReviewForm({
  idPrefix,
  draft,
  documents,
  disabled,
  feedbackId,
  submitting,
  submitBlocked,
  onChange,
  onSubmit,
}: FormProps<ReviewDraft> & {
  /** The Case's attachments a signed review form may be chosen from. */
  documents: readonly CertificationAttachment[];
}) {
  const copy = useCertificationCopy();
  const id = (name: string) => `${idPrefix}-${name}`;
  const invalid = feedbackId !== undefined;
  return (
    <form
      className="certification-form"
      aria-label={copy('recordReview')}
      noValidate
      onSubmit={onSubmit}
    >
      <p>{copy('reviewHelp')}</p>
      {REVIEW_CRITERIA.map((criterion) => {
        const entry = draft.criteria[criterion];
        const update = (patch: Partial<typeof entry>) =>
          onChange({
            ...draft,
            criteria: {
              ...draft.criteria,
              [criterion]: { ...entry, ...patch },
            },
          });
        return (
          <fieldset key={criterion} className="certification-criterion">
            <legend>{copy(criterion)}</legend>
            <div className="certification-answers">
              {(['yes', 'no'] as const).map((answer) => (
                <label key={answer} className="certification-choice">
                  <input
                    type="radio"
                    name={id(criterion)}
                    value={answer}
                    checked={entry.answer === answer}
                    disabled={disabled}
                    onChange={() => update({ answer })}
                  />
                  {copy(answer)}
                </label>
              ))}
            </div>
            <label htmlFor={id(`${criterion}-note`)}>{copy('note')}</label>
            <textarea
              id={id(`${criterion}-note`)}
              value={entry.note}
              maxLength={CERTIFICATION_LIMITS.note}
              disabled={disabled}
              required
              aria-invalid={invalid}
              aria-describedby={feedbackId}
              onChange={(event) => update({ note: event.target.value })}
            />
          </fieldset>
        );
      })}
      <fieldset>
        <legend>{copy('outcome')}</legend>
        {(
          [
            ['accepted', 'outcomeAccept'],
            ['rejected', 'outcomeReject'],
          ] as const
        ).map(([outcome, label]) => (
          <label key={outcome} className="certification-choice">
            <input
              type="radio"
              name={id('outcome')}
              value={outcome}
              checked={draft.outcome === outcome}
              disabled={disabled}
              onChange={() => onChange({ ...draft, outcome })}
            />
            {copy(label)}
          </label>
        ))}
      </fieldset>
      {draft.outcome === 'rejected' && (
        <>
          <label htmlFor={id('rejection-reason')}>
            {copy('rejectionReason')}
          </label>
          <textarea
            id={id('rejection-reason')}
            value={draft.rejectionReason}
            maxLength={CERTIFICATION_LIMITS.reason}
            disabled={disabled}
            required
            aria-invalid={invalid}
            aria-describedby={feedbackId}
            onChange={(event) =>
              onChange({ ...draft, rejectionReason: event.target.value })
            }
          />
        </>
      )}
      <ActingFieldset
        idPrefix={id('acting')}
        legend="actingReviewLegend"
        draft={draft.onBehalf}
        documents={documents}
        disabled={disabled}
        feedbackId={feedbackId}
        onChange={(onBehalf) => onChange({ ...draft, onBehalf })}
      />
      <button
        type="submit"
        className={
          draft.outcome === 'rejected'
            ? 'certification-reject'
            : 'certification-primary'
        }
        disabled={disabled || submitBlocked}
      >
        {submitting ? copy('saving') : copy('recordReview')}
      </button>
    </form>
  );
}
