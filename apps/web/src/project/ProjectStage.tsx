import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import {
  useScopedOperation,
  useScopedOperationGroup,
} from '../api/use-scoped-operation';
import { useEffect, useId, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { formatApplicationDateTime } from '../presentation/date-time';
import { formatMessage } from '../localization/messages';
import { useProjectStageCopy } from './project-stage.copy';
import {
  readStageProgress,
  readStageReceipt,
  type StageGate,
  type StageIntent,
  type StageProgress,
} from './project-stage-response';
import { projectTemplateAuthority } from './ProjectTemplate';
import { grantOf, holds } from '../access/company-grants';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  onActivityRecorded?: () => void | Promise<void>;
};
type Read =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; progress: StageProgress | null };
type Command = { body: string; key: string };
type Mutation =
  | { kind: 'idle' }
  | { kind: 'pending' | 'uncertain'; command: Command }
  | { kind: 'conflict' }
  | { kind: 'confirmed' | 'confirmedRefreshFailed' };

/** This owner alone retires stage state; dedicated denial never remounts independent Task work. */
export function ProjectStage(props: Props) {
  const company = props.actor.activeCompany;
  const authority = JSON.stringify([
    projectTemplateAuthority(props.actor),
    props.actor.internalUserId,
    grantOf(company, 'company_director_client_access'),
    props.actor.workspacePermissions,
    grantOf(company, 'company_project_stage_advancer'),
  ]);
  return <StageSection key={`${props.projectId}:${authority}`} {...props} />;
}
function StageSection({
  actor,
  identity,
  projectId,
  onActivityRecorded,
}: Props) {
  const copy = useProjectStageCopy();
  const heading = useId();
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const company = actor.activeCompany;
  const canAdvance = holds(
    company,
    'company_project_stage_advancer',
    'project.stage.advance',
  );
  const companyId = company?.id;
  const path = `/projects/${encodeURIComponent(projectId)}`;
  const operationScope = String(useRequestLifetime(identity, projectId));
  const projectRead = useScopedOperation(operationScope);
  const commands = useScopedOperationGroup(operationScope);
  const observation = useActorObservation(actor);
  const captureRecovery = useAuthorityLifetime(String(observation), identity);
  function retire() {
    projectRead.retire();
    commands.retire();
    setRead({ kind: 'denied' });
    setMutation({ kind: 'idle' });
  }
  async function load(afterConfirmation = false) {
    const signal = projectRead.begin();
    if (!signal) return;
    const recoveryCurrent = captureRecovery();
    if (!afterConfirmation) setRead({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request(`${path}/stage-progress`, {
        companyContextId: companyId,
        signal,
      });
      if (signal.aborted) return;
      if (result.status === 'unauthorized') {
        retire();
        if (recoveryCurrent()) await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        retire();
        return;
      }
      if (result.status !== 'ok') throw new Error('Unavailable');
      setRead({ kind: 'ready', progress: readStageProgress(result.value) });
      if (afterConfirmation) setMutation({ kind: 'confirmed' });
    } catch {
      if (signal.aborted) return;
      if (afterConfirmation) setMutation({ kind: 'confirmedRefreshFailed' });
      else setRead({ kind: 'error' });
    }
  }
  useEffect(() => {
    void load();
  }, [operationScope]);
  async function submit(command: Command) {
    if (commands.isPending()) return;
    const operation = commands.beginLatest();
    if (!operation) return;
    const { signal } = operation;
    const recoveryCurrent = captureRecovery();
    setMutation({ kind: 'pending', command });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request(`${path}/stage-advance`, {
        method: 'POST',
        body: command.body,
        headers: {
          'idempotency-key': command.key,
          'content-type': 'application/json',
        },
        companyContextId: companyId,
      });
      if (signal.aborted) return;
      if (result.status === 'unauthorized') {
        retire();
        if (recoveryCurrent()) await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        retire();
        return;
      }
      if (result.status === 'conflict' || result.status === 'validation') {
        setMutation({ kind: 'conflict' });
        return;
      }
      if (result.status !== 'ok') throw new Error('Unconfirmed');
      readStageReceipt(result.value, projectId);
      setMutation({ kind: 'confirmed' });
      await load(true);
      void Promise.resolve()
        .then(() => {
          if (!signal.aborted) return onActivityRecorded?.();
        })
        .catch(() => undefined);
    } catch {
      if (!signal.aborted) setMutation({ kind: 'uncertain', command });
    } finally {
      operation.release();
    }
  }
  const gateCopy = {
    required_tasks_incomplete: 'incomplete',
    advance_authority_required: 'readonly',
    project_closed: 'closed',
    original_client_inactive: 'clientInactive',
    last_supported_stage: 'last',
    ready: 'ready',
  } as const satisfies Record<StageGate, Parameters<typeof copy>[0]>;
  if (read.kind === 'ready' && read.progress === null) return null;
  const progress = read.kind === 'ready' ? read.progress : null;
  const pending = mutation.kind === 'pending';
  return (
    <section
      className="project-template-plan project-stage"
      aria-labelledby={heading}
    >
      <h4 id={heading}>{copy('title')}</h4>
      {read.kind !== 'ready' ? (
        <>
          <p role={read.kind === 'loading' ? 'status' : 'alert'}>
            {copy(read.kind)}
          </p>
          {read.kind === 'error' && (
            <button type="button" onClick={() => void load()}>
              {copy('reload')}
            </button>
          )}
        </>
      ) : (
        progress && (
          <>
            <p className="project-warning">{copy('warning')}</p>
            <dl>
              <dt>{copy('current')}</dt>
              <dd>{progress.currentStageTitle}</dd>
              <dt>{copy('revision')}</dt>
              <dd>{progress.stageRevision}</dd>
            </dl>
            <h5>{copy('required')}</h5>
            <ul>
              {progress.requiredTasks.map((task) => (
                <li key={task.taskId}>
                  {task.title} — {copy(task.status)}
                </li>
              ))}
            </ul>
            <p>{copy(gateCopy[progress.gate])}</p>
            {progress.nextStage && (
              <button
                type="button"
                disabled={
                  pending ||
                  mutation.kind === 'uncertain' ||
                  mutation.kind === 'conflict' ||
                  mutation.kind === 'confirmed' ||
                  mutation.kind === 'confirmedRefreshFailed' ||
                  !progress.canAdvance ||
                  !canAdvance
                }
                onClick={() => {
                  const intent: StageIntent = {
                    expectedStageKey: progress.currentStageKey,
                    expectedStageRevision: progress.stageRevision,
                    targetStageKey: progress.nextStage?.key ?? '',
                  };
                  void submit({
                    body: JSON.stringify(intent),
                    key: crypto.randomUUID(),
                  });
                }}
              >
                {formatMessage(copy('advance'), {
                  stage: progress.nextStage.title,
                })}
              </button>
            )}
            <button
              type="button"
              disabled={pending || mutation.kind === 'uncertain'}
              onClick={() => {
                if (
                  mutation.kind !== 'confirmed' &&
                  mutation.kind !== 'confirmedRefreshFailed'
                )
                  setMutation({ kind: 'idle' });
                void load(
                  mutation.kind === 'confirmed' ||
                    mutation.kind === 'confirmedRefreshFailed',
                );
              }}
            >
              {copy('reload')}
            </button>
            <h5>{copy('history')}</h5>
            {progress.transitions.length === 0 ? (
              <p>{copy('noHistory')}</p>
            ) : (
              <ol>
                {progress.transitions.map((transition) => (
                  <li key={transition.transitionId}>
                    <p>
                      {formatMessage(copy('transition'), {
                        from: transition.fromStageTitle,
                        to: transition.toStageTitle,
                      })}
                    </p>
                    <p>{transition.actor.displayName}</p>
                    <time dateTime={transition.occurredAt}>
                      {formatApplicationDateTime(transition.occurredAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </>
        )
      )}
      {mutation.kind !== 'idle' && (
        <p
          role={
            mutation.kind === 'uncertain' || mutation.kind === 'conflict'
              ? 'alert'
              : 'status'
          }
        >
          {copy(mutation.kind)}
        </p>
      )}
      {mutation.kind === 'uncertain' && (
        <button type="button" onClick={() => void submit(mutation.command)}>
          {copy('retry')}
        </button>
      )}
    </section>
  );
}
