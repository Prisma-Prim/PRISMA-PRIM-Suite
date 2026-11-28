import { ArrowUpRight, ListChecks, Plus, RotateCw } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { TaskPlanning } from '../../project/TaskPlanning';
import {
  TaskCalendarDate,
  TaskDeclarationFacts,
  TaskFieldsForm,
  TaskHistory,
  TaskReasonForm,
  formatTime,
} from '../../project/TaskPresentation';
import { TaskResults } from '../../project/TaskResults';
import { useProjectTaskCopy } from '../../project/task.copy';
import { isOpenTaskState, taskMoves } from '../../project/task-response';
import {
  projectTaskOwnerAuthority,
  useProjectTaskOwner,
  type ProjectTaskOwner,
} from '../../project/use-project-task-owner';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { clarteTaskStateTone, type OpenTaskInProject } from './ClarteTaskRow';
import { useClarteTasksCopy } from './clarte-tasks.copy';

/** The Task a view row opened, with the labels its read returned. */
export type ClarteTaskPanelTarget = Readonly<{
  projectId: string;
  taskId: string;
  title: string;
  projectTitle: string;
  clientDisplayName: string;
}>;

type Props = Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  target: ClarteTaskPanelTarget;
  onClose: () => void;
  onOpenTask?: OpenTaskInProject;
  /** After a confirmed Task command or grouped planning. */
  onActivityRecorded?: () => void | Promise<void>;
  /** After any change the view's list should show again. */
  onTasksChanged: () => void;
}>;

/**
 * The side panel of one Task (#1542). It mounts the Project's Task owner the
 * current interface uses in the Project, opened on this Task: the same
 * reads, drafts, commands, exact retries, access recovery, results and
 * grouped planning. Any authority change remounts it.
 */
export function ClarteTaskPanel(props: Props) {
  return (
    <TaskPanelOwner
      key={JSON.stringify([
        projectTaskOwnerAuthority(props.actor),
        props.target.projectId,
        props.target.taskId,
      ])}
      {...props}
    />
  );
}

