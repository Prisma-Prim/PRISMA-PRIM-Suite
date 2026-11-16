import { useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { holds } from '../access/company-grants';
import {
  createAuthenticatedApiClient,
  type ApiRequest,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useAccessRecovery } from '../api/use-access-recovery';
import { digest, uuid } from '../knowledge-evidence/knowledge-response';
import {
  inventory,
  detail,
  search,
  historyPage,
  type citation,
  type source,
} from './analysis-response';
import {
  useAnalysisCopy,
  useAnalysisTerms,
  useAnalysisTruncation,
  useAnalysisIssue,
  useAnalysisInteractionCopy,
  useAnalysisHistoryCopy,
} from './analysis-copy';
import './analysis.css';

export interface DossierAnalysisProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  authorityGeneration: string;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (id: string) => void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}
type Inventory = ReturnType<typeof inventory>;
type Detail = ReturnType<typeof detail>;
type Search = ReturnType<typeof search>;
type Command = { path: string; request: ApiRequest };
type DocumentChoice = {
  documentId: string;
  documentTitle: string;
  documentVersionId: string;
  versionNumber: number;
  versionStatus: string;
  representationId: string | null;
  fileName: string | null;
  kind: 'pdf' | 'docx';
  caseId: string | null;
  attachmentId: string | null;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid response');
  return Object.fromEntries(Object.entries(value));
}
function documents(value: unknown): DocumentChoice[] {
  const x = record(value);
  if (!Array.isArray(x.items)) throw new Error('Invalid response');
  return x.items.map((v) => {
    const d = record(v);
    if (
      !uuid(d.documentId) ||
      typeof d.documentTitle !== 'string' ||
      !uuid(d.documentVersionId) ||
      typeof d.versionNumber !== 'number' ||
      !Number.isSafeInteger(d.versionNumber) ||
      d.versionNumber < 1 ||
      typeof d.versionStatus !== 'string' ||
      !['draft', 'official', 'superseded'].some((s) => s === d.versionStatus) ||
      !(
        (d.kind === 'pdf' &&
          uuid(d.representationId) &&
          typeof d.fileName === 'string') ||
        (d.kind === 'docx' &&
          d.representationId === null &&
          d.fileName === null)
      ) ||
      !(
        (d.caseId === null && d.attachmentId === null) ||
        (uuid(d.caseId) && uuid(d.attachmentId))
      )
    )
      throw new Error('Invalid inventory');
    return {
      documentId: d.documentId,
      documentTitle: d.documentTitle,
      documentVersionId: d.documentVersionId,
      versionNumber: d.versionNumber,
      versionStatus: d.versionStatus,
      representationId: d.representationId,
      fileName: d.fileName,
      kind: d.kind,
      caseId: d.caseId,
      attachmentId: d.attachmentId,
    };
  });
}
/** Presentation eligibility only; the server rechecks each source and operation. */
export function dossierAnalysisAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  return Boolean(
    actor.active &&
    company &&
    holds(company, 'company_project_access', 'project.read') &&
    holds(company, 'company_document_registrar', 'document.read') &&
    holds(
      company,
      'company_document_content_reader',
      'document.content.read',
    ) &&
    (actor.workspacePermissions.includes('client.manage') ||
      holds(company, 'company_director_client_access', 'client.read')),
  );
}
export function useDossierAnalysisTitle() {
  return useAnalysisCopy()[0];
}
export function DossierAnalysisWorkspace(props: DossierAnalysisProps) {
  const key = JSON.stringify([
    props.projectId,
    props.actor,
    props.authorityGeneration,
  ]);
  const lifetime = useRequestLifetime(props.identity, key);
  if (
    !dossierAnalysisAuthority(props.actor) ||
    !props.actor.activeCompany ||
    !props.identity.loaded ||
    !props.identity.signedIn
  )
    return null;
  return (
    <AnalysisOwner
      key={lifetime}
      {...props}
      companyId={props.actor.activeCompany.id}
      scope={String(lifetime)}
    />
  );
}
function AnalysisOwner(
  props: DossierAnalysisProps & { companyId: string; scope: string },
) {
  const c = useAnalysisCopy();
  const cursors = useRef(new Set<string>());
  const term = useAnalysisTerms();
  const truncation = useAnalysisTruncation();
  const issue = useAnalysisIssue();
  const interaction = useAnalysisInteractionCopy();
  const historyCopy = useAnalysisHistoryCopy();
  const historyCursors = useRef(new Set<string>());
  const historyGeneration = useRef(0);
  const recovery = useAccessRecovery({
    ...props,
    authority: { key: props.scope, companyId: props.companyId },
  });
  const base = `/projects/${encodeURIComponent(props.projectId)}/dossier-analysis`;
  const reads = useScopedOperationGroup(props.scope),
    side = useScopedOperationGroup(props.scope),
    searches = useScopedOperationGroup(props.scope),
    downloads = useScopedOperationGroup(props.scope),
    historyReads = useScopedOperationGroup(props.scope),
    fileReads = useScopedOperationGroup(props.scope),
    writes = useScopedOperationGroup(props.scope);
  const [data, setData] = useState<Inventory | null>(null),
    [selected, setSelected] = useState<Detail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [message, setMessage] = useState(''),
    [historyLoading, setHistoryLoading] = useState(false),
    [historyError, setHistoryError] = useState(false);
  const [docs, setDocs] = useState<DocumentChoice[]>([]),
    [choice, setChoice] = useState<DocumentChoice | null>(null),
    [language, setLanguage] = useState('ro'),
    [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<Command | null>(null),
    [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''),
    [mode, setMode] = useState('literal'),
    [filterSource, setFilterSource] = useState(''),
    [filterLanguage, setFilterLanguage] = useState(''),
    [filterStatus, setFilterStatus] = useState(''),
    [filterKind, setFilterKind] = useState(''),
    [filterField, setFilterField] = useState(''),
    [results, setResults] = useState<Search | null>(null);
  const [field, setField] = useState('taxId'),
    [value, setValue] = useState(''),
    [rationale, setRationale] = useState(''),
    [citationKey, setCitationKey] = useState(''),
    [quote, setQuote] = useState(''),
    [history, setHistory] = useState(false),
    [proposalFile, setProposalFile] = useState<File | null>(null),
    [replacement, setReplacement] = useState('');
  const editable =
    holds(
      props.actor.activeCompany,
      'company_document_content_uploader',
      'document.content.upload',
    ) &&
    holds(
      props.actor.activeCompany,
      'company_document_registrar',
      'document.version.manage',
    );
  function deny(result: ApiResult<unknown>) {
    if (result.status === 'unauthorized' || result.status === 'forbidden')
      recovery.reject(result);
    reads.retire();
    side.retire();
    searches.retire();
    downloads.retire();
    historyReads.retire();
    fileReads.retire();
    writes.retire();
    setData(null);
    setSelected(null);
    setDocs([]);
    setChoice(null);
    setPending(null);
    setError(true);
  }
  async function apiRequest(
    path: string,
    request: ApiRequest,
    group: typeof reads,
    latest = false,
  ) {
    const op = latest ? group.beginLatest() : group.begin();
    if (!op) return undefined;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (op.signal.aborted) return undefined;
      const result = await api.request(path, {
        ...request,
        companyContextId: props.companyId,
        signal: op.signal,
        cache: 'no-store',
      });
      if (op.signal.aborted || !group.isLive()) return undefined;
      if (
        result.status === 'unauthorized' ||
        result.status === 'forbidden' ||
        result.status === 'notFound'
      ) {
        deny(result);
        return undefined;
      }
      if (result.status !== 'ok') throw new Error(result.status);
      return result.value;
    } catch (error) {
      if (op.signal.aborted || !group.isLive()) return undefined;
      throw error;
    } finally {
      op.release();
    }
  }
  async function refresh() {
    historyGeneration.current++;
    historyReads.retire();
    historyCursors.current.clear();
    setHistoryLoading(false);
    setHistoryError(false);
    setLoading(true);
    setError(false);
    try {
      const v = await apiRequest(base, {}, reads, true);
      if (v !== undefined) setData(inventory(v));
    } catch {
      setData(null);
      setError(true);
    } finally {
      if (reads.isLive()) setLoading(false);
    }
  }
  async function loadMoreHistory() {
    if (!data?.runsNextCursor || historyReads.isPending()) return;
    const cursor = data.runsNextCursor;
    const generation = ++historyGeneration.current;
    historyCursors.current.add(cursor);
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const params = new URLSearchParams({ cursor });
      const value = await apiRequest(
        `${base}/runs?${params}`,
        {},
        historyReads,
        true,
      );
      if (value === undefined) return;
      const page = historyPage(value);
      if (
        (page.runsNextCursor &&
          historyCursors.current.has(page.runsNextCursor)) ||
        page.runs.some((r) =>
          data.runs.some((existing) => existing.id === r.id),
        )
      )
        throw new Error('Invalid history page');
      setData((current) =>
        current && current.runsNextCursor === cursor
          ? {
              ...current,
              runs: [...current.runs, ...page.runs],
              runsNextCursor: page.runsNextCursor,
            }
          : current,
      );
    } catch {
      if (historyReads.isLive() && generation === historyGeneration.current)
        setHistoryError(true);
    } finally {
      if (historyReads.isLive() && generation === historyGeneration.current)
        setHistoryLoading(false);
    }
  }
  async function loadDocs() {
    try {
      const v = await apiRequest(`${base}/inventory`, {}, side);
      if (v !== undefined) setDocs(documents(v));
    } catch {
      setMessage(c[48]);
    }
  }
  useEffect(() => {
    void refresh();
    void loadDocs();
  }, []);
  async function openRun(id: string) {
    searches.retire();
    fileReads.retire();
    setSelected(null);
    setResults(null);
    setCitationKey('');
    setQuote('');
    setHistory(false);
    try {
      const v = await apiRequest(
        `${base}/runs/${encodeURIComponent(id)}`,
        {},
        reads,
        true,
      );
      if (v !== undefined) {
        const result = detail(v);
        if (result.id !== id) throw new Error('Wrong run');
        setSelected(result);
      }
    } catch {
      setMessage(c[63]);
    }
  }
  async function send(command: Command) {
    setPending(command);
    setBusy(true);
    setMessage('');
    try {
      const response = await apiRequest(command.path, command.request, writes);
      if (response !== undefined) {
        setPending(null);
        setMessage(c[49]);
        await refresh();
        if (selected) await openRun(selected.id);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        ['validation', 'conflict'].includes(error.message)
      ) {
        setPending(null);
        setMessage(c[62]);
      } else setMessage(c[48]);
    } finally {
      if (writes.isLive()) setBusy(false);
    }
  }
  function command(
    path: string,
    method: 'POST' | 'DELETE',
    body?: string | Blob,
    headers: Record<string, string> = {},
  ) {
    if (writes.isPending()) return;
    const key = crypto.randomUUID();
    void send({
      path,
      request: {
        method,
        body,
        headers: { 'Idempotency-Key': key, ...headers },
      },
    });
  }
  function json(path: string, body: unknown) {
    command(path, 'POST', JSON.stringify(body), {
      'Content-Type': 'application/json',
    });
  }
  async function searchRun(cursor?: string) {
    if (!selected || !query.trim() || (selected.stale && !history)) return;
    if (cursor) cursors.current.add(cursor);
    else cursors.current.clear();
    const params = new URLSearchParams({ query, mode });
    if (selected.stale && history) params.set('history', 'true');
    if (cursor) params.set('cursor', cursor);
    if (filterSource) params.set('sourceId', filterSource);
    if (filterLanguage) params.set('language', filterLanguage);
    if (filterStatus) params.set('versionStatus', filterStatus);
    if (filterKind) params.set('kind', filterKind);
    if (filterField) params.set('field', filterField);
    try {
      const v = await apiRequest(
        `${base}/runs/${encodeURIComponent(selected.id)}/search?${params}`,
        {},
        searches,
        true,
      );
      if (v !== undefined) {
        const page = search(v);
        if (
          page.snapshotHash !== selected.snapshotHash ||
          (page.nextCursor && cursors.current.has(page.nextCursor))
        )
          throw new Error('Stale');
        for (const hit of page.hits) {
          const known = selected.sources.find((s) => s.id === hit.source.id);
          if (
            !known ||
            known.documentVersionId !== hit.source.documentVersionId ||
            known.sourceSha256 !== hit.source.sourceSha256 ||
            known.representationId !== hit.source.representationId ||
            !known.extraction.passages.some(
              (p) =>
                p.locator === hit.passage.locator &&
                p.sha256 === hit.passage.sha256 &&
                p.text === hit.passage.text,
            )
          )
            throw new Error('Invalid search evidence');
        }
        setResults(
          cursor && results
            ? { ...page, hits: [...results.hits, ...page.hits] }
            : page,
        );
      }
    } catch {
      setResults(null);
      setMessage(c[48]);
    }
  }
  async function download(
    path: string,
    filename: string,
    original?: ReturnType<typeof source>,
  ) {
    const op = downloads.begin();
    if (!op) return;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (op.signal.aborted) return;
      const result = await api.download(path, {
        companyContextId: props.companyId,
        signal: op.signal,
        cache: 'no-store',
        maximumBytes: original?.sizeBytes ?? 10 * 1024 * 1024,
      });
      if (op.signal.aborted) return;
      if (
        result.status === 'unauthorized' ||
        result.status === 'forbidden' ||
        result.status === 'notFound'
      ) {
        deny(result);
        return;
      }
      if (result.status !== 'ok') throw new Error('Unavailable');
      if (original) {
        if (
          result.value.type !== original.mediaType ||
          result.value.size !== original.sizeBytes
        )
          throw new Error('Invalid original');
        const bytes = new Uint8Array(await result.value.arrayBuffer());
        if (op.signal.aborted || !downloads.isLive()) return;
        const actual = await digest(bytes);
        if (op.signal.aborted || !downloads.isLive()) return;
        if (actual !== original.sourceSha256)
          throw new Error('Invalid original');
      }
      const url = URL.createObjectURL(result.value);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      if (!op.signal.aborted && downloads.isLive()) setMessage(c[48]);
    } finally {
      op.release();
    }
  }
  const citations =
    selected?.sources.flatMap((s) =>
      s.extraction.passages
        .map((p) => ({
          sourceId: s.id,
          documentVersionId: s.documentVersionId,
          locator: p.locator,
          start: 0,
          end: p.text.length,
          quote: p.text,
          passageSha256: p.sha256,
        }))
        .filter((p) => p.end > 0),
    ) ?? [];
  async function importProposal() {
    if (!selected || !proposalFile) return;
    const op = fileReads.beginLatest();
    if (!op) return;
    const runId = selected.id;
    try {
      const text = await proposalFile.text();
      if (op.signal.aborted || !fileReads.isLive()) return;
      const parsed: unknown = JSON.parse(text);
      json(`${base}/runs/${encodeURIComponent(runId)}/suggestions`, parsed);
    } catch {
      if (!op.signal.aborted && fileReads.isLive()) setMessage(c[63]);
    } finally {
      op.release();
    }
  }
  const pickedCitation = citations.find((_, i) => String(i) === citationKey);
  const quoteStart =
    pickedCitation && quote.length > 0 && quote.length <= 2000
      ? pickedCitation.quote.indexOf(quote)
      : -1;
  const validQuote =
    pickedCitation !== undefined &&
    quoteStart >= 0 &&
    pickedCitation.quote.indexOf(quote, quoteStart + 1) === -1;
  function manual() {
    if (!selected || !pickedCitation || !validQuote) return;
    const picked = {
      ...pickedCitation,
      start: quoteStart,
      end: quoteStart + quote.length,
      quote,
    };
    json(`${base}/runs/${encodeURIComponent(selected.id)}/suggestions`, {
      snapshotHash: selected.snapshotHash,
      suggestions: [{ field, value, rationale, citations: [picked] }],
    });
  }
  function sourceName(id: string) {
    return selected?.sources.find((s) => s.id === id)?.documentTitle ?? c[31];
  }
  function showCitation(item: ReturnType<typeof citation>) {
    const original = selected?.sources.find(
      (s) =>
        s.id === item.sourceId &&
        s.documentVersionId === item.documentVersionId,
    );
    const passage = original?.extraction?.passages.find(
      (p) => p.locator === item.locator && p.sha256 === item.passageSha256,
    );
    return (
      <blockquote>
        <strong>
          {sourceName(item.sourceId)} · {item.locator}
        </strong>
        <p>{item.quote}</p>
        {passage && passage.text !== item.quote && <p>{passage.text}</p>}
        <button
          type="button"
          disabled={!original}
          onClick={() =>
            original &&
            void download(
              `${base}/sources/${encodeURIComponent(item.sourceId)}/original`,
              original.fileName,
              original,
            )
          }
        >
          {c[55]}
        </button>
      </blockquote>
    );
  }
  return (
    <section className="dossier-analysis" aria-label={c[0]}>
      <h2>{c[0]}</h2>
      <p>{c[1]}</p>
      <p>{c[2]}</p>
      {loading && <p role="status">{c[47]}</p>}
      {error && (
        <div role="alert">
          {c[3]} <button onClick={() => void refresh()}>{c[4]}</button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {pending && !busy && (
        <button onClick={() => void send(pending)}>{c[4]}</button>
      )}
      {data && (
        <>
          <div className="analysis-grid">
            <section>
              <h3>{c[6]}</h3>
              {data.sources.length === 0 ? (
                <p>{c[5]}</p>
              ) : (
                <ul>
                  {data.sources.map((s) => (
                    <li key={s.id}>
                      <strong>{s.documentTitle}</strong> · {s.versionNumber} ·{' '}
                      {s.fileName}
                      <br />
                      {s.extraction ? (
                        <>
                          {term(s.extraction.state)} · {c[53]}:{' '}
                          {s.extraction.unitsReadable}/{s.extraction.unitsTotal}
                        </>
                      ) : (
                        c[61]
                      )}{' '}
                      {editable && (
                        <button
                          disabled={busy || !!pending}
                          onClick={() =>
                            command(
                              `${base}/sources/${encodeURIComponent(s.id)}`,
                              'DELETE',
                            )
                          }
                        >
                          {c[43]}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editable && (
                <fieldset disabled={busy || !!pending}>
                  <legend>{c[44]}</legend>
                  <label>
                    {c[44]}
                    <select
                      value={choice ? String(docs.indexOf(choice)) : ''}
                      onChange={(e) =>
                        setChoice(
                          e.target.value === ''
                            ? null
                            : (docs[Number(e.target.value)] ?? null),
                        )
                      }
                    >
                      <option value="">{c[45]}</option>
                      {docs.map((d, index) => (
                        <option key={index} value={index}>
                          {d.documentTitle} · {d.versionNumber} ·{' '}
                          {term(d.versionStatus)} · {d.fileName ?? 'DOCX'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {c[38]}
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      {['ro', 'ru', 'fr', 'en'].map((l) => (
                        <option key={l} value={l}>
                          {term(l)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={!choice?.representationId}
                    onClick={() =>
                      choice?.representationId &&
                      json(`${base}/sources`, {
                        documentId: choice.documentId,
                        documentVersionId: choice.documentVersionId,
                        representationId: choice.representationId,
                        language,
                        ...(choice.caseId ? { caseId: choice.caseId } : {}),
                        ...(choice.attachmentId
                          ? { attachmentId: choice.attachmentId }
                          : {}),
                      })
                    }
                  >
                    {c[41]}
                  </button>
                  <label>
                    {c[60]}
                    <input
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    disabled={!choice || !file}
                    onClick={() => {
                      if (!choice || !file) return;
                      const params = new URLSearchParams({
                        documentId: choice.documentId,
                        documentVersionId: choice.documentVersionId,
                        fileName: file.name,
                        language,
                      });
                      if (choice.caseId) params.set('caseId', choice.caseId);
                      if (choice.attachmentId)
                        params.set('attachmentId', choice.attachmentId);
                      command(`${base}/sources/docx?${params}`, 'POST', file, {
                        'Content-Type':
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      });
                    }}
                  >
                    {c[42]}
                  </button>
                </fieldset>
              )}
            </section>
            <section>
              <h3>{c[7]}</h3>
              {editable && (
                <button
                  disabled={busy || !!pending || data.sources.length === 0}
                  onClick={() => json(`${base}/runs`, {})}
                >
                  {c[8]}
                </button>
              )}
              {data.runs.length === 0 ? (
                <p>{c[9]}</p>
              ) : (
                <ul>
                  {data.runs.map((r) => (
                    <li key={r.id}>
                      {r.createdAt} · {r.stale ? c[11] : c[10]}{' '}
                      <button onClick={() => void openRun(r.id)}>
                        {c[12]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {historyError && <p role="alert">{historyCopy.error}</p>}
              {data.runsNextCursor && (
                <button
                  disabled={historyLoading}
                  onClick={() => void loadMoreHistory()}
                >
                  {historyCopy.more}
                </button>
              )}
            </section>
          </div>
          {selected && (
            <article>
              <h3>
                {c[7]} · {selected.createdAt} · {selected.stale ? c[11] : c[10]}
              </h3>
              <button
                onClick={() =>
                  void download(
                    `${base}/runs/${encodeURIComponent(selected.id)}/context`,
                    'dossier-context.json',
                  )
                }
              >
                {c[25]}
              </button>
              <h4>{c[13]}</h4>
              {(selected.coverage.truncatedCandidates ||
                selected.coverage.truncatedComparisons) && (
                <p role="status">{truncation}</p>
              )}
              <ul>
                {selected.sources.map((s) => (
                  <li key={s.id}>
                    {s.documentTitle} · {s.fileName} ·{' '}
                    {term(s.extraction.state)} · {s.extraction.unitsReadable}/
                    {s.extraction.unitsTotal}
                    <ul>
                      {s.extraction.issues.map((i, n) => (
                        <li key={n}>
                          {issue(i.code)} {i.locator}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {selected.coverage.missingDocuments.map((d, n) => (
                  <li key={n}>
                    {c[52]}: {d.title}
                  </li>
                ))}
              </ul>
              <p>{c[54]}</p>
              <ul>
                {selected.coverage.fields
                  .filter((f) => f.candidates === 0)
                  .map((f) => (
                    <li key={f.field}>
                      {term(f.field)}: {term(f.state)}
                    </li>
                  ))}
              </ul>
              <h4>{c[14]}</h4>
              {selected.candidates.map((item, n) => (
                <div key={n}>
                  <strong>
                    {term(item.field)}: {item.value} ·{' '}
                    {term(item.normalizationState)} {item.event ?? ''}
                  </strong>
                  {showCitation(item.citation)}
                </div>
              ))}
              <h4>{c[15]}</h4>
              {selected.comparisons.map((item, n) => (
                <div key={n}>
                  <strong>
                    {term(item.field)}: {term(item.outcome)} ·{' '}
                    {term(item.basis)}
                  </strong>
                  {showCitation(item.left.citation)}
                  {showCitation(item.right.citation)}
                </div>
              ))}
              <h4>{c[16]}</h4>
              {selected.stale && (
                <div>
                  <p>{interaction.historyHelp}</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={history}
                      onChange={(e) => {
                        searches.retire();
                        setResults(null);
                        setHistory(e.target.checked);
                      }}
                    />
                    {interaction.history}
                  </label>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void searchRun();
                }}
              >
                <label>
                  {c[21]}
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      searches.retire();
                      setResults(null);
                    }}
                    maxLength={200}
                  />
                </label>
                <label>
                  {c[16]}
                  <select
                    value={mode}
                    onChange={(e) => {
                      setMode(e.target.value);
                      searches.retire();
                      setResults(null);
                    }}
                  >
                    <option value="literal">{c[18]}</option>
                    <option value="lexical">{c[19]}</option>
                    <option value="fuzzy">{c[20]}</option>
                  </select>
                </label>
                <label>
                  {c[37]}
                  <select
                    value={filterSource}
                    onChange={(e) => {
                      setFilterSource(e.target.value);
                      searches.retire();
                      setResults(null);
                    }}
                  >
                    <option value="">{c[40]}</option>
                    {selected.sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.documentTitle} · {s.versionNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {c[38]}
                  <select
                    value={filterLanguage}
                    onChange={(e) => {
                      setFilterLanguage(e.target.value);
                      searches.retire();
                      setResults(null);
                    }}
                  >
                    <option value="">{c[40]}</option>
                    {['ro', 'ru', 'fr', 'en'].map((l) => (
                      <option key={l} value={l}>
                        {term(l)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {c[66]}
                  <select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      searches.retire();
                      setResults(null);
                    }}
                  >
                    <option value="">{c[40]}</option>
                    {['draft', 'official', 'superseded'].map((l) => (
                      <option key={l} value={l}>
                        {term(l)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {c[65]}
                  <select
                    value={filterKind}
                    onChange={(e) => {
                      setFilterKind(e.target.value);
                      searches.retire();
                      setResults(null);
                    }}
                  >
                    <option value="">{c[40]}</option>
                    {Array.from(
                      new Set(selected.sources.map((s) => s.documentType)),
                    ).map((l) => (
                      <option key={l} value={l}>
                        {term(l)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {c[29]}
                  <select
                    value={filterField}
                    onChange={(e) => {
                      setFilterField(e.target.value);
                      searches.retire();
                      setResults(null);
                    }}
                  >
                    <option value="">{c[40]}</option>
                    {[
                      'legalName',
                      'taxId',
                      'address',
                      'standard',
                      'auditType',
                      'auditDate',
                      'decisionDate',
                      'validFrom',
                      'validUntil',
                      'auditorDays',
                      'reference',
                      'scope',
                    ].map((f) => (
                      <option key={f} value={f}>
                        {term(f)}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={selected.stale && !history}>{c[17]}</button>
              </form>
              {results?.truncated && <p role="status">{truncation}</p>}
              {results &&
                (results.hits.length === 0 ? (
                  <p>{c[22]}</p>
                ) : (
                  results.hits.map((hit, n) => (
                    <blockquote key={n}>
                      <strong>
                        {hit.source.documentTitle} · {hit.passage.locator} ·{' '}
                        {term(hit.reason)}
                      </strong>
                      <p>{hit.passage.text}</p>
                      <button
                        onClick={() =>
                          void download(
                            `${base}/sources/${encodeURIComponent(hit.source.id)}/original`,
                            hit.source.fileName,
                            hit.source,
                          )
                        }
                      >
                        {c[55]}
                      </button>
                    </blockquote>
                  ))
                ))}
              {results?.nextCursor && (
                <button
                  onClick={() =>
                    void searchRun(results.nextCursor ?? undefined)
                  }
                >
                  {c[56]}
                </button>
              )}
              <h4>{c[26]}</h4>
              <p>{c[51]}</p>
              {selected.suggestions.map((s) => (
                <section key={s.id}>
                  <h5>
                    {term(s.proposal.field)}: {s.proposal.value}
                  </h5>
                  <p>{s.proposal.rationale}</p>
                  {s.proposal.citations.map((cit, n) => (
                    <div key={n}>{showCitation(cit)}</div>
                  ))}
                  <h6>{c[36]}</h6>
                  <ul>
                    {s.reviews.map((r) => (
                      <li key={r.revision}>
                        {r.recordedAt} · {r.actorDisplayName} · {r.decision}{' '}
                        {r.replacementValue}
                      </li>
                    ))}
                  </ul>
                  {editable && !selected.stale && (
                    <div>
                      <button
                        disabled={busy || !!pending}
                        onClick={() =>
                          json(
                            `${base}/suggestions/${encodeURIComponent(s.id)}/reviews`,
                            {
                              expectedRevision: s.revision,
                              decision: 'confirm',
                            },
                          )
                        }
                      >
                        {c[32]}
                      </button>
                      <button
                        disabled={busy || !!pending}
                        onClick={() =>
                          json(
                            `${base}/suggestions/${encodeURIComponent(s.id)}/reviews`,
                            {
                              expectedRevision: s.revision,
                              decision: 'reject',
                            },
                          )
                        }
                      >
                        {c[33]}
                      </button>
                      <label>
                        {c[35]}
                        <input
                          value={replacement}
                          onChange={(e) => setReplacement(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={busy || !!pending || !replacement}
                        onClick={() =>
                          json(
                            `${base}/suggestions/${encodeURIComponent(s.id)}/reviews`,
                            {
                              expectedRevision: s.revision,
                              decision: 'correct',
                              replacementValue: replacement,
                            },
                          )
                        }
                      >
                        {c[34]}
                      </button>
                    </div>
                  )}
                </section>
              ))}
              {editable && !selected.stale && (
                <>
                  <fieldset disabled={busy || !!pending}>
                    <legend>{c[57]}</legend>
                    <label>
                      {c[29]}
                      <select
                        value={field}
                        onChange={(e) => setField(e.target.value)}
                      >
                        {[
                          'legalName',
                          'taxId',
                          'address',
                          'standard',
                          'auditType',
                          'auditDate',
                          'decisionDate',
                          'validFrom',
                          'validUntil',
                          'auditorDays',
                          'reference',
                          'scope',
                        ].map((f) => (
                          <option key={f} value={f}>
                            {term(f)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {c[30]}
                      <input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      />
                    </label>
                    <label>
                      {c[31]}
                      <textarea
                        value={rationale}
                        onChange={(e) => setRationale(e.target.value)}
                      />
                    </label>
                    <label>
                      {c[58]}
                      <select
                        value={citationKey}
                        onChange={(e) => {
                          const index = e.target.value;
                          const picked = citations.find(
                            (_, i) => String(i) === index,
                          );
                          setCitationKey(index);
                          setQuote(
                            picked
                              ? Array.from(picked.quote).slice(0, 500).join('')
                              : '',
                          );
                        }}
                      >
                        <option value="">{c[59]}</option>
                        {citations.map((cit, n) => (
                          <option key={n} value={n}>
                            {sourceName(cit.sourceId)} · {cit.locator} ·{' '}
                            {cit.quote.slice(0, 120)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {interaction.quote}
                      <textarea
                        value={quote}
                        maxLength={2000}
                        onChange={(e) => setQuote(e.target.value)}
                        aria-describedby="analysis-quote-help"
                      />
                    </label>
                    <p id="analysis-quote-help">{interaction.quoteHelp}</p>
                    <button
                      disabled={!value || !rationale || !validQuote}
                      onClick={manual}
                    >
                      {c[28]}
                    </button>
                  </fieldset>
                  <fieldset disabled={busy || !!pending}>
                    <legend>{c[27]}</legend>
                    <input
                      type="file"
                      aria-label={c[27]}
                      accept="application/json,.json"
                      onChange={(e) => {
                        fileReads.retire();
                        setProposalFile(e.target.files?.[0] ?? null);
                      }}
                    />
                    <button
                      disabled={!proposalFile}
                      onClick={() => void importProposal()}
                    >
                      {c[28]}
                    </button>
                  </fieldset>
                </>
              )}
            </article>
          )}
        </>
      )}
    </section>
  );
}
