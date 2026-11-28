import { Building2, Plus, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { InternalTaskDetail } from '../../internal-task/InternalTaskDetail';
import { TaskEditor } from '../../internal-task/InternalTaskEditor';
import {
  internalTaskFilters,
  useInternalTaskWorkspace,
  type InternalTaskProps,
  type InternalTaskWorkspaceOwner,
} from '../../internal-task/InternalTaskWorkspace';
import { useInternalTaskCopy } from '../../internal-task/internal-task.copy';
import type { Task } from '../../internal-task/internal-task-response';
import { Select } from '../../presentation/Select';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import {
  ClarteDueDate,
  ClarteTaskMark,
  clarteTaskStateTone,
} from './ClarteTaskRow';
import { useClarteTasksCopy } from './clarte-tasks.copy';
import './clarte-tasks.css';

/**
 * Tasks › Internal Tasks (#1542): the Company's work without a Project or
 * Client, filtered by state; one side panel creates an internal Task and
 * one shows a Task with its edit, state change and history. The internal
 * Task owner keeps every read, command, exact retry and access recovery.
 */
export function ClarteInternalTasks(props: InternalTaskProps) {
  const copy = useInternalTaskCopy();
  const owner = useInternalTaskWorkspace(props);
  const [creating, setCreating] = useState(false);
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null);
  if (owner.denied)
    return (
      <section
        id="internal-tasks"
        tabIndex={-1}
        className="clarte-tasks"
        aria-label={copy('title')}
      >
        <ClarteErrorState title={copy('denied')} />
      </section>
    );
  const { page, pageState } = owner;
  const panelTask = page.tasks.find((task) => task.id === panelTaskId);
  return (
    <section
      id="internal-tasks"
      tabIndex={-1}
      className="clarte-tasks"
      aria-label={copy('title')}
    >
      <div className="clarte-tasks-toolbar">
        <div className="clarte-tasks-toolbar-actions">
          <ClarteField label={copy('status')}>
            {(control) => (
              <Select
                id={control.id}
                value={owner.filter}
                options={internalTaskFilters.map((value) => ({
                  value,
                  label: copy(value),
                }))}
                onValueChange={owner.chooseFilter}
              />
            )}
          </ClarteField>
          <ClarteButton
            disabled={pageState === 'loading'}
            onClick={() => void owner.loadPage()}
          >
            <RotateCw aria-hidden="true" />
            {copy('reload')}
          </ClarteButton>
          <ClarteButton variant="primary" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            {copy('create')}
          </ClarteButton>
        </div>
      </div>
      {pageState === 'loading' && (
        <ClarteLoadingState label={copy('loading')} />
      )}
      {pageState !== 'ready' && pageState !== 'loading' && (
        <ClarteErrorState title={copy(pageState)} />
      )}
      {pageState === 'ready' && page.tasks.length === 0 && (
        <div className="clarte-card">
          <ClarteEmptyState title={copy('empty')} />
        </div>
      )}
      {page.tasks.length > 0 && (
        <div className="clarte-card clarte-task-card">
          <ol className="clarte-task-list" aria-label={copy('title')}>
            {page.tasks.map((task) => (
              <InternalTaskRow
                key={task.id}
                task={task}
                onOpen={(opener) => {
                  setPanelTaskId(task.id);
                  owner.openTask(task.id, opener);
                }}
              />
            ))}
          </ol>
        </div>
      )}
      {page.nextBeforeTaskId && (
        <div className="clarte-tasks-pagination">
          <ClarteButton
            size="small"
            disabled={pageState === 'loading'}
            onClick={() =>
              void owner.loadPage(
                owner.filter,
                page.nextBeforeTaskId ?? undefined,
              )
            }
          >
            {copy('more')}
          </ClarteButton>
        </div>
      )}
      {creating && (
        <ClarteSidePanel
          title={copy('create')}
          description={copy('help')}
          icon={<Building2 />}
          onClose={() => setCreating(false)}
        >
          <div className="clarte-task-panel clarte-internal-task-panel">
            <Assignees owner={owner} />
            <TaskEditor
              identity={props.identity}
              scope={owner.scope}
              members={owner.members}
              request={owner.request}
              capture={owner.capture}
              captureRecovery={owner.captureRecovery}
              onConfirmed={owner.created}
            />
          </div>
        </ClarteSidePanel>
      )}
      {panelTaskId && owner.selected?.id === panelTaskId && (
        <ClarteSidePanel
          title={panelTask?.title ?? copy('title')}
          description={copy('help')}
          icon={<Building2 />}
          onClose={() => setPanelTaskId(null)}
        >
          <div className="clarte-task-panel clarte-internal-task-panel">
            <Assignees owner={owner} />
            <InternalTaskDetail
              key={panelTaskId}
              taskId={panelTaskId}
              selected
              selection={owner.selected.generation}
              focusFrom={owner.selected.focusFrom}
              identity={props.identity}
              scope={owner.scope}
              members={owner.members}
              request={owner.request}
              capture={owner.capture}
              captureRecovery={owner.captureRecovery}
              onChanged={owner.loadPage}
            />
          </div>
        </ClarteSidePanel>
      )}
    </section>
  );
}

