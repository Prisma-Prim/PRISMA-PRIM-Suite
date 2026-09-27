import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  conflictCode,
  createAuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import {
  readResponsibility,
  readResponsibilityReceipt,
  readResponsibleCandidates,
  type ProjectResponsibility,
  type ResponsibleMember,
} from './project-responsible-response';
import {
  isClosedProjectStatus,
  type ProjectStatus,
} from './project-lifecycle-response';
import { useProjectResponsibleCopy } from './project-responsible-localized.copy';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  projectStatus: ProjectStatus;
  onProjectChanged?: () => void | Promise<void>;
  onActivityRecorded?: () => void | Promise<void>;
  /** Each read's responsible member, or undefined once it is unknown. */
  onResponsibleRead?: (
    projectId: string,
    responsible: ResponsibleMember | null | undefined,
  ) => void;
};
type Read =
  | { kind: 'loading' | 'denied' | 'missing' | 'error' }
  | { kind: 'ready'; value: ProjectResponsibility };
type Editor =
  | { kind: 'closed' | 'loading' | 'error' }
  | { kind: 'open'; members: ResponsibleMember[]; selection: string };
type Command = {
  key: string;
  body: { expectedRevision: number; workspaceMembershipId: string | null };
};
type Feedback = 'saved' | 'unchanged' | null;
type Mutation =
  | { kind: 'idle' }
  | { kind: 'pending' | 'uncertain'; command: Command }
  | {
      kind: 'reload-required';
      reason: 'conflict' | 'rejected' | 'responsible-required' | 'closed';
    };

/**
 * The Project's accountable member, mounted once in Project detail. It is keyed
 * on the same authority tuple as Project Tasks, so a Company, membership or
 * permission change drops its drafts, commands and late replies.
 */
export function ProjectResponsible(props: Props) {
  const { actor } = props;
  const authority = JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    actor.workspacePermissions,
    actor.activeCompany,
    props.projectId,
  ]);
  return <Responsible key={authority} {...props} />;
}

