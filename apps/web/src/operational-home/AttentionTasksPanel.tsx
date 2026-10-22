import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { AttentionTaskList } from './AttentionTaskList';
import { useAttentionTasksCopy } from './attention-tasks.copy';
import {
  readAttentionTasks,
  type AttentionTasksPage,
} from './attention-tasks-response';

type Load =
  | { kind: 'loading'; offset: number }
  | { kind: 'error'; offset: number }
  | { kind: 'denied'; offset: number }
  | { kind: 'ready'; page: AttentionTasksPage };

/** App's existing Company/authority key and this disclosure own its read lifetime. */
export function AttentionTasksPanel({
  company,
  workspaceMembershipId,
  identity,
  panelId,
  headingRef,
  onClose,
  onOpenTask,
}: {
  company: { id: string; displayName: string };
  workspaceMembershipId: string;
  identity: BrowserIdentity;
  panelId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onOpenTask?: (task: { projectId: string; taskId: string }) => void;
}) {
  const message = useAttentionTasksCopy();
  const { formatDate, formatNumber } = useInterfaceLocale();
  const titleId = useId();
  const pending = useRef<AbortController | undefined>(undefined);
  const today = useRef<string | undefined>(undefined);
  const [load, setLoad] = useState<Load>({ kind: 'loading', offset: 0 });
  function read(offset: number) {
    setLoad({ kind: 'loading', offset });
    void runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(`/attention-tasks?offset=${offset}`, {
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
          const page = readAttentionTasks(result.value, {
            companyId: company.id,
            workspaceMembershipId,
            offset,
          });
          if (
            today.current !== undefined &&
            today.current !== page.today &&
            offset !== 0
          ) {
            today.current = page.today;
            read(0);
            return;
          }
          today.current = page.today;
          setLoad({ kind: 'ready', page });
        }
      },
      onError: () => setLoad({ kind: 'error', offset }),
    });
  }
  useEffect(() => {
    headingRef.current?.focus();
    read(0);
    return () => pending.current?.abort();
  }, [identity]);
  const offset = load.kind === 'ready' ? load.page.offset : load.offset;
  const busy = load.kind === 'loading';
  function body() {
    switch (load.kind) {
      case 'loading':
        return (
          <p role="status" className="operational-home-state">
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
                today: formatDate(load.page.today),
                total: formatNumber(load.page.total),
              })}
            </p>
            {load.page.tasks.length === 0 ? (
              <p className="operational-home-state">
                {message(
                  load.page.total === 0 && offset === 0
                    ? 'empty'
                    : 'outOfRange',
                )}
              </p>
            ) : (
              <>
                <p role="status" className="operational-home-upcoming-page">
                  {formatMessage(message('page'), {
                    first: formatNumber(offset + 1),
                    last: formatNumber(offset + load.page.tasks.length),
                    total: formatNumber(load.page.total),
                  })}
                </p>
                <AttentionTaskList
                  tasks={load.page.tasks}
                  onOpenTask={onOpenTask}
                  headingLevel={5}
                />
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
      className="operational-home-upcoming-panel operational-home-attention-panel"
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
      {body()}
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
              offset + load.page.tasks.length >= load.page.total
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
