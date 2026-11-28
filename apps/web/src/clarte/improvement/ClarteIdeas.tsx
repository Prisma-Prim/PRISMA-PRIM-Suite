import { Lightbulb, Plus, RotateCw } from 'lucide-react';
import { useId, useRef, useState, type ReactNode, type Ref } from 'react';
import type { History, Idea } from '../../ideas/ideas-contract';
import { useIdeasCopy } from '../../ideas/ideas.copy';
import {
  ideaExcerpt,
  useIdeasLifetime,
  useIdeasRegistry,
  type IdeasRegistry,
  type IdeasWorkspaceProps,
} from '../../ideas/use-ideas-registry';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useClarteComponentCopy } from '../components/clarte-components.copy';
import { ClartePanelParts } from './ClartePanelParts';
import { RowChevron, RowChevronHead, openRowButton } from './ClarteRow';
import { useClarteImprovementCopy } from './clarte-improvement.copy';
import './clarte-improvement.css';

const dispositionTone = {
  new: 'info',
  deferred: 'neutral',
  rejected: 'danger',
} as const satisfies Record<Idea['disposition'], ClarteTone>;

/**
 * Improvement › Ideas in Clarté (#1545): the Company's Ideas as a table, a
 * side panel to propose one, and one side panel per Idea with its original
 * submission, its decision and the decision history. The Ideas owner keeps
 * every read, draft, command, exact retry and access recovery.
 */
export function ClarteIdeas(props: IdeasWorkspaceProps) {
  const lifetime = useIdeasLifetime(props);
  if (lifetime === undefined) return null;
  return <ClarteIdeasRegistry key={lifetime} {...props} />;
}

function ClarteIdeasRegistry(props: IdeasWorkspaceProps) {
  const copy = useIdeasCopy();
  const text = useClarteImprovementCopy();
  const { formatNumber } = useInterfaceLocale();
  const registry = useIdeasRegistry(props);
  const { authority, page, selectedId, busy, save, reviewSave } = registry;
  // The proposal panel is a view of the owner's draft: closing it keeps the
  // draft, as the current interface keeps it beside the list.
  const [proposing, setProposing] = useState(false);
  const recordNotices = <RecordNotices registry={registry} />;
  // A confirmed recording is stated beside the Idea it recorded, until that
  // Idea's own decision has an outcome; another open Idea does not show it.
  const recordedHere =
    save.status !== 'saved' ||
    (save.ideaId === selectedId && reviewSave.status === 'idle');
  return (
    <section
      ref={registry.workspace}
      id="ideas"
      tabIndex={-1}
      className="clarte-improvement"
      aria-label={copy('label')}
    >
      {!selectedId && !proposing && recordNotices}
      <ClarteCard
        title={text('ideasHeading')}
        actions={
          <>
            <ClarteButton disabled={busy} onClick={registry.refresh}>
              <RotateCw aria-hidden="true" />
              {copy('refresh')}
            </ClarteButton>
            {authority.record && (
              <ClarteButton
                variant="primary"
                onClick={() => setProposing(true)}
              >
                <Plus aria-hidden="true" />
                {text('proposeIdea')}
              </ClarteButton>
            )}
          </>
        }
      >
        {page.status === 'loading' && (
          <ClarteLoadingState label={copy('loading')} />
        )}
        {(page.status === 'error' ||
          page.status === 'denied' ||
          page.status === 'unavailable') && (
          <ClarteErrorState title={copy(page.status)} />
        )}
        {page.status === 'ready' && (
          <>
            {page.value.ideas.length === 0 ? (
              <ClarteEmptyState title={copy('empty')} />
            ) : (
              <IdeasTable registry={registry} ideas={page.value.ideas} />
            )}
            <div className="clarte-improvement-foot">
              <p>
                {copy('label')}: {formatNumber(page.value.total)}
              </p>
              {page.value.nextCursor && (
                <ClarteButton
                  size="small"
                  disabled={busy}
                  onClick={registry.nextPage}
                >
                  {copy('next')}
                </ClarteButton>
              )}
            </div>
          </>
        )}
      </ClarteCard>
      {selectedId ? (
        <IdeaPanel
          registry={registry}
          notices={recordedHere && recordNotices}
          onClose={() => {
            setProposing(false);
            registry.close();
          }}
        />
      ) : (
        proposing &&
        authority.record && (
          <ProposalPanel
            registry={registry}
            notices={recordNotices}
            onClose={() => setProposing(false)}
          />
        )
      )}
    </section>
  );
}

