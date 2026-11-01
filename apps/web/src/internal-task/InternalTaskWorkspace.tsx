import { TaskEditor } from './InternalTaskEditor';
import { TaskDate } from './InternalTaskValues';
import { InternalTaskDetail } from './InternalTaskDetail';
import {
  responseState,
  formatFailure,
  type Request,
  type ViewState,
} from './internal-task-request';
import { useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { Select } from '../presentation/Select';
import { useInternalTaskCopy } from './internal-task.copy';
import {
  isNativeUuid,
  readMembers,
  readPage,
  status,
  type Member,
  type Page,
  type Scope,
} from './internal-task-response';
import './internal-task.css';

export interface InternalTaskProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  companyGeneration: number;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (id: string) => void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}
export function internalTaskAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  return JSON.stringify([
    actor.active,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company?.id,
    canReadInternalTasks(actor)
      ? ['internal_task.read', 'internal_task.manage']
      : null,
    company?.internalTaskManagerAssignmentId,
    company?.internalTaskManagerPermissionSetVersion,
  ]);
}
export function canReadInternalTasks(actor: ActorContext) {
  const company = actor.activeCompany;
  return (
    actor.active &&
    !!company &&
    Array.isArray(company.internalTaskPermissions) &&
    company.internalTaskPermissions.length === 2 &&
    company.internalTaskPermissions.includes('internal_task.read') &&
    company.internalTaskPermissions.includes('internal_task.manage') &&
    company.internalTaskManagerPermissionSetVersion === 'v1' &&
    isNativeUuid(company.internalTaskManagerAssignmentId)
  );
}
export function InternalTaskWorkspace(props: InternalTaskProps) {
  const copy = useInternalTaskCopy(),
    scope: Scope = {
      workspaceId: props.actor.workspaceId,
      companyId: props.actor.activeCompany?.id ?? '',
    };
  const captureScope = useAuthorityLifetime(
      internalTaskAuthority(props.actor) + ':' + props.companyGeneration,
      props.identity,
    ),
    captureRecoveryActor = useAuthorityLifetime(
      JSON.stringify(props.actor),
      props.identity,
    );
  const retired = useRef(false),
    callbacks = useRef(props);
  callbacks.current = props;
  function capture() {
    const live = captureScope();
    return () => !retired.current && live();
  }
  function captureRecovery() {
    const scopeLive = captureScope(),
      actorLive = captureRecoveryActor();
    return () => scopeLive() && actorLive();
  }
  const [denied, setDenied] = useState(false),
    [filter, setFilter] = useState('open'),
    [page, setPage] = useState<Page>({ tasks: [], nextBeforeTaskId: null }),
    [pageState, setPageState] = useState<ViewState>('loading'),
    [selected, setSelected] = useState<{
      id: string;
      generation: number;
      focusFrom: HTMLElement;
    }>(),
    [visited, setVisited] = useState<string[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [nextMember, setNextMember] = useState<string | null>(null),
    [memberState, setMemberState] = useState<ViewState>('loading');
  const listRequest = useRef(0),
    memberRequest = useRef(0);
  const request: Request = async (path, options = {}) => {
    const live = options.live ?? capture(),
      recoveryLive = options.recoveryLive ?? captureRecovery(),
      recoveryScopeLive = captureScope();
    if (!live()) return;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live()) return;
      const result = await api.request<unknown>(path, {
        companyContextId: scope.companyId,
        ...(options.method ? { method: options.method } : {}),
        ...(options.body ? { body: options.body } : {}),
        ...(options.key
          ? {
              headers: {
                'content-type': 'application/json',
                'idempotency-key': options.key,
              },
            }
          : {}),
      });
      if (!live()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        retired.current = true;
        setDenied(true);
        setPage({ tasks: [], nextBeforeTaskId: null });
        setMembers([]);
        await handleAuthenticatedAccessRejection({
          result,
          identity: props.identity,
          companyContextId: scope.companyId,
          isCurrent: () => recoveryScopeLive() && recoveryLive(),
          onActorRevalidated:
            callbacks.current.onActorRevalidated ?? (() => undefined),
          onCompanyContextRejected:
            callbacks.current.onCompanyContextRejected ?? (() => undefined),
          onWorkspaceAccessRejected:
            callbacks.current.onWorkspaceAccessRejected,
        });
        if (!live()) return;
      }
      return result;
    } catch {
      return live() ? { status: 'error' } : undefined;
    }
  };
  async function loadPage(chosen = filter, before?: string) {
    const serial = ++listRequest.current,
      live = capture();
    setPageState('loading');
    const result = await request(
      '/company-internal-tasks?status=' +
        chosen +
        (before ? '&beforeTaskId=' + before : ''),
      { live },
    );
    if (!live() || serial !== listRequest.current || !result) return;
    if (result.status !== 'ok') {
      setPageState(responseState(result, 'unavailable'));
      return;
    }
    try {
      const next = readPage(result.value, scope);
      setPage((current) => ({
        tasks: before ? [...current.tasks, ...next.tasks] : next.tasks,
        nextBeforeTaskId: next.nextBeforeTaskId,
      }));
      setPageState('ready');
    } catch (error) {
      setPageState(formatFailure(error));
    }
  }
  async function loadMembers(after?: string) {
    const serial = ++memberRequest.current,
      live = capture();
    setMemberState('loading');
    const result = await request(
      '/company-internal-tasks/eligible-assignees' +
        (after ? '?afterMembershipId=' + after : ''),
      { live },
    );
    if (!live() || serial !== memberRequest.current || !result) return;
    if (result.status !== 'ok') {
      setMemberState(responseState(result, 'unavailable'));
      return;
    }
    try {
      const next = readMembers(result.value);
      setMembers((current) =>
        after ? [...current, ...next.members] : next.members,
      );
      setNextMember(next.nextAfterMembershipId);
      setMemberState('ready');
    } catch (error) {
      setMemberState(formatFailure(error));
    }
  }
  useEffect(() => {
    void loadPage();
    void loadMembers();
  }, []);
  async function created() {
    await loadPage();
  }
  function openTask(id: string, focusFrom: HTMLElement) {
    setVisited((previous) =>
      previous.includes(id) ? previous : [...previous, id],
    );
    setSelected((previous) => ({
      id,
      generation: (previous?.generation ?? 0) + 1,
      focusFrom,
    }));
  }
  if (denied)
    return (
      <section
        id="internal-tasks"
        tabIndex={-1}
        className="internal-tasks"
        aria-labelledby="internal-tasks-title"
      >
        <h2 id="internal-tasks-title" tabIndex={-1}>
          {copy('title')}
        </h2>
        <p role="alert">{copy('denied')}</p>
      </section>
    );
  return (
    <section
      id="internal-tasks"
      tabIndex={-1}
      className="internal-tasks"
      aria-labelledby="internal-tasks-title"
    >
      <header>
        <h2 id="internal-tasks-title" tabIndex={-1}>
          {copy('title')}
        </h2>
        <p>
          {props.actor.activeCompany?.displayName} · {copy('help')}
        </p>
      </header>
      <TaskEditor
        identity={props.identity}
        scope={scope}
        members={members}
        request={request}
        capture={capture}
        captureRecovery={captureRecovery}
        onConfirmed={created}
      />
      <div className="internal-task-panel">
        <label htmlFor="internal-task-filter">{copy('status')}</label>
        <Select
          id="internal-task-filter"
          value={filter}
          options={[
            'open',
            'all',
            'todo',
            'in_progress',
            'blocked',
            'done',
            'cancelled',
          ].map((value) => ({
            value,
            label: copy(
              value === 'open'
                ? 'open'
                : value === 'all'
                  ? 'all'
                  : status(value),
            ),
          }))}
          onValueChange={(value) => {
            setFilter(value);
            setPage({ tasks: [], nextBeforeTaskId: null });
            void loadPage(value);
          }}
        />
        {pageState !== 'ready' && (
          <p role={pageState === 'loading' ? 'status' : 'alert'}>
            {copy(pageState)}
          </p>
        )}
        {pageState === 'ready' && page.tasks.length === 0 && (
          <p>{copy('empty')}</p>
        )}
        <ul className="internal-task-list">
          {page.tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={(event) => openTask(task.id, event.currentTarget)}
              >
                {task.title}
              </button>
              <span>
                {copy(task.status)} · {copy(task.priority)} ·{' '}
                <TaskDate value={task.dueDate} />
              </span>
            </li>
          ))}
        </ul>
        {page.nextBeforeTaskId && (
          <button
            type="button"
            disabled={pageState === 'loading'}
            onClick={() =>
              void loadPage(filter, page.nextBeforeTaskId ?? undefined)
            }
          >
            {copy('more')}
          </button>
        )}
        <button
          type="button"
          disabled={pageState === 'loading'}
          onClick={() => void loadPage()}
        >
          {copy('reload')}
        </button>
      </div>
      <div className="internal-task-panel">
        <p
          role={
            memberState === 'ready'
              ? 'status'
              : memberState === 'loading'
                ? 'status'
                : 'alert'
          }
        >
          {memberState === 'ready'
            ? members.length
              ? ''
              : copy('noMembers')
            : copy(memberState)}
        </p>
        {nextMember && (
          <button
            type="button"
            disabled={memberState === 'loading'}
            onClick={() => void loadMembers(nextMember ?? undefined)}
          >
            {copy('more')} · {copy('assignee')}
          </button>
        )}
        {memberState !== 'loading' && (
          <button type="button" onClick={() => void loadMembers()}>
            {copy('reload')} · {copy('assignee')}
          </button>
        )}
      </div>
      {visited.map((taskId) => (
        <InternalTaskDetail
          key={taskId}
          taskId={taskId}
          selected={selected?.id === taskId}
          selection={selected?.id === taskId ? selected.generation : 0}
          focusFrom={selected?.id === taskId ? selected.focusFrom : undefined}
          identity={props.identity}
          scope={scope}
          members={members}
          request={request}
          capture={capture}
          captureRecovery={captureRecovery}
          onChanged={loadPage}
        />
      ))}
    </section>
  );
}
