import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { useMyTasksCopy } from '../project/my-tasks-localized.copy';
import {
  readUpcomingDeadlines,
  type UpcomingDeadlinesPage,
} from './upcoming-deadlines-response';
import { useUpcomingDeadlinesCopy } from './upcoming-deadlines.copy';

type Props = {
  company: { id: string; displayName: string };
  workspaceMembershipId: string;
  identity: BrowserIdentity;
  onOpenTask?: (task: { projectId: string; taskId: string }) => void;
};
type Load =
  | { kind: 'loading'; offset: number }
  | { kind: 'error'; offset: number }
  | { kind: 'denied'; offset: number }
  | { kind: 'ready'; list: UpcomingDeadlinesPage };

/** Home-local disclosure. App's existing authority key owns its lifetime. */
export function UpcomingDeadlines(props: Props) {
  const message = useUpcomingDeadlinesCopy();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const panelId = useId();
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);
  return (
    <section className="operational-home-upcoming" aria-labelledby={titleId}>
      <header className="operational-home-upcoming-intro">
        <div>
          <h3 id={titleId}>
            <CalendarDays aria-hidden="true" />
            {message('title')}
          </h3>
          <p>{message('definition')}</p>
        </div>
        <button
          type="button"
          ref={trigger}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => {
            if (open) heading.current?.focus();
            else setOpen(true);
          }}
        >
          {message('open')}
        </button>
      </header>
      {open && (
        <UpcomingPanel
          {...props}
          panelId={panelId}
          headingRef={heading}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </section>
  );
}

function UpcomingPanel({
  company,
  workspaceMembershipId,
  identity,
  onOpenTask,
  headingRef,
  panelId,
  onClose,
}: Props & {
  headingRef: RefObject<HTMLHeadingElement | null>;
  panelId: string;
  onClose: () => void;
}) {
  const message = useUpcomingDeadlinesCopy();
  const taskCopy = useMyTasksCopy();
  const { formatDate, formatNumber } = useInterfaceLocale();
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ kind: 'loading', offset: 0 });
  const pending = useRef<AbortController | undefined>(undefined);
  const range = useRef<string | undefined>(undefined);
  function read(offset: number) {
    setLoad({ kind: 'loading', offset });
    void runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(`/due-soon-tasks?offset=${offset}`, {
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
        else {
          const list = readUpcomingDeadlines(result.value, {
            companyId: company.id,
            workspaceMembershipId,
            offset,
          });
          if (
            range.current !== undefined &&
            range.current !== list.today &&
            offset !== 0
          ) {
            // Retire the new day's nonzero page; restart before exposing rows/counts.
            range.current = list.today;
            read(0);
            return;
          }
          range.current = list.today;
          setLoad({ kind: 'ready', list });
        }
      },
      onError: () => setLoad({ kind: 'error', offset }),
    });
  }
  useEffect(() => {
    read(0);
    return () => pending.current?.abort();
  }, [identity]);
  const offset = load.kind === 'ready' ? load.list.offset : load.offset;
  const busy = load.kind === 'loading';
  function renderBody() {
    switch (load.kind) {
      case 'loading':
        return (
          <p className="operational-home-state" role="status">
            {message('loading')}
          </p>
        );
      case 'denied':
        return <p className="operational-home-state">{message('denied')}</p>;
      case 'error':
        return (
          <div className="operational-home-state operational-home-state--alert">
            <p role="alert">{message('error')}</p>
            <button type="button" onClick={() => read(offset)}>
              {message('retry')}
            </button>
          </div>
        );
      case 'ready':
        return (
          <>
            <p className="operational-home-upcoming-range">
              {formatMessage(message('range'), {
                company: company.displayName,
                today: formatDate(load.list.today),
                throughDate: formatDate(load.list.throughDate),
                total: formatNumber(load.list.total),
              })}
            </p>
            {load.list.tasks.length === 0 ? (
              <p className="operational-home-state">
                {message(
                  load.list.total === 0 && offset === 0
                    ? 'empty'
                    : 'outOfRange',
                )}
              </p>
            ) : (
              <>
                <p className="operational-home-upcoming-page" role="status">
                  {formatMessage(message('page'), {
                    first: formatNumber(offset + 1),
                    last: formatNumber(offset + load.list.tasks.length),
                    total: formatNumber(load.list.total),
                  })}
                </p>
                <ol
                  className="operational-home-overdue-list"
                  aria-label={message('list')}
                  start={offset + 1}
                >
                  {load.list.tasks.map((task) => (
                    <li key={task.id}>
                      <div>
                        <h5>{task.title}</h5>
                        <p className="operational-home-overdue-state">
                          <span>{taskCopy.states[task.status]}</span>
                          <span>
                            {taskCopy.priority}:{' '}
                            {taskCopy.priorities[task.priority]}
                          </span>
                        </p>
                      </div>
                      <dl>
                        <div>
                          <dt>{taskCopy.dueDate}</dt>
                          <dd>
                            <time dateTime={task.dueDate}>
                              {formatDate(task.dueDate)}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt>{taskCopy.project}</dt>
                          <dd>{task.project.title}</dd>
                        </div>
                        <div>
                          <dt>{taskCopy.client}</dt>
                          <dd>{task.project.clientDisplayName}</dd>
                        </div>
                      </dl>
                      {onOpenTask && (
                        <button
                          type="button"
                          aria-label={taskCopy.openTask({
                            task: task.title,
                            project: task.project.title,
                            client: task.project.clientDisplayName,
                          })}
                          onClick={() =>
                            onOpenTask({
                              projectId: task.projectId,
                              taskId: task.id,
                            })
                          }
                        >
                          {taskCopy.open}
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        );
      default: {
        const exhaustive: never = load;
        return exhaustive;
      }
    }
  }
  return (
    <section
      id={panelId}
      className="operational-home-upcoming-panel"
      aria-labelledby={titleId}
      aria-busy={busy}
    >
      <header className="operational-home-overdue-heading">
        <h4 id={titleId} ref={headingRef} tabIndex={-1}>
          {message('title')} — {company.displayName}
        </h4>
        <button type="button" onClick={onClose}>
          <X aria-hidden="true" />
          {message('close')}
        </button>
      </header>
      {renderBody()}
      {load.kind !== 'denied' && (
        <footer className="operational-home-upcoming-pagination">
          <button
            type="button"
            disabled={busy || offset === 0}
            onClick={() => read(Math.max(0, offset - 25))}
          >
            <ChevronLeft aria-hidden="true" />
            {message('previous')}
          </button>
          <button
            type="button"
            disabled={
              load.kind !== 'ready' ||
              offset + load.list.tasks.length >= load.list.total
            }
            onClick={() => read(offset + 25)}
          >
            {message('next')}
            <ChevronRight aria-hidden="true" />
          </button>
          <button type="button" onClick={() => read(0)}>
            <RefreshCw aria-hidden="true" />
            {message('refresh')}
          </button>
        </footer>
      )}
    </section>
  );
}