function IdeasTable({
  registry,
  ideas,
}: Readonly<{ registry: IdeasRegistry; ideas: readonly Idea[] }>) {
  const copy = useIdeasCopy();
  const text = useClarteImprovementCopy();
  return (
    <div className="clarte-table-wrap">
      <table className="clarte-table clarte-improvement-table clarte-improvement-ideas-table">
        <thead>
          <tr>
            <th scope="col">{text('ideaColumn')}</th>
            <th scope="col">{copy('origin')}</th>
            <th scope="col">{copy('kind')}</th>
            <RowChevronHead />
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea) => (
            <tr
              key={idea.id}
              className="clarte-improvement-row"
              onClick={openRowButton}
            >
              <td data-label={text('ideaColumn')}>
                <button
                  type="button"
                  className="clarte-improvement-row-open"
                  disabled={registry.busy}
                  onClick={(event) =>
                    registry.openFromRow(idea.id, event.currentTarget)
                  }
                >
                  {ideaExcerpt(idea.description)}
                </button>
              </td>
              <td
                data-label={copy('origin')}
                className="clarte-improvement-literal"
              >
                {idea.origin}
              </td>
              <td data-label={copy('kind')}>
                <ClarteBadge tone={dispositionTone[idea.disposition]}>
                  {copy(idea.disposition)}
                </ClarteBadge>
              </td>
              <RowChevron />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The outcome of a recording, where the person is looking: one place only. */
function RecordNotices({ registry }: Readonly<{ registry: IdeasRegistry }>) {
  const copy = useIdeasCopy();
  const { save, busy } = registry;
  if (save.status === 'saved')
    return (
      <p role="status" className="clarte-improvement-notice">
        {copy('saveConfirmed')}
      </p>
    );
  if (save.status === 'uncertain')
    return (
      <div
        role="alert"
        className="clarte-improvement-notice clarte-improvement-notice--warning"
      >
        <p>{copy('uncertain')}</p>
        <ClarteButton
          variant="primary"
          size="small"
          disabled={busy}
          onClick={registry.retryRecord}
        >
          {copy('retry')}
        </ClarteButton>
      </div>
    );
  if (
    save.status === 'validation' ||
    save.status === 'denied' ||
    save.status === 'conflict'
  )
    return (
      <p
        id="clarte-idea-validation"
        role="alert"
        className="clarte-improvement-notice clarte-improvement-notice--danger"
      >
        {copy(save.status)}
      </p>
    );
  return null;
}

function ProposalPanel({
  registry,
  notices,
  onClose,
}: Readonly<{
  registry: IdeasRegistry;
  notices: ReactNode;
  onClose: () => void;
}>) {
  const copy = useIdeasCopy();
  const text = useClarteImprovementCopy();
  const components = useClarteComponentCopy();
  const { save, busy } = registry;
  const invalid = save.status === 'validation';
  const describedBy = (control: string | undefined) =>
    [control, invalid ? 'clarte-idea-validation' : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <ClarteSidePanel
      title={text('proposeIdea')}
      icon={<Lightbulb />}
      dismissible={!busy}
      onClose={onClose}
    >
      <div className="clarte-improvement-panel">
        {notices}
        <form
          className="clarte-improvement-form"
          onSubmit={registry.record}
          noValidate
        >
          <ClarteField label={copy('description')}>
            {(control) => (
              <textarea
                {...control}
                className="clarte-input"
                rows={5}
                required
                value={registry.description}
                disabled={busy}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy(control['aria-describedby'])}
                onChange={(event) =>
                  registry.changeDescription(event.target.value)
                }
              />
            )}
          </ClarteField>
          <ClarteField label={copy('origin')}>
            {(control) => (
              <textarea
                {...control}
                className="clarte-input"
                rows={2}
                required
                value={registry.origin}
                disabled={busy}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy(control['aria-describedby'])}
                onChange={(event) => registry.changeOrigin(event.target.value)}
              />
            )}
          </ClarteField>
          <div className="clarte-improvement-actions">
            <ClarteButton disabled={busy} onClick={onClose}>
              {components.cancel}
            </ClarteButton>
            <ClarteButton type="submit" variant="primary" disabled={busy}>
              {copy(save.status === 'saving' ? 'recording' : 'record')}
            </ClarteButton>
          </div>
        </form>
      </div>
    </ClarteSidePanel>
  );
}