function InternalTaskRow({
  task,
  onOpen,
}: Readonly<{ task: Task; onOpen: (opener: HTMLElement) => void }>) {
  const copy = useInternalTaskCopy();
  return (
    <li className="clarte-task-row" data-state={task.status}>
      <ClarteTaskMark state={task.status} />
      <div className="clarte-task-main">
        <h3 className="clarte-task-title">
          <button
            type="button"
            onClick={(event) => onOpen(event.currentTarget)}
          >
            {task.title}
          </button>
        </h3>
        <p className="clarte-task-meta">
          <span>{task.assignee?.displayLabel ?? copy('unassigned')}</span>
          {task.priority !== 'normal' && (
            <span className="clarte-task-priority">{copy(task.priority)}</span>
          )}
        </p>
        {task.reason && (
          <p className="clarte-task-reason">
            {copy('reason')}: {task.reason.text}
          </p>
        )}
      </div>
      <div className="clarte-task-side">
        <dl className="clarte-task-facts">
          <div>
            <dt>{copy('date')}</dt>
            <dd>
              <ClarteDueDate value={task.dueDate} />
            </dd>
          </div>
          <div>
            <dt>{copy('status')}</dt>
            <dd>
              <ClarteBadge tone={clarteTaskStateTone[task.status]}>
                {copy(task.status)}
              </ClarteBadge>
            </dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

/** The eligible assignees the editor offers, with their read state and paging. */
function Assignees({ owner }: Readonly<{ owner: InternalTaskWorkspaceOwner }>) {
  const copy = useInternalTaskCopy();
  const text = useClarteTasksCopy();
  const { memberState, members, nextMember } = owner;
  const notice =
    memberState === 'ready'
      ? members.length
        ? null
        : copy('noMembers')
      : copy(memberState);
  return (
    <div
      className="clarte-internal-assignees"
      aria-label={text('assigneesHeading')}
      role="group"
    >
      {notice && (
        <p
          role={
            memberState === 'loading' || memberState === 'ready'
              ? 'status'
              : 'alert'
          }
        >
          {notice}
        </p>
      )}
      <div className="clarte-task-actions">
        {nextMember && (
          <ClarteButton
            size="small"
            disabled={memberState === 'loading'}
            onClick={() => void owner.loadMembers(nextMember)}
          >
            {copy('more')} · {copy('assignee')}
          </ClarteButton>
        )}
        {memberState !== 'loading' && (
          <ClarteButton
            size="small"
            variant="quiet"
            onClick={() => void owner.loadMembers()}
          >
            {copy('reload')} · {copy('assignee')}
          </ClarteButton>
        )}
      </div>
    </div>
  );
}