function Responsible({
  actor,
  identity,
  projectId,
  projectStatus,
  onProjectChanged,
  onActivityRecorded,
  onResponsibleRead,
}: Props) {
  const copy = useProjectResponsibleCopy();
  const { formatDateTime } = useInterfaceLocale();
  const refusalCopy = {
    conflict: copy.conflict,
    rejected: copy.rejected,
    'responsible-required': copy.responsibleRequired,
    closed: copy.closedRefusal,
  } as const;
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [editor, setEditor] = useState<Editor>({ kind: 'closed' });
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const readRequest = useRef<AbortController | null>(null);
  const membersRequest = useRef<AbortController | null>(null);
  const commandRequest = useRef<AbortController | null>(null);
  const company = actor.activeCompany;
  const companyId = company?.id ?? '';
  const canRead =
    actor.active &&
    company?.projectPermissions?.includes('project.read') === true &&
    (actor.workspacePermissions.includes('client.manage') ||
      company.clientPermissions?.includes('client.read') === true);
  const canUpdate =
    canRead && company?.projectPermissions?.includes('project.update') === true;
  const projectClosed = isClosedProjectStatus(projectStatus);
  const path = `/projects/${encodeURIComponent(projectId)}`;

  function abortAll() {
    readRequest.current?.abort();
    membersRequest.current?.abort();
    commandRequest.current?.abort();
  }
  /** Lost authority or a missing Project retires every draft and command. */
  function retire(kind: 'denied' | 'missing') {
    abortAll();
    onResponsibleRead?.(projectId, undefined);
    setRead({ kind });
    setEditor({ kind: 'closed' });
    setMutation({ kind: 'idle' });
    setFeedback(null);
  }
  async function load() {
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    if (!canRead || !companyId) {
      setRead({ kind: 'denied' });
      return;
    }
    setRead({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(`${path}/responsible`, {
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        retire('denied');
        return;
      }
      if (result.status === 'forbidden') {
        retire('denied');
        return;
      }
      if (result.status === 'notFound') {
        retire('missing');
        return;
      }
      if (result.status !== 'ok') throw new Error('Unavailable');
      const value = readResponsibility(result.value);
      setRead({ kind: 'ready', value });
      onResponsibleRead?.(projectId, value.responsible);
    } catch {
      if (!controller.signal.aborted) {
        setRead({ kind: 'error' });
        onResponsibleRead?.(projectId, undefined);
      }
    }
  }
  useEffect(() => {
    setEditor({ kind: 'closed' });
    setMutation({ kind: 'idle' });
    setFeedback(null);
    void load();
    return abortAll;
  }, [identity]);

  function reload() {
    membersRequest.current?.abort();
    setEditor({ kind: 'closed' });
    setMutation((current) =>
      current.kind === 'reload-required' ? { kind: 'idle' } : current,
    );
    if (mutation.kind !== 'uncertain') setFeedback(null);
    void Promise.all([load(), onProjectChanged?.()]);
  }
  async function openEditor(current: ProjectResponsibility) {
    membersRequest.current?.abort();
    const controller = new AbortController();
    membersRequest.current = controller;
    setFeedback(null);
    setEditor({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `${path}/eligible-responsible-members`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        retire('denied');
        return;
      }
      if (result.status === 'forbidden') {
        retire('denied');
        return;
      }
      if (result.status !== 'ok') throw new Error('Unavailable');
      const members = readResponsibleCandidates(result.value);
      const currentId = current.responsible?.workspaceMembershipId;
      setEditor({
        kind: 'open',
        members,
        selection: members.some(
          (member) => member.workspaceMembershipId === currentId,
        )
          ? (currentId ?? '')
          : '',
      });
    } catch {
      if (!controller.signal.aborted) setEditor({ kind: 'error' });
    }
  }
  async function run(command: Command) {
    membersRequest.current?.abort();
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    setMutation({ kind: 'pending', command });
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(`${path}/responsible`, {
        companyContextId: companyId,
        signal: controller.signal,
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: JSON.stringify(command.body),
      });
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        retire('denied');
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        retire(result.status === 'forbidden' ? 'denied' : 'missing');
        return;
      }
      if (result.status === 'conflict' || result.status === 'validation') {
        if (
          result.status === 'conflict' &&
          conflictCode(result) === 'project_closed'
        ) {
          setMutation({ kind: 'reload-required', reason: 'closed' });
          return;
        }
        setEditor({ kind: 'closed' });
        setMutation({
          kind: 'reload-required',
          reason:
            result.status === 'validation'
              ? 'rejected'
              : conflictCode(result) === 'project_responsible_required'
                ? 'responsible-required'
                : 'conflict',
        });
        return;
      }
      if (result.status !== 'ok') throw new Error('Unconfirmed change');
      const receipt = readResponsibilityReceipt(result.value, projectId);
      setEditor({ kind: 'closed' });
      setMutation({ kind: 'idle' });
      setFeedback(receipt.outcome === 'changed' ? 'saved' : 'unchanged');
      // A receipt is historical; only a fresh read authorizes the next change.
      await load();
      if (receipt.outcome === 'changed' && !controller.signal.aborted) {
        try {
          await onActivityRecorded?.();
        } catch {
          /* A failed Activity Log refresh does not undo a confirmed change. */
        }
      }
    } catch {
      if (!controller.signal.aborted)
        setMutation({ kind: 'uncertain', command });
    }
  }
  function save(event: FormEvent, current: ProjectResponsibility) {
    event.preventDefault();
    if (editor.kind !== 'open' || !editor.selection) return;
    void run({
      key: crypto.randomUUID(),
      body: {
        expectedRevision: current.revision,
        workspaceMembershipId: editor.selection,
      },
    });
  }
  function clear(current: ProjectResponsibility) {
    void run({
      key: crypto.randomUUID(),
      body: { expectedRevision: current.revision, workspaceMembershipId: null },
    });
  }

  const busy = mutation.kind === 'pending';
  const current = read.kind === 'ready' ? read.value : null;
  const closedRefusal =
    mutation.kind === 'reload-required' && mutation.reason === 'closed';
  const changeable =
    canUpdate &&
    current?.mutable === true &&
    !projectClosed &&
    mutation.kind === 'idle';
  const editorVisible =
    canUpdate &&
    current?.mutable === true &&
    !projectClosed &&
    (mutation.kind === 'idle' || closedRefusal);
  return (
    <section className="project-responsible" aria-label={copy.title}>
      {read.kind === 'loading' && <p role="status">{copy.loading}</p>}
      {(read.kind === 'denied' ||
        read.kind === 'missing' ||
        read.kind === 'error') && (
        <p role="alert">
          {read.kind === 'denied'
            ? copy.denied
            : read.kind === 'missing'
              ? copy.missing
              : copy.error}
        </p>
      )}
      {current && (
        <>
          <dl className="project-responsible-facts">
            <div>
              <dt>{copy.title}</dt>
              <dd>{current.responsible?.displayLabel ?? copy.none}</dd>
            </div>
          </dl>
          {current.lastChange && (
            <p className="project-responsible-change">
              {copy.lastChangedBy} {current.lastChange.actorDisplayName}{' '}
              {copy.on}{' '}
              <time dateTime={current.lastChange.occurredAt}>
                {formatDateTime(current.lastChange.occurredAt)}
              </time>
            </p>
          )}
          {!current.mutable && (
            <p>{projectClosed ? copy.closedReadOnly : copy.readOnly}</p>
          )}
          {editorVisible && editor.kind !== 'closed' && (
            <form
              className="project-responsible-editor"
              onSubmit={(event) => save(event, current)}
            >
              {editor.kind === 'loading' && (
                <p role="status">{copy.membersLoading}</p>
              )}
              {editor.kind === 'error' && (
                <p role="alert">{copy.membersError}</p>
              )}
              {editor.kind === 'open' && editor.members.length === 0 && (
                <p>{copy.noMembers}</p>
              )}
              {editor.kind === 'open' && editor.members.length > 0 && (
                <label htmlFor={`project-responsible-${projectId}`}>
                  {copy.choose}
                  <Select
                    id={`project-responsible-${projectId}`}
                    value={editor.selection}
                    placeholder={copy.selectMember}
                    options={editor.members.map((member) => ({
                      value: member.workspaceMembershipId,
                      label: member.displayLabel,
                    }))}
                    onValueChange={(value) =>
                      setEditor({ ...editor, selection: value })
                    }
                  />
                </label>
              )}
              <div className="project-responsible-actions">
                {editor.kind === 'open' && editor.members.length > 0 && (
                  <button
                    type="submit"
                    disabled={!editor.selection || closedRefusal}
                  >
                    {copy.save}
                  </button>
                )}
                {current.responsible && (
                  <button
                    type="button"
                    disabled={closedRefusal}
                    onClick={() => clear(current)}
                  >
                    {copy.clear}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    membersRequest.current?.abort();
                    setEditor({ kind: 'closed' });
                  }}
                >
                  {copy.cancel}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {busy && <p role="status">{copy.saving}</p>}
      {feedback && <p role="status">{copy[feedback]}</p>}
      {mutation.kind === 'reload-required' && (
        <p role="alert">{refusalCopy[mutation.reason]}</p>
      )}
      {mutation.kind === 'uncertain' && <p role="alert">{copy.uncertain}</p>}
      <div className="project-responsible-actions">
        {current && changeable && editor.kind === 'closed' && (
          <button type="button" onClick={() => void openEditor(current)}>
            {copy.change}
          </button>
        )}
        {mutation.kind === 'uncertain' && (
          <button type="button" onClick={() => void run(mutation.command)}>
            {copy.retry}
          </button>
        )}
        <button type="button" disabled={busy} onClick={reload}>
          {copy.reload}
        </button>
      </div>
    </section>
  );
}