function TaskPanelOwner({
  actor,
  identity,
  target,
  onClose,
  onOpenTask,
  onActivityRecorded,
  onTasksChanged,
}: Props) {
  const copy = useProjectTaskCopy();
  const text = useClarteTasksCopy();
  // One requested open per mounted panel; the owner consumes it once.
  const [requestedTask] = useState({ taskId: target.taskId, requestId: 1 });
  const [creating, setCreating] = useState(false);
  // The Task a create form returns to.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  // Whether the result owner holds a pending or uncertain command.
  const [resultHeld, setResultHeld] = useState(false);
  const owner = useProjectTaskOwner({
    active: true,
    actor,
    identity,
    projectId: target.projectId,
    projectStatus: null,
    requestedTask,
    onActivityRecorded: async () => {
      onTasksChanged();
      await onActivityRecorded?.();
    },
  });
  const { current, load, detail, mutation } = owner;
  const showCreate = creating && owner.selected === null;
  const id = useId();
  const [part, setPart] = useState<PanelPart>('task');
  // An open Task shows its parts as tabs, which stay mounted while the Task
  // is read again after a command, as the current interface keeps them; a
  // create form or a refusal shows only its state and the Project part.
  const tabbed =
    !showCreate &&
    owner.selected !== null &&
    load.kind !== 'denied' &&
    detail?.kind !== 'missing';
  const tab = (name: PanelPart) =>
    tabbed ? { selected: part === name, tabId: `${id}-${name}-tab` } : null;
  const title = showCreate
    ? text('newTaskTitle')
    : (current?.task.title ?? target.title);
  // The panel owns its commands: it stays open, and keeps the Task it shows,
  // while a Task command, a result command or the grouped planning is
  // pending or uncertain, so each exact retry is kept.
  const settled =
    mutation.kind !== 'pending' &&
    mutation.kind !== 'uncertain' &&
    !owner.planningProtected &&
    !resultHeld;
  return (
    <ClarteSidePanel
      title={title}
      description={`${target.projectTitle} · ${target.clientDisplayName}`}
      icon={<ListChecks />}
      dismissible={settled}
      onClose={onClose}
    >
      <div className="clarte-task-panel">
        {tabbed && (
          <PartTabs
            id={id}
            label={text('panelParts')}
            part={part}
            onPart={setPart}
          />
        )}
        {owner.feedback && (
          <p className="clarte-task-feedback" role="status">
            {copy[owner.feedback]}
          </p>
        )}
        {mutation.kind === 'uncertain' && (
          <ClarteButton onClick={() => void owner.run(mutation.command)}>
            {copy.retry}
          </ClarteButton>
        )}
        {load.kind === 'denied' && <ClarteErrorState title={copy.denied} />}
        {load.kind === 'error' && detail === null && (
          <ClarteErrorState title={copy.error} />
        )}
        {detail?.kind === 'loading' && (
          <ClarteLoadingState label={copy.loading} />
        )}
        {detail?.kind === 'error' && <ClarteErrorState title={copy.error} />}
        {detail?.kind === 'missing' && (
          <ClarteErrorState title={copy.missing} />
        )}
        {showCreate && (
          <CreateTask
            owner={owner}
            onBack={() => {
              setCreating(false);
              void owner.open(returnTo ?? target.taskId);
            }}
          />
        )}
        {tabbed && owner.selected !== null && (
          <>
            <TaskPart
              id={`${id}-task`}
              title={text('taskPart')}
              tab={tab('task')}
            >
              <TaskFacts owner={owner} />
              <TaskCommands owner={owner} />
            </TaskPart>
            <TaskPart
              id={`${id}-result`}
              title={text('resultPart')}
              tab={tab('result')}
            >
              <TaskResults
                active
                actor={actor}
                identity={identity}
                taskId={owner.selected}
                projectId={target.projectId}
                observedProjectStatus={null}
                observedTaskVersion={current?.task.version}
                onProtectionChange={setResultHeld}
              />
            </TaskPart>
            <TaskPart
              id={`${id}-history`}
              title={text('historyPart')}
              tab={tab('history')}
            >
              {current && <TaskHistory events={current.events} />}
            </TaskPart>
          </>
        )}
        <TaskPart
          id={`${id}-project`}
          title={text('projectPart')}
          tab={tab('project')}
        >
          <p className="clarte-task-project-name">
            {target.projectTitle} · {target.clientDisplayName}
          </p>
          <div className="clarte-task-actions">
            {onOpenTask && (
              <ClarteButton
                disabled={!settled}
                onClick={() => {
                  const open = {
                    projectId: target.projectId,
                    taskId: owner.selected ?? target.taskId,
                  };
                  onClose();
                  onOpenTask(open);
                }}
              >
                <ArrowUpRight aria-hidden="true" />
                {text('openInProject')}
              </ClarteButton>
            )}
            {owner.canManage &&
              owner.mutable &&
              load.kind === 'ready' &&
              !showCreate && (
                <ClarteButton
                  disabled={owner.busy || resultHeld}
                  onClick={() => {
                    setReturnTo(owner.selected);
                    setCreating(true);
                    void owner.open(null);
                  }}
                >
                  <Plus aria-hidden="true" />
                  {text('newTaskInProject')}
                </ClarteButton>
              )}
            <ClarteButton
              variant="quiet"
              disabled={owner.busy}
              onClick={() => void owner.open(owner.selected, { reload: true })}
            >
              <RotateCw aria-hidden="true" />
              {owner.selected ? copy.reloadDetail : copy.reload}
            </ClarteButton>
          </div>
          {owner.canManage && load.kind !== 'denied' && (
            <div className="clarte-task-planning">
              <p>{text('planningLead')}</p>
              <TaskPlanning
                active
                captureRecovery={owner.captureActiveRecovery}
                disabled={
                  mutation.kind === 'pending' || mutation.kind === 'uncertain'
                }
                projectClosed={owner.projectClosed}
                taskReads={owner.taskReads}
                nativeReadOnly={owner.readOnlyRevision === 0}
                onProtectionChange={owner.setPlanningProtected}
                onDenied={owner.deny}
                onReloaded={async (mode) => {
                  onTasksChanged();
                  if (mode !== 'confirmed')
                    await owner.refreshNativeAfterPlanning();
                }}
                onConfirmed={async () => {
                  onTasksChanged();
                  await Promise.all([
                    owner.refreshNativeAfterPlanning(),
                    onActivityRecorded?.(),
                  ]);
                }}
              />
            </div>
          )}
        </TaskPart>
      </div>
    </ClarteSidePanel>
  );
}

