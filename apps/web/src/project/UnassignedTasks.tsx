import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import { canReadTasks } from './MyTasks';
import { useMyTasksCopy } from './my-tasks-localized.copy';
import { useUnassignedTasksCopy } from './unassigned-tasks.copy';
import {
  readUnassignedTasks,
  type UnassignedTasksPage,
} from './unassigned-tasks-response';
import './unassigned-tasks.css';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onOpenTask?: (target: { projectId: string; taskId: string }) => void;
};
type Load =
  | { kind: 'loading' | 'denied' | 'error' | 'malformed'; offset: number }
  | { kind: 'ready'; page: UnassignedTasksPage };

/** App and the authority key retire this read on navigation or access changes. */
export function UnassignedTasks(props: Props) {
  const { actor } = props;
  const authority = JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    actor.workspacePermissions,
    actor.activeCompany,
  ]);
  return <UnassignedPage key={authority} {...props} />;
}
function UnassignedPage({ actor, identity, onOpenTask }: Props) {
  const message = useUnassignedTasksCopy();
  const taskCopy = useMyTasksCopy();
  const { formatDate } = useInterfaceLocale();
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ kind: 'loading', offset: 0 });
  const pending = useRef<AbortController | undefined>(undefined);
  const companyId = actor.activeCompany?.id;
  function read(offset: number) {
    if (!companyId || !canReadTasks(actor)) {
      pending.current?.abort();
      setLoad({ kind: 'denied', offset });
      return;
    }
    setLoad({ kind: 'loading', offset });
    void runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(`/unassigned-tasks?offset=${offset}`, {
          companyContextId: companyId,
          signal,
        }),
      onResult: async (result, signal) => {
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          if (!signal.aborted) setLoad({ kind: 'denied', offset });
        } else if (result.status === 'forbidden')
          setLoad({ kind: 'denied', offset });
        else if (result.status !== 'ok') setLoad({ kind: 'error', offset });
        else {
          try {
            setLoad({
              kind: 'ready',
              page: readUnassignedTasks(result.value, { companyId, offset }),
            });
          } catch {
            setLoad({ kind: 'malformed', offset });
          }
        }
      },
      onError: () => setLoad({ kind: 'error', offset }),
    });
  }
  useEffect(() => {
    read(0);
    return () => pending.current?.abort();
  }, [identity]);
  const offset = load.kind === 'ready' ? load.page.offset : load.offset;
  function renderLoad() {
    switch (load.kind) {
      case 'loading':
        return (
          <p className="unassigned-tasks-state" role="status">
            {message('loading')}
          </p>
        );
      case 'denied':
        return (
          <p className="unassigned-tasks-state" role="alert">
            {message('denied')}
          </p>
        );
      case 'error':
      case 'malformed':
        return (
          <div className="unassigned-tasks-state">
            <p role="alert">{message(load.kind)}</p>
            <button type="button" onClick={() => read(offset)}>
              {message('retry')}
            </button>
          </div>
        );
      case 'ready':
        return load.page.tasks.length === 0 ? (
          <p className="unassigned-tasks-state" role="status">
            {message(offset === 0 ? 'empty' : 'outOfRange')}
          </p>
        ) : (
          <ol className="unassigned-tasks-list" aria-label={message('list')}>
            {load.page.tasks.map((task) => (
              <li key={task.id}>
                <div className="unassigned-task-title">
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
                    className="unassigned-task-open"
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
      id="unassigned-tasks"
      tabIndex={-1}
      className="unassigned-tasks"
      aria-labelledby={titleId}
    >
      <header className="unassigned-tasks-heading">
        <div>
          <h2 id={titleId}>{message('title')}</h2>
          <p className="unassigned-tasks-company">
            {actor.activeCompany?.displayName}
          </p>
        </div>
        <button
          type="button"
          className="unassigned-refresh"
          onClick={() => read(0)}
        >
          <RefreshCw aria-hidden="true" />
          {message('refresh')}
        </button>
      </header>
      <p className="unassigned-tasks-note">{message('note')}</p>
      {renderLoad()}
      <div className="unassigned-tasks-pagination">
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
