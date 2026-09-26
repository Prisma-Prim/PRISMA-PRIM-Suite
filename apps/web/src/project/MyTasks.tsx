import { useContext, useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { readAssignedTasks, type AssignedTask } from './task-response';
import { taskCopy } from './task.copy';
import './my-tasks.css';

const copy = taskCopy.myTasks;

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  /** Opens this assigned Task in its Project; rows offer Open only when supplied. */
  onOpenTask?: (task: { projectId: string; taskId: string }) => void;
};
type Load =
  | { kind: 'loading' | 'denied' | 'error' }
  | { kind: 'ready'; tasks: AssignedTask[] };

/** The delivered Task-read predicate: captured Company Task Manager v1 plus Project and Client read. */
export function canReadTasks(actor: ActorContext): boolean {
  const company = actor.activeCompany;
  return (
    actor.active &&
    company?.taskPermissionSetVersion === 'v1' &&
    !!company.taskPermissionAssignmentId &&
    company.taskPermissions?.includes('task.read') === true &&
    company.projectPermissions?.includes('project.read') === true &&
    (actor.workspacePermissions.includes('client.manage') ||
      company.clientPermissions?.includes('client.read') === true)
  );
}

export function MyTasks(props: Props) {
  const { actor } = props;
  // Any authority change remounts the list, dropping its pending reply and rows.
  const authority = JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    actor.workspacePermissions,
    actor.activeCompany,
  ]);
  return <AssignedTasks key={authority} {...props} />;
}

function AssignedTasks({ actor, identity, onOpenTask }: Props) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const pending = useRef<AbortController | undefined>(undefined);
  const companyId = actor.activeCompany?.id;
  const readable = canReadTasks(actor);

  // The latest read supersedes any earlier read still in flight.
  function read() {
    if (!readable || !companyId) {
      pending.current?.abort();
      setLoad({ kind: 'denied' });
      return;
    }
    setLoad({ kind: 'loading' });
    void runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>('/assigned-tasks', {
          companyContextId: companyId,
          signal,
        }),
      onResult: async (result, signal) => {
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          if (!signal.aborted) setLoad({ kind: 'denied' });
        } else if (result.status === 'forbidden') setLoad({ kind: 'denied' });
        else if (result.status !== 'ok') setLoad({ kind: 'error' });
        else
          setLoad({
            kind: 'ready',
            tasks: readAssignedTasks(result.value, {
              companyId,
              workspaceMembershipId: actor.workspaceMembershipId,
            }),
          });
      },
      onError: () => setLoad({ kind: 'error' }),
    });
  }
  useEffect(() => {
    read();
    return () => pending.current?.abort();
  }, [identity]);

  return (
    <section
      id="my-tasks"
      tabIndex={-1}
      className={`my-tasks${isPrisme ? ' my-tasks--prisme' : ''}`}
      aria-labelledby={titleId}
    >
      <header className="my-tasks-heading">
        <div>
          <h2 id={titleId}>{copy.title}</h2>
          <p>{copy.note}</p>
        </div>
        <button type="button" onClick={read}>
          {copy.refresh}
        </button>
      </header>
      {load.kind === 'loading' && (
        <p className="my-tasks-state" role="status">
          {copy.loading}
        </p>
      )}
      {load.kind === 'denied' && (
        <p className="my-tasks-state my-tasks-state--alert" role="alert">
          {copy.denied}
        </p>
      )}
      {load.kind === 'error' && (
        <div className="my-tasks-state my-tasks-state--alert">
          <p role="alert">{copy.error}</p>
          <button type="button" onClick={read}>
            {copy.retry}
          </button>
        </div>
      )}
      {load.kind === 'ready' && load.tasks.length === 0 && (
        <p className="my-tasks-state">{copy.empty}</p>
      )}
      {load.kind === 'ready' && load.tasks.length > 0 && (
        <ol className="my-tasks-list" aria-label={copy.listLabel}>
          {load.tasks.map((task) => (
            <li key={task.id}>
              <div>
                <h3>{task.title}</h3>
                <p className="my-tasks-status">
                  {taskCopy.states[task.status]}
                </p>
              </div>
              <dl>
                <div>
                  <dt>{copy.project}</dt>
                  <dd>{task.project.title}</dd>
                </div>
                <div>
                  <dt>{copy.client}</dt>
                  <dd>{task.project.clientDisplayName}</dd>
                </div>
                <div>
                  <dt>{taskCopy.dueDate}</dt>
                  <dd>
                    {task.dueDate === null ? (
                      taskCopy.noDate
                    ) : (
                      <time dateTime={task.dueDate}>{task.dueDate}</time>
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
                  aria-label={copy.openTask({
                    task: task.title,
                    project: task.project.title,
                    client: task.project.clientDisplayName,
                  })}
                  onClick={() =>
                    onOpenTask({ projectId: task.projectId, taskId: task.id })
                  }
                >
                  {copy.open}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
