import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  conflictCode,
  createAuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { formatApplicationDateTime } from '../presentation/date-time';
import { Select } from '../presentation/Select';
import {
  START_DECLARATION_ITEMS,
  isClosedProjectStatus,
  readLifecycleReceipt,
  readProjectLifecycle,
  readStartExceptionCandidates,
  type ProjectLifecycle as LifecycleValue,
  type ProjectStatus,
  type StartDeclaration,
  type StartDeclarationItem,
  type StartDeclarationValue,
} from './project-lifecycle-response';
import {
  projectLifecycleCopy as copy,
  projectStatusLabels,
  projectStatusTones,
  startDeclarationItemLabels,
  startDeclarationValueLabels,
  transitionLabel,
} from './project-lifecycle.copy';
import type { ResponsibleMember } from './project-responsible-response';
import { validTaskDate, validTaskReason } from './task-response';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  /** The responsible member as last read; undefined while it is unknown. */
  responsible: ResponsibleMember | null | undefined;
  /** Re-reads the Project detail and its list row. */
  onProjectChanged?: () => void | Promise<void>;
  onShowTasks?: () => void;
  onActivityRecorded?: () => void | Promise<void>;
};
type Read =
  | { kind: 'loading' | 'unavailable' | 'error' }
  | { kind: 'ready'; value: LifecycleValue };
type DeclarationDraft = Record<
  StartDeclarationItem,
  StartDeclarationValue | undefined
>;
type Members =
  | { kind: 'loading' | 'error' }
  | { kind: 'ready'; members: ResponsibleMember[] };
type Editor =
  | { kind: 'closed' | 'resume' }
  | {
      kind: 'activate';
      declaration: DeclarationDraft;
      reason: string;
      completionMembershipId: string;
      completionDueDate: string;
      members: Members;
      showErrors: boolean;
    }
  | { kind: 'hold'; reason: string; showErrors: boolean }
  | {
      kind: 'complete' | 'cancel';
      text: string;
      showErrors: boolean;
    };
type StartException = {
  reason: string;
  completionMembershipId: string;
  completionDueDate: string;
};
type CommandBody =
  | {
      action: 'activate';
      expectedLifecycleRevision: number;
      declaration: StartDeclaration;
      startException?: StartException;
    }
  | { action: 'hold'; expectedLifecycleRevision: number; reason: string }
  | { action: 'resume'; expectedLifecycleRevision: number }
  | { action: 'complete'; expectedLifecycleRevision: number; note: string }
  | { action: 'cancel'; expectedLifecycleRevision: number; reason: string };
type Command = { key: string; body: CommandBody };
type Refusal = 'conflict' | 'invalid' | 'responsible' | 'rejected';
type Mutation =
  | { kind: 'idle' | 'open-tasks' }
  | { kind: 'pending' | 'uncertain'; command: Command }
  | { kind: 'reload-required'; reason: Refusal };

const emptyDeclaration: DeclarationDraft = {
  approvedOffer: undefined,
  contractOrPrecontract: undefined,
  projectPlan: undefined,
  initialDocuments: undefined,
  deadlines: undefined,
  financialConditions: undefined,
  risks: undefined,
};
const refusalCopy = {
  conflict: copy.conflict,
  invalid: copy.invalid,
  responsible: copy.responsibleRequired,
  rejected: copy.rejected,
} as const satisfies Record<Refusal, string>;

/** A Project status as the `/ui-baseline` Projects Status pill shows it. */
export function ProjectStatusLabel({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`project-status project-status--${projectStatusTones[status]}`}
    >
      <i aria-hidden="true" />
      {projectStatusLabels[status]}
    </span>
  );
}

/**
 * The Project lifecycle (Project/Task PRD section 23), mounted once in Project
 * detail. It is keyed on the same authority tuple as the responsible member,
 * so a Company, membership or permission change, including the Approver
 * assignment, drops its drafts and never renders a late reply.
 */
export function ProjectLifecycle(props: Props) {
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
  return <LifecycleSection key={authority} {...props} />;
}

