import { useActorObservation } from '../api/use-actor-requests';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { taskResultAuthority } from './project-authority';
import { holds } from '../access/company-grants';
import type { ProjectStatus } from './project-lifecycle-response';
import { useTaskResultCopy } from './task-results.copy';
import {
  readTaskResultSnapshot,
  readTaskResultVersions,
  readTaskResultReceipt,
  readTaskResultPage,
  type TaskResultSnapshot,
  type TaskResultReference,
  type TaskResultDeclaration,
  type TaskResultPage,
} from './task-results-response';

interface Props {
  actor: ActorContext;
  identity: BrowserIdentity;
  taskId: string;
  projectId: string;
  active?: boolean;
  observedTaskVersion?: number;
  observedProjectStatus?: ProjectStatus | null;
}
type ReadState =
  | { kind: 'loading' | 'unavailable' | 'malformed' | 'denied' }
  | {
      kind: 'ready';
      snapshot: TaskResultSnapshot;
      versions: TaskResultReference[];
    };
interface ResultCommand {
  kind: 'record' | 'correct';
  key: string;
  revision: number;
  body: string;
}
type Mutation =
  | { kind: 'idle' | 'invalid' | 'conflict' }
  | { kind: 'pending' | 'uncertain'; command: ResultCommand }
  | { kind: 'confirmed'; unchanged: boolean };
class ResultReadFailure extends Error {
  constructor(readonly kind: 'denied' | 'unavailable') {
    super(kind);
  }
}

