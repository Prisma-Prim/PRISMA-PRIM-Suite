import { Plus, RotateCw, TriangleAlert } from 'lucide-react';
import { useRef, type Ref } from 'react';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { useOperationalRiskCopy } from '../../operational-risk/operational-risk.copy';
import { factFields } from '../../operational-risk/operational-risk.editor';
import type {
  OperationalRiskEntry,
  OperationalRiskFacts,
} from '../../operational-risk/operational-risk.types';
import {
  useOperationalRiskOwner,
  type OperationalRiskOwner,
  type OperationalRiskWorkspaceProps,
} from '../../operational-risk/use-operational-risk-owner';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { ClartePanelParts } from './ClartePanelParts';
import { ClarteRiskEditor } from './ClarteRiskEditor';
import { ClarteRiskStatement } from './ClarteRiskStatement';
import { RowChevron, RowChevronHead, openRowButton } from './ClarteRow';
import { useClarteImprovementCopy } from './clarte-improvement.copy';
import { useFactLabel } from './risk-fact-label';
import './clarte-improvement.css';

/**
 * Improvement › Operational risks in Clarté (#1545): the Company's register
 * as a table and one side panel per Risk with its current and original
 * facts, its log statements and the immutable history; recording, fact
 * corrections, log notes and statement corrections open in the same panel.
 * The Risk owner keeps every read, draft, frozen command, exact retry,
 * conflict review and access recovery.
 */
