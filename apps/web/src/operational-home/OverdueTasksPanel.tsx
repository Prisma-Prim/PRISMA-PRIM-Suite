import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  readCompanyOverdueTasks,
  type CompanyOverdueTasks,
} from './operational-home-response';
import { useOperationalHomeCopy } from './operational-home-localized.copy';

type Load =
  | { kind: 'loading'; offset: number }
  | { kind: 'error'; offset: number }
  | { kind: 'denied'; offset: number }
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
  const copy = useOperationalHomeCopy().overdue;
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ kind: 'loading', offset: 0 });
  const pending = useRef<AbortController | undefined>(undefined);

  function read(offset: number) {
    setLoad({ kind: 'loading', offset });
    void runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(`/overdue-tasks?offset=${offset}`, {
          companyContextId: company.id,
          signal,
        }),
      onResult: async (result, signal) => {
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          if (!signal.aborted) setLoad({ kind: 'denied', offset });
        } else if (result.status === 'forbidden')
          setLoad({ kind: 'denied', offset });
        else if (result.status !== 'ok') setLoad({ kind: 'error', offset });
        else
          setLoad({
            kind: 'ready',
            list: readCompanyOverdueTasks(result.value, {
              companyId: company.id,
              offset,
            }),
          });
      },
      onError: () => setLoad({ kind: 'error', offset }),
    });
  }
  useEffect(() => {
    read(0);
    return () => pending.current?.abort();
  }, [identity, company.id]);
  const offset = load.kind === 'ready' ? load.list.offset : load.offset;
  const busy = load.kind === 'loading';
  const unavailablePage =
    load.kind === 'ready' &&
    load.list.total > 0 &&
    load.list.tasks.length === 0;

  return (
    <section
      className="operational-home-overdue"
      aria-labelledby={titleId}
      aria-busy={busy}
    >
      <header className="operational-home-overdue-heading">
        <h3 id={titleId} ref={headingRef} tabIndex={-1}>
          {copy.title({ company: company.displayName })}
        </h3>
        <button type="button" aria-label={copy.closeName} onClick={onClose}>
          <X aria-hidden="true" />
          {copy.close}
        </button>
      </header>
      <OverdueTasks
        load={load}
        company={company.displayName}
        onRetry={() => read(offset)}
        onOpenTask={onOpenTask}
      />
      {load.kind !== 'denied' && (
        <footer className="operational-home-overdue-pagination">
          <button
            type="button"
            disabled={busy || offset === 0}
            onClick={() => read(Math.max(0, offset - 25))}
          >
            <ChevronLeft aria-hidden="true" />
            {copy.previous}
          </button>
          <button
            type="button"
            className="operational-home-overdue-pagination-next"
            disabled={
              load.kind !== 'ready' ||
              offset + load.list.tasks.length >= load.list.total
            }
            onClick={() => read(offset + 25)}
          >
            {copy.next}
            <ChevronRight aria-hidden="true" />
          </button>
          <button type="button" onClick={() => read(0)}>
            <RefreshCw aria-hidden="true" />
            {unavailablePage ? copy.restart : copy.refresh}
          </button>
        </footer>
      )}
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
  const localizedCopy = useOperationalHomeCopy();
  const copy = localizedCopy.overdue;
  const { formatDate, formatNumber } = useInterfaceLocale();
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
          <p
            role="status"
            className={
              total === 0
                ? 'operational-home-state'
                : 'operational-home-state operational-home-state--changed'
            }
          >
            {total === 0
              ? copy.empty({ company })
              : copy.outOfRange({ total: formatNumber(total) })}
          </p>
        );
      return (
        <>
          <p className="operational-home-overdue-note" role="status">
            {copy.page({
              first: formatNumber(load.list.offset + 1),
              last: formatNumber(load.list.offset + tasks.length),
              total: formatNumber(total),
            })}
          </p>
          <ol
            className="operational-home-overdue-list"
            aria-label={copy.listLabel}
            start={load.list.offset + 1}
          >
            {tasks.map((task) => (
              <li key={task.id}>
                <div>
                  <h4>{task.title}</h4>
                  <p className="operational-home-overdue-state">
                    <span>{localizedCopy.states[task.status]}</span>
                    <span>
                      {copy.overdueBy({
                        days: task.daysOverdue,
                        count: formatNumber(task.daysOverdue),
                      })}
                    </span>
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>{copy.dueDate}</dt>
                    <dd>
                      <time dateTime={task.dueDate}>
                        {formatDate(task.dueDate)}
                      </time>
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
