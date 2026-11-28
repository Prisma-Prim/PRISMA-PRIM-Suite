import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperation } from '../api/use-scoped-operation';
import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useLayoutEffect, useId, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import { canReadTasks } from './MyTasks';
import { useMyTasksCopy } from './my-tasks-localized.copy';
import { useUnassignedTasksCopy } from './unassigned-tasks.copy';
import { readUnassignedTasks } from './unassigned-tasks-response';
import './task-discovery.css';
import { useBlockedTasksCopy } from './blocked-tasks.copy';
import { readBlockedTasks } from './blocked-tasks-response';
import { TaskDeclarationFacts } from './TaskPresentation';
import { useProjectTaskCopy } from './task.copy';

export type TaskDiscoveryProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onOpenTask?: (target: { projectId: string; taskId: string }) => void;
};
type Props = TaskDiscoveryProps & { kind: TaskDiscoveryKind };
type Page =
  ReturnType<typeof readUnassignedTasks> | ReturnType<typeof readBlockedTasks>;
export type TaskDiscoveryLoad =
  | { kind: 'loading' | 'denied' | 'error' | 'malformed'; offset: number }
  | { kind: 'ready'; page: Page };

export type TaskDiscoveryKind = 'unassigned' | 'blocked';
/** App and this authority key retire the read on navigation or access changes. */
export function taskDiscoveryAuthority(
  kind: TaskDiscoveryKind,
  actor: ActorContext,
): string {
  return JSON.stringify([
    kind,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    actor.workspacePermissions,
    actor.activeCompany,
  ]);
}
export function TaskDiscovery(props: Props) {
  return (
    <DiscoveryPage
      key={taskDiscoveryAuthority(props.kind, props.actor)}
      {...props}
    />
  );
}
/**
 * One page of 25 unassigned or blocked Tasks of the active Company, read on
 * mount and on demand; the latest read supersedes earlier ones. Both
 * interfaces present it.
 */
