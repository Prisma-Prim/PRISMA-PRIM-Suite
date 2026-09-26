import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { formatApplicationCount } from '../presentation/number';
import { taskCopy } from '../project/task.copy';
import {
  readCompanyOverdueTasks,
  type CompanyOverdueTasks,
} from './operational-home-response';
import { operationalHomeCopy } from './operational-home.copy';

const copy = operationalHomeCopy.overdue;

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'denied' }
  | { kind: 'ready'; list: CompanyOverdueTasks };

/**
 * The Company overdue-Task list of Operational Dashboard PRD §17.2. It is
 * mounted only when opened and owns its one on-demand read.
 */
export function OverdueTasksPanel({
  company,
  identity,
  headingRef,
  onOpenTask,
  onClose,
}: {
  company: { id: string; displayName: string };
  identity: BrowserIdentity;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onOpenTask?: (task: { projectId: string; taskId: string }) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const pending = useRef<AbortController | undefined>(undefined);

  function read() {
    setLoad({ kind: 'loading' });
    void runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>('/overdue-tasks', {
          companyContextId: company.id,
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
            list: readCompanyOverdueTasks(result.value, company.id),
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
    <section className="operational-home-overdue" aria-labelledby={titleId}>
      <header className="operational-home-overdue-heading">
        <h3 id={titleId} ref={headingRef} tabIndex={-1}>
          {copy.title({ company: company.displayName })}
        </h3>
        <button type="button" aria-label={copy.closeName} onClick={onClose}>
          {copy.close}
        </button>
      </header>
      <OverdueTasks
        load={load}
        company={company.displayName}
        onRetry={read}
        onOpenTask={onOpenTask}
      />
    </section>
  );
}

function OverdueTasks({
  load,
  company,
  onRetry,
  onOpenTask,
}: {
  load: Load;
  company: string;
  onRetry: () => void;
  onOpenTask?: (task: { projectId: string; taskId: string }) => void;
}) {
  switch (load.kind) {
    case 'loading':
      return (
        <p className="operational-home-state" aria-live="polite">
          {copy.loading}
        </p>
      );
    case 'denied':
      return <p className="operational-home-state">{copy.denied}</p>;
    case 'error':
      return (
        <div className="operational-home-state operational-home-state--alert">
          <p role="alert">{copy.error}</p>
          <button type="button" onClick={onRetry}>
            {copy.retry}
          </button>
        </div>
      );
    case 'ready': {
      const { tasks, total } = load.list;
      if (tasks.length === 0)
        return (
          <p className="operational-home-state">{copy.empty({ company })}</p>
        );
      return (
        <>
          {total > tasks.length && (
            <p className="operational-home-overdue-note">
              {copy.truncated({
                shown: formatApplicationCount(tasks.length),
                total: formatApplicationCount(total),
              })}
            </p>
          )}
          <ol
            className="operational-home-overdue-list"
            aria-label={copy.listLabel}
          >
            {tasks.map((task) => (
              <li key={task.id}>
                <div>
                  <h4>{task.title}</h4>
                  <p className="operational-home-overdue-state">
                    <span>{taskCopy.states[task.status]}</span>
                    <span>
                      {copy.overdueBy({
                        days: task.daysOverdue,
                        count: formatApplicationCount(task.daysOverdue),
                      })}
                    </span>
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>{copy.dueDate}</dt>
                    <dd>
                      <time dateTime={task.dueDate}>{task.dueDate}</time>
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.responsible}</dt>
                    <dd>{task.assignee?.displayLabel ?? copy.unassigned}</dd>
                  </div>
                  <div>
                    <dt>{copy.project}</dt>
                    <dd>{task.project.title}</dd>
                  </div>
                  <div>
                    <dt>{copy.client}</dt>
                    <dd>{task.project.clientDisplayName}</dd>
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
        </>
      );
    }
    default: {
      const exhaustive: never = load;
      return exhaustive;
    }
  }
}