/** A result owner survives ordinary Task refreshes, but never a new identity or captured authority. */
export function TaskResults(props: Props) {
  const [session, setSession] = useState({
    identity: props.identity,
    generation: 0,
  });
  if (session.identity !== props.identity) {
    setSession({
      identity: props.identity,
      generation: session.generation + 1,
    });
  }
  const key = JSON.stringify([
    session.generation,
    props.taskId,
    props.projectId,
    props.actor.internalUserId,
    props.actor.workspaceId,
    props.actor.workspaceMembershipId,
    props.actor.active,
    props.actor.workspacePermissions.includes('client.manage'),
    taskResultAuthority(props.actor),
  ]);
  return <TaskResultOwner key={key} {...props} />;
}
function TaskResultOwner({
  active = true,
  actor,
  identity,
  taskId,
  projectId,
  observedTaskVersion,
  observedProjectStatus,
}: Props) {
  const copy = useTaskResultCopy();
  const locale = useInterfaceLocale();
  const id = useId();
  const company = actor.activeCompany;
  const companyId = company?.id ?? '';
  const canReadClient =
    actor.workspacePermissions.includes('client.manage') ||
    holds(company, 'company_director_client_access', 'client.read');
  const canRead =
    holds(company, 'company_task_manager', 'task.read') &&
    holds(company, 'company_project_access', 'project.read') &&
    canReadClient &&
    holds(company, 'company_document_registrar', 'document.read') &&
    holds(
      company,
      'company_document_content_reader',
      'document.content.read',
    ) &&
    holds(
      company,
      'company_mission_deliverable_access',
      'document.mission_deliverable.access',
    );
  const canRecord =
    canRead &&
    holds(company, 'company_task_manager', 'task.manage') &&
    holds(company, 'company_task_result_recorder', 'task.result.record');
  const [read, setRead] = useState<ReadState>({
    kind: canRead ? 'loading' : 'denied',
  });
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const [draft, setDraft] = useState({
    declaration: '',
    versionId: '',
    reason: '',
  });
  const [correcting, setCorrecting] = useState(false);
  const [history, setHistory] = useState<TaskResultPage>();
  const [historyStatus, setHistoryStatus] = useState<
    'idle' | 'pending' | 'failed'
  >('idle');
  const [downloadStatus, setDownloadStatus] = useState<
    'idle' | 'pending' | 'failed'
  >('idle');
  const actorObservation = useActorObservation(actor);
  const sessions = useScopedOperationGroup(String(actorObservation));
  const reads = useScopedOperationGroup('result');
  const histories = useScopedOperationGroup('history');
  const downloads = useScopedOperationGroup(String(active));
  const writes = useScopedOperationGroup('write');
  const writing = useRef(false);
  useEffect(() => {
    if (!active) setDownloadStatus('idle');
  }, [active]);
  const path = `/tasks/${encodeURIComponent(taskId)}/results`;
  const expected = { taskId, projectId };
  const observation = useRef({
    taskVersion: observedTaskVersion,
    projectStatus: observedProjectStatus,
  });
  const lastProjectStatus = useRef(observedProjectStatus);
  useLayoutEffect(() => {
    observation.current = {
      taskVersion: observedTaskVersion,
      projectStatus: observedProjectStatus,
    };
  }, [observedTaskVersion, observedProjectStatus]);
  useEffect(() => {
    const projectChanged = lastProjectStatus.current !== observedProjectStatus;
    lastProjectStatus.current = observedProjectStatus;
    if (!canRead) return;
    // A late parent observation cannot replace an already newer native result read.
    // Keep its focused draft and let an in-flight latest read validate that version.
    if (!projectChanged && reads.isPending()) return;
    if (
      !projectChanged &&
      read.kind === 'ready' &&
      observedTaskVersion !== undefined &&
      read.snapshot.taskVersion >= observedTaskVersion
    )
      return;
    void reload();
  }, [observedTaskVersion, observedProjectStatus]);

  function deny() {
    reads.retire();
    histories.retire();
    downloads.retire();
    writes.retire();
    setRead({ kind: 'denied' });
    setMutation({ kind: 'idle' });
    setDraft({ declaration: '', versionId: '', reason: '' });
    setHistory(undefined);
    setCorrecting(false);
  }
  async function value(
    result: ApiResult<unknown>,
    currentActor: () => boolean,
  ): Promise<unknown> {
    if (result.status === 'unauthorized') {
      if (currentActor()) await identity.rejectSession();
      throw new ResultReadFailure('denied');
    }
    if (result.status === 'forbidden' || result.status === 'notFound')
      throw new ResultReadFailure('denied');
    if (result.status !== 'ok') throw new ResultReadFailure('unavailable');
    return result.value;
  }
  async function reload(): Promise<void> {
    const operation = reads.beginLatest();
    if (!operation) return;
    const currentActor = sessions.capture();
    const observedAtStart = observation.current.taskVersion;
    histories.retire();
    setRead({ kind: 'loading' });
    setHistory(undefined);
    setHistoryStatus('idle');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (operation.signal.aborted) return;
      const options = {
        companyContextId: companyId,
        signal: operation.signal,
      };
      const currentValue = await api.request(path, options);
      if (operation.signal.aborted) return;
      const snapshot = readTaskResultSnapshot(
        await value(currentValue, currentActor),
        expected,
      );
      let versions: TaskResultReference[] = [];
      if (snapshot.mutable && canRecord) {
        const candidates = await api.request(
          `${path}/eligible-versions`,
          options,
        );
        if (operation.signal.aborted) return;
        const eligible = readTaskResultVersions(
          await value(candidates, currentActor),
          expected,
        );
        if (!eligible.mutable) throw new ResultReadFailure('unavailable');
        versions = eligible.versions;
      }
      if (operation.signal.aborted) return;
      const observedNow = observation.current.taskVersion;
      if (observedNow !== undefined && snapshot.taskVersion < observedNow) {
        if (observedNow !== observedAtStart) {
          void reload();
          return;
        }
        // An inconsistent native read is never shown and cannot create a retry loop.
        throw new ResultReadFailure('unavailable');
      }
      setRead({ kind: 'ready', snapshot, versions });
    } catch (error: unknown) {
      if (operation.signal.aborted) return;
      if (error instanceof ResultReadFailure && error.kind === 'denied') deny();
      else
        setRead({
          kind:
            error instanceof ResultReadFailure ? 'unavailable' : 'malformed',
        });
    } finally {
      operation.release();
    }
  }
  async function submit(command: ResultCommand): Promise<void> {
    if (writing.current) return;
    const operation = writes.begin();
    if (!operation) return;
    const currentActor = sessions.capture();
    writing.current = true;
    // Discard reads begun before this mutation; they cannot replace its confirmed refresh.
    reads.retire();
    histories.retire();
    setMutation({ kind: 'pending', command });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (operation.signal.aborted) return;
      const result = await api.request(
        `${path}${command.kind === 'correct' ? '/corrections' : ''}`,
        {
          method: 'POST',
          signal: operation.signal,
          companyContextId: companyId,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
        },
      );
      if (operation.signal.aborted) return;
      if (result.status === 'unauthorized') {
        deny();
        if (currentActor()) await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        deny();
        return;
      }
      if (result.status === 'conflict') {
        setMutation({ kind: 'conflict' });
        return;
      }
      if (result.status === 'validation') {
        setMutation({ kind: 'invalid' });
        return;
      }
      if (result.status !== 'ok') {
        setMutation({ kind: 'uncertain', command });
        return;
      }
      const receipt = readTaskResultReceipt(result.value, {
        taskId,
        revision: command.revision,
        kind: command.kind,
      });
      setMutation({
        kind: 'confirmed',
        unchanged: receipt.action === 'unchanged',
      });
      setCorrecting(false);
      setDraft({ declaration: '', versionId: '', reason: '' });
      void reload();
    } catch {
      if (!operation.signal.aborted)
        setMutation({ kind: 'uncertain', command });
    } finally {
      operation.release();
      writing.current = false;
    }
  }
  function prepare(): void {
    if (
      read.kind !== 'ready' ||
      !read.snapshot.mutable ||
      !canRecord ||
      writing.current ||
      mutation.kind === 'pending' ||
      mutation.kind === 'uncertain' ||
      mutation.kind === 'conflict'
    )
      return;
    const declaration = draft.declaration.trim();
    const reason = draft.reason.trim();
    const reference = read.versions.find(
      (item) => item.versionId === draft.versionId,
    );
    const length = Array.from(declaration).length;
    if (
      !reference ||
      length < 1 ||
      length > 2000 ||
      (correcting &&
        (Array.from(reason).length < 1 || Array.from(reason).length > 500))
    ) {
      setMutation({ kind: 'invalid' });
      return;
    }
    const common = {
      declaration,
      documentId: reference.documentId,
      versionId: reference.versionId,
      expectedTaskVersion: read.snapshot.taskVersion,
      expectedResultRevision: read.snapshot.revision,
    };
    void submit({
      kind: correcting ? 'correct' : 'record',
      key: crypto.randomUUID(),
      revision: read.snapshot.revision,
      body: JSON.stringify(correcting ? { ...common, reason } : common),
    });
  }
  async function loadHistory(beforeRevision?: number): Promise<void> {
    if (read.kind !== 'ready') return;
    const snapshot = read.snapshot;
    const operation = histories.beginLatest();
    if (!operation) return;
    const currentActor = sessions.capture();
    setHistoryStatus('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (operation.signal.aborted) return;
      const result = await api.request(
        `${path}/history${beforeRevision === undefined ? '' : `?beforeRevision=${beforeRevision}`}`,
        { companyContextId: companyId, signal: operation.signal },
      );
      if (operation.signal.aborted) return;
      const page = readTaskResultPage(await value(result, currentActor), {
        taskId,
        beforeRevision,
      });
      if (
        beforeRevision === undefined &&
        (page.declarations[0]?.id ?? null) !== (snapshot.current?.id ?? null)
      )
        throw new Error('History/current changed');
      if (operation.signal.aborted) return;
      setHistory((previous) => ({
        ...page,
        declarations:
          beforeRevision === undefined
            ? page.declarations
            : [...(previous?.declarations ?? []), ...page.declarations],
      }));
      setHistoryStatus('idle');
    } catch (error: unknown) {
      if (operation.signal.aborted) return;
      if (error instanceof ResultReadFailure && error.kind === 'denied') deny();
      else setHistoryStatus('failed');
    } finally {
      operation.release();
    }
  }
  async function download(reference: TaskResultReference): Promise<void> {
    if (!active) return;
    const operation = downloads.beginLatest();
    if (!operation) return;
    const currentActor = sessions.capture();
    setDownloadStatus('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (operation.signal.aborted) return;
      const result = await api.download(
        `/documents/${encodeURIComponent(reference.documentId)}/versions/${encodeURIComponent(reference.versionId)}/content/${encodeURIComponent(reference.representationId)}`,
        { companyContextId: companyId, signal: operation.signal },
      );
      if (operation.signal.aborted) return;
      if (result.status === 'unauthorized') {
        deny();
        if (currentActor()) await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        deny();
        return;
      }
      if (
        result.status !== 'ok' ||
        result.value.type !== 'application/pdf' ||
        result.value.size === 0
      ) {
        setDownloadStatus('failed');
        return;
      }
      const url = URL.createObjectURL(result.value);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `mission-version-${reference.versionNumber}.pdf`;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setDownloadStatus('idle');
    } catch {
      if (!operation.signal.aborted) setDownloadStatus('failed');
    } finally {
      operation.release();
    }
  }
  function renderDeclaration(item: TaskResultDeclaration) {
    return (
      <article className="task-result-declaration">
        <p>
          <strong>{copy.revision(item.revision)}</strong>
        </p>
        <p className="task-result-text">{item.declaration}</p>
        <p>
          {item.reference.title} · {item.reference.versionNumber} ·{' '}
          {copy.t(item.reference.status)}
        </p>
        <p>
          {item.actor.displayName} ·{' '}
          <time dateTime={item.occurredAt}>
            {locale.formatDateTime(item.occurredAt)}
          </time>
        </p>
        {item.kind === 'corrected' && (
          <p>
            {copy.t('reason')}: {item.reason}
          </p>
        )}
        <button
          type="button"
          disabled={downloadStatus === 'pending'}
          onClick={() => void download(item.reference)}
        >
          {copy.download(item.reference.versionNumber)}
        </button>
      </article>
    );
  }
  const blocked =
    mutation.kind === 'pending' ||
    mutation.kind === 'uncertain' ||
    mutation.kind === 'conflict';
  return (
    <section className="task-results" aria-labelledby={id}>
      <h5 id={id}>{copy.t('title')}</h5>
      <p>{copy.t('warning')}</p>
      {read.kind === 'loading' && <p role="status">{copy.t('loading')}</p>}
      {(read.kind === 'unavailable' ||
        read.kind === 'malformed' ||
        read.kind === 'denied') && <p role="alert">{copy.t(read.kind)}</p>}
      {read.kind !== 'denied' && (
        <button
          type="button"
          disabled={read.kind === 'loading' || mutation.kind === 'pending'}
          onClick={() => {
            if (mutation.kind === 'conflict') {
              setMutation({ kind: 'idle' });
              setCorrecting(false);
              setDraft({ declaration: '', versionId: '', reason: '' });
            }
            void reload();
          }}
        >
          {copy.t('reload')}
        </button>
      )}
      {read.kind === 'ready' && (
        <>
          <p>{read.snapshot.taskTitle}</p>
          {read.snapshot.current ? (
            renderDeclaration(read.snapshot.current)
          ) : (
            <p>{copy.t('empty')}</p>
          )}
          {!read.snapshot.mutable && <p>{copy.t('readOnly')}</p>}
          {canRecord && read.snapshot.mutable && (
            <>
              {read.versions.length === 0 && <p>{copy.t('noVersions')}</p>}
              {read.snapshot.current && !correcting && (
                <button
                  type="button"
                  disabled={blocked || read.versions.length === 0}
                  onClick={() => {
                    const current = read.snapshot.current;
                    if (!current) return;
                    setCorrecting(true);
                    setMutation({ kind: 'idle' });
                    setDraft({
                      declaration: current.declaration,
                      versionId: read.versions.some(
                        (item) =>
                          item.versionId === current.reference.versionId,
                      )
                        ? current.reference.versionId
                        : '',
                      reason: '',
                    });
                  }}
                >
                  {copy.t('correct')}
                </button>
              )}
              {read.versions.length > 0 &&
                (!read.snapshot.current || correcting) && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      prepare();
                    }}
                  >
                    <label htmlFor={`${id}-declaration`}>
                      {copy.t('declaration')} (1–2000)
                    </label>
                    <textarea
                      id={`${id}-declaration`}
                      aria-label={copy.t('declaration')}
                      value={draft.declaration}
                      disabled={blocked}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          declaration: event.currentTarget.value,
                        })
                      }
                    />
                    <label htmlFor={`${id}-version`}>{copy.t('version')}</label>
                    <Select
                      id={`${id}-version`}
                      value={draft.versionId}
                      disabled={blocked}
                      onValueChange={(versionId) =>
                        setDraft({ ...draft, versionId })
                      }
                      options={read.versions.map((item) => ({
                        value: item.versionId,
                        label: `${item.title} · ${item.versionNumber} · ${copy.t(item.status)}`,
                      }))}
                    />
                    {correcting && (
                      <>
                        <label htmlFor={`${id}-reason`}>
                          {copy.t('reason')} (1–500)
                        </label>
                        <textarea
                          id={`${id}-reason`}
                          aria-label={copy.t('reason')}
                          value={draft.reason}
                          disabled={blocked}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              reason: event.currentTarget.value,
                            })
                          }
                        />
                      </>
                    )}
                    <button type="submit" disabled={blocked}>
                      {copy.t(correcting ? 'save' : 'record')}
                    </button>
                    {correcting && (
                      <button
                        type="button"
                        disabled={blocked}
                        onClick={() => {
                          setCorrecting(false);
                          setDraft({
                            declaration: '',
                            versionId: '',
                            reason: '',
                          });
                        }}
                      >
                        {copy.t('cancel')}
                      </button>
                    )}
                  </form>
                )}
            </>
          )}
          {!history && (
            <button
              type="button"
              disabled={historyStatus === 'pending'}
              onClick={() => void loadHistory()}
            >
              {copy.t('history')}
            </button>
          )}
          {history && (
            <>
              <h6>{copy.t('history')}</h6>
              <ol>
                {history.declarations.map((item) => (
                  <li key={item.id}>{renderDeclaration(item)}</li>
                ))}
              </ol>
              {history.nextBeforeRevision !== null && (
                <button
                  type="button"
                  disabled={historyStatus === 'pending'}
                  onClick={() =>
                    void loadHistory(history.nextBeforeRevision ?? undefined)
                  }
                >
                  {copy.t('older')}
                </button>
              )}
            </>
          )}
          {historyStatus === 'failed' && (
            <p role="alert">{copy.t('historyFailed')}</p>
          )}
        </>
      )}
      {mutation.kind === 'pending' && <p role="status">{copy.t('pending')}</p>}
      {mutation.kind === 'confirmed' && (
        <p role="status">
          {copy.t(mutation.unchanged ? 'unchanged' : 'confirmed')}
        </p>
      )}
      {(mutation.kind === 'conflict' ||
        mutation.kind === 'invalid' ||
        mutation.kind === 'uncertain') && (
        <p role="alert">{copy.t(mutation.kind)}</p>
      )}
      {mutation.kind === 'uncertain' && read.kind !== 'denied' && (
        <button type="button" onClick={() => void submit(mutation.command)}>
          {copy.t('retry')}
        </button>
      )}
      {downloadStatus === 'pending' && (
        <p role="status">{copy.t('downloading')}</p>
      )}
      {downloadStatus === 'failed' && (
        <p role="alert">{copy.t('downloadFailed')}</p>
      )}
    </section>
  );
}
