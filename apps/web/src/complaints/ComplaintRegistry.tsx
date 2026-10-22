import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { useComplaintCopy } from './complaints.copy';
import { IntakeFields, IntakeFacts, type Draft } from './ComplaintIntakeViews';
import { ComplaintHistoryPanel } from './ComplaintHistoryPanel';
import { ComplaintRegisterList } from './ComplaintRegisterList';
import { ComplaintJournalForm } from './ComplaintJournalForm';
import {
  complaintCalendarDate,
  parseComplaint,
  parseComplaintPage,
  parseComplaintHistory,
  parseClientChoices,
  parseProjectChoices,
  type Complaint,
  type ComplaintIntake,
  type ComplaintPage,
  type ComplaintHistory,
  type ComplaintHistoryEntry,
} from './complaints-response';

export interface ComplaintWorkspaceProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected: (companyId: string) => void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}
type Remote<T> =
  { status: 'loading' | 'error' | 'denied' } | { status: 'ready'; value: T };
type Screen =
  | { kind: 'register' | 'new' }
  | { kind: 'opening' | 'read-error'; id: string }
  | { kind: 'detail'; complaint: Complaint; history: Remote<ComplaintHistory> };
type Intent = {
  kind: 'record' | 'intake-correction' | 'journal' | 'journal-correction';
  path: string;
  body: string;
  key: string;
};
type Save =
  | {
      status:
        | 'idle'
        | 'saved'
        | 'savedRefreshFailed'
        | 'validation'
        | 'stale'
        | 'denied'
        | 'writeRefused';
    }
  | { status: 'saving' | 'uncertain'; intent: Intent };
type Editor =
  | { kind: 'none' | 'intake' }
  | { kind: 'journal'; entryKind: 'action' | 'response' }
  | {
      kind: 'journal-correction';
      original: Extract<ComplaintHistoryEntry, { kind: 'action' | 'response' }>;
    };
type Slot = 'list' | 'detail' | 'history' | 'clients' | 'projects' | 'mutation';
type RequestContext = {
  slot: Slot;
  controller: AbortController;
  epoch: number;
};
type ComplaintReadOptions = {
  id: string;
  trigger?: HTMLElement;
  replaceDraft?: boolean;
  afterWriteRefusal?: boolean;
};
const emptyDraft: Draft = {
  complaintDate: '',
  complainant: '',
  subject: '',
  severityDescription: '',
  responseDueDate: '',
};