export function ClarteOperationalRisks(props: OperationalRiskWorkspaceProps) {
  const copy = useOperationalRiskCopy();
  const { formatDateTime } = useInterfaceLocale();
  const owner = useOperationalRiskOwner(props);
  const { list, selectedId, editor, pending, busy, denied, canRecord } = owner;
  if (!owner.companyId || !owner.canRead) return null;
  const panelOpen =
    selectedId !== undefined || editor !== undefined || pending !== undefined;
  return (
    <section
      id="operational-risks"
      tabIndex={-1}
      className="clarte-improvement"
      aria-label={copy('title')}
    >
      <p className="clarte-improvement-banner">{copy('limits')}</p>
      {denied ? (
        <ClarteErrorState title={copy('denied')} />
      ) : (
        <>
          {!canRecord && (
            <p className="clarte-improvement-quiet">{copy('readOnly')}</p>
          )}
          {!panelOpen && <CommandNotices owner={owner} />}
          <ClarteCard
            title={copy('list')}
            actions={
              <>
                <ClarteButton
                  disabled={busy}
                  onClick={() => {
                    void owner.reload();
                  }}
                >
                  <RotateCw aria-hidden="true" />
                  {copy('retryRead')}
                </ClarteButton>
                {canRecord && (
                  <ClarteButton
                    variant="primary"
                    disabled={busy}
                    onClick={owner.startRecord}
                  >
                    <Plus aria-hidden="true" />
                    {copy('newIntake')}
                  </ClarteButton>
                )}
              </>
            }
          >
            {list.kind === 'loading' ? (
              <ClarteLoadingState label={copy('loading')} />
            ) : list.kind === 'error' ? (
              <ClarteErrorState title={copy('loadError')} />
            ) : (
              <>
                {list.value.items.length === 0 ? (
                  <ClarteEmptyState title={copy('empty')} />
                ) : (
                  <div className="clarte-table-wrap">
                    <table className="clarte-table clarte-improvement-table">
                      <thead>
                        <tr>
                          <th scope="col">{copy('process')}</th>
                          <th scope="col">{copy('recordedAt')}</th>
                          <RowChevronHead />
                        </tr>
                      </thead>
                      <tbody>
                        {list.value.items.map((item) => (
                          <tr
                            key={item.id}
                            className="clarte-improvement-row"
                            onClick={openRowButton}
                          >
                            <td data-label={copy('process')}>
                              <button
                                type="button"
                                className="clarte-improvement-row-open"
                                aria-pressed={selectedId === item.id}
                                disabled={busy || editor !== undefined}
                                onClick={() => owner.selectRisk(item.id)}
                              >
                                {item.process}
                              </button>
                            </td>
                            <td data-label={copy('recordedAt')}>
                              {formatDateTime(item.createdAt)}
                            </td>
                            <RowChevron />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {list.more === 'error' && (
                  <ClarteErrorState title={copy('loadError')} />
                )}
                {list.value.next_cursor && (
                  <div className="clarte-improvement-foot">
                    <ClarteButton
                      size="small"
                      disabled={busy || list.more === 'loading'}
                      onClick={owner.moreRisks}
                    >
                      {list.more === 'loading' ? copy('loading') : copy('more')}
                    </ClarteButton>
                  </div>
                )}
              </>
            )}
          </ClarteCard>
          {panelOpen && <RiskPanel owner={owner} />}
        </>
      )}
    </section>
  );
}

/** A command's outcome and its exact retry, where the person is looking. */
function CommandNotices({ owner }: Readonly<{ owner: OperationalRiskOwner }>) {
  const copy = useOperationalRiskCopy();
  const { notice, pending, editor } = owner;
  return (
    <>
      {/* An open editor states a refused draft beside its fields. */}
      {notice && !(notice === 'invalid' && editor) && (
        <p
          role={notice === 'recorded' ? 'status' : 'alert'}
          className={
            notice === 'recorded'
              ? 'clarte-improvement-notice'
              : 'clarte-improvement-notice clarte-improvement-notice--danger'
          }
        >
          {copy(notice)}
        </p>
      )}
      {pending && (
        <div
          role="status"
          className="clarte-improvement-notice clarte-improvement-notice--warning"
        >
          <p>
            {pending.kind === 'submitting'
              ? copy('loading')
              : copy('uncertain')}
          </p>
          {pending.kind === 'uncertain' && (
            <ClarteButton
              variant="primary"
              size="small"
              onClick={owner.retryCommand}
            >
              {copy(
                pending.command.kind === 'journal-correct'
                  ? 'retryCorrection'
                  : 'retryExact',
              )}
            </ClarteButton>
          )}
        </div>
      )}
    </>
  );
}

function RiskPanel({ owner }: Readonly<{ owner: OperationalRiskOwner }>) {
  const copy = useOperationalRiskCopy();
  const text = useClarteImprovementCopy();
  const { formatDateTime } = useInterfaceLocale();
  const {
    list,
    selectedId,
    detail,
    risk,
    editor,
    busy,
    notice,
    statement,
    confirmedJournal,
    knownRevision,
    canRecord,
  } = owner;
  const listed =
    list.kind === 'ready'
      ? list.value.items.find((item) => item.id === selectedId)
      : undefined;
  const title = risk
    ? risk.currentIntake.facts.process
    : editor?.kind === 'record'
      ? copy('newIntake')
      : (listed?.process ?? copy('title'));
  const historical = risk !== undefined && risk.revision < knownRevision;
  const factsHeading = useRef<HTMLHeadingElement>(null);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  return (
    <ClarteSidePanel
      title={title}
      description={
        risk
          ? `${copy('revision')} ${risk.revision} · ${formatDateTime(risk.createdAt)}`
          : undefined
      }
      icon={<TriangleAlert />}
      dismissible={!busy}
      onClose={owner.close}
    >
      <div className="clarte-improvement-panel">
        {(selectedId !== undefined || owner.conflict) && (
          <div className="clarte-improvement-toolbar">
            {risk && (
              <ClartePanelParts
                parts={[
                  { label: text('factsPart'), heading: factsHeading },
                  { label: text('historyPart'), heading: historyHeading },
                ]}
              />
            )}
            <ClarteButton
              size="small"
              disabled={busy}
              onClick={() => {
                void owner.reload();
              }}
            >
              <RotateCw aria-hidden="true" />
              {copy('retryRead')}
            </ClarteButton>
          </div>
        )}
        <CommandNotices owner={owner} />
        {editor && (
          <ClarteRiskEditor
            editor={editor}
            companyName={owner.companyName}
            busy={busy}
            status={
              notice === 'invalid'
                ? 'invalid'
                : owner.conflict
                  ? owner.reviewed
                    ? 'reviewed'
                    : 'conflict'
                  : 'editable'
            }
            onChange={owner.changeEditor}
            onSubmit={owner.submit}
            onContinue={owner.continueReviewed}
            onCancel={owner.cancelEditor}
          />
        )}
        {statement.kind === 'ready' && (
          <ClarteRiskStatement
            value={statement.value}
            revision={Math.max(knownRevision, risk?.revision ?? 0)}
            canCorrect={canRecord && !editor && notice !== 'savedRefreshError'}
            disabled={busy}
            editing={editor !== undefined}
            onCorrect={() => {
              void owner.startJournalCorrection();
            }}
          />
        )}
        {(statement.kind === 'loading' ||
          statement.kind === 'error' ||
          statement.kind === 'unavailable') && (
          <section
            aria-label={copy('currentStatement')}
            className="clarte-improvement-section"
          >
            {statement.kind === 'loading' ? (
              <ClarteLoadingState label={copy('loading')} />
            ) : (
              <ClarteErrorState
                title={copy(
                  statement.kind === 'unavailable'
                    ? 'journalUnavailable'
                    : 'loadError',
                )}
                action={
                  <ClarteButton
                    size="small"
                    disabled={busy}
                    onClick={owner.retryStatement}
                  >
                    {copy('retryRead')}
                  </ClarteButton>
                }
              />
            )}
          </section>
        )}
        {confirmedJournal && notice === 'savedRefreshError' && (
          <section
            aria-label={copy('savedCorrection')}
            className="clarte-improvement-section"
          >
            <h3>{copy('savedCorrection')}</h3>
            <p className="clarte-improvement-literal">
              {confirmedJournal.narrative}
            </p>
            <p className="clarte-improvement-literal">
              {copy('reason')}: {confirmedJournal.reason}
            </p>
          </section>
        )}
        {selectedId !== undefined &&
          (detail.kind === 'loading' ? (
            <ClarteLoadingState label={copy('loading')} />
          ) : !risk ? (
            <ClarteErrorState title={copy('loadError')} />
          ) : (
            <>
              {historical && (
                <p role="status" className="clarte-improvement-notice">
                  {copy('historicalStatement')}
                </p>
              )}
              <div className="clarte-improvement-status">
                <ClarteBadge>{copy('notAssessed')}</ClarteBadge>
                <p>{copy('notResponsible')}</p>
              </div>
              <section
                aria-label={copy('current')}
                className="clarte-improvement-section"
              >
                <h3 ref={factsHeading} tabIndex={-1}>
                  {copy('current')}
                </h3>
                <RiskFacts facts={risk.currentIntake.facts} />
                {risk.currentIntake.kind === 'intake-corrected' && (
                  <p className="clarte-improvement-literal">
                    <strong>{copy('reason')}: </strong>
                    {risk.currentIntake.reason}
                  </p>
                )}
                {canRecord && !editor && (
                  <div className="clarte-improvement-actions">
                    <ClarteButton
                      disabled={busy || historical}
                      onClick={() => owner.startCorrection(risk)}
                    >
                      {copy('correct')}
                    </ClarteButton>
                    <ClarteButton
                      variant="primary"
                      disabled={busy || historical}
                      onClick={() => owner.startJournalNote(risk)}
                    >
                      <Plus aria-hidden="true" />
                      {text('addNote')}
                    </ClarteButton>
                  </div>
                )}
              </section>
              <details className="clarte-improvement-details">
                <summary>{copy('original')}</summary>
                <RiskFacts facts={risk.originalIntake.facts} />
              </details>
              <RiskHistory owner={owner} headingRef={historyHeading} />
            </>
          ))}
      </div>
    </ClarteSidePanel>
  );
}

/** The seven intake facts, absent optional ones stated as such. */
function RiskFacts({ facts }: Readonly<{ facts: OperationalRiskFacts }>) {
  const copy = useOperationalRiskCopy();
  const label = useFactLabel();
  const { formatDate } = useInterfaceLocale();
  return (
    <dl className="clarte-improvement-facts">
      {factFields.map((name) => {
        const value = facts[name];
        return (
          <div key={name}>
            <dt>{label(name)}</dt>
            <dd className="clarte-improvement-literal">
              {value === null
                ? copy(
                    name === 'existingMeasures' || name === 'sourceDescription'
                      ? 'notRecorded'
                      : 'unknown',
                  )
                : name === 'plannedDate'
                  ? formatDate(`${value}T00:00:00.000Z`)
                  : value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function RiskHistory({
  owner,
  headingRef,
}: Readonly<{
  owner: OperationalRiskOwner;
  headingRef: Ref<HTMLHeadingElement>;
}>) {
  const copy = useOperationalRiskCopy();
  const { history, busy, editor, statement } = owner;
  const currentEntryId =
    statement.kind === 'ready' ? statement.value.currentEntry.id : undefined;
  return (
    <section
      aria-label={copy('history')}
      className="clarte-improvement-section"
    >
      <h3 ref={headingRef} tabIndex={-1}>
        {copy('history')}
      </h3>
      {history.kind === 'loading' ? (
        <ClarteLoadingState label={copy('loading')} />
      ) : history.kind === 'error' ? (
        <ClarteErrorState title={copy('loadError')} />
      ) : (
        <>
          <ol className="clarte-improvement-timeline">
            {history.value.items.map((entry) => (
              <HistoryEntry
                key={entry.id}
                entry={entry}
                current={currentEntryId === entry.id}
                disabled={busy || editor !== undefined}
                onView={owner.viewStatement}
              />
            ))}
          </ol>
          {history.more === 'error' && (
            <ClarteErrorState title={copy('loadError')} />
          )}
          {history.value.next_cursor && (
            <ClarteButton
              size="small"
              disabled={busy || history.more === 'loading'}
              onClick={() => {
                void owner.loadOlder();
              }}
            >
              {copy(history.more === 'loading' ? 'loading' : 'more')}
            </ClarteButton>
          )}
        </>
      )}
    </section>
  );
}

function HistoryEntry({
  entry,
  current,
  disabled,
  onView,
}: Readonly<{
  entry: OperationalRiskEntry;
  current: boolean;
  disabled: boolean;
  onView: (root: string) => void;
}>) {
  const copy = useOperationalRiskCopy();
  const label = useFactLabel();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  return (
    <li>
      <div className="clarte-improvement-entry-head">
        <strong>{copy(entry.kind)}</strong>
        <span>
          {copy('revision')} {entry.revision}
        </span>
      </div>
      <p className="clarte-improvement-meta">
        {copy('author')}: <strong>{entry.actor.displayName}</strong> ·{' '}
        {formatDateTime(entry.recordedAt)}
      </p>
      {entry.kind === 'intake-recorded' || entry.kind === 'intake-corrected' ? (
        <>
          <RiskFacts facts={entry.facts} />
          {entry.kind === 'intake-corrected' && (
            <>
              <p className="clarte-improvement-literal">
                {copy('reason')}: {entry.reason}
              </p>
              <p className="clarte-improvement-meta">
                {copy('predecessor')}: <code>{entry.predecessorId}</code>
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <p className="clarte-improvement-literal">{entry.narrative}</p>
          <p className="clarte-improvement-meta">
            {label('occurredOn')}:{' '}
            {entry.occurredOn === null
              ? copy('unknown')
              : formatDate(`${entry.occurredOn}T00:00:00.000Z`)}
          </p>
          {entry.kind === 'journal-corrected' && (
            <>
              <p className="clarte-improvement-literal">
                {copy('reason')}: {entry.reason}
              </p>
              <p className="clarte-improvement-meta">
                {copy('journalPredecessor')}: <code>{entry.predecessorId}</code>
              </p>
              <p className="clarte-improvement-meta">
                {copy(current ? 'currentStatement' : 'historicalStatement')}
              </p>
            </>
          )}
          <div>
            <ClarteButton
              size="small"
              disabled={disabled}
              onClick={() =>
                onView(
                  entry.kind === 'journal-corrected'
                    ? entry.originalEntryId
                    : entry.id,
                )
              }
            >
              {copy('viewStatement')}
            </ClarteButton>
          </div>
        </>
      )}
    </li>
  );
}
