import { BookOpen, Download, History, Search } from 'lucide-react';
import {
  knowledgeAuthority,
  knowledgeEvidenceKey,
  useKnowledgeEvidence,
  type KnowledgeEvidenceOwnerProps,
  type KnowledgeEvidenceProps,
} from '../../knowledge-evidence/KnowledgeEvidenceWorkspace';
import { useKnowledgeCopy } from '../../knowledge-evidence/knowledge.copy';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteField } from '../components/ClarteField';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useClarteDocumentsCopy } from './clarte-documents.copy';
import './clarte-documents.css';

/**
 * The Clarté Knowledge view of Documents (#1543): literal passage search in
 * the admitted Knowledge Items, the inventory of current sources, an exact
 * cited version reopened as it was, and the exact source PDF downloaded only
 * after its fingerprint matches. It renders the same session as the current
 * interface.
 */
export function ClarteKnowledge(props: KnowledgeEvidenceProps) {
  const authority = knowledgeAuthority(props.actor);
  return authority ? (
    <ClarteKnowledgeSession
      key={knowledgeEvidenceKey(authority, props.authorityGeneration)}
      {...props}
      authority={authority}
    />
  ) : null;
}

function ClarteKnowledgeSession(props: KnowledgeEvidenceOwnerProps) {
  const copy = useKnowledgeCopy();
  const clarte = useClarteDocumentsCopy();
  const { locale } = useInterfaceLocale();
  const languages = new Intl.DisplayNames([locale], { type: 'language' });
  const languageName = (code: string) => languages.of(code) ?? code;
  const {
    query,
    setQuery,
    view,
    setView,
    recovery,
    heading,
    retire,
    list,
    open,
    download,
  } = useKnowledgeEvidence(props);
  if (recovery.denied)
    return (
      <section
        id="knowledge-evidence"
        tabIndex={-1}
        className="clarte-knowledge"
        aria-label={clarte.knowledgeTab}
      >
        <ClarteErrorState
          title={copy('denied')}
          action={
            <ClarteButton
              onClick={() => {
                recovery.retry();
                void list();
              }}
            >
              {copy('retry')}
            </ClarteButton>
          }
        />
      </section>
    );
  const busy =
    view.kind === 'loading' ||
    (view.kind === 'citation' && view.pdf === 'pending');
  return (
    <section
      id="knowledge-evidence"
      tabIndex={-1}
      className="clarte-knowledge"
      aria-label={clarte.knowledgeTab}
    >
      <ClarteCard>
        <form
          className="clarte-knowledge-search"
          onSubmit={(event) => {
            event.preventDefault();
            void list({ query });
          }}
        >
          <Search aria-hidden="true" />
          <ClarteField label={copy('query')} labelHidden>
            {(control) => (
              <textarea
                {...control}
                className="clarte-input"
                rows={1}
                value={query}
                onChange={(event) => {
                  retire();
                  setQuery(event.target.value);
                  setView({ kind: 'idle' });
                }}
              />
            )}
          </ClarteField>
          <div className="clarte-document-actions">
            <ClarteButton type="submit" variant="primary" disabled={busy}>
              {copy('search')}
            </ClarteButton>
            <ClarteButton onClick={() => void list()}>
              {copy('inventory')}
            </ClarteButton>
          </div>
        </form>
      </ClarteCard>
      {view.kind === 'loading' && (
        <ClarteLoadingState label={copy('loading')} />
      )}
      {view.kind === 'failure' && (
        <ClarteErrorState
          title={copy(view.reason)}
          action={
            <ClarteButton
              onClick={() => void list({ query: query || undefined })}
            >
              {copy('retry')}
            </ClarteButton>
          }
        />
      )}
      {view.kind === 'inventory' && (
        <ClarteCard title={copy('inventory')}>
          {view.items.length === 0 ? (
            <ClarteEmptyState title={copy('empty')} />
          ) : (
            <ul className="clarte-list clarte-knowledge-sources">
              {view.items.map((source) => (
                <li key={source.sourceId}>
                  <span className="clarte-document-icon" aria-hidden="true">
                    <BookOpen />
                  </span>
                  <div className="clarte-document-row-main">
                    <strong>{source.title}</strong>
                    <p className="clarte-document-row-meta">
                      <span>{copy('exact')}</span>
                      <span>{languageName(source.language)}</span>
                    </p>
                  </div>
                  <ClarteBadge
                    tone={
                      source.versionStatus === 'official'
                        ? 'success'
                        : 'neutral'
                    }
                  >
                    {copy(source.versionStatus)}
                  </ClarteBadge>
                </li>
              ))}
            </ul>
          )}
          {view.nextCursor && (
            <ClarteButton
              onClick={() =>
                void list({ cursor: view.nextCursor ?? undefined })
              }
            >
              {copy('more')}
            </ClarteButton>
          )}
        </ClarteCard>
      )}
      {view.kind === 'search' && (
        <ClarteCard title={clarte.passages}>
          {view.items.length === 0 ? (
            <ClarteEmptyState title={copy('noMatch')} />
          ) : (
            <ul className="clarte-knowledge-passages">
              {view.items.map((citation) => (
                <li
                  key={JSON.stringify([
                    citation.source.sourceId,
                    citation.locator,
                  ])}
                >
                  <figure>
                    <blockquote>{citation.text}</blockquote>
                    <figcaption>
                      <h3>{citation.source.title}</h3>
                      <span>
                        {languageName(citation.source.language)} ·{' '}
                        {citation.locator}
                      </span>
                    </figcaption>
                  </figure>
                  <div className="clarte-document-actions">
                    <ClarteButton
                      size="small"
                      onClick={() => void open(citation, 'current')}
                    >
                      {copy('open')}
                    </ClarteButton>
                    <ClarteButton
                      size="small"
                      onClick={() => void download(citation, 'current')}
                    >
                      <Download aria-hidden="true" />
                      {copy('download')}
                    </ClarteButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {view.nextCursor && (
            <ClarteButton
              onClick={() =>
                void list({
                  query: view.query,
                  cursor: view.nextCursor ?? undefined,
                })
              }
            >
              {copy('more')}
            </ClarteButton>
          )}
        </ClarteCard>
      )}
      {view.kind === 'citation' && (
        <article
          className="clarte-card clarte-knowledge-citation"
          aria-label={view.citation.source.title}
        >
          <div className="clarte-card-head">
            <h2 ref={heading} tabIndex={-1}>
              {view.citation.source.title}
            </h2>
            <ClarteBadge
              tone={
                view.citation.source.versionStatus === 'official'
                  ? 'success'
                  : 'neutral'
              }
            >
              {copy(view.citation.source.versionStatus)}
            </ClarteBadge>
          </div>
          <blockquote className="clarte-knowledge-passage">
            {view.citation.text}
          </blockquote>
          {view.mode === 'historical' && (
            <p className="clarte-knowledge-historical">
              <History aria-hidden="true" />
              {copy('historical')}
            </p>
          )}
          <p className="clarte-documents-note">{copy('exact')}</p>
          <dl className="clarte-document-facts-list">
            <div>
              <dt>{copy('language')}</dt>
              <dd>{languageName(view.citation.source.language)}</dd>
            </div>
            <div>
              <dt>{copy('locator')}</dt>
              <dd className="knowledge-locator">{view.citation.locator}</dd>
            </div>
            <div>
              <dt>{copy('retrieved')}</dt>
              <dd>
                <time dateTime={view.citation.retrievedAt}>
                  {new Intl.DateTimeFormat(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    fractionalSecondDigits: 3,
                    timeZone: 'UTC',
                    timeZoneName: 'short',
                  }).format(new Date(view.citation.retrievedAt))}
                </time>
              </dd>
            </div>
          </dl>
          {view.pdf === 'pending' && <p role="status">{copy('loading')}</p>}
          {view.pdf === 'failure' && (
            <p className="clarte-documents-feedback" role="alert">
              {copy('pdfFailure')}
            </p>
          )}
          <div className="clarte-document-actions">
            <ClarteButton
              variant="primary"
              disabled={view.pdf === 'pending'}
              onClick={() => void download(view.citation, view.mode)}
            >
              <Download aria-hidden="true" />
              {copy('download')}
            </ClarteButton>
            <ClarteButton
              disabled={view.pdf === 'pending'}
              onClick={() => void open(view.citation, 'historical')}
            >
              {copy('history')} — {view.citation.source.title}
            </ClarteButton>
            {view.mode === 'historical' && (
              <ClarteButton variant="quiet" onClick={() => void list()}>
                {copy('current')}
              </ClarteButton>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