export function useTaskDiscovery({
  actor,
  identity,
  kind,
}: Pick<Props, 'actor' | 'identity' | 'kind'>) {
  const [load, setLoad] = useState<TaskDiscoveryLoad>({
    kind: 'loading',
    offset: 0,
  });
  const operationScope = String(useRequestLifetime(identity, 'tasks'));
  const latest = useScopedOperation(operationScope);
  const observation = useActorObservation(actor);
  const captureRecovery = useAuthorityLifetime(String(observation), identity);
  const companyId = actor.activeCompany?.id;
  function read(offset: number) {
    if (!companyId || !canReadTasks(actor)) {
      latest.retire();
      setLoad({ kind: 'denied', offset });
      return;
    }
    const requestSignal = latest.begin();
    if (!requestSignal) return;
    const recoveryCurrent = captureRecovery();
    setLoad({ kind: 'loading', offset });
    void runLatestAuthenticatedRequest({
      signal: requestSignal,
      identity,
      execute: (api, signal) =>
        api.request(`/${kind}-tasks?offset=${offset}`, {
          companyContextId: companyId,
          signal,
        }),
      onResult: async (result, signal) => {
        if (result.status === 'unauthorized') {
          if (recoveryCurrent()) await identity.rejectSession();
          if (!signal.aborted) setLoad({ kind: 'denied', offset });
        } else if (result.status === 'forbidden')
          setLoad({ kind: 'denied', offset });
        else if (result.status !== 'ok') setLoad({ kind: 'error', offset });
        else {
          try {
            setLoad({
              kind: 'ready',
              page: (kind === 'blocked'
                ? readBlockedTasks
                : readUnassignedTasks)(result.value, { companyId, offset }),
            });
          } catch {
            setLoad({ kind: 'malformed', offset });
          }
        }
      },
      onError: () => setLoad({ kind: 'error', offset }),
    });
  }
  useLayoutEffect(() => {
    read(0);
  }, [operationScope]);
  const offset = load.kind === 'ready' ? load.page.offset : load.offset;
  return { load, offset, read };
}
function DiscoveryPage({ actor, identity, onOpenTask, kind }: Props) {
  const unassignedMessage = useUnassignedTasksCopy(),
    blockedMessage = useBlockedTasksCopy();
  const message = kind === 'blocked' ? blockedMessage : unassignedMessage;
  const nativeCopy = useProjectTaskCopy();
  const taskCopy = useMyTasksCopy();
  const { formatDate } = useInterfaceLocale();
  const titleId = useId();
  const { load, offset, read } = useTaskDiscovery({ actor, identity, kind });
  function renderLoad() {
    switch (load.kind) {
      case 'loading':
        return (
          <p className="task-discovery-state" role="status">
            {message('loading')}
          </p>
        );
      case 'denied':
        return (
          <p className="task-discovery-state" role="alert">
            {message('denied')}
          </p>
        );
      case 'error':
      case 'malformed':
        return (
          <div className="task-discovery-state">
            <p role="alert">{message(load.kind)}</p>
            <button type="button" onClick={() => read(offset)}>
              {message('retry')}
            </button>
          </div>
        );
      case 'ready':
        return load.page.tasks.length === 0 ? (
          <p className="task-discovery-state" role="status">
            {message(offset === 0 ? 'empty' : 'outOfRange')}
          </p>
        ) : (
          <ol className="task-discovery-list" aria-label={message('list')}>
            {load.page.tasks.map((task) => (
              <li key={task.id}>
                <div className="task-discovery-title">
                  <h3>{task.title}</h3>
                  <p>{taskCopy.states[task.status]}</p>
                </div>
                <dl>
                  <div>
                    <dt>{taskCopy.project}</dt>
                    <dd>{task.project.title}</dd>
                  </div>
                  <div>
                    <dt>{taskCopy.client}</dt>
                    <dd>{task.project.clientDisplayName}</dd>
                  </div>
                  {kind === 'blocked' && (
                    <div>
                      <dt>{nativeCopy.assignee}</dt>
                      <dd>
                        {task.assignee?.displayLabel ?? nativeCopy.unassigned}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>{taskCopy.dueDate}</dt>
                    <dd>
                      {task.dueDate === null ? (
                        taskCopy.noDate
                      ) : (
                        <time dateTime={task.dueDate}>
                          {formatDate(task.dueDate)}
                        </time>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{taskCopy.priority}</dt>
                    <dd>{taskCopy.priorities[task.priority]}</dd>
                  </div>
                </dl>
                {onOpenTask && (
                  <button
                    type="button"
                    className="task-discovery-open"
                    aria-label={taskCopy.openTask({
                      task: task.title,
                      project: task.project.title,
                      client: task.project.clientDisplayName,
                    })}
                    onClick={() =>
                      onOpenTask({ projectId: task.projectId, taskId: task.id })
                    }
                  >
                    {taskCopy.open}
                    <ArrowRight aria-hidden="true" />
                  </button>
                )}
                {kind === 'blocked' && task.status === 'blocked' && (
                  <div className="task-discovery-blockage">
                    <TaskDeclarationFacts
                      kind="blocked"
                      declaration={task.blockage}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        );
      default: {
        const exhaustive: never = load;
        return exhaustive;
      }
    }
  }
  return (
    <section
      id={`${kind}-tasks`}
      tabIndex={-1}
      className={`task-discovery ${kind}-tasks`}
      aria-labelledby={titleId}
    >
      <header className="task-discovery-heading">
        <div>
          <h2 id={titleId}>{message('title')}</h2>
          <p className="task-discovery-company">
            {actor.activeCompany?.displayName}
          </p>
        </div>
        <button
          type="button"
          className="task-discovery-refresh"
          onClick={() => read(0)}
        >
          <RefreshCw aria-hidden="true" />
          {message('refresh')}
        </button>
      </header>
      <p className="task-discovery-note">{message('note')}</p>
      {renderLoad()}
      <div className="task-discovery-pagination">
        <button
          type="button"
          disabled={
            offset === 0 || load.kind === 'loading' || load.kind === 'denied'
          }
          onClick={() => read(Math.max(0, offset - 25))}
        >
          <ChevronLeft aria-hidden="true" />
          {message('previous')}
        </button>
        <button
          type="button"
          disabled={
            load.kind !== 'ready' ||
            !load.page.hasNextPage ||
            offset > Number.MAX_SAFE_INTEGER - 25
          }
          onClick={() => read(offset + 25)}
        >
          {message('next')}
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
