import { type FormEvent, useId, useRef, useState } from 'react';
import { Select } from '../presentation/Select';
import { useMissionApplicabilityCopy } from './mission-applicability.copy';
import type {
  ApplicabilityIntent,
  ApplicabilitySnapshot,
} from './mission-applicability-response';
import {
  ApplicabilityPreparation,
  preparedApplicability,
  type PreparedApplicability,
} from './ApplicabilityPreparation';
import {
  applicabilityObservations,
  validApplicabilityStatement,
} from './ApplicabilityProposalForm';

export function ApplicabilityDecisionForm({
  snapshot,
  activity,
  disabled,
  onRecord,
  capture,
}: {
  snapshot: ApplicabilitySnapshot;
  activity: ApplicabilitySnapshot['activities'][number];
  disabled: boolean;
  onRecord: (body: ApplicabilityIntent) => void;
  capture: () => () => boolean;
}) {
  const copy = useMissionApplicabilityCopy(),
    id = useId(),
    basisControl = useRef<HTMLTextAreaElement>(null);
  const [basis, setBasis] = useState(''),
    [outcome, setOutcome] = useState<'APPROVE' | 'REJECT'>('APPROVE'),
    [invalid, setInvalid] = useState(false),
    [prepared, setPrepared] = useState<PreparedApplicability | null>(null);
  const restoration = activity.activeApproval !== null;
  function prepare(event: FormEvent) {
    event.preventDefault();
    const live = capture();
    if (!live() || disabled) return;
    if (!validApplicabilityStatement(basis, 2000)) {
      setInvalid(true);
      if (live()) basisControl.current?.focus();
      return;
    }
    let intent: ApplicabilityIntent;
    if (restoration && activity.activeApproval)
      intent = {
        ...applicabilityObservations(snapshot, activity),
        action: 'RESTORE',
        approvalId: activity.activeApproval.id,
        basis: basis.trim(),
      };
    else if (activity.pendingProposal)
      intent = {
        ...applicabilityObservations(snapshot, activity),
        action: 'DECIDE',
        proposalId: activity.pendingProposal.id,
        outcome,
        basis: basis.trim(),
      };
    else return;
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
        <p>
          {copy('version')}{' '}
          {restoration
            ? activity.activeApproval?.revision
            : activity.pendingProposal?.revision}
        </p>
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
          {copy(restoration ? 'recordRestoration' : 'recordDecision')}
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
    <form onSubmit={prepare} noValidate>
      {!restoration && (
        <>
          <label htmlFor={id + '-decision'}>{copy('outcome')}</label>
          <Select
            id={id + '-decision'}
            value={outcome}
            options={[
              { value: 'APPROVE', label: copy('approve') },
              { value: 'REJECT', label: copy('reject') },
            ]}
            onValueChange={(value) => {
              if (value === 'APPROVE' || value === 'REJECT') setOutcome(value);
            }}
            disabled={disabled}
          />
        </>
      )}
      <label htmlFor={id + '-basis'}>
        {copy(restoration ? 'restorationBasis' : 'decisionBasis')}
      </label>
      <textarea
        ref={basisControl}
        id={id + '-basis'}
        required
        value={basis}
        onChange={(event) => setBasis(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={invalid ? id + '-error' : undefined}
        disabled={disabled}
      />
      {invalid && (
        <p id={id + '-error'} role="alert">
          {copy('invalid')}
        </p>
      )}
      <button type="submit" disabled={disabled}>
        {copy(restoration ? 'reviewRestoration' : 'reviewDecision')}
      </button>
    </form>
  );
}
