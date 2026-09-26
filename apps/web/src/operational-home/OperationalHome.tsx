import { CalendarClock, FolderKanban, Users } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { formatApplicationCount } from '../presentation/number';
import {
  readOperationalHome,
  type CompanySummary,
  type CompanySummaryKind,
  type OperationalHomeView,
} from './operational-home-response';
import { operationalHomeCopy as copy } from './operational-home.copy';
import { OverdueTasksPanel } from './OverdueTasksPanel';
import './operational-home.css';

export type OperationalHomeCompany = { id: string; displayName: string };

type Props = {
  /** The active Company; App remounts the region for any other Company or authority. */
  company: OperationalHomeCompany;
  identity: BrowserIdentity;
  /** Destinations currently offered by App's captured authority. */
  availableSummaries: Record<CompanySummaryKind, boolean>;
  /** App's existing Company selection owns actor refresh and remounting. */
  onRevalidateAuthority: () => Promise<void>;
  onOpenClients: () => void;
  onOpenProjects: () => void;
  /** Opens an overdue Task in its Project; rows offer Open only when supplied. */
  onOpenTask?: (task: { projectId: string; taskId: string }) => void;
};

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'denied' }
  | { kind: 'ready'; view: OperationalHomeView };

const icons = {
  active_clients: Users,
  open_projects: FolderKanban,
  overdue_tasks: CalendarClock,
} satisfies Record<CompanySummaryKind, unknown>;

/**
 * The active-Company summary of Operational Dashboard PRD §17.2. It owns its
 * one read, Refresh/Retry and late-reply suppression, and the on-demand
 * overdue panel. It never shows zeros for a failed or refused read.
 */
export function OperationalHome({
  company,
  identity,
  availableSummaries,
  onRevalidateAuthority,
  onOpenClients,
  onOpenProjects,
  onOpenTask,
}: Props) {
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [panelOpen, setPanelOpen] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const overdueCard = useRef<HTMLButtonElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const focusPanel = useRef(false);

  // The latest read supersedes any earlier read still in flight.
  function read() {
    setLoad({ kind: 'loading' });
    void runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>('/operational-home', {
          companyContextId: company.id,
          signal,
        }),
      onResult: async (result, signal) => {
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          if (!signal.aborted) setLoad({ kind: 'denied' });
        } else if (result.status === 'forbidden') setLoad({ kind: 'denied' });
        else if (result.status !== 'ok') setLoad({ kind: 'error' });
        else {
          const view = readOperationalHome(result.value, company.id);
          if (view.summaries.some(({ kind }) => !availableSummaries[kind])) {
            // A newly granted read must mount its destination before a card
            // can expose it. Changed authority remounts this region and reads
            // again; an unchanged or failed refresh exposes no stale links.
            await onRevalidateAuthority();
            if (!signal.aborted) setLoad({ kind: 'error' });
            return;
          }
          setLoad({ kind: 'ready', view });
        }
      },
      onError: () => setLoad({ kind: 'error' }),
    });
  }
  useEffect(() => {
    read();
    return () => pending.current?.abort();
  }, [identity]);

  const overdueShown =
    load.kind === 'ready' &&
    load.view.summaries.some((summary) => summary.kind === 'overdue_tasks');
  // A read that no longer returns the overdue count closes its panel.
  const overdueWithdrawn = load.kind === 'ready' && !overdueShown;
  useEffect(() => {
    if (overdueWithdrawn) setPanelOpen(false);
  }, [overdueWithdrawn]);
  // Focus moves into the panel only when the card opened it.
  useEffect(() => {
    if (!focusPanel.current || !panelOpen || !overdueShown) return;
    focusPanel.current = false;
    panelHeading.current?.focus();
  }, [panelOpen, overdueShown]);

  function open(kind: CompanySummaryKind) {
    switch (kind) {
      case 'active_clients':
        onOpenClients();
        return;
      case 'open_projects':
        onOpenProjects();
        return;
      case 'overdue_tasks':
        if (panelOpen) panelHeading.current?.focus();
        else {
          focusPanel.current = true;
          setPanelOpen(true);
        }
        return;
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  }

  if (load.kind === 'ready' && load.view.summaries.length === 0) return null;
  return (
    <section className="operational-home" aria-labelledby={titleId}>
      <header className="operational-home-heading">
        <div>
          <h2 id={titleId}>{copy.title}</h2>
          {load.kind === 'ready' && (
            <p>
              {copy.note({
                company: company.displayName,
                today: load.view.today,
              })}
            </p>
          )}
        </div>
        <button type="button" onClick={read}>
          {copy.refresh}
        </button>
      </header>
      <Body
        load={load}
        company={company}
        onRetry={read}
        onOpen={open}
        overdueCard={overdueCard}
      />
      {panelOpen && overdueShown && (
        <OverdueTasksPanel
          company={company}
          identity={identity}
          headingRef={panelHeading}
          onOpenTask={onOpenTask}
          onClose={() => {
            setPanelOpen(false);
            overdueCard.current?.focus();
          }}
        />
      )}
    </section>
  );
}

function Body({
  load,
  company,
  onRetry,
  onOpen,
  overdueCard,
}: {
  load: Load;
  company: OperationalHomeCompany;
  onRetry: () => void;
  onOpen: (kind: CompanySummaryKind) => void;
  overdueCard: RefObject<HTMLButtonElement | null>;
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
    case 'ready':
      return (
        <ul className="operational-home-cards">
          {load.view.summaries.map((summary) => (
            <li key={summary.kind}>
              <SummaryCard
                summary={summary}
                context={{
                  company: company.displayName,
                  today: load.view.today,
                }}
                onOpen={onOpen}
                cardRef={
                  summary.kind === 'overdue_tasks' ? overdueCard : undefined
                }
              />
            </li>
          ))}
        </ul>
      );
    default: {
      const exhaustive: never = load;
      return exhaustive;
    }
  }
}

function SummaryCard({
  summary,
  context,
  onOpen,
  cardRef,
}: {
  summary: CompanySummary;
  context: { company: string; today: string };
  onOpen: (kind: CompanySummaryKind) => void;
  cardRef: RefObject<HTMLButtonElement | null> | undefined;
}) {
  const definitionId = useId();
  const entry = copy.summaries[summary.kind];
  const Icon = icons[summary.kind];
  const count = formatApplicationCount(summary.count);
  return (
    <button
      ref={cardRef}
      type="button"
      className="operational-home-card"
      aria-label={copy.cardName({
        label: entry.label,
        count,
        destination: entry.destination,
      })}
      aria-describedby={definitionId}
      onClick={() => onOpen(summary.kind)}
    >
      <span className="operational-home-card-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="operational-home-card-text">
        <small>{entry.label}</small>
        <strong>{count}</strong>
        <span id={definitionId}>{entry.definition(context)}</span>
      </span>
    </button>
  );
}
