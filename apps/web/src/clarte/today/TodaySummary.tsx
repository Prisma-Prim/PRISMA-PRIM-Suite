import { CalendarClock, FolderKanban, RefreshCw, Users } from 'lucide-react';
import { useId, type RefObject } from 'react';
import { useInterfaceLocale } from '../../localization/interface-locale';
import type { OperationalHomeLoad } from '../../operational-home/OperationalHome';
import type {
  CompanySummary,
  CompanySummaryKind,
} from '../../operational-home/operational-home-response';
import { useOperationalHomeCopy } from '../../operational-home/operational-home-localized.copy';
import { ClarteButton } from '../components/ClarteButton';
import {
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';

const icons = {
  active_clients: Users,
  open_projects: FolderKanban,
  overdue_tasks: CalendarClock,
} satisfies Record<CompanySummaryKind, unknown>;

/**
 * The Company summary (#1532, EX-003) of the one Company summary owner:
 * active Clients, open Projects and overdue Tasks with their counting date
 * and Refresh. Each counter opens its destination; overdue Tasks open their
 * full list. A failed or refused read never shows zeros.
 */
export function TodaySummary({
  company,
  load,
  onRefresh,
  onOpen,
  overdueCard,
}: Readonly<{
  company: { id: string; displayName: string };
  load: OperationalHomeLoad;
  onRefresh: () => void;
  onOpen: (kind: CompanySummaryKind) => void;
  overdueCard: RefObject<HTMLButtonElement | null>;
}>) {
  const copy = useOperationalHomeCopy();
  const { formatDate } = useInterfaceLocale();
  const titleId = useId();
  if (load.kind === 'ready' && load.view.summaries.length === 0) return null;
  return (
    <section
      className="clarte-today-card clarte-today-summary"
      aria-labelledby={titleId}
    >
      <div className="clarte-today-card-head">
        <h2 id={titleId} className="clarte-today-card-title">
          {copy.title}
        </h2>
        <ClarteButton
          size="small"
          variant="quiet"
          aria-label={copy.refresh}
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" />
        </ClarteButton>
      </div>
      {load.kind === 'ready' && (
        <p className="clarte-today-card-note">
          {copy.note({
            company: company.displayName,
            today: formatDate(load.view.today),
          })}
        </p>
      )}
      {load.kind === 'loading' && <ClarteLoadingState label={copy.loading} />}
      {load.kind === 'denied' && (
        <p className="clarte-today-card-note">{copy.denied}</p>
      )}
      {load.kind === 'error' && (
        <ClarteErrorState
          title={copy.error}
          action={
            <ClarteButton size="small" onClick={onRefresh}>
              {copy.retry}
            </ClarteButton>
          }
        />
      )}
      {load.kind === 'ready' && (
        <ul className="clarte-today-counters">
          {load.view.summaries.map((summary) => (
            <li key={summary.kind}>
              <Counter
                summary={summary}
                context={{
                  company: company.displayName,
                  today: formatDate(load.view.today),
                }}
                onOpen={onOpen}
                counterRef={
                  summary.kind === 'overdue_tasks' ? overdueCard : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Counter({
  summary,
  context,
  onOpen,
  counterRef,
}: Readonly<{
  summary: CompanySummary;
  context: { company: string; today: string };
  onOpen: (kind: CompanySummaryKind) => void;
  counterRef: RefObject<HTMLButtonElement | null> | undefined;
}>) {
  const copy = useOperationalHomeCopy();
  const { formatNumber } = useInterfaceLocale();
  const definitionId = useId();
  const entry = copy.summaries[summary.kind];
  const Icon = icons[summary.kind];
  const count = formatNumber(summary.count);
  return (
    <button
      ref={counterRef}
      type="button"
      className="clarte-today-counter"
      data-kind={summary.kind}
      aria-label={copy.cardName({
        label: entry.label,
        count,
        destination: entry.destination,
      })}
      aria-describedby={definitionId}
      onClick={() => onOpen(summary.kind)}
    >
      <span className="clarte-today-counter-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="clarte-today-counter-text">
        <span>{entry.label}</span>
        <small id={definitionId}>{entry.definition(context)}</small>
      </span>
      <strong>{count}</strong>
    </button>
  );
}