type PanelPart = 'task' | 'result' | 'history' | 'project';
const panelParts: readonly PanelPart[] = [
  'task',
  'result',
  'history',
  'project',
];
const partLabel = {
  task: 'taskPart',
  result: 'resultPart',
  history: 'historyPart',
  project: 'projectPart',
} as const satisfies Record<PanelPart, string>;

/** The parts of an open Task as tabs; arrow keys, Home and End move between them. */
function PartTabs({
  id,
  label,
  part,
  onPart,
}: Readonly<{
  id: string;
  label: string;
  part: PanelPart;
  onPart: (part: PanelPart) => void;
}>) {
  const text = useClarteTasksCopy();
  function move(event: KeyboardEvent<HTMLDivElement>) {
    const index = panelParts.indexOf(part);
    const next =
      event.key === 'ArrowRight'
        ? panelParts[(index + 1) % panelParts.length]
        : event.key === 'ArrowLeft'
          ? panelParts[(index + panelParts.length - 1) % panelParts.length]
          : event.key === 'Home'
            ? panelParts[0]
            : event.key === 'End'
              ? panelParts[panelParts.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    onPart(next);
    document.getElementById(`${id}-${next}-tab`)?.focus();
  }
  return (
    <div
      className="clarte-task-parts"
      role="tablist"
      aria-label={label}
      onKeyDown={move}
    >
      {panelParts.map((name) => (
        <button
          key={name}
          type="button"
          role="tab"
          id={`${id}-${name}-tab`}
          aria-selected={part === name}
          aria-controls={`${id}-${name}`}
          tabIndex={part === name ? 0 : -1}
          onClick={() => onPart(name)}
        >
          {text(partLabel[name])}
        </button>
      ))}
    </div>
  );
}

/**
 * One part of the panel: a tab panel of an open Task, or a titled section
 * beside a create form, a refusal or a failed read.
 */
function TaskPart({
  id,
  title,
  tab,
  children,
}: Readonly<{
  id: string;
  title: string;
  tab: { selected: boolean; tabId: string } | null;
  children: ReactNode;
}>) {
  const headingId = `${id}-title`;
  // One structure in both modes, so a part's owners stay mounted when the
  // tabs appear or step aside.
  return (
    <section
      id={id}
      className="clarte-task-part"
      role={tab ? 'tabpanel' : undefined}
      aria-labelledby={tab ? tab.tabId : headingId}
      hidden={tab ? !tab.selected : undefined}
    >
      <h3 id={headingId} className={tab ? 'clarte-visually-hidden' : undefined}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function TaskFacts({ owner }: Readonly<{ owner: ProjectTaskOwner }>) {
  const copy = useProjectTaskCopy();
  const { locale } = useInterfaceLocale();
  const current = owner.current;
  if (!current) return null;
  const { task } = current;
  return (
    <>
      <dl className="clarte-task-panel-facts">
        <div>
          <dt>{copy.assignee}</dt>
          <dd>{task.assignee?.displayLabel ?? copy.unassigned}</dd>
        </div>
        <div>
          <dt>{copy.dueDate}</dt>
          <dd>
            <TaskCalendarDate value={task.dueDate} />
          </dd>
        </div>
        <div>
          <dt>{copy.status}</dt>
          <dd>
            <ClarteBadge tone={clarteTaskStateTone[task.status]}>
              {copy.states[task.status]}
            </ClarteBadge>
          </dd>
        </div>
        <div>
          <dt>{copy.priority}</dt>
          <dd>{copy.priorities[task.priority]}</dd>
        </div>
        <div>
          <dt>{copy.createdBy}</dt>
          <dd>{task.createdBy.displayName}</dd>
        </div>
      </dl>
      <InstructionsCard text={task.description ?? copy.noDescription} />
      {task.status === 'done' && (
        <p>
          {copy.completion} {task.completion.actor.displayName} {copy.at}{' '}
          <time dateTime={task.completion.occurredAt}>
            {formatTime(task.completion.occurredAt, locale)}
          </time>
        </p>
      )}
      {task.status === 'blocked' && (
        <div className="clarte-task-declaration">
          <TaskDeclarationFacts kind="blocked" declaration={task.blockage} />
        </div>
      )}
      {task.status === 'cancelled' && (
        <div className="clarte-task-declaration">
          <TaskDeclarationFacts
            kind="cancelled"
            declaration={task.cancellation}
          />
        </div>
      )}
      {!owner.mutable && (
        <p className="clarte-task-notice">
          {owner.projectClosed ? copy.closedReadOnly : copy.immutable}
        </p>
      )}
    </>
  );
}

/** The Task's recorded instructions, in their own card. */
function InstructionsCard({ text }: Readonly<{ text: string }>) {
  const copy = useProjectTaskCopy();
  const headingId = useId();
  return (
    <section
      className="clarte-task-instructions-card"
      aria-labelledby={headingId}
    >
      <h4 id={headingId}>{copy.description}</h4>
      <p className="clarte-task-instructions">{text}</p>
    </section>
  );
}

/** State moves, the required reason, and the edit form of an open Task. */
function TaskCommands({ owner }: Readonly<{ owner: ProjectTaskOwner }>) {
  const copy = useProjectTaskCopy();
  const text = useClarteTasksCopy();
  const [editing, setEditing] = useState(false);
  const current = owner.current;
  if (!current || !owner.canManage || !owner.mutable) return null;
  const { task } = current;
  return (
    <>
      {owner.reasonDraft ? (
        <div className="clarte-task-form">
          <TaskReasonForm
            draft={owner.reasonDraft}
            onChange={(next) =>
              owner.setReasonDraft((previous) =>
                previous ? { ...previous, ...next } : null,
              )
            }
            onSubmit={owner.declare}
            onDismiss={() => owner.setReasonDraft(null)}
          />
        </div>
      ) : (
        <div
          className="clarte-task-actions"
          role="group"
          aria-label={copy.actions}
        >
          {taskMoves(task.status).map((move) => (
            <ClarteButton
              key={move}
              variant={move === 'done' ? 'primary' : 'secondary'}
              size="small"
              disabled={
                owner.mutation.kind !== 'idle' || owner.planningProtected
              }
              onClick={() => owner.choose(task, move)}
            >
              {copy.moves[move]}
            </ClarteButton>
          ))}
        </div>
      )}
      {isOpenTaskState(task.status) && (
        <>
          <ClarteButton
            variant="quiet"
            size="small"
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? text('closeEdit') : text('editTask')}
          </ClarteButton>
          {editing && (
            <div className="clarte-task-form">
              <TaskFieldsForm
                draft={owner.draft}
                descriptionInvalid={owner.feedback === 'descriptionValidation'}
                members={owner.members}
                current={task}
                disabled={!owner.editable}
                editing
                onChange={owner.updateDraft}
                onSubmit={owner.save}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}

function CreateTask({
  owner,
  onBack,
}: Readonly<{ owner: ProjectTaskOwner; onBack: () => void }>) {
  const text = useClarteTasksCopy();
  return (
    <section className="clarte-task-part" aria-label={text('newTaskTitle')}>
      {owner.canManage && owner.mutable && (
        <div className="clarte-task-form">
          <TaskFieldsForm
            draft={owner.draft}
            descriptionInvalid={owner.feedback === 'descriptionValidation'}
            members={owner.members}
            current={null}
            disabled={!owner.editable}
            editing={false}
            onChange={owner.updateDraft}
            onSubmit={owner.save}
          />
        </div>
      )}
      <ClarteButton
        variant="quiet"
        size="small"
        disabled={owner.busy}
        onClick={onBack}
      >
        {text('backToTask')}
      </ClarteButton>
    </section>
  );
}