function IdeaPanel({
  registry,
  notices,
  onClose,
}: Readonly<{
  registry: IdeasRegistry;
  notices: ReactNode;
  onClose: () => void;
}>) {
  const copy = useIdeasCopy();
  const text = useClarteImprovementCopy();
  const { formatNumber } = useInterfaceLocale();
  const { detail, page, selectedId, busy } = registry;
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const ready = detail?.status === 'ready' ? detail.value : undefined;
  const listed =
    page.status === 'ready'
      ? page.value.ideas.find((idea) => idea.id === selectedId)
      : undefined;
  const shown = ready?.idea ?? listed;
  const title = shown ? ideaExcerpt(shown.description) : copy('label');
  return (
    <ClarteSidePanel
      title={title}
      description={shown ? `${copy('origin')}: ${shown.origin}` : undefined}
      icon={<Lightbulb />}
      dismissible={!busy}
      onClose={onClose}
    >
      <div className="clarte-improvement-panel">
        <div className="clarte-improvement-toolbar">
          {ready && (
            <ClartePanelParts
              parts={[
                {
                  label: text('decisionPart'),
                  heading: registry.heading,
                },
                { label: text('historyPart'), heading: historyHeading },
              ]}
            />
          )}
          <ClarteButton
            size="small"
            disabled={busy}
            onClick={registry.reloadIdea}
          >
            <RotateCw aria-hidden="true" />
            {copy('reload')}
          </ClarteButton>
        </div>
        {ready ? (
          <article
            aria-label={copy('original')}
            className="clarte-improvement-record"
          >
            <h3 ref={registry.heading} tabIndex={-1}>
              {text('currentDecision')}
            </h3>
            <p className="clarte-improvement-meta">
              <ClarteBadge tone={dispositionTone[ready.idea.disposition]}>
                {copy(ready.idea.disposition)}
              </ClarteBadge>{' '}
              · {copy('revision')} {formatNumber(ready.idea.revision)}
            </p>
            {notices}
            {ready.idea.description.trim() !== title && (
              <p className="clarte-improvement-literal clarte-improvement-lead">
                {ready.idea.description}
              </p>
            )}
            {registry.authority.review && <DecisionForm registry={registry} />}
            <DecisionHistory
              registry={registry}
              history={ready.history}
              idea={ready.idea}
              headingRef={historyHeading}
            />
          </article>
        ) : (
          <>
            {notices}
            {detail?.status === 'loading' && (
              <ClarteLoadingState label={copy('loading')} />
            )}
            {(detail?.status === 'error' ||
              detail?.status === 'denied' ||
              detail?.status === 'unavailable') && (
              <ClarteErrorState title={copy(detail.status)} />
            )}
          </>
        )}
      </div>
    </ClarteSidePanel>
  );
}

