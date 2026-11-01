import { useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { useAccessRecovery } from '../api/use-access-recovery';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { knowledgeAuthority } from './knowledge-authority';
import {
  digest,
  literal,
  readInventory,
  readPassage,
  readSearch,
  type Citation,
  type Source,
} from './knowledge-response';
import { useKnowledgeCopy } from './knowledge.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
import './knowledge.css';
export { knowledgeAuthority } from './knowledge-authority';

export interface KnowledgeEvidenceProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  authorityGeneration: string;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (id: string) => void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}
type Failure = 'unavailable' | 'missing' | 'malformed' | 'invalid';
type View =
  | { kind: 'loading' | 'idle' }
  | { kind: 'failure'; reason: Failure }
  | { kind: 'inventory'; items: Source[]; nextCursor: string | null }
  | {
      kind: 'search';
      items: Citation[];
      nextCursor: string | null;
      query: string;
    }
  | {
      kind: 'citation';
      citation: Citation;
      mode: 'current' | 'historical';
      pdf: 'idle' | 'pending' | 'failure';
    };

export function KnowledgeEvidenceWorkspace(props: KnowledgeEvidenceProps) {
  const authority = knowledgeAuthority(props.actor);
  return authority ? (
    <EvidenceOwner
      key={authority.key + ':' + props.authorityGeneration}
      {...props}
      authority={authority}
    />
  ) : null;
}
function EvidenceOwner(
  props: KnowledgeEvidenceProps & {
    authority: NonNullable<ReturnType<typeof knowledgeAuthority>>;
  },
) {
  const copy = useKnowledgeCopy();
  const { locale } = useInterfaceLocale();
  const [query, setQuery] = useState(''),
    [view, setView] = useState<View>({ kind: 'loading' });
  const recovery = useAccessRecovery({ ...props, authority: props.authority });
  const capture = useAuthorityLifetime(
    props.authority.key + ':' + props.authorityGeneration,
    props.identity,
  );
  const operation = useRef<AbortController | null>(null),
    visited = useRef(new Set<string>()),
    objectUrl = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  function retire() {
    operation.current?.abort();
    operation.current = null;
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  }
  function begin() {
    retire();
    const controller = new AbortController();
    operation.current = controller;
    const scopeLive = capture();
    return {
      signal: controller.signal,
      live: () =>
        scopeLive() &&
        operation.current === controller &&
        !controller.signal.aborted,
    };
  }
  function failure(result: ApiResult<unknown>): Failure {
    return result.status === 'notFound'
      ? 'missing'
      : result.status === 'validation'
        ? 'invalid'
        : 'unavailable';
  }
  async function request(path: string, owner: ReturnType<typeof begin>) {
    if (!owner.live()) return;
    const api = await createAuthenticatedApiClient(props.identity);
    if (!owner.live()) return;
    const result = await api.request<unknown>(path, {
      companyContextId: props.authority.companyId,
      signal: owner.signal,
      cache: 'no-store',
    });
    if (!owner.live()) return;
    if (result.status === 'unauthorized' || result.status === 'forbidden') {
      retire();
      setView({ kind: 'loading' });
      recovery.reject(result);
      return;
    }
    if (result.status !== 'ok') {
      setView({ kind: 'failure', reason: failure(result) });
      return;
    }
    return result.value;
  }
  async function list({
    query: searchQuery,
    cursor,
  }: { query?: string; cursor?: string } = {}) {
    if (searchQuery !== undefined && !literal(searchQuery, 200)) {
      retire();
      setView({ kind: 'failure', reason: 'invalid' });
      return;
    }
    const owner = begin();
    setView({ kind: 'loading' });
    if (!cursor) visited.current.clear();
    else visited.current.add(cursor);
    try {
      const params = new URLSearchParams();
      if (searchQuery !== undefined) params.set('query', searchQuery);
      if (cursor) params.set('cursor', cursor);
      const suffix = params.size ? '?' + params.toString() : '';
      const value = await request(
        '/knowledge/evidence/' +
          (searchQuery === undefined ? 'sources' : 'search') +
          suffix,
        owner,
      );
      if (!owner.live() || value === undefined) return;
      if (searchQuery === undefined) {
        const page = readInventory(value);
        if (page.nextCursor && visited.current.has(page.nextCursor))
          throw new Error('Repeated continuation.');
        setView({ kind: 'inventory', ...page });
      } else {
        const page = await readSearch(value, searchQuery);
        if (!owner.live()) return;
        if (page.nextCursor && visited.current.has(page.nextCursor))
          throw new Error('Repeated continuation.');
        setView({ kind: 'search', query: searchQuery, ...page });
      }
    } catch {
      if (owner.live()) setView({ kind: 'failure', reason: 'malformed' });
    }
  }
  function passagePath(citation: Citation, mode: 'current' | 'historical') {
    return (
      '/knowledge/evidence/sources/' +
      encodeURIComponent(citation.source.sourceId) +
      '/passages/' +
      encodeURIComponent(citation.locator) +
      (mode === 'historical'
        ? '?mode=historical&documentVersionId=' +
          encodeURIComponent(citation.source.documentVersionId)
        : '')
    );
  }
  async function open(target: Citation, mode: 'current' | 'historical') {
    // Capture the immutable known target before the prior operation is retired.
    const owner = begin();
    setView({ kind: 'loading' });
    try {
      const value = await request(passagePath(target, mode), owner);
      if (!owner.live() || value === undefined) return;
      const citation = await readPassage(value, mode, target);
      if (!owner.live()) return;
      setView({ kind: 'citation', citation, mode, pdf: 'idle' });
      queueMicrotask(() => {
        if (owner.live()) heading.current?.focus();
      });
    } catch {
      if (owner.live()) setView({ kind: 'failure', reason: 'malformed' });
    }
  }
  async function download(target: Citation, mode: 'current' | 'historical') {
    const owner = begin();
    let verified: Citation | undefined;
    setView({ kind: 'citation', citation: target, mode, pdf: 'pending' });
    try {
      const value = await request(passagePath(target, mode), owner);
      if (!owner.live() || value === undefined) return;
      const fresh = await readPassage(value, mode, target);
      if (!owner.live()) return;
      verified = fresh;
      setView({ kind: 'citation', citation: fresh, mode, pdf: 'pending' });
      const api = await createAuthenticatedApiClient(props.identity);
      if (!owner.live()) return;
      const { documentId, documentVersionId, representationId, sourceSha256 } =
        fresh.source;
      const result = await api.download(
        `/documents/${documentId}/versions/${documentVersionId}/content/${representationId}`,
        {
          companyContextId: props.authority.companyId,
          signal: owner.signal,
          cache: 'no-store',
          maximumBytes: 5 * 1024 * 1024,
        },
      );
      if (!owner.live()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        retire();
        setView({ kind: 'loading' });
        recovery.reject(result);
        return;
      }
      if (result.status === 'notFound') {
        setView({ kind: 'failure', reason: 'missing' });
        return;
      }
      if (
        result.status !== 'ok' ||
        result.value.type !== 'application/pdf' ||
        result.value.size < 5 ||
        result.value.size > 5 * 1024 * 1024
      )
        throw new Error('Invalid PDF.');
      const bytes = new Uint8Array(await result.value.arrayBuffer());
      if (!owner.live()) return;
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-')
        throw new Error('Invalid PDF.');
      const actual = await digest(bytes);
      if (!owner.live()) return;
      if (actual !== sourceSha256) throw new Error('Invalid PDF.');
      const url = URL.createObjectURL(result.value);
      objectUrl.current = url;
      if (!owner.live()) {
        URL.revokeObjectURL(url);
        objectUrl.current = null;
        return;
      }
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'knowledge-source.pdf';
      anchor.click();
      URL.revokeObjectURL(url);
      objectUrl.current = null;
      if (owner.live())
        setView({ kind: 'citation', citation: fresh, mode, pdf: 'idle' });
    } catch {
      if (owner.live())
        setView(
          verified
            ? { kind: 'citation', citation: verified, mode, pdf: 'failure' }
            : { kind: 'failure', reason: 'malformed' },
        );
    }
  }
  useEffect(() => {
    void list();
    return retire;
  }, []);
  if (recovery.denied)
    return (
      <section className="knowledge-evidence">
        <h2>{copy('title')}</h2>
        <p role="alert">{copy('denied')}</p>
        <button
          type="button"
          onClick={() => {
            recovery.retry();
            void list();
          }}
        >
          {copy('retry')}
        </button>
      </section>
    );
  return (
    <section
      id="knowledge-evidence"
      tabIndex={-1}
      className="knowledge-evidence"
      aria-label={copy('title')}
    >
      <h2 ref={heading} tabIndex={-1} data-shell-focus-target>
        {copy('title')}
      </h2>
      <p>{props.actor.activeCompany?.displayName}</p>
      <p>{copy('help')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void list({ query });
        }}
      >
        <label>
          {copy('query')}
          <textarea
            rows={2}
            value={query}
            onChange={(event) => {
              retire();
              setQuery(event.target.value);
              setView({ kind: 'idle' });
            }}
          />
        </label>
        <button
          disabled={
            view.kind === 'loading' ||
            (view.kind === 'citation' && view.pdf === 'pending')
          }
        >
          {copy('search')}
        </button>
        <button type="button" onClick={() => void list()}>
          {copy('inventory')}
        </button>
      </form>
      {view.kind === 'loading' && <p role="status">{copy('loading')}</p>}
      {view.kind === 'failure' && (
        <div role="alert">
          <p>{copy(view.reason)}</p>
          <button
            type="button"
            onClick={() => void list({ query: query || undefined })}
          >
            {copy('retry')}
          </button>
        </div>
      )}
      {view.kind === 'inventory' && (
        <>
          <h3>{copy('inventory')}</h3>
          {view.items.length === 0 && <p>{copy('empty')}</p>}
          <ul>
            {view.items.map((source) => (
              <li key={source.sourceId}>
                <strong>{source.title}</strong>
                <p>
                  {copy('exact')} · {copy(source.versionStatus)} ·{' '}
                  {source.language}
                </p>
              </li>
            ))}
          </ul>
          {view.nextCursor && (
            <button
              type="button"
              onClick={() =>
                void list({ cursor: view.nextCursor ?? undefined })
              }
            >
              {copy('more')}
            </button>
          )}
        </>
      )}
      {view.kind === 'search' && (
        <>
          {view.items.length === 0 && <p>{copy('noMatch')}</p>}
          <ul>
            {view.items.map((citation) => (
              <li
                key={JSON.stringify([
                  citation.source.sourceId,
                  citation.locator,
                ])}
              >
                <h3>{citation.source.title}</h3>
                <p>
                  {citation.source.language} · {citation.locator}
                </p>
                <pre>{citation.text}</pre>
                <button
                  type="button"
                  onClick={() => void open(citation, 'current')}
                >
                  {copy('open')}
                </button>
              </li>
            ))}
          </ul>
          {view.nextCursor && (
            <button
              type="button"
              onClick={() =>
                void list({
                  query: view.query,
                  cursor: view.nextCursor ?? undefined,
                })
              }
            >
              {copy('more')}
            </button>
          )}
        </>
      )}
      {view.kind === 'citation' && (
        <article aria-label={view.citation.source.title}>
          <h3>{view.citation.source.title}</h3>
          {view.mode === 'historical' && <p>{copy('historical')}</p>}
          <p>
            {copy('exact')} · {copy(view.citation.source.versionStatus)}
          </p>
          <dl>
            <dt>{copy('language')}</dt>
            <dd>{view.citation.source.language}</dd>
            <dt>{copy('locator')}</dt>
            <dd className="knowledge-locator">{view.citation.locator}</dd>
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
          </dl>
          <pre>{view.citation.text}</pre>
          <button
            type="button"
            disabled={view.pdf === 'pending'}
            onClick={() => void download(view.citation, view.mode)}
          >
            {copy('download')}
          </button>
          {view.pdf === 'pending' && <p role="status">{copy('loading')}</p>}
          {view.pdf === 'failure' && <p role="alert">{copy('pdfFailure')}</p>}
          <button
            type="button"
            disabled={view.pdf === 'pending'}
            onClick={() => void open(view.citation, 'historical')}
          >
            {copy('history')} — {view.citation.source.title}
          </button>
          {view.mode === 'historical' && (
            <button type="button" onClick={() => void list()}>
              {copy('current')}
            </button>
          )}
        </article>
      )}
    </section>
  );
}
