import { useEffect, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import type { CopiedPilotTemplatePlan } from './project-template-response';
import { useProjectTemplateCopy } from './project-template.copy';
import { useProjectTaskCopy } from './task.copy';
import { useMissionReadinessCopy } from './mission-readiness.copy';
import {
  missionState,
  readMissionReadiness,
  type MissionReadinessSnapshot,
  type MissionResult,
} from './mission-readiness-response';

interface Props {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  plan: CopiedPilotTemplatePlan;
  onOpenTask?: (taskId: string) => void;
}
type Load =
  | { kind: 'loading' | 'error' | 'malformed' | 'denied' }
  | {
      kind: 'ready';
      snapshot: MissionReadinessSnapshot | null;
      evidenceGeneration: number;
    };

/** Document captures retire only this diagnostic projection, never sibling source/Task owners. */
export function MissionReadiness(props: Props) {
  const [session, setSession] = useState({
    identity: props.identity,
    generation: 0,
  });
  if (session.identity !== props.identity)
    setSession({
      identity: props.identity,
      generation: session.generation + 1,
    });
  const { actor } = props,
    company = actor.activeCompany;
  const key = JSON.stringify([
    session.generation,
    props.projectId,
    props.plan,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    actor.workspacePermissions.includes('client.manage'),
    company?.id,
    company?.projectPermissionAssignmentId,
    company?.projectPermissionSetVersion,
    company?.projectPermissions,
    company?.taskPermissionAssignmentId,
    company?.taskPermissionSetVersion,
    company?.taskPermissions,
    company?.clientPermissionAssignmentId,
    company?.clientPermissionSetVersion,
    company?.clientPermissions,
    company?.projectTemplatePermissionAssignmentId,
    company?.projectTemplatePermissionSetVersion,
    company?.projectTemplatePermissions,
  ]);
  return <MissionReadinessOwner key={key} {...props} />;
}

function MissionReadinessOwner({
  actor,
  identity,
  projectId,
  plan,
  onOpenTask,
}: Props) {
  const copy = useMissionReadinessCopy(),
    planCopy = useProjectTemplateCopy(),
    taskCopy = useProjectTaskCopy();
  const company = actor.activeCompany;
  const evidenceKey = JSON.stringify([
    company?.documentPermissionAssignmentId,
    company?.documentPermissionSetVersion,
    company?.documentPermissions?.includes('document.read'),
    company?.documentPermissions?.includes('document.content.read'),
    company?.documentPermissions?.includes(
      'document.mission_deliverable.access',
    ),
    company?.documentContentReaderAssignmentId,
    company?.documentContentReaderPermissionSetVersion,
    company?.missionDeliverableAccessAssignmentId,
    company?.missionDeliverableAccessPermissionSetVersion,
  ]);
  const [evidence, setEvidence] = useState({ key: evidenceKey, generation: 0 });
  if (evidence.key !== evidenceKey)
    setEvidence({ key: evidenceKey, generation: evidence.generation + 1 });
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [reload, setReload] = useState(0),
    [pending, setPending] = useState(false);
  const companyId = company?.id;
  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        const response = await api.request<unknown>(
          `/projects/${projectId}/mission-readiness`,
          { companyContextId: companyId, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (response.status === 'unauthorized') {
          setLoad({ kind: 'denied' });
          await identity.rejectSession();
          return;
        }
        if (response.status === 'forbidden' || response.status === 'notFound') {
          setLoad({ kind: 'denied' });
          return;
        }
        if (response.status !== 'ok') {
          setLoad({ kind: 'error' });
          return;
        }
        try {
          setLoad({
            kind: 'ready',
            snapshot: readMissionReadiness(response.value, { projectId, plan }),
            evidenceGeneration: evidence.generation,
          });
        } catch {
          setLoad({ kind: 'malformed' });
        }
      } catch {
        if (!controller.signal.aborted) setLoad({ kind: 'error' });
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    })();
    return () => controller.abort();
  }, [companyId, identity, projectId, plan, evidence.generation, reload]);
  const snapshot = load.kind === 'ready' ? load.snapshot : null;
  return (
    <section
      className="project-template-plan mission-readiness"
      aria-label={copy('title')}
    >
      <h4>{copy('title')}</h4>
      <p>{copy('notice')}</p>
      <p className="project-warning">{copy('clarification')}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => setReload((value) => value + 1)}
      >
        {copy('reload')}
      </button>
      {pending && <p role="status">{copy('loading')}</p>}
      {load.kind !== 'ready' ? (
        <p role={load.kind === 'loading' ? 'status' : 'alert'}>
          {copy(load.kind)}
        </p>
      ) : snapshot === null ? (
        <p>{copy('empty')}</p>
      ) : (
        <>
          {(snapshot.projectStatus === 'completed' ||
            snapshot.projectStatus === 'cancelled') && <p>{copy('history')}</p>}
          <ol>
            {snapshot.activities.map((row) => {
              const result: MissionResult =
                evidence.key === evidenceKey &&
                load.evidenceGeneration === evidence.generation
                  ? row.result
                  : { kind: 'unavailable' };
              return (
                <li key={row.taskId}>
                  <h5>
                    {row.key} — {row.title}
                  </h5>
                  <p>{row.activity}</p>
                  <p>
                    <strong>{planCopy('intendedResult')}: </strong>
                    <span>{row.intendedResult}</span>
                  </p>
                  <p>
                    {row.task.title} — {taskCopy.states[row.task.status]}
                  </p>
                  <p>{copy(missionState(row.task.status, result))}</p>
                  {result.kind === 'unavailable' ? (
                    <p>{copy('unavailable')}</p>
                  ) : result.current === null ? (
                    <p>{copy('notRecorded')}</p>
                  ) : (
                    <>
                      <p>{copy('recorded')}</p>
                      <p>{result.current.declaration}</p>
                      <p>
                        {result.current.reference.title} —{' '}
                        {planCopy('sourceVersion')}{' '}
                        {result.current.reference.versionNumber}
                      </p>
                    </>
                  )}
                  {onOpenTask && (
                    <button
                      type="button"
                      onClick={() => onOpenTask(row.taskId)}
                    >
                      {copy('openTask')} — {row.key}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