export function ComplaintRegistry(props: ComplaintWorkspaceProps) {
  const { actor, identity } = props;
  const companyId = actor.activeCompany?.id ?? '';
  const copy = useComplaintCopy();
  const { formatNumber } = useInterfaceLocale();
  const callbacks = useRef(props);
  callbacks.current = props;
  const [page, setPage] = useState<Remote<ComplaintPage>>({
    status: 'loading',
  });
  const [screen, setScreen] = useState<Screen>({ kind: 'register' });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<{ id: string; displayName: string }[]>(
    [],
  );
  const [clientId, setClientId] = useState('');
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [choicesError, setChoicesError] = useState(false);
  const [selfConfirmed, setSelfConfirmed] = useState(false);
  const [editor, setEditor] = useState<Editor>({ kind: 'none' });
  const [reason, setReason] = useState('');
  const [journalText, setJournalText] = useState('');
  const [journalDate, setJournalDate] = useState('');
  const [save, setSave] = useState<Save>({ status: 'idle' });
  const pending = useRef<Partial<Record<Slot, AbortController>>>({});
  const epoch = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const section = useRef<HTMLElement>(null);
  const openingTrigger = useRef<HTMLElement | null>(null);
  const intentLocked = save.status === 'saving' || save.status === 'uncertain';
  const recordAllowed = Boolean(
    actor.activeCompany?.complaintRecorderAssignmentId?.trim() &&
    actor.activeCompany.complaintRecorderPermissionSetVersion === 'v1',
  );
  const detailWriteAllowed = recordAllowed && screen.kind === 'detail';

  const start = useCallback((slot: Slot): RequestContext => {
    pending.current[slot]?.abort();
    const controller = new AbortController();
    pending.current[slot] = controller;
    return { slot, controller, epoch: epoch.current };
  }, []);
  const current = useCallback((context: RequestContext): boolean => {
    return (
      !context.controller.signal.aborted &&
      context.epoch === epoch.current &&
      pending.current[context.slot] === context.controller
    );
  }, []);
  const finish = useCallback((context: RequestContext) => {
    if (pending.current[context.slot] === context.controller)
      delete pending.current[context.slot];
  }, []);

  const request = useCallback(
    async ({
      path,
      context,
      intent,
      optionalProjects = false,
    }: {
      path: string;
      context: RequestContext;
      intent?: Intent;
      optionalProjects?: boolean;
    }): Promise<ApiResult<unknown>> => {
      const api = await createAuthenticatedApiClient(identity);
      if (!current(context)) return { status: 'error' };
      const result = await api.request<unknown>(path, {
        companyContextId: companyId,
        signal: context.controller.signal,
        ...(intent
          ? {
              method: 'POST',
              body: intent.body,
              headers: {
                'idempotency-key': intent.key,
                'content-type': 'application/json',
              },
            }
          : {}),
      });
      if (!current(context)) return { status: 'error' };
      if (result.status === 'forbidden' && optionalProjects) {
        // An optional Project chooser does not own independent Complaint authority.
        setProjects([]);
        setProjectId('');
        setChoicesError(true);
        await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId: companyId,
          signal: context.controller.signal,
          onActorRevalidated: (actor) =>
            callbacks.current.onActorRevalidated(actor),
          onCompanyContextRejected: (id) =>
            callbacks.current.onCompanyContextRejected(id),
          onWorkspaceAccessRejected: () =>
            callbacks.current.onWorkspaceAccessRejected(),
        });
        return result;
      }
      const unavailableRecord =
        result.status === 'notFound' &&
        (context.slot === 'detail' || context.slot === 'history');
      if (
        result.status === 'unauthorized' ||
        result.status === 'forbidden' ||
        unavailableRecord
      ) {
        // A positive actor revalidation must never resurrect this refused generation.
        epoch.current += 1;
        for (const controller of Object.values(pending.current))
          if (controller && controller !== context.controller)
            controller.abort();
        setPage({ status: 'denied' });
        setScreen({ kind: 'register' });
        setDraft(emptyDraft);
        setClients([]);
        setProjects([]);
        setClientSearch('');
        setClientId('');
        setProjectId('');
        setSelfConfirmed(false);
        setEditor({ kind: 'none' });
        setReason('');
        setJournalText('');
        setJournalDate('');
        setSave({ status: 'denied' });
        openingTrigger.current = null;
        if (result.status === 'unauthorized')
          await callbacks.current.onWorkspaceAccessRejected();
        await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId: companyId,
          signal: context.controller.signal,
          onActorRevalidated: (actor) =>
            callbacks.current.onActorRevalidated(actor),
          onCompanyContextRejected: (id) =>
            callbacks.current.onCompanyContextRejected(id),
          onWorkspaceAccessRejected: () =>
            callbacks.current.onWorkspaceAccessRejected(),
        });
      }
      return result;
    },
    [identity, companyId, current],
  );

  const loadList = useCallback(
    async (offset = 0): Promise<boolean> => {
      const context = start('list');
      setPage({ status: 'loading' });
      try {
        const result = await request({
          path: `/complaints${offset ? `?offset=${offset}` : ''}`,
          context,
        });
        if (!current(context)) return false;
        if (result.status !== 'ok') {
          setPage({ status: 'error' });
          return false;
        }
        setPage({
          status: 'ready',
          value: parseComplaintPage({
            value: result.value,
            companyId,
            workspaceId: actor.workspaceId,
            offset,
          }),
        });
        return true;
      } catch {
        if (current(context)) setPage({ status: 'error' });
        return false;
      } finally {
        finish(context);
      }
    },
    [request, companyId, actor.workspaceId, start, current, finish],
  );
  useEffect(() => {
    void loadList();
    return () => {
      epoch.current += 1;
      for (const controller of Object.values(pending.current))
        controller?.abort();
    };
  }, [loadList]);
  useEffect(() => {
    if (screen.kind !== 'detail' || !openingTrigger.current || !heading.current)
      return;
    const trigger = openingTrigger.current;
    if (
      !heading.current.closest('[hidden]') &&
      (document.activeElement === trigger ||
        (!trigger.isConnected && document.activeElement === document.body))
    )
      heading.current.focus();
    openingTrigger.current = null;
  }, [screen]);

  async function loadHistory({
    complaint,
    offset = 0,
  }: {
    complaint: Complaint;
    offset?: number;
  }): Promise<boolean> {
    const context = start('history');
    try {
      const result = await request({
        path: `/complaints/${encodeURIComponent(complaint.id)}/history${offset ? `?offset=${offset}` : ''}`,
        context,
      });
      if (!current(context)) return false;
      if (result.status !== 'ok')
        throw new Error('Complaint history is unavailable.');
      const history = parseComplaintHistory({
        value: result.value,
        complaint,
        offset,
      });
      setScreen((state) =>
        state.kind === 'detail' &&
        state.complaint.id === complaint.id &&
        state.complaint.revision === complaint.revision
          ? { ...state, history: { status: 'ready', value: history } }
          : state,
      );
      return true;
    } catch {
      if (current(context))
        setScreen((state) =>
          state.kind === 'detail' && state.complaint.id === complaint.id
            ? { ...state, history: { status: 'error' } }
            : state,
        );
      return false;
    } finally {
      finish(context);
    }
  }
  async function openComplaint(options: ComplaintReadOptions) {
    if (intentLocked && !options.afterWriteRefusal) return false;
    return readComplaint(options);
  }
  async function readComplaint({
    id,
    trigger,
    replaceDraft = false,
    afterWriteRefusal = false,
  }: ComplaintReadOptions): Promise<boolean> {
    const context = start('detail');
    pending.current.history?.abort();
    if (trigger) openingTrigger.current = trigger;
    setScreen({ kind: 'opening', id });
    try {
      const result = await request({
        path: `/complaints/${encodeURIComponent(id)}`,
        context,
      });
      if (!current(context)) return false;
      if (result.status !== 'ok') {
        setScreen({ kind: 'read-error', id });
        return false;
      }
      const complaint = parseComplaint({
        value: result.value,
        companyId,
        workspaceId: actor.workspaceId,
      });
      if (complaint.id !== id)
        throw new Error('Complaint detail does not match.');
      setScreen({ kind: 'detail', complaint, history: { status: 'loading' } });
      if (afterWriteRefusal) {
        setEditor({ kind: 'none' });
        setSave({ status: 'writeRefused' });
      }
      if (replaceDraft) {
        setDraft(toDraft(complaint.currentIntake));
        setReason('');
        setEditor({ kind: 'none' });
        setSave({ status: 'idle' });
      }
      const historyLoaded = await loadHistory({ complaint });
      return current(context) && historyLoaded;
    } catch {
      if (current(context)) setScreen({ kind: 'read-error', id });
      return false;
    } finally {
      finish(context);
    }
  }
  async function reloadComplaint(id: string) {
    if (intentLocked || pending.current.mutation) return;
    const confirmed =
      save.status === 'saved' || save.status === 'savedRefreshFailed';
    if (!confirmed) {
      await openComplaint({ id, replaceDraft: true });
      return;
    }
    const refreshed = await Promise.all([loadList(), readComplaint({ id })]);
    if (refreshed.every((success) => success))
      setSave((state) =>
        state.status === 'saved' || state.status === 'savedRefreshFailed'
          ? { status: 'saved' }
          : state,
      );
  }
  async function findClients(event: FormEvent) {
    event.preventDefault();
    if (intentLocked || !clientSearch.trim()) return;
    const context = start('clients');
    setChoicesError(false);
    try {
      const result = await request({
        path: `/clients/search?query=${encodeURIComponent(clientSearch.trim())}`,
        context,
      });
      if (!current(context)) return;
      if (result.status !== 'ok')
        throw new Error('Client choices are unavailable.');
      setClients(parseClientChoices(result.value));
    } catch {
      if (current(context)) setChoicesError(true);
    } finally {
      finish(context);
    }
  }
  async function chooseClient(id: string) {
    if (intentLocked) return;
    setClientId(id);
    setProjectId('');
    setProjects([]);
    pending.current.projects?.abort();
    if (
      !actor.activeCompany?.projectPermissions?.includes('project.read') ||
      !id
    )
      return;
    const context = start('projects');
    try {
      const result = await request({
        path: '/projects',
        context,
        optionalProjects: true,
      });
      if (!current(context)) return;
      if (result.status !== 'ok')
        throw new Error('Project choices are unavailable.');
      setProjects(
        parseProjectChoices({
          value: result.value,
          companyId,
          clientAccountId: id,
        }),
      );
    } catch {
      if (current(context)) setChoicesError(true);
    } finally {
      finish(context);
    }
  }
  async function execute(intent: Intent) {
    if (!recordAllowed || pending.current.mutation) return;
    const context = start('mutation');
    setSave({ status: 'saving', intent });
    try {
      const result = await request({ path: intent.path, intent, context });
      if (!current(context)) return;
      if (result.status === 'ok') {
        const scope = {
          value: result.value,
          companyId,
          workspaceId: actor.workspaceId,
        };
        const receipt = parseComplaint(scope);
        // Exact retries return the historical receipt; only its identity locates
        // today's detail and the history belonging to that current revision.
        setSave({ status: 'saved' });
        setEditor({ kind: 'none' });
        setDraft(emptyDraft);
        setSelfConfirmed(false);
        setReason('');
        setJournalText('');
        setJournalDate('');
        const refreshed = await Promise.all([
          loadList(),
          readComplaint({ id: receipt.id }),
        ]);
        if (current(context) && refreshed.some((success) => !success))
          setSave({ status: 'savedRefreshFailed' });
      } else if (result.status === 'validation')
        setSave({ status: 'validation' });
      else if (result.status === 'conflict') setSave({ status: 'stale' });
      else if (result.status === 'notFound') {
        // A rejected new write is not proof that authorized history disappeared.
        // Withhold old detail, then let the existing protected GET decide readability.
        if (screen.kind === 'detail')
          await openComplaint({
            id: screen.complaint.id,
            afterWriteRefusal: true,
          });
        else setSave({ status: 'denied' });
      } else setSave({ status: 'uncertain', intent });
    } catch {
      if (current(context)) setSave({ status: 'uncertain', intent });
    } finally {
      finish(context);
    }
  }
  function submitIntake(event: FormEvent) {
    event.preventDefault();
    if (intentLocked || !recordAllowed) return;
    const intake = validIntake(draft);
    if (!intake) {
      setSave({ status: 'validation' });
      return;
    }
    if (screen.kind === 'new') {
      if (
        !clientId ||
        !selfConfirmed ||
        !clients.some((client) => client.id === clientId) ||
        (projectId && !projects.some((project) => project.id === projectId))
      ) {
        setSave({ status: 'validation' });
        return;
      }
      void execute({
        kind: 'record',
        path: '/complaints',
        body: JSON.stringify({
          clientAccountId: clientId,
          projectId: projectId || null,
          responsibleMembershipId: actor.workspaceMembershipId,
          ...intake,
        }),
        key: crypto.randomUUID(),
      });
    } else if (
      detailWriteAllowed &&
      screen.kind === 'detail' &&
      editor.kind === 'intake'
    ) {
      if (!reason.trim() || reason.length > 1000) {
        setSave({ status: 'validation' });
        return;
      }
      void execute({
        kind: 'intake-correction',
        path: `/complaints/${encodeURIComponent(screen.complaint.id)}/intake-corrections`,
        body: JSON.stringify({
          ...intake,
          expectedRevision: screen.complaint.revision,
          reason,
        }),
        key: crypto.randomUUID(),
      });
    }
  }
  function submitJournal(event: FormEvent) {
    event.preventDefault();
    if (
      intentLocked ||
      !detailWriteAllowed ||
      screen.kind !== 'detail' ||
      (editor.kind !== 'journal' && editor.kind !== 'journal-correction')
    )
      return;
    if (
      !journalText.trim() ||
      journalText.length > 5000 ||
      (journalDate && !complaintCalendarDate(journalDate)) ||
      (editor.kind === 'journal-correction' &&
        (!reason.trim() || reason.length > 1000))
    ) {
      setSave({ status: 'validation' });
      return;
    }
    const base = `/complaints/${encodeURIComponent(screen.complaint.id)}/journal`;
    const shared = {
      text: journalText,
      declaredDate: journalDate || null,
      expectedRevision: screen.complaint.revision,
    };
    if (editor.kind === 'journal')
      void execute({
        kind: 'journal',
        path: base,
        body: JSON.stringify({ ...shared, kind: editor.entryKind }),
        key: crypto.randomUUID(),
      });
    else
      void execute({
        kind: 'journal-correction',
        path: `${base}/${encodeURIComponent(editor.original.id)}/corrections`,
        body: JSON.stringify({ ...shared, reason }),
        key: crypto.randomUUID(),
      });
  }
  function returnToRegister() {
    if (intentLocked) return;
    pending.current.detail?.abort();
    pending.current.history?.abort();
    setScreen({ kind: 'register' });
    setEditor({ kind: 'none' });
    setSave({ status: 'idle' });
    if (section.current && !section.current.closest('[hidden]'))
      section.current.focus();
  }

  return (
    <section
      ref={section}
      className="complaints-workspace"
      id="complaints"
      aria-labelledby="complaints-heading"
      tabIndex={-1}
    >
      <header className="complaint-heading">
        <div>
          <h2 id="complaints-heading">{copy('title')}</h2>
          <p>{copy('description')}</p>
        </div>
        {recordAllowed &&
        screen.kind === 'register' &&
        page.status !== 'denied' ? (
          <button
            type="button"
            className="complaint-button"
            onClick={() => {
              setScreen({ kind: 'new' });
              setSave({ status: 'idle' });
            }}
          >
            {copy('newComplaint')}
          </button>
        ) : null}
      </header>
      {save.status !== 'idle' ? (
        <p
          id="complaint-feedback"
          className="complaint-status"
          data-kind={save.status}
          role={
            save.status === 'validation' ||
            save.status === 'denied' ||
            save.status === 'writeRefused'
              ? 'alert'
              : 'status'
          }
        >
          {copy(save.status)}
        </p>
      ) : null}
      {save.status === 'uncertain' ? (
        <button
          type="button"
          className="complaint-button"
          onClick={() => {
            if (save.status === 'uncertain') void execute(save.intent);
          }}
        >
          {copy('retry')}
        </button>
      ) : null}
      {screen.kind === 'register' ? (
        <ComplaintRegisterList
          page={page}
          disabled={intentLocked}
          onReload={() => void loadList()}
          onPageChange={(offset) => void loadList(offset)}
          onOpen={(selection) => void openComplaint(selection)}
        />
      ) : null}
      {screen.kind === 'new' ? (
        <div className="complaint-card">
          <h3>{copy('newComplaint')}</h3>
          <form
            className="complaint-actions"
            onSubmit={(event) => void findClients(event)}
          >
            <label htmlFor="complaint-client-search">
              {copy('clientSearch')}
              <input
                id="complaint-client-search"
                value={clientSearch}
                maxLength={200}
                disabled={intentLocked}
                onChange={(event) => setClientSearch(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="complaint-button complaint-button--secondary"
              disabled={intentLocked || !clientSearch.trim()}
            >
              {copy('searchClients')}
            </button>
          </form>
          {choicesError ? <p role="alert">{copy('noRelatedAccess')}</p> : null}
          <form className="complaint-form" onSubmit={submitIntake} noValidate>
            <div className="complaint-fields">
              <label htmlFor="complaint-client">
                {copy('client')}
                <Select
                  id="complaint-client"
                  value={clientId}
                  options={clients.map((client) => ({
                    value: client.id,
                    label: client.displayName,
                  }))}
                  placeholder={copy('chooseClient')}
                  disabled={intentLocked || clients.length === 0}
                  onValueChange={(value) => void chooseClient(value)}
                  required
                />
              </label>
              <label htmlFor="complaint-project">
                {copy('project')}
                <Select
                  id="complaint-project"
                  value={projectId}
                  options={[
                    { value: '', label: copy('noProject') },
                    ...projects.map((project) => ({
                      value: project.id,
                      label: project.title,
                    })),
                  ]}
                  disabled={intentLocked || !clientId || projects.length === 0}
                  onValueChange={setProjectId}
                />
              </label>
            </div>
            <IntakeFields
              value={draft}
              onChange={setDraft}
              disabled={intentLocked}
              invalid={save.status === 'validation'}
            />
            <div>
              <p>{copy('responsible')}</p>
              <button
                type="button"
                className="complaint-button complaint-self"
                aria-pressed={selfConfirmed}
                disabled={intentLocked}
                onClick={() => setSelfConfirmed((value) => !value)}
              >
                {copy('assignMyself')}
              </button>
              <p className="complaint-muted">{actor.displayName}</p>
            </div>
            <div className="complaint-actions">
              <button
                type="submit"
                className="complaint-button"
                disabled={
                  intentLocked ||
                  !selfConfirmed ||
                  !clientId ||
                  !validIntake(draft)
                }
              >
                {copy('saveIntake')}
              </button>
              <button
                type="button"
                className="complaint-button complaint-button--secondary"
                disabled={intentLocked}
                onClick={returnToRegister}
              >
                {copy('back')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {screen.kind === 'opening' ? (
        <p role="status">{copy('loading')}</p>
      ) : null}
      {screen.kind === 'read-error' ? (
        <div role="alert">
          <p>{copy('error')}</p>
          <div className="complaint-actions">
            <button
              type="button"
              className="complaint-button"
              disabled={intentLocked}
              onClick={() => void reloadComplaint(screen.id)}
            >
              {copy('reload')}
            </button>
            <button
              type="button"
              className="complaint-button complaint-button--secondary"
              onClick={returnToRegister}
            >
              {copy('back')}
            </button>
          </div>
        </div>
      ) : null}
      {screen.kind === 'detail' ? (
        <>
          <article className="complaint-card">
            <header className="complaint-heading">
              <h3 ref={heading} tabIndex={-1} className="complaint-literal">
                {screen.complaint.currentIntake.subject}
              </h3>
              <button
                type="button"
                className="complaint-button complaint-button--secondary"
                disabled={intentLocked}
                onClick={returnToRegister}
              >
                {copy('back')}
              </button>
            </header>
            <dl className="complaint-facts">
              <div>
                <dt>{copy('client')}</dt>
                <dd>{screen.complaint.clientDisplayName}</dd>
              </div>
              <div>
                <dt>{copy('project')}</dt>
                <dd>{screen.complaint.project?.title ?? copy('noProject')}</dd>
              </div>
              <div>
                <dt>{copy('responsible')}</dt>
                <dd>{screen.complaint.responsible.displayLabel}</dd>
              </div>
              <div>
                <dt>{copy('revision')}</dt>
                <dd>{formatNumber(screen.complaint.revision)}</dd>
              </div>
            </dl>
            <h4>{copy('currentIntake')}</h4>
            <IntakeFacts intake={screen.complaint.currentIntake} />
            <h4>{copy('originalIntake')}</h4>
            <IntakeFacts intake={screen.complaint.originalIntake} />
            <p className="complaint-note">{copy('noSending')}</p>
            {detailWriteAllowed ? (
              <div className="complaint-actions">
                <button
                  type="button"
                  className="complaint-button complaint-button--secondary"
                  disabled={intentLocked}
                  onClick={() => {
                    setDraft(toDraft(screen.complaint.currentIntake));
                    setReason('');
                    setEditor({ kind: 'intake' });
                    setSave({ status: 'idle' });
                  }}
                >
                  {copy('correctIntake')}
                </button>
                {(
                  ['action', 'response'] satisfies Array<'action' | 'response'>
                ).map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    className="complaint-button complaint-button--secondary"
                    disabled={intentLocked}
                    onClick={() => {
                      setEditor({ kind: 'journal', entryKind: kind });
                      setJournalText('');
                      setJournalDate('');
                      setReason('');
                      setSave({ status: 'idle' });
                    }}
                  >
                    {copy(kind)}
                  </button>
                ))}
              </div>
            ) : null}
            {save.status === 'stale' ? (
              <button
                type="button"
                className="complaint-button"
                onClick={() =>
                  void openComplaint({
                    id: screen.complaint.id,
                    replaceDraft: true,
                  })
                }
              >
                {copy('reload')}
              </button>
            ) : null}
            {detailWriteAllowed && editor.kind === 'intake' ? (
              <form
                className="complaint-form"
                onSubmit={submitIntake}
                noValidate
              >
                <IntakeFields
                  value={draft}
                  onChange={setDraft}
                  disabled={intentLocked}
                  invalid={save.status === 'validation'}
                />
                <label htmlFor="complaint-reason">
                  {copy('correctionReason')}
                  <textarea
                    id="complaint-reason"
                    aria-invalid={
                      save.status === 'validation' && !reason.trim()
                    }
                    aria-describedby={
                      save.status === 'validation'
                        ? 'complaint-feedback'
                        : undefined
                    }
                    value={reason}
                    maxLength={1000}
                    disabled={intentLocked}
                    required
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="complaint-button"
                  disabled={intentLocked}
                >
                  {copy('recordCorrection')}
                </button>
              </form>
            ) : null}
            {detailWriteAllowed &&
            (editor.kind === 'journal' ||
              editor.kind === 'journal-correction') ? (
              <ComplaintJournalForm
                editor={editor}
                journalText={journalText}
                journalDate={journalDate}
                reason={reason}
                invalid={save.status === 'validation'}
                disabled={intentLocked}
                onSubmit={submitJournal}
                onTextChange={setJournalText}
                onDateChange={setJournalDate}
                onReasonChange={setReason}
              />
            ) : null}
          </article>
          <ComplaintHistoryPanel
            history={screen.history}
            canCorrect={detailWriteAllowed}
            disabled={intentLocked}
            onReload={() => void reloadComplaint(screen.complaint.id)}
            onPageChange={(offset) =>
              void loadHistory({ complaint: screen.complaint, offset })
            }
            onCorrect={(entry) => {
              setEditor({ kind: 'journal-correction', original: entry });
              setJournalText(entry.text);
              setJournalDate(entry.declaredDate ?? '');
              setReason('');
              setSave({ status: 'idle' });
            }}
          />
        </>
      ) : null}
    </section>
  );
}

function validIntake(draft: Draft): ComplaintIntake | undefined {
  if (
    !draft.complainant.trim() ||
    draft.complainant.length > 300 ||
    !draft.subject.trim() ||
    draft.subject.length > 5000 ||
    draft.severityDescription.length > 1000 ||
    (draft.severityDescription !== '' && !draft.severityDescription.trim()) ||
    (draft.complaintDate !== '' &&
      !complaintCalendarDate(draft.complaintDate)) ||
    (draft.responseDueDate !== '' &&
      !complaintCalendarDate(draft.responseDueDate))
  )
    return undefined;
  return {
    complaintDate: draft.complaintDate || null,
    complainant: draft.complainant,
    subject: draft.subject,
    severityDescription: draft.severityDescription || null,
    responseDueDate: draft.responseDueDate || null,
  };
}
function toDraft(intake: ComplaintIntake): Draft {
  return {
    complaintDate: intake.complaintDate ?? '',
    complainant: intake.complainant,
    subject: intake.subject,
    severityDescription: intake.severityDescription ?? '',
    responseDueDate: intake.responseDueDate ?? '',
  };
}
