import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  List,
  Search,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useActorRequests } from '../../api/use-actor-requests';
import { useCommercialRequestCopy } from '../../commercial-intake/commercial-request.copy';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { OpportunityFollowUpDiscovery } from '../../opportunity-follow-up/OpportunityFollowUpDiscovery';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { stageLabelKeys, stageNumber } from './deal-labels';
import {
  dealStages,
  parseDealPage,
  type DealStage,
  type DealSummary,
} from './deal-response';
import { useDealCopy, type DealMessageKey } from './deals.copy';
import type { DealUpdate } from './DealPage';
import type { DealStagePanelContext } from './stage-panels';

type ListView = 'all' | 'mine_open';
type Layout = 'list' | 'board';
type ListState =
  | { kind: 'loading' | 'denied' | 'error' }
  | {
      kind: 'ready';
      items: DealSummary[];
      nextCursor?: string;
      older: 'idle' | 'loading' | 'error';
      /** The Client projection the rows' Client names belong to. */
      projection: string;
    };
const sortColumns = [
  'client',
  'deal',
  'stage',
  'owner',
  'nextAction',
  'followUp',
  'lastChange',
] as const;
type SortColumn = (typeof sortColumns)[number];
type Sort = { column: SortColumn; direction: 'ascending' | 'descending' };

const columnLabels = {
  client: 'columnClient',
  deal: 'columnDeal',
  stage: 'columnStage',
  owner: 'columnOwner',
  nextAction: 'columnNextAction',
  followUp: 'columnFollowUp',
  lastChange: 'columnLastChange',
} as const satisfies Record<SortColumn, DealMessageKey>;

/** Stages a deal can stand at; Collection is never linked in PRISMA. */
const boardStages = dealStages.filter((stage) => stage !== 'collection');

/** A Client dossier restricting the loaded rows, as the shell requested it. */
export type ClientRestriction = {
  clientDossierId: string;
  displayName: string;
};

/**
 * The Deals list (EX-054, EX-055, EX-067): one row per deal with its
 * current stage, sorting and text filtering over the loaded rows, All or My
 * open dossiers, follow-ups due until a date, and older pages. The board
 * groups the same loaded rows by current stage.
 */
