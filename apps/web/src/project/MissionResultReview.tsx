import { useEffect, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import type { CopiedPilotTemplatePlan } from './project-template-response';
import {
  readMissionReview,
  readReviewHistory,
  type MissionReviewJudgment,
} from './mission-result-review-response';
import { useMissionReviewCopy } from './mission-result-review.copy';
import { MissionResultReviewForm } from './MissionResultReviewForm';

interface Props {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  plan: CopiedPilotTemplatePlan;
  onOpenTask?: (taskId: string) => void;
}
type Snapshot = ReturnType<typeof readMissionReview>;
type History = Extract<
  NonNullable<ReturnType<typeof readReviewHistory>>,
  { kind: 'available' }
>;
type Load =
  | { kind: 'loading' | 'error' | 'malformed' | 'denied' }
  | { kind: 'ready'; snapshot: Snapshot };

/** Only consumed read captures retire this protected region; Reviewer changes retire its form. */
export function MissionResultReview(props: Props) {
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
    c = actor.activeCompany;
  const key = JSON.stringify([
    session.generation,
    props.projectId,
    props.plan,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    actor.workspacePermissions.includes('client.manage'),
    c?.id,
    c?.projectPermissionAssignmentId,
    c?.projectPermissionSetVersion,
    c?.projectPermissions,
    c?.taskPermissionAssignmentId,
    c?.taskPermissionSetVersion,
    c?.taskPermissions,
    c?.clientPermissionAssignmentId,
    c?.clientPermissionSetVersion,
    c?.clientPermissions,
    c?.projectTemplatePermissionAssignmentId,
    c?.projectTemplatePermissionSetVersion,
    c?.projectTemplatePermissions,
    c?.documentPermissionAssignmentId,
    c?.documentPermissionSetVersion,
    c?.documentPermissions?.includes('document.read'),
    c?.documentPermissions?.includes('document.content.read'),
    c?.documentPermissions?.includes('document.mission_deliverable.access'),
    c?.documentContentReaderAssignmentId,
    c?.documentContentReaderPermissionSetVersion,
    c?.missionDeliverableAccessAssignmentId,
    c?.missionDeliverableAccessPermissionSetVersion,
  ]);
  return <MissionReviewReader key={key} {...props} />;
}
function MissionReviewReader({
  actor,
  identity,
  projectId,
  plan,
  onOpenTask,
}: Props) {
  const copy = useMissionReviewCopy();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [history, setHistory] = useState<History | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [pending, setPending] = useState(false),
    [reload, setReload] = useState(0);
  const [older, setOlder] = useState<number | null>(null);
  const company = actor.activeCompany;
  const companyId = company?.id;
  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        const response = await api.request<unknown>(
          `/projects/${projectId}/mission-result-reviews`,
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
        let snapshot: Snapshot;
        try {
          snapshot = readMissionReview(response.value, { projectId, plan });
        } catch {
          setLoad({ kind: 'malformed' });
          return;
        }
        setLoad({ kind: 'ready', snapshot });
        if (snapshot?.kind !== 'available') {
          setHistory(null);
          return;
        }
        const historyResponse = await api.request<unknown>(
          `/projects/${projectId}/mission-result-reviews/history`,
          { companyContextId: companyId, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (historyResponse.status === 'unauthorized') {
          setLoad({ kind: 'denied' });
          setHistory(null);
          await identity.rejectSession();
          return;
        }
        try {
          if (
            historyResponse.status === 'forbidden' ||
            historyResponse.status === 'notFound'
          ) {
            setLoad({ kind: 'denied' });
            setHistory(null);
            return;
          }
          if (historyResponse.status !== 'ok')
            throw new Error('History unavailable');
          const page = readReviewHistory(historyResponse.value, plan);
          if (!page || page.kind === 'unavailable') {
            setLoad(
              page ? { kind: 'ready', snapshot: page } : { kind: 'error' },
            );
            setHistory(null);
            return;
          }
          setHistory(page);
          setHistoryFailed(false);
        } catch {
          setHistoryFailed(true);
          setHistory(null);
        }
      } catch {
        if (!controller.signal.aborted) setLoad({ kind: 'error' });
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    })();
    return () => controller.abort();
  }, [companyId, identity, projectId, plan, reload]);
  useEffect(() => {
    if (older === null) return;
    const controller = new AbortController();
    setPending(true);
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        const response = await api.request<unknown>(
          `/projects/${projectId}/mission-result-reviews/history?beforeRevision=${older}`,
          { companyContextId: companyId, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (response.status === 'unauthorized') {
          setLoad({ kind: 'denied' });
          setHistory(null);
          await identity.rejectSession();
          return;
        }
        if (response.status !== 'ok') throw new Error('History unavailable');
        const page = readReviewHistory(response.value, plan);
        if (!page || page.kind === 'unavailable') {
          setLoad(page ? { kind: 'ready', snapshot: page } : { kind: 'error' });
          setHistory(null);
          return;
        }
        if (page.batches.some((row) => row.reviewRevision >= older))
          throw new Error('Invalid history cursor');
        setHistory((current) => ({
          ...page,
          batches: [...(current?.batches ?? []), ...page.batches],
        }));
        setHistoryFailed(false);
      } catch {
        if (!controller.signal.aborted) setHistoryFailed(true);
      } finally {
        if (!controller.signal.aborted) {
          setPending(false);
          setOlder(null);
        }
      }
    })();
    return () => controller.abort();
  }, [older, companyId, identity, projectId, plan]);
  const snapshot = load.kind === 'ready' ? load.snapshot : null;
  const reviewerKey = JSON.stringify([
    company?.missionResultReviewPermissions,
    company?.missionResultReviewerAssignmentId,
    company?.missionResultReviewerPermissionSetVersion,
  ]);
  const canWrite =
    actor.active &&
    company?.missionResultReviewerPermissionSetVersion === 'v1' &&
    Boolean(company.missionResultReviewerAssignmentId) &&
    company.missionResultReviewPermissions?.includes(
      'project.mission_result.review',
    ) &&
    company.projectTemplatePermissionSetVersion === 'v2' &&
    company.projectTemplatePermissions?.includes(
      'project.template.pilot.read',
    ) &&
    company.taskPermissions?.includes('task.read') &&
    company.projectPermissions?.includes('project.read');
  return (
    <section
      className="project-template-plan mission-result-review"
      aria-label={copy('title')}
    >
      <h4>{copy('title')}</h4>
      <p>{copy('notice')}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => setReload((n) => n + 1)}
      >
        {copy('reload')}
      </button>
      {pending && <p role="status">{copy('loading')}</p>}
      {load.kind !== 'ready' ? (
        <p role="alert">{copy(load.kind)}</p>
      ) : !snapshot ? (
        <p>{copy('empty')}</p>
      ) : snapshot.kind === 'unavailable' ? (
        <p>{copy('unavailable')}</p>
      ) : (
        <>
          {!snapshot.mutable && <p>{copy('closed')}</p>}
          <ol>
            {snapshot.activities.map((row) => (
              <li key={row.taskId}>
                <h5>
                  {row.key} — {row.title}
                </h5>
                <p>{row.activity}</p>
                <p>{row.intendedResult}</p>
                <p>{row.task.title}</p>
                {row.result.current && <p>{row.result.current.declaration}</p>}
                {row.latest ? (
                  <ReviewJudgment
                    judgment={row.latest}
                    current={row.latest.current}
                  />
                ) : (
                  <p>{copy('none')}</p>
                )}
                {onOpenTask && (
                  <button type="button" onClick={() => onOpenTask(row.taskId)}>
                    {copy('openTask')} — {row.key}
                  </button>
                )}
              </li>
            ))}
          </ol>
          {canWrite && (
            <MissionResultReviewForm
              key={reviewerKey}
              snapshot={snapshot}
              fresh={!pending}
              identity={identity}
              projectId={projectId}
              companyId={companyId}
              onConfirmed={() => setReload((n) => n + 1)}
            />
          )}
          <h5>{copy('history')}</h5>
          {historyFailed && <p role="alert">{copy('historyFailed')}</p>}
          {history?.batches.map((batch) => (
            <article key={batch.id}>
              <p>{batch.reviewRevision}</p>
              {batch.items.map((item) => (
                <ReviewJudgment key={item.id} judgment={item} />
              ))}
            </article>
          ))}
          {history?.hasMore && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setOlder(history.nextBeforeRevision)}
            >
              {copy('older')}
            </button>
          )}
        </>
      )}
    </section>
  );
}
function ReviewJudgment({
  judgment,
  current,
}: {
  judgment: MissionReviewJudgment;
  current?: boolean;
}) {
  const copy = useMissionReviewCopy();
  return (
    <div>
      <p>
        {judgment.observedTask.title} — {copy(judgment.outcome)}
      </p>
      <p>{judgment.basis}</p>
      <p>
        {judgment.actor.displayName} — {judgment.occurredAt}
      </p>
      {current !== undefined && <p>{copy(current ? 'current' : 'stale')}</p>}
      {judgment.evidence.kind === 'EXTERNAL_REPORTED' ? (
        <>
          <p>{copy('EXTERNAL_REPORTED')}</p>
          <p>{judgment.evidence.reference}</p>
          <p>{copy('externalNotice')}</p>
        </>
      ) : (
        <>
          <p>{copy('DECLARED_RESULT')}</p>
          <p>{judgment.evidence.result.declaration}</p>
          <p>
            {judgment.evidence.result.reference.title} —{' '}
            {judgment.evidence.result.reference.versionNumber}
          </p>
        </>
      )}
    </div>
  );
}
