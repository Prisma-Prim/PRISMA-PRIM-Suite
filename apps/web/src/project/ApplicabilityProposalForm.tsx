import { type FormEvent, useId, useRef, useState } from 'react';
import { Select } from '../presentation/Select';
import { useMissionApplicabilityCopy } from './mission-applicability.copy';
import type {
  ApplicabilityIntent,
  ApplicabilitySnapshot,
  readApplicabilityAgreement,
} from './mission-applicability-response';
import {
  ApplicabilityPreparation,
  preparedApplicability,
  type PreparedApplicability,
} from './ApplicabilityPreparation';

type Activity = ApplicabilitySnapshot['activities'][number];
type AgreementKind = ReturnType<typeof readApplicabilityAgreement>['kind'];
export function applicabilityObservations(
  snapshot: ApplicabilitySnapshot,
  activity: Activity,
) {
  return {
    taskId: activity.task.id,
    expectedApplicabilityRevision: snapshot.revision,
    expectedTaskVersion: activity.task.version,
    expectedResultRevision: activity.result.current?.revision ?? 0,
    expectedLifecycleRevision: snapshot.lifecycleRevision,
  };
}
export function validApplicabilityStatement(value: string, maximum: number) {
  return (
    value.trim().length > 0 &&
    Array.from(value.trim()).length <= maximum &&
    !/[\uD800-\uDFFF]/u.test(value) &&
    !value.includes('\0')
  );
}
function pendingContent(activity: Activity) {
  const intent = activity.pendingProposal?.intent;
  return intent &&
    (intent.action === 'PROPOSE' || intent.action === 'CORRECT_PROPOSAL')
    ? intent
    : null;
}
export function ApplicabilityProposalForm({
  snapshot,
  activity,
  disabled,
  onRecord,
  capture,
}: {
  snapshot: ApplicabilitySnapshot;
  activity: Activity;
  disabled: boolean;
  onRecord: (body: ApplicabilityIntent) => void;
  capture: () => () => boolean;
}) {
  const copy = useMissionApplicabilityCopy(),
    id = useId(),
    form = useRef<HTMLFormElement>(null),
    initial = pendingContent(activity);
  const [reason, setReason] = useState(initial?.reason ?? ''),
    [scopeBasis, setScopeBasis] = useState(initial?.scopeBasis ?? ''),
    [agreementKind, setAgreementKind] = useState<AgreementKind>(
      initial?.agreement.kind ?? 'NO_CONTRACTUAL_CHANGE_REPORTED',
    ),
    [agreementText, setAgreementText] = useState(
      initial
        ? initial.agreement.kind === 'PARTIES_AGREEMENT_REPORTED'
          ? initial.agreement.reference
          : initial.agreement.basis
        : '',
    ),
    [correctionReason, setCorrectionReason] = useState('');
  const [invalid, setInvalid] = useState(false),
    [prepared, setPrepared] = useState<PreparedApplicability | null>(null);
  const correction = activity.pendingProposal !== null;
  function prepare(event: FormEvent) {
    event.preventDefault();
    const live = capture();
    if (!live() || disabled) return;
    const valid =
      validApplicabilityStatement(reason, 1000) &&
      validApplicabilityStatement(scopeBasis, 2000) &&
      validApplicabilityStatement(agreementText, 2000) &&
      (!correction || validApplicabilityStatement(correctionReason, 500));
    if (!valid) {
      setInvalid(true);
      requestAnimationFrame(() => {
        if (!live()) return;
        const node = form.current?.querySelector('[aria-invalid="true"]');
        if (node instanceof HTMLElement && !node.closest('[hidden]'))
          node.focus();
      });
      return;
    }
    const agreement =
      agreementKind === 'PARTIES_AGREEMENT_REPORTED'
        ? { kind: agreementKind, reference: agreementText.trim() }
        : { kind: agreementKind, basis: agreementText.trim() };
    const proposal = {
      ...applicabilityObservations(snapshot, activity),
      reason: reason.trim(),
      scopeBasis: scopeBasis.trim(),
      agreement,
    };
    const intent: ApplicabilityIntent =
      correction && activity.pendingProposal
        ? {
            ...proposal,
            action: 'CORRECT_PROPOSAL',
            proposalId: activity.pendingProposal.id,
            correctionReason: correctionReason.trim(),
          }
        : { ...proposal, action: 'PROPOSE' };
    setPrepared(preparedApplicability({ intent, snapshot, activity }));
    setInvalid(false);
  }
  const stale =
    prepared &&
    (prepared.intent.expectedApplicabilityRevision !== snapshot.revision ||
      prepared.intent.expectedTaskVersion !== activity.task.version ||
      prepared.intent.expectedResultRevision !==
        (activity.result.current?.revision ?? 0) ||
      prepared.intent.expectedLifecycleRevision !== snapshot.lifecycleRevision);
  if (prepared)
    return (
      <div className="applicability-preparation">
        <ApplicabilityPreparation prepared={prepared} />
        {stale && <p role="alert">{copy('conflict')}</p>}
        <button
          type="button"
          disabled={disabled || Boolean(stale)}
          onClick={() => {
            const live = capture();
            if (live()) onRecord(prepared.intent);
          }}
        >
          {copy(correction ? 'recordCorrection' : 'recordProposal')}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPrepared(null)}
        >
          {copy('edit')}
        </button>
      </div>
    );
  return (
    <form ref={form} onSubmit={prepare} noValidate>
      <label htmlFor={id + '-reason'}>{copy('reason')}</label>
      <textarea
        id={id + '-reason'}
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        aria-invalid={invalid && !validApplicabilityStatement(reason, 1000)}
        aria-describedby={invalid ? id + '-error' : undefined}
        disabled={disabled}
      />
      <label htmlFor={id + '-scope'}>{copy('scopeBasis')}</label>
      <textarea
        id={id + '-scope'}
        required
        value={scopeBasis}
        onChange={(event) => setScopeBasis(event.target.value)}
        aria-invalid={invalid && !validApplicabilityStatement(scopeBasis, 2000)}
        aria-describedby={invalid ? id + '-error' : undefined}
        disabled={disabled}
      />
      <label htmlFor={id + '-agreement'}>{copy('agreement')}</label>
      <Select
        id={id + '-agreement'}
        value={agreementKind}
        options={(
          [
            'NO_CONTRACTUAL_CHANGE_REPORTED',
            'PARTIES_AGREEMENT_REPORTED',
            'PARTIES_AGREEMENT_UNAVAILABLE',
          ] as const
        ).map((value) => ({ value, label: copy(value) }))}
        onValueChange={(value) => {
          if (
            value === 'NO_CONTRACTUAL_CHANGE_REPORTED' ||
            value === 'PARTIES_AGREEMENT_REPORTED' ||
            value === 'PARTIES_AGREEMENT_UNAVAILABLE'
          )
            setAgreementKind(value);
        }}
        disabled={disabled}
      />
      <label htmlFor={id + '-agreement-text'}>
        {copy(
          agreementKind === 'PARTIES_AGREEMENT_REPORTED'
            ? 'reference'
            : 'agreementBasis',
        )}
      </label>
      <textarea
        id={id + '-agreement-text'}
        required
        value={agreementText}
        onChange={(event) => setAgreementText(event.target.value)}
        aria-invalid={
          invalid && !validApplicabilityStatement(agreementText, 2000)
        }
        aria-describedby={invalid ? id + '-error' : undefined}
        disabled={disabled}
      />
      {correction && (
        <>
          <label htmlFor={id + '-correction'}>{copy('correctionReason')}</label>
          <textarea
            id={id + '-correction'}
            required
            value={correctionReason}
            onChange={(event) => setCorrectionReason(event.target.value)}
            aria-invalid={
              invalid && !validApplicabilityStatement(correctionReason, 500)
            }
            aria-describedby={invalid ? id + '-error' : undefined}
            disabled={disabled}
          />
        </>
      )}
      {invalid && (
        <p id={id + '-error'} role="alert">
          {copy('invalid')}
        </p>
      )}
      <button type="submit" disabled={disabled}>
        {copy(correction ? 'reviewCorrection' : 'reviewProposal')}
      </button>
    </form>
  );
}