export function DealList({
  companyId,
  context,
  readAuthority,
  restriction,
  onClearRestriction,
  updated,
  onOpen,
  onOpenRequest,
}: Readonly<{
  companyId: string;
  context: Pick<
    DealStagePanelContext,
    | 'actor'
    | 'identity'
    | 'onCompanyContextRejected'
    | 'onActorRevalidated'
    | 'onWorkspaceAccessRejected'
  >;
  /**
   * The Client authority and identity loaded Client names belong to. A change
   * withdraws them at once and rereads the first page, as the current
   * Requests list does.
   */
  readAuthority: string;
  restriction: ClientRestriction | undefined;
  onClearRestriction: () => void;
  /** The latest reread of an opened deal, replacing its loaded row. */
  updated: DealUpdate | undefined;
  onOpen: (deal: DealSummary) => void;
  onOpenRequest: (clientRequestId: string) => void;
}>) {
  const copy = useDealCopy();
  const requests = useActorRequests({
    actor: context.actor,
    identity: context.identity,
    onCompanyContextRejected: context.onCompanyContextRejected,
    onActorRevalidated: context.onActorRevalidated,
    onWorkspaceAccessRejected: context.onWorkspaceAccessRejected,
    companyId,
    scope: 'clarte-deals',
  });
  const latestRequest = useRef(requests.request);
  const projection = useRef(readAuthority);
  useLayoutEffect(() => {
    latestRequest.current = requests.request;
    projection.current = readAuthority;
  });
  const [view, setView] = useState<ListView>('all');
  const [layout, setLayout] = useState<Layout>('list');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<Sort>();
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const sequence = useRef(0);

  const load = useCallback(async (listView: ListView, cursor?: string) => {
    const attempt = ++sequence.current;
    const readUnder = projection.current;
    if (cursor === undefined) setState({ kind: 'loading' });
    else
      setState((current) =>
        current.kind === 'ready' ? { ...current, older: 'loading' } : current,
      );
    const result = await latestRequest.current(
      `/deals?limit=25${listView === 'mine_open' ? '&view=mine_open' : ''}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`,
    );
    if (result.status === 'retired' || attempt !== sequence.current) return;
    let page: ReturnType<typeof parseDealPage> | undefined;
    try {
      page = result.status === 'ok' ? parseDealPage(result.value) : undefined;
    } catch {
      page = undefined;
    }
    if (!page) {
      const failed =
        result.status === 'forbidden' || result.status === 'unauthorized'
          ? 'denied'
          : 'error';
      setState((current) =>
        cursor !== undefined && current.kind === 'ready' && failed === 'error'
          ? { ...current, older: 'error' }
          : { kind: failed },
      );
      return;
    }
    const received = page;
    setState((current) => ({
      kind: 'ready',
      projection: readUnder,
      items:
        cursor !== undefined &&
        current.kind === 'ready' &&
        current.projection === readUnder
          ? [
              ...current.items,
              ...received.items.filter(
                (item) =>
                  !current.items.some(
                    (known) => known.opportunityId === item.opportunityId,
                  ),
              ),
            ]
          : received.items,
      ...(received.nextCursor ? { nextCursor: received.nextCursor } : {}),
      older: 'idle',
    }));
  }, []);

  useEffect(() => {
    void load(view);
  }, [load, view]);

  // Only a projection change rereads here; a view change has its own read.
  const shownView = useRef(view);
  useLayoutEffect(() => {
    shownView.current = view;
  });
  const readProjection = useRef(readAuthority);
  useEffect(() => {
    if (readProjection.current === readAuthority) return;
    readProjection.current = readAuthority;
    void load(shownView.current);
  }, [readAuthority, load]);

  // A reread deal replaces its loaded row, so returning shows its state;
  // a row that left My open dossiers leaves that view.
  const member = context.actor.workspaceMembershipId;
  useEffect(() => {
    if (!updated) return;
    const summary = summaryOf(updated.summary);
    const stillShown =
      shownView.current === 'all' || isMineOpen(summary, member);
    setState((current) =>
      current.kind === 'ready' && current.projection === updated.projection
        ? {
            ...current,
            items: current.items.flatMap((item) =>
              item.opportunityId !== summary.opportunityId
                ? [item]
                : stillShown
                  ? [summary]
                  : [],
            ),
          }
        : current,
    );
  }, [updated, member]);

  // Rows read under an earlier authority are withdrawn until the reread.
  const visible: ListState =
    state.kind === 'ready' && state.projection !== readAuthority
      ? { kind: 'loading' }
      : state;
  const normalized = filter.trim().toLowerCase();
  const rows =
    visible.kind === 'ready'
      ? sortRows(
          visible.items.filter(
            (item) =>
              (!restriction ||
                item.client?.clientDossierId === restriction.clientDossierId) &&
              matches(item, normalized),
          ),
          sort,
        )
      : [];

  return (
    <div className="clarte-deals-list">
      <p className="clarte-deals-intro">{copy('listIntro')}</p>
      <div className="clarte-deals-toolbar">
        <div
          className="clarte-segmented"
          role="group"
          aria-label={copy('viewsLabel')}
        >
          {(['all', 'mine_open'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {copy(option === 'all' ? 'viewAll' : 'viewMine')}
            </button>
          ))}
        </div>
        <div
          className="clarte-segmented"
          role="group"
          aria-label={copy('layoutLabel')}
        >
          <button
            type="button"
            aria-pressed={layout === 'list'}
            onClick={() => setLayout('list')}
          >
            <List aria-hidden="true" />
            {copy('layoutList')}
          </button>
          <button
            type="button"
            aria-pressed={layout === 'board'}
            onClick={() => setLayout('board')}
          >
            <Columns3 aria-hidden="true" />
            {copy('layoutBoard')}
          </button>
        </div>
        <label className="clarte-deals-filter">
          <Search aria-hidden="true" />
          <span className="clarte-visually-hidden">{copy('filterLabel')}</span>
          <input
            className="clarte-input"
            type="search"
            placeholder={copy('filterHint')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </div>
      {restriction ? (
        <p className="clarte-deals-restriction">
          <ClarteBadge tone="accent">
            {formatMessage(copy('restriction'), {
              client: restriction.displayName,
            })}
          </ClarteBadge>
          <ClarteButton
            size="small"
            variant="quiet"
            onClick={onClearRestriction}
          >
            {copy('clearRestriction')}
          </ClarteButton>
        </p>
      ) : null}
      <div className="clarte-deals-follow-ups">
        <OpportunityFollowUpDiscovery
          actor={context.actor}
          identity={context.identity}
          clientProjectionAuthority={readAuthority}
          disabled={false}
          onCompanyContextRejected={context.onCompanyContextRejected}
          onActorRevalidated={context.onActorRevalidated}
          onWorkspaceAccessRejected={context.onWorkspaceAccessRejected}
          onOpenRequest={onOpenRequest}
        />
      </div>
      {visible.kind === 'loading' ? (
        <ClarteLoadingState label={copy('loadingList')} />
      ) : visible.kind === 'denied' ? (
        <ClarteErrorState title={copy('listDenied')} />
      ) : visible.kind !== 'ready' ? (
        <ClarteErrorState
          title={copy('listError')}
          action={
            <ClarteButton onClick={() => void load(view)}>
              {copy('retry')}
            </ClarteButton>
          }
        />
      ) : visible.items.length === 0 ? (
        <ClarteEmptyState
          title={copy(view === 'mine_open' ? 'emptyMine' : 'emptyAll')}
        />
      ) : rows.length === 0 ? (
        <ClarteEmptyState title={copy('emptyFilter')} />
      ) : layout === 'list' ? (
        <DealTable
          rows={rows}
          sort={sort}
          onSort={(column) =>
            setSort((current) => ({
              column,
              direction:
                current?.column === column && current.direction === 'ascending'
                  ? 'descending'
                  : 'ascending',
            }))
          }
          onOpen={onOpen}
        />
      ) : (
        <DealBoard rows={rows} onOpen={onOpen} />
      )}
      {visible.kind === 'ready' && visible.nextCursor ? (
        <div className="clarte-deals-older">
          {visible.older === 'error' ? (
            <p role="alert">{copy('olderError')}</p>
          ) : null}
          <ClarteButton
            disabled={visible.older === 'loading'}
            onClick={() => void load(view, visible.nextCursor)}
          >
            {copy(visible.older === 'loading' ? 'loadingOlder' : 'loadOlder')}
          </ClarteButton>
        </div>
      ) : null}
    </div>
  );
}

function DealTable({
  rows,
  sort,
  onSort,
  onOpen,
}: Readonly<{
  rows: readonly DealSummary[];
  sort: Sort | undefined;
  onSort: (column: SortColumn) => void;
  onOpen: (deal: DealSummary) => void;
}>) {
  const copy = useDealCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  return (
    <div className="clarte-table-wrap">
      <table className="clarte-table clarte-deals-table">
        <caption className="clarte-visually-hidden">{copy('sortHint')}</caption>
        <thead>
          <tr>
            {sortColumns.map((column) => {
              const active =
                sort?.column === column ? sort.direction : undefined;
              const Icon =
                active === 'ascending'
                  ? ArrowUp
                  : active === 'descending'
                    ? ArrowDown
                    : ArrowUpDown;
              return (
                <th key={column} scope="col" aria-sort={active ?? 'none'}>
                  <button type="button" onClick={() => onSort(column)}>
                    {copy(columnLabels[column])}
                    <Icon aria-hidden="true" />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.opportunityId}>
              <td
                className="clarte-cell-lead"
                data-label={copy('columnClient')}
              >
                {row.client?.displayName ?? (
                  <span className="clarte-muted">{copy('noClient')}</span>
                )}
              </td>
              <td className="clarte-cell-lead" data-label={copy('columnDeal')}>
                <button
                  type="button"
                  id={rowTarget(row.opportunityId)}
                  className="clarte-row-link"
                  onClick={() => onOpen(row)}
                >
                  {row.title}
                </button>
                {row.subject ? <small>{row.subject}</small> : null}
              </td>
              <td data-label={copy('columnStage')}>
                <ThreadChip deal={row} />
              </td>
              <td data-label={copy('columnOwner')}>{row.owner.displayName}</td>
              <td data-label={copy('columnNextAction')}>{row.nextAction}</td>
              <td data-label={copy('columnFollowUp')}>
                {!row.followUpOn.readable ? (
                  <span className="clarte-muted">{copy('notAvailable')}</span>
                ) : row.followUpOn.value ? (
                  formatDate(row.followUpOn.value)
                ) : (
                  <span className="clarte-muted">{copy('noFollowUp')}</span>
                )}
              </td>
              <td data-label={copy('columnLastChange')}>
                <time dateTime={row.lastChangedAt}>
                  {formatDateTime(row.lastChangedAt)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealBoard({
  rows,
  onOpen,
}: Readonly<{
  rows: readonly DealSummary[];
  onOpen: (deal: DealSummary) => void;
}>) {
  const copy = useDealCopy();
  const { formatDate } = useInterfaceLocale();
  const id = useId();
  const columns: { key: DealStage | 'closed'; label: string }[] = [
    ...boardStages.map((stage) => ({
      key: stage,
      label: copy(stageLabelKeys[stage]),
    })),
    { key: 'closed', label: copy('boardClosed') },
  ];
  return (
    <>
      <p className="clarte-board-notice" role="note">
        {copy('boardNotice')}
      </p>
      <div className="clarte-board">
        {columns.map((column) => {
          const items = rows.filter((row) =>
            column.key === 'closed'
              ? row.thread.kind === 'closed'
              : row.thread.kind === 'in_progress' &&
                row.thread.currentStage === column.key,
          );
          return (
            <section
              key={column.key}
              className="clarte-board-column"
              data-stage={
                column.key === 'closed' ? undefined : stageNumber(column.key)
              }
              aria-labelledby={`${id}-${column.key}`}
            >
              <h3 id={`${id}-${column.key}`}>
                {column.label} <span>{items.length}</span>
              </h3>
              {items.length ? (
                <ul>
                  {items.map((row) => (
                    <li key={row.opportunityId}>
                      <button type="button" onClick={() => onOpen(row)}>
                        <strong>
                          {row.client?.displayName ?? copy('noClient')}
                        </strong>
                        <span>{row.title}</span>
                        <small>{row.nextAction}</small>
                        <span className="clarte-board-foot">
                          <span>{row.owner.displayName}</span>
                          {row.followUpOn.readable && row.followUpOn.value ? (
                            <ClarteBadge tone="warning">
                              {formatDate(row.followUpOn.value)}
                            </ClarteBadge>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="clarte-muted">{copy('boardEmpty')}</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function ThreadChip({ deal }: Readonly<{ deal: DealSummary }>) {
  const copy = useDealCopy();
  const request = useCommercialRequestCopy();
  if (deal.thread.kind === 'closed')
    return (
      <ClarteBadge tone="neutral">
        {request.opportunityStatusLabels[deal.thread.status]}
      </ClarteBadge>
    );
  return (
    <span
      className="clarte-stage-chip"
      data-stage={stageNumber(deal.thread.currentStage)}
    >
      {copy(stageLabelKeys[deal.thread.currentStage])}
    </span>
  );
}

/** The id of a row's open button, where focus returns from the deal page. */
export function rowTarget(opportunityId: string) {
  return `clarte-deal-${opportunityId}`;
}

function summaryOf(deal: DealSummary): DealSummary {
  return {
    opportunityId: deal.opportunityId,
    clientRequestId: deal.clientRequestId,
    title: deal.title,
    subject: deal.subject,
    client: deal.client,
    status: deal.status,
    owner: deal.owner,
    nextAction: deal.nextAction,
    salesStage: deal.salesStage,
    followUpOn: deal.followUpOn,
    lastChangedAt: deal.lastChangedAt,
    thread: deal.thread,
  };
}

/** Commercial Intake's My open cases: Open or On hold and owned by the member. */
function isMineOpen(item: DealSummary, workspaceMembershipId: string) {
  return (
    item.owner.workspaceMembershipId === workspaceMembershipId &&
    (item.status === 'OPEN' || item.status === 'ON_HOLD')
  );
}

function matches(item: DealSummary, normalized: string) {
  if (!normalized) return true;
  return [item.subject ?? '', item.title, item.owner.displayName].some(
    (value) => value.toLowerCase().includes(normalized),
  );
}

function sortRows(rows: DealSummary[], sort: Sort | undefined): DealSummary[] {
  if (!sort) return rows;
  const factor = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = sortKey(left, sort.column);
    const b = sortKey(right, sort.column);
    // Rows without a value stay last in both directions.
    if (a === b) return 0;
    if (a === '') return 1;
    if (b === '') return -1;
    return a < b ? -factor : factor;
  });
}

function sortKey(row: DealSummary, column: SortColumn): string {
  switch (column) {
    case 'client':
      return row.client?.displayName.toLowerCase() ?? '';
    case 'deal':
      return row.title.toLowerCase();
    case 'stage':
      return row.thread.kind === 'in_progress'
        ? String(stageNumber(row.thread.currentStage))
        : '8';
    case 'owner':
      return row.owner.displayName.toLowerCase();
    case 'nextAction':
      return row.nextAction.toLowerCase();
    case 'followUp':
      return row.followUpOn.readable ? (row.followUpOn.value ?? '') : '';
    case 'lastChange':
      return row.lastChangedAt;
    default: {
      const exhaustive: never = column;
      return exhaustive;
    }
  }
}
