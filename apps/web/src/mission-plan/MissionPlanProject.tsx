import { useId, useRef, useState } from 'react';
import { Select } from '../presentation/Select';
import {
  isProject,
  type ClientChoice,
  type ProjectView,
} from '../project/project-directory';
import {
  MissionPlanBoundary,
  MissionPlanCommandStatus,
  type MissionPlanProps,
} from './MissionPlanWorkspace';
import { MissionPlanPicker, PlanReadStatus } from './MissionPlanPicker';
import { MissionPlanContent } from './MissionPlanContent';
import type { PlanAuthority } from './mission-plan-authority';
import { copiedPlan, type PlanVersion } from './mission-plan-response';
import {
  useMissionPlanCommand,
  useMissionPlanRead,
} from './use-mission-plan-io';
import { useMissionPlanCopy } from './mission-plan.copy';
export function MissionPlanProjectCreator(
  props: MissionPlanProps & {
    clients: readonly ClientChoice[] | null;
    onCreated: (v: ProjectView) => void;
  },
) {
  return (
    <MissionPlanBoundary {...props} purpose="create">
      {(authority) => <Creator {...props} authority={authority} />}
    </MissionPlanBoundary>
  );
}
function Creator({
  authority,
  clients,
  onCreated,
  onActivityRecorded,
  ...props
}: MissionPlanProps & {
  authority: PlanAuthority;
  clients: readonly ClientChoice[] | null;
  onCreated: (v: ProjectView) => void;
}) {
  const [selected, setSelected] = useState<PlanVersion | null>(null),
    [title, setTitle] = useState(''),
    [client, setClient] = useState('');
  const c = useMissionPlanCopy(),
    prefix = useId(),
    context = { ...props, authority };
  const command = useMissionPlanCommand<ProjectView>(
    context,
    (project) => {
      onCreated(project);
      void onActivityRecorded?.();
    },
    'created',
  );
  // Choices belong to this authority-keyed creator, not a transient directory read.
  const choices = useRef<readonly ClientChoice[]>(clients ?? []);
  if (clients !== null && !command.blocked) choices.current = clients;
  return (
    <section aria-label={c('createHeading')}>
      <h3>{c('createHeading')}</h3>
      <MissionPlanPicker
        context={context}
        disabled={command.blocked}
        onSelected={setSelected}
      />
      {selected && <MissionPlanContent version={selected} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!selected || !title.trim() || !client || !authority.canCreate)
            return;
          const payload = {
            title: title.trim(),
            clientAccountId: client,
            planId: selected.planId,
            versionId: selected.id,
            versionNumber: selected.versionNumber,
          };
          command.start('/projects/from-mission-plan', payload, (value) => {
            if (
              !isProject(value) ||
              value.companyId !== authority.companyId ||
              value.title !== payload.title ||
              value.clientAccountId !== payload.clientAccountId
            )
              throw new Error('Unexpected Project receipt.');
            return value;
          });
        }}
      >
        <fieldset disabled={command.blocked || !authority.canCreate}>
          <legend>{c('createHeading')}</legend>
          <label htmlFor={prefix + 'title'}>{c('projectTitle')}</label>
          <input
            id={prefix + 'title'}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label htmlFor={prefix + 'client'}>{c('client')}</label>
          <Select
            id={prefix + 'client'}
            value={client}
            placeholder={c('chooseClient')}
            options={choices.current.map((c) => ({
              value: c.id,
              label: c.displayName,
            }))}
            onValueChange={setClient}
          />
          <button
            type="submit"
            disabled={!selected || !title.trim() || !client}
          >
            {c('create')}
          </button>
        </fieldset>
      </form>
      <MissionPlanCommandStatus command={command} />
    </section>
  );
}
export function MissionPlanProjectCopy(
  props: MissionPlanProps & {
    projectId: string;
    onOpenTask: (id: string) => void;
  },
) {
  return (
    <MissionPlanBoundary {...props} purpose="copy">
      {(authority) => (
        <Copy key={props.projectId} {...props} authority={authority} />
      )}
    </MissionPlanBoundary>
  );
}
function Copy({
  authority,
  projectId,
  onOpenTask,
  ...props
}: MissionPlanProps & {
  authority: PlanAuthority;
  projectId: string;
  onOpenTask: (id: string) => void;
}) {
  const context = { ...props, authority },
    read = useMissionPlanRead(
      context,
      `/projects/${projectId}/mission-plan`,
      (v) => copiedPlan(v, authority, projectId),
    ),
    c = useMissionPlanCopy();
  if (read.state.kind === 'ready' && read.state.value === null) return null;
  return (
    <section aria-label={c('copyHeading')}>
      <h3>{c('copyHeading')}</h3>
      <button type="button" onClick={read.load}>
        {c('refresh')}
      </button>
      <PlanReadStatus state={read.state.kind} />
      {read.state.kind === 'ready' && read.state.value && (
        <MissionPlanContent
          version={read.state.value.version}
          tasks={read.state.value.tasks}
          onOpenTask={onOpenTask}
        />
      )}
    </section>
  );
}
