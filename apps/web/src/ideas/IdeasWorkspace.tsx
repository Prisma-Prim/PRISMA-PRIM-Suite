import './ideas-workspace.css';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { useIdeasCopy } from './ideas.copy';
import {
  ideaExcerpt,
  useIdeasLifetime,
  useIdeasRegistry,
  type IdeasWorkspaceProps,
} from './use-ideas-registry';

export function IdeasWorkspace(props: IdeasWorkspaceProps) {
  const lifetime = useIdeasLifetime(props);
  if (lifetime === undefined) return null;
  return <IdeasRegistry key={lifetime} {...props} />;
}
function IdeasRegistry(props: IdeasWorkspaceProps) {
  const copy = useIdeasCopy();
  const { formatDate, formatDateTime, formatNumber } = useInterfaceLocale();
  const {
    authority,
    page,
    detail,
    selectedId,
    description,
    origin,
    save,
    reviewSave,
    kind,
    reason,
    date,
    busy,
    reviewLocked,
    heading,
    workspace,
    ...registry
  } = useIdeasRegistry(props);
  return (
    <section
      ref={workspace}
      className="ideas-workspace"
      id="ideas"
      tabIndex={-1}
      aria-labelledby="ideas-title"
    >
      <header>
        <h2 id="ideas-title">{copy('label')}</h2>
        <button type="button" disabled={busy} onClick={registry.refresh}>
          {copy('refresh')}
        </button>
      </header>
      {save.status === 'saved' && <p role="status">{copy('saveConfirmed')}</p>}
      {save.status === 'uncertain' && (
        <div role="alert">
          <p>{copy('uncertain')}</p>
          <button type="button" disabled={busy} onClick={registry.retryRecord}>
            {copy('retry')}
          </button>
        </div>
      )}
      {(save.status === 'validation' ||
        save.status === 'denied' ||
        save.status === 'conflict') && (
        <p id="idea-validation" role="alert">
          {copy(save.status)}
        </p>
      )}
      {authority.record && (
        <form onSubmit={registry.record} noValidate>
          <div className="ideas-fields">
            <label htmlFor="idea-description">
              {copy('description')}
              <textarea
                id="idea-description"
                required
                value={description}
                disabled={busy}
                aria-invalid={save.status === 'validation'}
                aria-describedby={
                  save.status === 'validation' ? 'idea-validation' : undefined
                }
                onChange={(event) =>
                  registry.changeDescription(event.target.value)
                }
              />
            </label>
            <label htmlFor="idea-origin">
              {copy('origin')}
              <textarea
                id="idea-origin"
                required
                value={origin}
                disabled={busy}
                aria-invalid={save.status === 'validation'}
                aria-describedby={
                  save.status === 'validation' ? 'idea-validation' : undefined
                }
                onChange={(event) => registry.changeOrigin(event.target.value)}
              />
            </label>
            <button type="submit" className="ideas-primary" disabled={busy}>
              {copy(save.status === 'saving' ? 'recording' : 'record')}
            </button>
          </div>
        </form>
      )}
      {page.status === 'loading' && <p role="status">{copy('loading')}</p>}
      {page.status !== 'ready' && page.status !== 'loading' && (
        <p role="alert">{copy(page.status)}</p>
      )}
      {page.status === 'ready' && (
        <div className="ideas-register">
          <p>
            {copy('label')}: {formatNumber(page.value.total)}
          </p>
          {page.value.ideas.length === 0 && <p>{copy('empty')}</p>}
          <ul className="ideas-list">
            {page.value.ideas.map((idea) => (
              <li key={idea.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) =>
                    registry.openFromRow(idea.id, event.currentTarget)
                  }
                >
                  {ideaExcerpt(idea.description)}
                </button>
                <span
                  className={`ideas-status ideas-status-${idea.disposition}`}
                >
                  {copy(idea.disposition)}
                </span>
              </li>
            ))}
          </ul>
          {page.value.nextCursor && (
            <button type="button" disabled={busy} onClick={registry.nextPage}>
              {copy('next')}
            </button>
          )}
        </div>
      )}
      {detail?.status === 'loading' && <p role="status">{copy('loading')}</p>}
      {detail && detail.status !== 'loading' && detail.status !== 'ready' && (
        <p role="alert">{copy(detail.status)}</p>
      )}
      {selectedId && (
        <div className="ideas-actions">
          <button type="button" disabled={busy} onClick={registry.reloadIdea}>
            {copy('reload')}
          </button>
          <button type="button" disabled={busy} onClick={registry.close}>
            {copy('close')}
          </button>
        </div>
      )}
      {reviewSave.status === 'saved' && (
        <p role="status">{copy('saveConfirmed')}</p>
      )}
      {reviewSave.status === 'uncertain' && (
        <div role="alert">
          <p>{copy('uncertain')}</p>
          <button type="button" disabled={busy} onClick={registry.retryReview}>
            {copy('retry')}
          </button>
        </div>
      )}
      {(reviewSave.status === 'stale' ||
        reviewSave.status === 'conflict' ||
        reviewSave.status === 'validation' ||
        reviewSave.status === 'denied') && (
        <p id="idea-review-validation" role="alert">
          {copy(reviewSave.status)}
        </p>
      )}
      {detail?.status === 'ready' && (
        <article aria-label={copy('original')}>
          <h3 ref={heading} tabIndex={-1}>
            {copy('original')}
          </h3>
          <p className="ideas-literal">{detail.value.idea.description}</p>
          <p className="ideas-literal">{detail.value.idea.origin}</p>
          <p>
            {copy('submittedBy')}: {detail.value.idea.submittedBy.displayName}
          </p>
          <p>
            {copy('submittedAt')}:{' '}
            {formatDateTime(detail.value.idea.submittedAt)}
          </p>
          <p>
            <span
              className={`ideas-status ideas-status-${detail.value.idea.disposition}`}
            >
              {copy(detail.value.idea.disposition)}
            </span>{' '}
            · {copy('revision')} {formatNumber(detail.value.idea.revision)}
          </p>
          <h4>{copy('history')}</h4>
          {detail.value.history.entries.length === 0 && (
            <p>{copy('historyEmpty')}</p>
          )}
          <ol className="ideas-history">
            {detail.value.history.entries.map((entry) => (
              <li key={entry.id}>
                <strong>{copy(entry.kind)}</strong>
                <p className="ideas-literal">{entry.reason}</p>
                <p>
                  {entry.recordedBy.displayName} ·{' '}
                  {formatDateTime(entry.recordedAt)}
                </p>
                {entry.reconsiderationDate && (
                  <p>
                    {copy('date')}: {formatDate(entry.reconsiderationDate)}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {detail.value.history.nextCursor && (
            <button
              type="button"
              disabled={busy}
              onClick={(event) => registry.moreHistory(event.currentTarget)}
            >
              {copy('moreHistory')}
            </button>
          )}
          {authority.review && (
            <form onSubmit={registry.review} noValidate>
              <p>{copy('reviewHelp')}</p>
              <div className="ideas-fields">
                <label htmlFor="idea-disposition">{copy('kind')}</label>
                <Select
                  id="idea-disposition"
                  value={kind}
                  options={[
                    { value: 'deferred', label: copy('deferred') },
                    { value: 'rejected', label: copy('rejected') },
                  ]}
                  disabled={busy || reviewLocked}
                  onValueChange={(value) => {
                    if (value === 'deferred' || value === 'rejected')
                      registry.changeKind(value);
                  }}
                />
                <label htmlFor="idea-reason">
                  {copy('reason')}
                  <textarea
                    id="idea-reason"
                    required
                    value={reason}
                    disabled={busy || reviewLocked}
                    aria-invalid={reviewSave.status === 'validation'}
                    aria-describedby={
                      reviewSave.status === 'validation'
                        ? 'idea-review-validation'
                        : undefined
                    }
                    onChange={(event) =>
                      registry.changeReason(event.target.value)
                    }
                  />
                </label>
                {kind === 'deferred' && (
                  <>
                    <label htmlFor="idea-date">
                      {copy('date')}
                      <input
                        id="idea-date"
                        type="date"
                        value={date}
                        disabled={busy || reviewLocked}
                        aria-describedby="idea-date-help"
                        onChange={(event) =>
                          registry.changeDate(event.target.value)
                        }
                      />
                    </label>
                    <small id="idea-date-help">{copy('dateHelp')}</small>
                  </>
                )}
                <button
                  type="submit"
                  className={
                    kind === 'rejected' ? 'ideas-reject' : 'ideas-primary'
                  }
                  disabled={busy || reviewLocked}
                >
                  {copy(
                    reviewSave.status === 'saving' ? 'recording' : 'review',
                  )}
                </button>
              </div>
            </form>
          )}
        </article>
      )}
    </section>
  );
}
