import { useId } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useOperationalRiskCopy } from './operational-risk.copy';
import { OperationalRiskJournalStatement } from './OperationalRiskJournalStatement';
import { OperationalRiskEditor } from './OperationalRiskEditor';
import { OperationalRiskFactsView } from './OperationalRiskFactsView';
import { OperationalRiskHistory } from './OperationalRiskHistory';
import {
  useOperationalRiskOwner,
  type OperationalRiskWorkspaceProps,
} from './use-operational-risk-owner';
import './operational-risk.css';

export { canReadOperationalRisks } from './use-operational-risk-owner';

export function OperationalRiskWorkspace(props: OperationalRiskWorkspaceProps) {
  const { actor } = props;
  const copy = useOperationalRiskCopy();
  const { formatDateTime } = useInterfaceLocale();
  const id = useId();
  const owner = useOperationalRiskOwner(props);
  const {
    list,
    selectedId,
    detail,
    risk,
    history,
    editor,
    pending,
    busy,
    notice,
    confirmedJournal,
    denied,
    statement,
    knownRevision,
    canRecord,
  } = owner;

  if (!owner.companyId || !owner.canRead) return null;
  const formatInstant = formatDateTime;

  return (
    <section className="risk-workspace" aria-labelledby={`${id}-heading`}>
      <header className="risk-heading">
        <div>
          <p className="risk-eyebrow">{actor.activeCompany?.displayName}</p>
          <h2 id="operational-risks" tabIndex={-1}>
            <span id={`${id}-heading`}>{copy('title')}</span>
          </h2>
          <p>{copy('description')}</p>
        </div>
        {canRecord && !denied && (
          <button
            className="risk-primary"
            type="button"
            disabled={busy}
            onClick={owner.startRecord}
          >
            {copy('newIntake')}
          </button>
        )}
      </header>
      <p className="risk-scope-note">{copy('limits')}</p>
      {denied ? (
        <p role="alert">{copy('denied')}</p>
      ) : (
        <>
          {!canRecord && <p className="risk-read-only">{copy('readOnly')}</p>}
          {notice && (
            <p role={notice === 'recorded' ? 'status' : 'alert'}>
              {copy(notice)}
            </p>
          )}
          {pending && (
            <div className="risk-command-state" role="status">
              <p>
                {pending.kind === 'submitting'
                  ? copy('loading')
                  : copy('uncertain')}
              </p>
              {pending.kind === 'uncertain' && (
                <button
                  className="risk-primary"
                  type="button"
                  onClick={owner.retryCommand}
                >
                  {copy(
                    pending.command.kind === 'journal-correct'
                      ? 'retryCorrection'
                      : 'retryExact',
                  )}
                </button>
              )}
            </div>
          )}
          <div className="risk-columns">
            <section aria-label={copy('list')} className="risk-panel">
              <h3>{copy('list')}</h3>
              {list.kind === 'loading' ? (
                <p role="status">{copy('loading')}</p>
              ) : list.kind === 'error' ? (
                <p role="alert">{copy('loadError')}</p>
              ) : (
                <>
                  <ul className="risk-list">
                    {list.value.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-pressed={selectedId === item.id}
                          disabled={busy || editor !== undefined}
                          onClick={() => owner.selectRisk(item.id)}
                        >
                          <strong>{item.process}</strong>
                          <span>{formatInstant(item.createdAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {list.value.items.length === 0 && <p>{copy('empty')}</p>}
                  {list.more === 'error' && (
                    <p role="alert">{copy('loadError')}</p>
                  )}
                  {list.value.next_cursor && (
                    <button
                      type="button"
                      disabled={busy || list.more === 'loading'}
                      onClick={owner.moreRisks}
                    >
                      {list.more === 'loading' ? copy('loading') : copy('more')}
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void owner.reload();
                }}
              >
                {copy('retryRead')}
              </button>
            </section>
            <div className="risk-main">
              {editor && (
                <OperationalRiskEditor
                  editor={editor}
                  companyName={actor.activeCompany?.displayName ?? ''}
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
                <OperationalRiskJournalStatement
                  value={statement.value}
                  revision={Math.max(knownRevision, risk?.revision ?? 0)}
                  canCorrect={
                    canRecord && !editor && notice !== 'savedRefreshError'
                  }
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
                  className="risk-panel"
                  aria-label={copy('currentStatement')}
                >
                  <p role={statement.kind === 'loading' ? 'status' : 'alert'}>
                    {copy(
                      statement.kind === 'loading'
                        ? 'loading'
                        : statement.kind === 'unavailable'
                          ? 'journalUnavailable'
                          : 'loadError',
                    )}
                  </p>
                  {statement.kind !== 'loading' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={owner.retryStatement}
                    >
                      {copy('retryRead')}
                    </button>
                  )}
                </section>
              )}
              {confirmedJournal && notice === 'savedRefreshError' && (
                <section
                  className="risk-panel"
                  aria-label={copy('savedCorrection')}
                >
                  <h3>{copy('savedCorrection')}</h3>
                  <p className="risk-literal">{confirmedJournal.narrative}</p>
                  <p className="risk-literal">
                    {copy('reason')}: {confirmedJournal.reason}
                  </p>
                </section>
              )}
              {selectedId && (
                <section className="risk-panel" aria-label={copy('current')}>
                  {detail.kind === 'loading' ? (
                    <p role="status">{copy('loading')}</p>
                  ) : !risk ? (
                    <p role="alert">{copy('loadError')}</p>
                  ) : (
                    <>
                      <div className="risk-detail-heading">
                        <h3>{risk.currentIntake.facts.process}</h3>
                        <span className="risk-revision">
                          {copy('revision')} {risk.revision}
                        </span>
                      </div>
                      {risk.revision < knownRevision && (
                        <p role="status">{copy('historicalStatement')}</p>
                      )}
                      <p className="risk-truth">{copy('notAssessed')}</p>
                      <p>{copy('notResponsible')}</p>
                      <h4>{copy('current')}</h4>
                      <OperationalRiskFactsView
                        facts={risk.currentIntake.facts}
                      />
                      {risk.currentIntake.kind === 'intake-corrected' && (
                        <p className="risk-literal">
                          <strong>{copy('reason')}: </strong>
                          {risk.currentIntake.reason}
                        </p>
                      )}
                      {canRecord && !editor && (
                        <div className="risk-actions">
                          <button
                            type="button"
                            disabled={busy || risk.revision < knownRevision}
                            onClick={() => owner.startCorrection(risk)}
                          >
                            {copy('correct')}
                          </button>
                          <button
                            className="risk-primary"
                            type="button"
                            disabled={busy || risk.revision < knownRevision}
                            onClick={() => owner.startJournalNote(risk)}
                          >
                            {copy('observation')} / {copy('reassessment')}
                          </button>
                        </div>
                      )}
                      <details>
                        <summary>{copy('original')}</summary>
                        <OperationalRiskFactsView
                          facts={risk.originalIntake.facts}
                        />
                      </details>
                      <OperationalRiskHistory
                        history={history}
                        busy={busy}
                        canSelect={!editor}
                        currentEntryId={
                          statement.kind === 'ready'
                            ? statement.value.currentEntry.id
                            : undefined
                        }
                        onView={owner.viewStatement}
                        onOlder={() => {
                          void owner.loadOlder();
                        }}
                      />
                    </>
                  )}
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
