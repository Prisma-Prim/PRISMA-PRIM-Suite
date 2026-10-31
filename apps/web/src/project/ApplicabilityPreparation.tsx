import type {
  ApplicabilityIntent,
  ApplicabilitySnapshot,
} from './mission-applicability-response';
import { ApplicabilityIntentContent } from './ApplicabilityFactView';
import { useMissionApplicabilityCopy } from './mission-applicability.copy';
import { useProjectTaskCopy } from './task.copy';
import { ProjectStatusLabel } from './ProjectLifecycle';

/** Capture the named observations when preparing, before a later read can replace them. */
export function preparedApplicability(input: {
  intent: ApplicabilityIntent;
  snapshot: ApplicabilitySnapshot;
  activity: ApplicabilitySnapshot['activities'][number];
}) {
  return {
    intent: input.intent,
    task: input.activity.task,
    result: input.activity.result.current,
    projectStatus: input.snapshot.projectStatus,
  };
}
export type PreparedApplicability = ReturnType<typeof preparedApplicability>;

export function ApplicabilityPreparation({
  prepared,
}: {
  prepared: PreparedApplicability;
}) {
  const copy = useMissionApplicabilityCopy(),
    taskCopy = useProjectTaskCopy(),
    intent = prepared.intent;
  return (
    <>
      <ApplicabilityIntentContent intent={intent} />
      <section aria-label={copy('observations')}>
        <h6>{copy('observations')}</h6>
        <dl className="applicability-literal">
          <dt>{copy('applicabilityObservation')}</dt>
          <dd>{intent.expectedApplicabilityRevision}</dd>
          <dt>{copy('taskObservation')}</dt>
          <dd>
            {prepared.task.title} · {taskCopy.states[prepared.task.status]} ·{' '}
            {copy('version')} {intent.expectedTaskVersion}
          </dd>
          <dt>{copy('resultObservation')}</dt>
          <dd>
            {prepared.result
              ? prepared.result.reference.title
              : copy('noObservedResult')}{' '}
            · {copy('version')} {intent.expectedResultRevision}
          </dd>
          <dt>{copy('projectObservation')}</dt>
          <dd>
            <ProjectStatusLabel status={prepared.projectStatus} /> ·{' '}
            {copy('version')} {intent.expectedLifecycleRevision}
          </dd>
        </dl>
      </section>
    </>
  );
}