function DecisionForm({ registry }: Readonly<{ registry: IdeasRegistry }>) {
  const copy = useIdeasCopy();
  const text = useClarteImprovementCopy();
  const id = useId();
  const { reviewSave, kind, busy, reviewLocked } = registry;
  const locked = busy || reviewLocked;
  const invalid = reviewSave.status === 'validation';
  const noticeId = `${id}-notice`;
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="clarte-improvement-section"
    >
      <h3 id={`${id}-title`}>{text('decideHeading')}</h3>
      {reviewSave.status === 'saved' && (
        <p role="status" className="clarte-improvement-notice">
          {copy('saveConfirmed')}
        </p>
      )}
      {reviewSave.status === 'uncertain' && (
        <div
          role="alert"
          className="clarte-improvement-notice clarte-improvement-notice--warning"
        >
          <p>{copy('uncertain')}</p>
          <ClarteButton
            variant="primary"
            size="small"
            disabled={busy}
            onClick={registry.retryReview}
          >
            {copy('retry')}
          </ClarteButton>
        </div>
      )}
      {(reviewSave.status === 'stale' ||
        reviewSave.status === 'conflict' ||
        reviewSave.status === 'validation' ||
        reviewSave.status === 'denied') && (
        <p
          id={noticeId}
          role="alert"
          className="clarte-improvement-notice clarte-improvement-notice--danger"
        >
          {copy(reviewSave.status)}
        </p>
      )}
      <form
        className="clarte-improvement-form"
        onSubmit={registry.review}
        noValidate
      >
        <p className="clarte-field-hint">{copy('reviewHelp')}</p>
        <fieldset className="clarte-improvement-choice" disabled={locked}>
          <legend>{copy('kind')}</legend>
          {(
            [
              ['deferred', text('postpone')],
              ['rejected', text('reject')],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name={`${id}-kind`}
                value={value}
                checked={kind === value}
                onChange={() => registry.changeKind(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <ClarteField label={copy('reason')}>
          {(control) => (
            <textarea
              {...control}
              className="clarte-input"
              rows={3}
              required
              value={registry.reason}
              disabled={locked}
              aria-invalid={invalid || undefined}
              aria-describedby={
                [control['aria-describedby'], invalid ? noticeId : undefined]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onChange={(event) => registry.changeReason(event.target.value)}
            />
          )}
        </ClarteField>
        {kind === 'deferred' && (
          <ClarteField label={copy('date')} hint={copy('dateHelp')}>
            {(control) => (
              <input
                {...control}
                type="date"
                className="clarte-input clarte-improvement-date"
                value={registry.date}
                disabled={locked}
                onChange={(event) => registry.changeDate(event.target.value)}
              />
            )}
          </ClarteField>
        )}
        <div className="clarte-improvement-actions">
          <ClarteButton
            type="submit"
            variant={kind === 'rejected' ? 'danger' : 'primary'}
            disabled={locked}
          >
            {copy(reviewSave.status === 'saving' ? 'recording' : 'review')}
          </ClarteButton>
        </div>
      </form>
    </section>
  );
}

function DecisionHistory({
  registry,
  history,
  idea,
  headingRef,
}: Readonly<{
  registry: IdeasRegistry;
  history: History;
  idea: Idea;
  headingRef: Ref<HTMLHeadingElement>;
}>) {
  const copy = useIdeasCopy();
  const text = useClarteImprovementCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  return (
    <section
      aria-label={copy('history')}
      className="clarte-improvement-section"
    >
      <h3 ref={headingRef} tabIndex={-1}>
        {copy('history')}
      </h3>
      {history.entries.length === 0 && (
        <p className="clarte-improvement-quiet">{copy('historyEmpty')}</p>
      )}
      <ol className="clarte-improvement-timeline">
        {history.entries.map((entry) => (
          <li key={entry.id}>
            <strong>{copy(entry.kind)}</strong>
            <p className="clarte-improvement-literal">{entry.reason}</p>
            <p className="clarte-improvement-meta">
              {entry.recordedBy.displayName} ·{' '}
              {formatDateTime(entry.recordedAt)}
            </p>
            {entry.reconsiderationDate && (
              <p className="clarte-improvement-meta">
                {text('reviewDate')}: {formatDate(entry.reconsiderationDate)}
              </p>
            )}
          </li>
        ))}
        <li>
          <strong>{text('ideaSubmitted')}</strong>
          <p className="clarte-improvement-meta">
            {copy('submittedBy')}: {idea.submittedBy.displayName}
          </p>
          <p className="clarte-improvement-meta">
            {copy('submittedAt')}: {formatDateTime(idea.submittedAt)}
          </p>
        </li>
      </ol>
      {history.nextCursor && (
        <ClarteButton
          size="small"
          disabled={registry.busy}
          onClick={(event) => registry.moreHistory(event.currentTarget)}
        >
          {copy('moreHistory')}
        </ClarteButton>
      )}
    </section>
  );
}
