import { useEffect, useId, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { companyAuthorityWithoutProjectTemplate } from './project-authority';
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
  observedTaskVersion?: number;
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
    companyAuthorityWithoutProjectTemplate(props.actor.activeCompany),
  ]);
  return <TaskResultOwner key={key} {...props} />;
}
function TaskResultOwner({
  actor,
  identity,
  taskId,
  projectId,
  observedTaskVersion,
}: Props) {
  const copy = useTaskResultCopy();
  const locale = useInterfaceLocale();
  const id = useId();
  const company = actor.activeCompany;
  const companyId = company?.id ?? '';
  const canRead = Boolean(
    company?.taskPermissions?.includes('task.read') &&
    company.taskPermissionAssignmentId &&
    company.taskPermissionSetVersion === 'v1' &&
    company.projectPermissions?.includes('project.read') &&
    company.projectPermissionAssignmentId &&
    (company.projectPermissionSetVersion === 'v1' ||
      company.projectPermissionSetVersion === 'v2') &&
    company.clientPermissions?.includes('client.read') &&
    company.clientPermissionAssignmentId &&
    (company.clientPermissionSetVersion === 'v1' ||
      company.clientPermissionSetVersion === 'v2') &&
    company.documentPermissions?.includes('document.read') &&
    company.documentPermissionSetVersion &&
    company.documentPermissionAssignmentId &&
    ['v1', 'v2', 'v3'].includes(company.documentPermissionSetVersion) &&
    company.documentPermissions.includes('document.content.read') &&
    company.documentContentReaderAssignmentId &&
    company.documentContentReaderPermissionSetVersion === 'v1' &&
    company.documentPermissions.includes(
      'document.mission_deliverable.access',
    ) &&
    company.missionDeliverableAccessAssignmentId &&
    company.missionDeliverableAccessPermissionSetVersion === 'v1',
  );
  const canRecord =
    canRead &&
    company?.taskPermissions?.includes('task.manage') &&
    company.taskResultPermissions?.includes('task.result.record') &&
    Boolean(company.taskResultRecorderAssignmentId) &&
    company.taskResultRecorderPermissionSetVersion === 'v1';
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
  const alive = useRef(true);
  const activeRead = useRef<AbortController | null>(null);
  const activeHistory = useRef<AbortController | null>(null);
  const activeDownload = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const path = `/tasks/${encodeURIComponent(taskId)}/results`;
  const expected = { taskId, projectId };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      activeRead.current?.abort();
      activeHistory.current?.abort();
      activeDownload.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (canRead) void reload();
    // An ordinary Task revision refreshes availability without discarding an uncertain command.
    // Authority and identity are owned by the keyed lifetime above.
  }, [observedTaskVersion]);

  function deny() {
    activeRead.current?.abort();
    activeHistory.current?.abort();
    activeDownload.current?.abort();
    setRead({ kind: 'denied' });
    setMutation({ kind: 'idle' });
    setDraft({ declaration: '', versionId: '', reason: '' });
    setHistory(undefined);
    setCorrecting(false);
  }
  async function value(result: ApiResult<unknown>): Promise<unknown> {
    if (result.status === 'unauthorized') {
      await identity.rejectSession();
      throw new ResultReadFailure('denied');
    }
    if (result.status === 'forbidden' || result.status === 'notFound')
      throw new ResultReadFailure('denied');
    if (result.status !== 'ok') throw new ResultReadFailure('unavailable');
    return result.value;
  }
  async function reload(): Promise<void> {
    activeRead.current?.abort();
    activeHistory.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    setRead({ kind: 'loading' });
    setHistory(undefined);
    setHistoryStatus('idle');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!alive.current || controller.signal.aborted) return;
      const options = {
        companyContextId: companyId,
        signal: controller.signal,
      };
      const currentValue = await api.request<unknown>(path, options);
      if (!alive.current || controller.signal.aborted) return;
      const snapshot = readTaskResultSnapshot(
        await value(currentValue),
        expected,
      );
      let versions: TaskResultReference[] = [];
      if (snapshot.mutable && canRecord) {
        const candidates = await api.request<unknown>(
          `${path}/eligible-versions`,
          options,
        );
        if (!alive.current || controller.signal.aborted) return;
        const eligible = readTaskResultVersions(
          await value(candidates),
          expected,
        );
        if (!eligible.mutable) throw new ResultReadFailure('unavailable');
        versions = eligible.versions;
      }
      if (!alive.current || controller.signal.aborted) return;
      setRead({ kind: 'ready', snapshot, versions });
    } catch (error: unknown) {
      if (!alive.current || controller.signal.aborted) return;
      if (error instanceof ResultReadFailure && error.kind === 'denied') deny();
      else
        setRead({
          kind:
            error instanceof ResultReadFailure ? 'unavailable' : 'malformed',
        });
    }
  }
  async function submit(command: ResultCommand): Promise<void> {
    if (writing.current) return;
    writing.current = true;
    // Discard reads begun before this mutation; they cannot replace its confirmed refresh.
    activeRead.current?.abort();
    activeHistory.current?.abort();
    setMutation({ kind: 'pending', command });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!alive.current) return;
      const result = await api.request<unknown>(
        `${path}${command.kind === 'correct' ? '/corrections' : ''}`,
        {
          method: 'POST',
          companyContextId: companyId,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
        },
      );
      if (!alive.current) return;
      if (result.status === 'unauthorized') {
        deny();
        await identity.rejectSession();
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
      if (alive.current) setMutation({ kind: 'uncertain', command });
    } finally {
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
    activeHistory.current?.abort();
    const controller = new AbortController();
    activeHistory.current = controller;
    setHistoryStatus('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!alive.current || controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `${path}/history${beforeRevision === undefined ? '' : `?beforeRevision=${beforeRevision}`}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (!alive.current || controller.signal.aborted) return;
      const page = readTaskResultPage(await value(result), {
        taskId,
        beforeRevision,
      });
      if (
        beforeRevision === undefined &&
        (page.declarations[0]?.id ?? null) !== (snapshot.current?.id ?? null)
      )
        throw new Error('History/current changed');
      if (!alive.current || controller.signal.aborted) return;
      setHistory((previous) => ({
        ...page,
        declarations:
          beforeRevision === undefined
            ? page.declarations
            : [...(previous?.declarations ?? []), ...page.declarations],
      }));
      setHistoryStatus('idle');
    } catch (error: unknown) {
      if (!alive.current || controller.signal.aborted) return;
      if (error instanceof ResultReadFailure && error.kind === 'denied') deny();
      else setHistoryStatus('failed');
    }
  }
  async function download(reference: TaskResultReference): Promise<void> {
    activeDownload.current?.abort();
    const controller = new AbortController();
    activeDownload.current = controller;
    setDownloadStatus('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!alive.current || controller.signal.aborted) return;
      const result = await api.download(
        `/documents/${encodeURIComponent(reference.documentId)}/versions/${encodeURIComponent(reference.versionId)}/content/${encodeURIComponent(reference.representationId)}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (!alive.current || controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        deny();
        await identity.rejectSession();
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
      if (alive.current && !controller.signal.aborted)
        setDownloadStatus('failed');
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
