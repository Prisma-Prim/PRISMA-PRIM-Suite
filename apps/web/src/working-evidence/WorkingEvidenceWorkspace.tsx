import { useInterfaceLocale } from '../localization/interface-locale';
import { EvidenceArtifacts } from './EvidenceArtifacts';
import { EvidenceEditor } from './EvidenceEditor';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { isClosedProjectStatus } from '../project/project-lifecycle-response';
import type { ProjectView } from '../project/project-directory';
import { workingEvidenceAuthority } from './working-evidence-access';
import { useWorkingEvidenceAuthority } from './use-working-evidence-authority';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { useWorkingEvidenceCopy } from './working-evidence.copy';
import {
  useEvidenceOperations,
  type EvidenceCallbacks,
} from './use-evidence-operations';
import {
  readEvidenceCase,
  readEvidenceCases,
  readEvidenceHistory,
  readEvidenceReceipt,
  readEvidenceRevision,
  type EvidenceRevision,
} from './working-evidence-response';
import './working-evidence.css';
export type WorkingEvidenceProps = EvidenceCallbacks & {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  projectStatus: ProjectView['status'];
  onActivityRecorded?: () => void | Promise<void>;
};
type Authority = NonNullable<ReturnType<typeof workingEvidenceAuthority>>;
export function WorkingEvidenceWorkspace(props: WorkingEvidenceProps) {
  const copy = useWorkingEvidenceCopy();
  const identityOwner = useRef({ identity: props.identity, generation: 0 });
  if (identityOwner.current.identity !== props.identity)
    identityOwner.current = {
      identity: props.identity,
      generation: identityOwner.current.generation + 1,
    };
  const authority = useWorkingEvidenceAuthority(
    props.actor,
    props.identity,
    props.projectId,
  );
  const [editor, setEditor] = useState<
    { kind: 'create' } | { kind: 'correct'; revision: EvidenceRevision } | null
  >(null);
  const [confirmation, setConfirmation] = useState<ReturnType<
    typeof readEvidenceReceipt
  > | null>(null);
  const mutationKey = JSON.stringify([
    props.projectId,
    authority?.record,
    authority?.source,
    identityOwner.current.generation,
  ]);
  const mutation = useRef(mutationKey);
  if (mutation.current !== mutationKey) {
    mutation.current = mutationKey;
    setEditor(null);
  }
  if (!authority || !props.identity.loaded || !props.identity.signedIn)
    return null;
  return (
    <section className="working-evidence" aria-label={copy('title')}>
      <EvidenceReader
        key={JSON.stringify([
          props.projectId,
          authority.read,
          identityOwner.current.generation,
        ])}
        {...props}
        authority={authority}
        confirmation={confirmation}
        onCreate={() => {
          setEditor({ kind: 'create' });
          setConfirmation(null);
        }}
        onCorrect={(revision) => {
          setEditor({ kind: 'correct', revision });
          setConfirmation(null);
        }}
      />
      {editor && authority.record && authority.source && (
        <EvidenceEditor
          key={JSON.stringify([
            mutationKey,
            editor.kind,
            editor.kind === 'correct' ? editor.revision.revisionId : null,
          ])}
          {...props}
          newUseAvailable={!isClosedProjectStatus(props.projectStatus)}
          signature={mutationKey}
          correction={editor.kind === 'correct' ? editor.revision : null}
          onCancel={() => setEditor(null)}
          onSaved={(receipt) => {
            setConfirmation(receipt);
            setEditor(null);
            void Promise.resolve(props.onActivityRecorded?.()).catch(
              () => undefined,
            );
          }}
        />
      )}
    </section>
  );
}
function EvidenceReader(
  props: WorkingEvidenceProps & {
    authority: Authority;
    confirmation: ReturnType<typeof readEvidenceReceipt> | null;
    onCreate: () => void;
    onCorrect: (revision: EvidenceRevision) => void;
  },
) {
  const copy = useWorkingEvidenceCopy(),
    id = useId();
  const { formatDateTime, formatNumber } = useInterfaceLocale();
  const operations = useEvidenceOperations({
    ...props,
    signature: JSON.stringify([props.projectId, props.authority.read]),
  });
  const [page, setPage] = useState<ReturnType<typeof readEvidenceCases>>({
    items: [],
    nextCursor: null,
  });
  const [history, setHistory] = useState<
    ReturnType<typeof readEvidenceHistory>
  >({ items: [], nextCursor: null });
  const [current, setCurrent] = useState<EvidenceRevision | null>(null),
    [selected, setSelected] = useState<EvidenceRevision | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'unavailable' | 'denied'
  >('loading');
  const [refresh, setRefresh] = useState(0);
  const sequences = useRef({ list: 0, open: 0, history: 0 });
  const openedCase = useRef<string | null>(null);
  const captureSource = useAuthorityLifetime(
    JSON.stringify(props.authority.source),
    props.identity,
  );
  const previousSource = useRef(props.authority.source);
  useLayoutEffect(() => {
    if (previousSource.current === props.authority.source) return;
    previousSource.current = props.authority.source;
    setCurrent((value) =>
      value ? { ...value, evidence: { state: 'unavailable' } } : null,
    );
    setSelected((value) =>
      value ? { ...value, evidence: { state: 'unavailable' } } : null,
    );
  }, [props.authority.source]);
  function clearDenied() {
    setPage({ items: [], nextCursor: null });
    setHistory({ items: [], nextCursor: null });
    setCurrent(null);
    setSelected(null);
    setState('denied');
  }
  async function list(cursor: string | null = null) {
    const sequence = ++sequences.current.list;
    const request = operations.operation(
      () => sequences.current.list === sequence,
    );
    setState('loading');
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!request.current()) return;
      const result = await api.request<unknown>(
        `/projects/${props.projectId}/working-evidence-cases${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        {
          companyContextId: props.actor.activeCompany?.id,
          signal: request.controller.signal,
          cache: 'no-store',
        },
      );
      if (!request.current()) return;
      if (result.status !== 'ok') {
        if (result.status === 'forbidden' || result.status === 'unauthorized')
          clearDenied();
        setState(
          result.status === 'forbidden' || result.status === 'unauthorized'
            ? 'denied'
            : 'unavailable',
        );
        request.recover(result);
        return;
      }
      const value = readEvidenceCases(result.value);
      if (!request.current()) return;
      setPage(value);
      setState('ready');
    } catch {
      if (request.current()) setState('unavailable');
    } finally {
      request.finish();
    }
  }
  useEffect(() => {
    void list();
  }, [refresh]);
  useEffect(() => {
    if (props.confirmation) {
      void open(props.confirmation.caseId);
      setRefresh((value) => value + 1);
    }
  }, [props.confirmation?.commandId]);
  function redact(revision: EvidenceRevision, sourceIsCurrent: () => boolean) {
    return sourceIsCurrent()
      ? revision
      : { ...revision, evidence: { state: 'unavailable' as const } };
  }
  async function open(caseId: string, revisionId?: string) {
    const sequence = ++sequences.current.open;
    ++sequences.current.history;
    if (!revisionId || openedCase.current !== caseId)
      setHistory({ items: [], nextCursor: null });
    if (openedCase.current !== caseId) {
      openedCase.current = caseId;
      setCurrent(null);
      setSelected(null);
    }
    const request = operations.operation(
      () => sequences.current.open === sequence,
    );
    const sourceIsCurrent = props.authority.source
      ? captureSource()
      : () => false;
    setState('loading');
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!request.current()) return;
      const path = revisionId
        ? `/working-evidence-cases/${caseId}/revisions/${revisionId}`
        : `/working-evidence-cases/${caseId}`;
      const result = await api.request<unknown>(path, {
        companyContextId: props.actor.activeCompany?.id,
        signal: request.controller.signal,
        cache: 'no-store',
      });
      if (!request.current()) return;
      if (result.status !== 'ok') {
        if (result.status === 'forbidden' || result.status === 'unauthorized')
          clearDenied();
        setState(
          result.status === 'forbidden' || result.status === 'unauthorized'
            ? 'denied'
            : 'unavailable',
        );
        request.recover(result);
        return;
      }
      if (revisionId) {
        const revision = readEvidenceRevision(result.value);
        if (revision.caseId !== caseId || revision.revisionId !== revisionId)
          throw new Error('Unexpected revision');
        setSelected(redact(revision, sourceIsCurrent));
      } else {
        const detail = readEvidenceCase(result.value);
        if (detail.projectId !== props.projectId || detail.caseId !== caseId)
          throw new Error('Unexpected Case');
        const revision = redact(detail.current, sourceIsCurrent);
        setCurrent(revision);
        setSelected(revision);
      }
      if (request.current()) {
        setState('ready');
      }
    } catch {
      if (request.current()) setState('unavailable');
    } finally {
      request.finish();
    }
  }
  async function readHistory(cursor: string | null = null) {
    if (!current) return;
    const sequence = ++sequences.current.history;
    const request = operations.operation(
      () => sequences.current.history === sequence,
    );
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!request.current()) return;
      const result = await api.request<unknown>(
        `/working-evidence-cases/${current.caseId}/revisions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        {
          companyContextId: props.actor.activeCompany?.id,
          signal: request.controller.signal,
          cache: 'no-store',
        },
      );
      if (!request.current()) return;
      if (result.status !== 'ok') {
        if (result.status === 'forbidden' || result.status === 'unauthorized')
          clearDenied();
        setState('unavailable');
        request.recover(result);
        return;
      }
      const value = readEvidenceHistory(result.value);
      if (request.current()) setHistory(value);
    } catch {
      if (request.current()) setState('unavailable');
    } finally {
      request.finish();
    }
  }
  const canMutate =
    props.authority.record &&
    props.authority.source &&
    !isClosedProjectStatus(props.projectStatus);
  return (
    <div aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{copy('title')}</h3>
      <p>{copy('meaning')}</p>
      {props.confirmation && <p role="status">{copy('confirmed')}</p>}
      {state === 'loading' && <p role="status">{copy('loading')}</p>}
      {state === 'unavailable' && <p role="alert">{copy('unavailable')}</p>}
      {state === 'denied' && <p role="alert">{copy('denied')}</p>}
      <button
        type="button"
        onClick={() => {
          setRefresh((value) => value + 1);
          if (current) void open(current.caseId);
        }}
      >
        {copy('refresh')}
      </button>
      {page.items.length === 0 && state === 'ready' && <p>{copy('empty')}</p>}
      <ul>
        {page.items.map((item) => (
          <li key={item.caseId}>
            <button type="button" onClick={() => void open(item.caseId)}>
              {item.title}
            </button>
          </li>
        ))}
      </ul>
      {page.nextCursor && (
        <button type="button" onClick={() => void list(page.nextCursor)}>
          {copy('next')}
        </button>
      )}
      {canMutate && (
        <button
          type="button"
          onClick={() => {
            props.onCreate();
          }}
        >
          {copy('create')}
        </button>
      )}
      {selected && (
        <article className="working-evidence-revision">
          <h4>{selected.title}</h4>
          <p>
            {copy('revision')} {formatNumber(selected.revisionNumber)} ·{' '}
            {selected.actor.displayName} ·{' '}
            <time dateTime={selected.recordedAt}>
              {formatDateTime(selected.recordedAt)}
            </time>
          </p>
          {selected.revisionId !== current?.revisionId && (
            <p>{copy('historical')}</p>
          )}
          <dl>
            <dt>{copy('context')}</dt>
            <dd>{selected.declaredContext ?? '—'}</dd>
            <dt>{copy('process')}</dt>
            <dd>{selected.process}</dd>
            <dt>{copy('statement')}</dt>
            <dd>{selected.statement}</dd>
            <dt>{copy('note')}</dt>
            <dd>{selected.observationNote ?? '—'}</dd>
            {selected.reason && (
              <>
                <dt>{copy('reason')}</dt>
                <dd>{selected.reason}</dd>
              </>
            )}
          </dl>
          <EvidenceArtifacts
            key={JSON.stringify([selected.revisionId, props.authority.source])}
            {...props}
            revision={selected}
            sourceAuthority={props.authority.source}
          />
          {current && (
            <>
              <button type="button" onClick={() => void open(current.caseId)}>
                {copy('current')}
              </button>
              <button type="button" onClick={() => void readHistory()}>
                {copy('history')}
              </button>
            </>
          )}
          {canMutate &&
            current &&
            selected.revisionId === current.revisionId &&
            current.evidence.state === 'visible' && (
              <button
                type="button"
                onClick={() => {
                  props.onCorrect(current);
                }}
              >
                {copy('correct')}
              </button>
            )}
          <ul>
            {history.items.map((item) => (
              <li key={item.revisionId}>
                <button
                  type="button"
                  onClick={() =>
                    current && void open(current.caseId, item.revisionId)
                  }
                >
                  {copy('revision')} {item.revisionNumber} ·{' '}
                  {item.actor.displayName}
                </button>
              </li>
            ))}
          </ul>
          {history.nextCursor && (
            <button
              type="button"
              onClick={() => void readHistory(history.nextCursor)}
            >
              {copy('next')}
            </button>
          )}
        </article>
      )}
    </div>
  );
}
