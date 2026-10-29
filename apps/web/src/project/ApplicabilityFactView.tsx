import {
  applicabilityRelation,
  resolveApplicabilityRelation,
  supersedingApplicabilityCorrection,
  type ApplicabilityRelation,
} from './applicability-relations';
import { useMissionApplicabilityCopy } from './mission-applicability.copy';
import type {
  ApplicabilityFact,
  ApplicabilityIntent,
} from './mission-applicability-response';

export function ApplicabilityIntentContent({
  intent,
}: {
  intent: ApplicabilityIntent;
}) {
  const copy = useMissionApplicabilityCopy();
  if (intent.action === 'PROPOSE' || intent.action === 'CORRECT_PROPOSAL')
    return (
      <dl className="applicability-literal">
        <dt>{copy('reason')}</dt>
        <dd>{intent.reason}</dd>
        <dt>{copy('scopeBasis')}</dt>
        <dd>{intent.scopeBasis}</dd>
        <dt>{copy('agreement')}</dt>
        <dd>{copy(intent.agreement.kind)}</dd>
        <dt>
          {copy(
            intent.agreement.kind === 'PARTIES_AGREEMENT_REPORTED'
              ? 'reference'
              : 'agreementBasis',
          )}
        </dt>
        <dd>
          {intent.agreement.kind === 'PARTIES_AGREEMENT_REPORTED'
            ? intent.agreement.reference
            : intent.agreement.basis}
        </dd>
        {intent.action === 'CORRECT_PROPOSAL' && (
          <>
            <dt>{copy('correctionReason')}</dt>
            <dd>{intent.correctionReason}</dd>
          </>
        )}
      </dl>
    );
  return (
    <dl className="applicability-literal">
      <dt>
        {copy(
          intent.action === 'RESTORE' ? 'restorationBasis' : 'decisionBasis',
        )}
      </dt>
      <dd>{intent.basis}</dd>
      {intent.action === 'DECIDE' && (
        <>
          <dt>{copy('outcome')}</dt>
          <dd>{copy(intent.outcome === 'APPROVE' ? 'approve' : 'reject')}</dd>
        </>
      )}
    </dl>
  );
}
export function ApplicabilityFactView({
  fact,
  knownFacts = [],
  onInspect,
}: {
  fact: ApplicabilityFact;
  knownFacts?: readonly ApplicabilityFact[];
  onInspect?: (
    origin: ApplicabilityFact,
    relation: ApplicabilityRelation,
    trigger: HTMLElement,
  ) => void;
}) {
  const copy = useMissionApplicabilityCopy(),
    relation = applicabilityRelation(fact),
    target = relation
      ? resolveApplicabilityRelation({
          origin: fact,
          relation,
          facts: knownFacts,
        })
      : null,
    correction = supersedingApplicabilityCorrection(fact, knownFacts);
  return (
    <article
      className="applicability-fact"
      aria-label={`${copy(fact.kind)} — ${copy('version')} ${fact.revision}`}
    >
      <h6>
        {fact.activityKey} — {copy(fact.kind)} — {copy('version')}{' '}
        {fact.revision}
      </h6>
      <p>
        {fact.actor.displayName} ·{' '}
        <time dateTime={fact.occurredAt}>{fact.occurredAt}</time>
      </p>
      <p className="applicability-literal">{fact.source.title}</p>
      {relation && target && (
        <dl>
          <dt>{copy(relation.kind)}</dt>
          <dd>
            {target.kind === 'known'
              ? `${copy(target.fact.kind)} — ${copy('version')} ${target.fact.revision}`
              : copy(
                  target.kind === 'notLoaded'
                    ? 'relationNotLoaded'
                    : 'relationUnverified',
                )}
            {onInspect && (
              <button
                type="button"
                onClick={(event) =>
                  onInspect(fact, relation, event.currentTarget)
                }
              >
                {copy('inspectRelation')}: {copy(relation.kind)} —{' '}
                {copy('version')} {fact.revision}
              </button>
            )}
          </dd>
        </dl>
      )}
      {correction && (
        <p>
          {copy('supersededBy')} — {copy('version')} {correction.revision}
        </p>
      )}
      <ApplicabilityIntentContent intent={fact.intent} />
    </article>
  );
}