function LifecycleSection({
  actor,
  identity,
  projectId,
  responsible,
  onProjectChanged,
  onShowTasks,
  onActivityRecorded,
}: Props) {
  const headingId = useId();
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [editor, setEditor] = useState<Editor>({ kind: 'closed' });
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const [feedback, setFeedback] = useState('');
  const readRequest = useRef<AbortController | null>(null);
  const membersRequest = useRef<AbortController | null>(null);
  /** Marks a command's reply as stale; the write itself is never cancelled. */
  const commandRequest = useRef<AbortController | null>(null);
  const company = actor.activeCompany;
  const companyId = company?.id ?? '';
  const canRead =
    actor.active &&
    company?.projectPermissions?.includes('project.read') === true &&
    (actor.workspacePermissions.includes('client.manage') ||
      company.clientPermissions?.includes('client.read') === true);
  const canTransition =
    canRead &&
    company?.projectApproverPermissions?.includes(
      'project.lifecycle.transition',
    ) === true;
  const canClose =
    canRead &&
    company?.projectApproverPermissions?.includes('project.close') === true;
  const canReadTasks =
    company?.taskPermissionSetVersion === 'v1' &&
    !!company.taskPermissionAssignmentId &&
    company.taskPermissions?.includes('task.read') === true;
  const path = `/projects/${encodeURIComponent(projectId)}`;

  function stopReads() {
    readRequest.current?.abort();
    membersRequest.current?.abort();
  }
  /** Lost authority or a hidden Project shows no value and keeps no draft. */
  function retire() {
    stopReads();
    commandRequest.current?.abort();
    setRead({ kind: 'unavailable' });
    setEditor({ kind: 'closed' });
    setMutation({ kind: 'idle' });
    setFeedback('');
  }
  async function load() {
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    if (!canRead || !companyId) {
      setRead({ kind: 'unavailable' });
      return;
    }
    setRead({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(`${path}/lifecycle`, {
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        retire();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        retire();
        return;
      }
      if (result.status !== 'ok') throw new Error('Unavailable');
      setRead({ kind: 'ready', value: readProjectLifecycle(result.value) });
    } catch {
      if (!controller.signal.aborted) setRead({ kind: 'error' });
    }
  }
  useEffect(() => {
    void load();
    return () => {
      stopReads();
      commandRequest.current?.abort();
    };
  }, [identity]);

  async function reloadProject() {
    membersRequest.current?.abort();
    setEditor({ kind: 'closed' });
    setMutation((current) =>
      current.kind === 'reload-required' ? { kind: 'idle' } : current,
    );
    setFeedback('');
    await Promise.all([load(), onProjectChanged?.()]);
  }
  async function openActivation() {
    membersRequest.current?.abort();
    const controller = new AbortController();
    membersRequest.current = controller;
    setFeedback('');
    setEditor({
      kind: 'activate',
      declaration: emptyDeclaration,
      reason: '',
      completionMembershipId: '',
      completionDueDate: '',
      members: { kind: 'loading' },
      showErrors: false,
    });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `${path}/eligible-start-exception-members`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        retire();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        retire();
        return;
      }
      if (result.status !== 'ok') throw new Error('Unavailable');
      const members = readStartExceptionCandidates(result.value);
      const preselected = members.some(
        (member) =>
          member.workspaceMembershipId === responsible?.workspaceMembershipId,
      )
        ? (responsible?.workspaceMembershipId ?? '')
        : '';
      setEditor((current) =>
        current.kind === 'activate'
          ? {
              ...current,
              members: { kind: 'ready', members },
              completionMembershipId:
                current.completionMembershipId || preselected,
            }
          : current,
      );
    } catch {
      if (!controller.signal.aborted)
        setEditor((current) =>
          current.kind === 'activate'
            ? { ...current, members: { kind: 'error' } }
            : current,
        );
    }
  }
  function closeEditor() {
    membersRequest.current?.abort();
    setEditor({ kind: 'closed' });
  }
  async function run(command: Command) {
    membersRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    setMutation({ kind: 'pending', command });
    setFeedback('');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      // No abort signal: a later read, reload or authority change never
      // cancels a submitted write; its reply is only ignored.
      const result = await api.request<unknown>(
        `${path}/lifecycle-transitions`,
        {
          companyContextId: companyId,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: JSON.stringify(command.body),
        },
      );
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        retire();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        retire();
        return;
      }
      if (result.status === 'conflict' || result.status === 'validation') {
        if (
          result.status === 'conflict' &&
          conflictCode(result) === 'project_open_tasks'
        ) {
          setMutation({ kind: 'open-tasks' });
          return;
        }
        setEditor({ kind: 'closed' });
        setMutation({
          kind: 'reload-required',
          reason:
            result.status === 'validation'
              ? 'rejected'
              : conflictCode(result) === 'project_lifecycle_transition_invalid'
                ? 'invalid'
                : conflictCode(result) === 'project_responsible_required'
                  ? 'responsible'
                  : 'conflict',
        });
        return;
      }
      if (result.status !== 'ok') throw new Error('Unconfirmed change');
      readLifecycleReceipt(result.value, projectId, command.body.action);
      setEditor({ kind: 'closed' });
      setMutation({ kind: 'idle' });
      setFeedback(copy.saved);
      // A receipt is historical: the section, the detail status and the list
      // row are re-read together before another change is offered.
      await Promise.all([load(), onProjectChanged?.()]);
      if (!controller.signal.aborted) {
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
  function activate(event: FormEvent, current: LifecycleValue) {
    event.preventDefault();
    if (editor.kind !== 'activate') return;
    const declaration = completeDeclaration(editor.declaration);
    const exceptionNeeded = START_DECLARATION_ITEMS.some(
      (item) => editor.declaration[item] === 'missing',
    );
    if (
      !declaration ||
      (exceptionNeeded &&
        (!validTaskReason(editor.reason) ||
          !editor.completionMembershipId ||
          !validTaskDate(editor.completionDueDate)))
    ) {
      setEditor({ ...editor, showErrors: true });
      return;
    }
    void run({
      key: crypto.randomUUID(),
      body: {
        action: 'activate',
        expectedLifecycleRevision: current.lifecycleRevision,
        declaration,
        ...(exceptionNeeded
          ? {
              startException: {
                reason: editor.reason.trim(),
                completionMembershipId: editor.completionMembershipId,
                completionDueDate: editor.completionDueDate,
              },
            }
          : {}),
      },
    });
  }
  function hold(event: FormEvent, current: LifecycleValue) {
    event.preventDefault();
    if (editor.kind !== 'hold') return;
    if (!validTaskReason(editor.reason)) {
      setEditor({ ...editor, showErrors: true });
      return;
    }
    void run({
      key: crypto.randomUUID(),
      body: {
        action: 'hold',
        expectedLifecycleRevision: current.lifecycleRevision,
        reason: editor.reason.trim(),
      },
    });
  }
  function resume(current: LifecycleValue) {
    void run({
      key: crypto.randomUUID(),
      body: {
        action: 'resume',
        expectedLifecycleRevision: current.lifecycleRevision,
      },
    });
  }
  function closeProject(
    event: FormEvent,
    current: LifecycleValue,
    action: 'complete' | 'cancel',
  ) {
    event.preventDefault();
    if (editor.kind !== action) return;
    if (!validTaskReason(editor.text)) {
      setEditor({ ...editor, showErrors: true });
      return;
    }
    const text = editor.text.trim();
    void run({
      key: crypto.randomUUID(),
      body:
        action === 'complete'
          ? {
              action,
              expectedLifecycleRevision: current.lifecycleRevision,
              note: text,
            }
          : {
              action,
              expectedLifecycleRevision: current.lifecycleRevision,
              reason: text,
            },
    });
  }

  const busy = mutation.kind === 'pending';
  const current = read.kind === 'ready' ? read.value : null;
  const actionable =
    current?.mutable === true &&
    (mutation.kind === 'idle' || mutation.kind === 'open-tasks');
  return (
    <section className="project-lifecycle" aria-labelledby={headingId}>
      <h4 id={headingId}>{copy.title}</h4>
      {read.kind === 'loading' && <p role="status">{copy.loading}</p>}
      {read.kind === 'unavailable' && <p role="alert">{copy.unavailable}</p>}
      {read.kind === 'error' && <p role="alert">{copy.error}</p>}
      {current && <LifecycleFacts value={current} />}
      {current && !current.mutable && (
        <p>
          {isClosedProjectStatus(current.status)
            ? copy.closedReadOnly
            : copy.readOnly}
        </p>
      )}
      {current && actionable && editor.kind === 'activate' && (
        <ActivationForm
          editor={editor}
          onChange={setEditor}
          onSubmit={(event) => activate(event, current)}
          onCancel={closeEditor}
        />
      )}
      {current && actionable && editor.kind === 'hold' && (
        <HoldForm
          editor={editor}
          onChange={setEditor}
          onSubmit={(event) => hold(event, current)}
          onCancel={closeEditor}
        />
      )}
      {current && actionable && editor.kind === 'resume' && (
        <div className="project-lifecycle-confirm">
          <p>{copy.resumeConfirmation}</p>
          <div className="project-lifecycle-actions">
            <button type="button" onClick={() => resume(current)}>
              {copy.confirmResume}
            </button>
            <button type="button" onClick={closeEditor}>
              {copy.cancel}
            </button>
          </div>
        </div>
      )}
      {current &&
        actionable &&
        (editor.kind === 'complete' || editor.kind === 'cancel') && (
          <CloseProjectForm
            editor={editor}
            onChange={setEditor}
            onSubmit={(event) => closeProject(event, current, editor.kind)}
            onCancel={closeEditor}
          />
        )}
      {busy && <p role="status">{copy.saving}</p>}
      {feedback && <p role="status">{feedback}</p>}
      {mutation.kind === 'reload-required' && (
        <p role="alert">{refusalCopy[mutation.reason]}</p>
      )}
      {mutation.kind === 'open-tasks' && (
        <div className="project-lifecycle-refusal" role="alert">
          <p>{copy.openTasks}</p>
          {canReadTasks && onShowTasks && (
            <button type="button" onClick={onShowTasks}>
              {copy.showTasks}
            </button>
          )}
        </div>
      )}
      {mutation.kind === 'uncertain' && <p role="alert">{copy.uncertain}</p>}
      <div className="project-lifecycle-actions">
        {current && actionable && editor.kind === 'closed' && (
          <LifecycleActions
            status={current.status}
            responsible={responsible}
            canTransition={canTransition}
            canClose={canClose}
            onActivate={() => void openActivation()}
            onHold={() =>
              setEditor({ kind: 'hold', reason: '', showErrors: false })
            }
            onResume={() => setEditor({ kind: 'resume' })}
            onComplete={() =>
              setEditor({ kind: 'complete', text: '', showErrors: false })
            }
            onCancelProject={() =>
              setEditor({ kind: 'cancel', text: '', showErrors: false })
            }
          />
        )}
        {mutation.kind === 'uncertain' && (
          <button type="button" onClick={() => void run(mutation.command)}>
            {copy.retry}
          </button>
        )}
        {mutation.kind === 'reload-required' ? (
          <button type="button" onClick={() => void reloadProject()}>
            {copy.reloadProject}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void load()}>
            {copy.reload}
          </button>
        )}
      </div>
    </section>
  );
}

function LifecycleActions({
  status,
  responsible,
  canTransition,
  canClose,
  onActivate,
  onHold,
  onResume,
  onComplete,
  onCancelProject,
}: {
  status: ProjectStatus;
  responsible: ResponsibleMember | null | undefined;
  canTransition: boolean;
  canClose: boolean;
  onActivate: () => void;
  onHold: () => void;
  onResume: () => void;
  onComplete: () => void;
  onCancelProject: () => void;
}) {
  const hintId = useId();
  switch (status) {
    case 'preparatory':
      return (
        <>
          {canTransition && (
            <button
              type="button"
              disabled={!responsible}
              aria-describedby={responsible === null ? hintId : undefined}
              onClick={onActivate}
            >
              {copy.activate}
            </button>
          )}
          {canTransition && responsible === null && (
            <p className="project-lifecycle-hint" id={hintId}>
              {copy.needsResponsible}
            </p>
          )}
          {canClose && (
            <button type="button" onClick={onCancelProject}>
              {copy.cancelProject}
            </button>
          )}
        </>
      );
    case 'active':
      return (
        <>
          {canTransition && (
            <button type="button" onClick={onHold}>
              {copy.hold}
            </button>
          )}
          {canClose && (
            <>
              <button type="button" onClick={onComplete}>
                {copy.complete}
              </button>
              <button type="button" onClick={onCancelProject}>
                {copy.cancelProject}
              </button>
            </>
          )}
        </>
      );
    case 'on_hold':
      return (
        <>
          {canTransition && (
            <button type="button" onClick={onResume}>
              {copy.resume}
            </button>
          )}
          {canClose && (
            <button type="button" onClick={onCancelProject}>
              {copy.cancelProject}
            </button>
          )}
        </>
      );
    case 'completed':
    case 'cancelled':
      return null;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function LifecycleFacts({ value }: { value: LifecycleValue }) {
  const [last] = value.transitions;
  const { start } = value;
  return (
    <>
      <dl className="project-lifecycle-facts">
        <div>
          <dt>{copy.status}</dt>
          <dd>
            <ProjectStatusLabel status={value.status} />
          </dd>
        </div>
        {last && (
          <div>
            <dt>{copy.lastChange}</dt>
            <dd>
              {transitionLabel(last)} {copy.by} {last.actor.displayName}{' '}
              {copy.on}{' '}
              <time dateTime={last.occurredAt}>
                {formatApplicationDateTime(last.occurredAt)}
              </time>
            </dd>
          </div>
        )}
        {value.status === 'on_hold' && last?.action === 'hold' && (
          <div>
            <dt>{copy.holdReason}</dt>
            <dd>{last.reason}</dd>
          </div>
        )}
        {value.status === 'completed' && last?.action === 'complete' && (
          <div>
            <dt>{copy.note}</dt>
            <dd>{last.note}</dd>
          </div>
        )}
        {value.status === 'cancelled' && last?.action === 'cancel' && (
          <div>
            <dt>{copy.reason}</dt>
            <dd>{last.reason}</dd>
          </div>
        )}
      </dl>
      {start && (
        <div className="project-lifecycle-start">
          <h5>{copy.declarationTitle}</h5>
          <dl className="project-lifecycle-declaration">
            {START_DECLARATION_ITEMS.map((item) => (
              <div key={item}>
                <dt>{startDeclarationItemLabels[item]}</dt>
                <dd>{startDeclarationValueLabels[start.declaration[item]]}</dd>
              </div>
            ))}
          </dl>
          <p className="project-lifecycle-meta">
            {copy.declaredBy} {start.declaredBy.displayName} {copy.on}{' '}
            <time dateTime={start.declaredAt}>
              {formatApplicationDateTime(start.declaredAt)}
            </time>
          </p>
          {start.exception && (
            <div className="project-lifecycle-exception">
              <h5>{copy.exceptionTitle}</h5>
              <p>
                {copy.exceptionReason}: {start.exception.reason}
              </p>
              <p>
                {copy.completion(
                  start.exception.completionResponsible.displayLabel,
                )}{' '}
                <time dateTime={start.exception.completionDueDate}>
                  {start.exception.completionDueDate}
                </time>
              </p>
            </div>
          )}
        </div>
      )}
      <div className="project-lifecycle-history">
        <h5>{copy.historyTitle}</h5>
        {value.transitions.length === 0 ? (
          <p>{copy.noTransitions}</p>
        ) : (
          <ol>
            {value.transitions.map((transition) => (
              <li key={transition.lifecycleRevision}>
                <p>
                  <strong>{transitionLabel(transition)}</strong> {copy.by}{' '}
                  {transition.actor.displayName} {copy.on}{' '}
                  <time dateTime={transition.occurredAt}>
                    {formatApplicationDateTime(transition.occurredAt)}
                  </time>
                </p>
                {(transition.action === 'hold' ||
                  transition.action === 'cancel') && (
                  <p>
                    {copy.reason}: {transition.reason}
                  </p>
                )}
                {transition.action === 'complete' && (
                  <p>
                    {copy.note}: {transition.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function ActivationForm({
  editor,
  onChange,
  onSubmit,
  onCancel,
}: {
  editor: Extract<Editor, { kind: 'activate' }>;
  onChange: (editor: Editor) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const exceptionNeeded = START_DECLARATION_ITEMS.some(
    (item) => editor.declaration[item] === 'missing',
  );
  const reasonInvalid = editor.showErrors && !validTaskReason(editor.reason);
  const memberInvalid = editor.showErrors && !editor.completionMembershipId;
  const dateInvalid =
    editor.showErrors && !validTaskDate(editor.completionDueDate);
  return (
    <form
      className="project-lifecycle-form"
      aria-labelledby={`${formId}-title`}
      onSubmit={onSubmit}
      noValidate
    >
      <h5 id={`${formId}-title`}>{copy.activateTitle}</h5>
      <p>{copy.activateHint}</p>
      <div className="project-lifecycle-items">
        {START_DECLARATION_ITEMS.map((item) => {
          const unchosen =
            editor.showErrors && editor.declaration[item] === undefined;
          const errorId = `${formId}-${item}-error`;
          return (
            <fieldset
              key={item}
              aria-describedby={unchosen ? errorId : undefined}
            >
              <legend>{startDeclarationItemLabels[item]}</legend>
              <div className="project-lifecycle-choice">
                {(['present', 'missing'] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`${formId}-${item}`}
                      value={value}
                      checked={editor.declaration[item] === value}
                      aria-invalid={unchosen || undefined}
                      onChange={() =>
                        onChange({
                          ...editor,
                          declaration: { ...editor.declaration, [item]: value },
                        })
                      }
                    />
                    {startDeclarationValueLabels[value]}
                  </label>
                ))}
              </div>
              {unchosen && (
                <p className="project-lifecycle-error" id={errorId}>
                  {copy.chooseEach}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
      {exceptionNeeded && (
        <fieldset className="project-lifecycle-exception-fields">
          <legend>{copy.exceptionLegend}</legend>
          <p>{copy.exceptionHint}</p>
          <label>
            {copy.exceptionReasonLabel}
            <textarea
              value={editor.reason}
              rows={3}
              required
              aria-invalid={reasonInvalid || undefined}
              aria-describedby={
                reasonInvalid ? `${formId}-reason-error` : undefined
              }
              onChange={(event) =>
                onChange({ ...editor, reason: event.target.value })
              }
            />
          </label>
          {reasonInvalid && (
            <p
              className="project-lifecycle-error"
              id={`${formId}-reason-error`}
            >
              {copy.reasonValidation}
            </p>
          )}
          {editor.members.kind === 'loading' && (
            <p role="status">{copy.membersLoading}</p>
          )}
          {editor.members.kind === 'error' && (
            <p role="alert">{copy.membersError}</p>
          )}
          {editor.members.kind === 'ready' &&
            editor.members.members.length === 0 && <p>{copy.noMembers}</p>}
          {editor.members.kind === 'ready' &&
            editor.members.members.length > 0 && (
              <label htmlFor={`${formId}-member`}>
                {copy.completionResponsible}
                <Select
                  id={`${formId}-member`}
                  value={editor.completionMembershipId}
                  placeholder={copy.selectMember}
                  options={editor.members.members.map((member) => ({
                    value: member.workspaceMembershipId,
                    label: member.displayLabel,
                  }))}
                  required
                  invalid={memberInvalid}
                  describedBy={
                    memberInvalid ? `${formId}-member-error` : undefined
                  }
                  onValueChange={(value) =>
                    onChange({
                      ...editor,
                      completionMembershipId: value,
                    })
                  }
                />
              </label>
            )}
          {memberInvalid && (
            <p
              className="project-lifecycle-error"
              id={`${formId}-member-error`}
            >
              {copy.memberValidation}
            </p>
          )}
          <label>
            {copy.completionDueDate}
            <input
              type="date"
              value={editor.completionDueDate}
              required
              aria-invalid={dateInvalid || undefined}
              aria-describedby={
                dateInvalid ? `${formId}-date-error` : undefined
              }
              onChange={(event) =>
                onChange({ ...editor, completionDueDate: event.target.value })
              }
            />
          </label>
          {dateInvalid && (
            <p className="project-lifecycle-error" id={`${formId}-date-error`}>
              {copy.dateValidation}
            </p>
          )}
        </fieldset>
      )}
      <div className="project-lifecycle-actions">
        <button type="submit">{copy.confirmActivate}</button>
        <button type="button" onClick={onCancel}>
          {copy.cancel}
        </button>
      </div>
    </form>
  );
}

function HoldForm({
  editor,
  onChange,
  onSubmit,
  onCancel,
}: {
  editor: Extract<Editor, { kind: 'hold' }>;
  onChange: (editor: Editor) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const errorId = useId();
  const invalid = editor.showErrors && !validTaskReason(editor.reason);
  return (
    <form className="project-lifecycle-form" onSubmit={onSubmit} noValidate>
      <label>
        {copy.holdReasonLabel}
        <textarea
          value={editor.reason}
          rows={3}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) =>
            onChange({ ...editor, reason: event.target.value })
          }
        />
      </label>
      {invalid && (
        <p className="project-lifecycle-error" id={errorId}>
          {copy.reasonValidation}
        </p>
      )}
      <div className="project-lifecycle-actions">
        <button type="submit">{copy.confirmHold}</button>
        <button type="button" onClick={onCancel}>
          {copy.cancel}
        </button>
      </div>
    </form>
  );
}

function CloseProjectForm({
  editor,
  onChange,
  onSubmit,
  onCancel,
}: {
  editor: Extract<Editor, { kind: 'complete' | 'cancel' }>;
  onChange: (editor: Editor) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const errorId = useId();
  const invalid = editor.showErrors && !validTaskReason(editor.text);
  const completing = editor.kind === 'complete';
  return (
    <form className="project-lifecycle-form" onSubmit={onSubmit} noValidate>
      <h5>{completing ? copy.completeTitle : copy.cancelTitle}</h5>
      <p>
        {copy.closureConfirmation(completing ? 'Completing' : 'Cancelling')}
      </p>
      <label>
        {completing ? copy.completionNoteLabel : copy.cancellationReasonLabel}
        <textarea
          value={editor.text}
          rows={4}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) =>
            onChange({ ...editor, text: event.target.value })
          }
        />
      </label>
      {invalid && (
        <p className="project-lifecycle-error" id={errorId}>
          {copy.closureTextValidation}
        </p>
      )}
      <div className="project-lifecycle-actions">
        <button type="submit">
          {completing ? copy.confirmComplete : copy.confirmCancel}
        </button>
        <button type="button" onClick={onCancel}>
          {copy.cancel}
        </button>
      </div>
    </form>
  );
}

function completeDeclaration(
  draft: DeclarationDraft,
): StartDeclaration | undefined {
  const {
    approvedOffer,
    contractOrPrecontract,
    projectPlan,
    initialDocuments,
    deadlines,
    financialConditions,
    risks,
  } = draft;
  if (
    approvedOffer === undefined ||
    contractOrPrecontract === undefined ||
    projectPlan === undefined ||
    initialDocuments === undefined ||
    deadlines === undefined ||
    financialConditions === undefined ||
    risks === undefined
  )
    return undefined;
  return {
    approvedOffer,
    contractOrPrecontract,
    projectPlan,
    initialDocuments,
    deadlines,
    financialConditions,
    risks,
  };
}
