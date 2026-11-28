import { Pencil, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { formatMessage } from '../../localization/messages';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { MissionPlanContent } from '../../mission-plan/MissionPlanContent';
import { MissionPlanForm } from '../../mission-plan/MissionPlanForm';
import { MissionPlanPicker } from '../../mission-plan/MissionPlanPicker';
import {
  MissionPlanBoundary,
  MissionPlanCommandStatus,
  publishMissionPlan,
  type MissionPlanProps,
} from '../../mission-plan/MissionPlanWorkspace';
import type { PlanAuthority } from '../../mission-plan/mission-plan-authority';
import type { PlanVersion } from '../../mission-plan/mission-plan-response';
import { useMissionPlanCopy } from '../../mission-plan/mission-plan.copy';
import { useMissionPlanCommand } from '../../mission-plan/use-mission-plan-io';
import {
  canUsePilotTemplate,
  projectTemplateAuthority,
} from '../../project/ProjectTemplate';
import {
  canReadProjectTemplateCatalogue,
  PilotTemplateInspector,
  projectTemplateConfigurationAuthority,
  useTemplateConfiguration,
  type ProjectTemplateConfigurationProps,
} from '../../project/ProjectTemplateConfiguration';
import { useProjectTemplateVersionCopy } from '../../project/project-template-version.copy';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import './settings-config.css';

type Props = ProjectTemplateConfigurationProps & MissionPlanProps;

/**
 * Project templates and Mission Plans in the Settings console (EX-141 to
 * EX-144): the template catalogue and its versions, the next version of the
 * illustrative template published from a side panel, and the Mission Plans
 * with their history, a plan or its next version published from a side
 * panel, through the existing transports.
 */
export function ClarteProjectTemplates(props: Props) {
  const { actor, identity } = props;
  return (
    <div className="clarte-config clarte-config--split">
      {canReadProjectTemplateCatalogue(actor) && (
        <TemplateVersions
          key={projectTemplateConfigurationAuthority(actor)}
          {...props}
        />
      )}
      {canUsePilotTemplate(actor) && (
        <div className="clarte-card clarte-config-embedded">
          <PilotTemplateInspector
            key={projectTemplateAuthority(actor)}
            actor={actor}
            identity={identity}
          />
        </div>
      )}
      <MissionPlanBoundary {...props} purpose="configure">
        {(authority) => <MissionPlans {...props} authority={authority} />}
      </MissionPlanBoundary>
    </div>
  );
}

function TemplateVersions(props: ProjectTemplateConfigurationProps) {
  const copy = useProjectTemplateVersionCopy();
  const { formatNumber } = useInterfaceLocale();
  const template = useTemplateConfiguration(props);
  const { read, mutation, canPublish, blocked, unchanged, valid } = template;
  const [publishing, setPublishing] = useState(false);
  // A confirmed publication closes the form.
  const [seen, setSeen] = useState(mutation);
  if (mutation !== seen) {
    setSeen(mutation);
    if (mutation.kind === 'confirmed') setPublishing(false);
  }
  const outcome = (
    <>
      {mutation.kind === 'confirmed' && (
        <p className="clarte-settings-status" role="status">
          {formatMessage(copy('published'), {
            version: formatNumber(mutation.version),
          })}
        </p>
      )}
      {mutation.kind === 'pending' && (
        <p className="clarte-settings-status" role="status">
          {copy('pending')}
        </p>
      )}
      {mutation.kind === 'invalid' && (
        <p className="clarte-settings-alert" role="alert">
          {copy('invalid')}
        </p>
      )}
      {(mutation.kind === 'stale' || mutation.kind === 'keyConflict') && (
        <p className="clarte-settings-alert" role="alert">
          {copy(mutation.kind)}
        </p>
      )}
      {mutation.kind === 'uncertain' && (
        <div className="clarte-settings-alert" role="alert">
          <p>{copy('uncertain')}</p>
          <ClarteButton onClick={() => void template.publish(mutation.command)}>
            {copy('retry')}
          </ClarteButton>
        </div>
      )}
    </>
  );
  const tasks =
    read.kind === 'ready'
      ? read.source.stages.flatMap((stage) => stage.tasks)
      : [];
  return (
    <>
      <ClarteCard
        title={copy('region')}
        actions={
          <>
            {read.kind === 'ready' && (
              <ClarteButton
                variant="quiet"
                size="small"
                disabled={template.protectedCommand}
                onClick={() => void template.load()}
              >
                <RefreshCw aria-hidden="true" />
                {copy('reload')}
              </ClarteButton>
            )}
            {read.kind === 'ready' && canPublish && (
              <ClarteButton
                variant="quiet"
                size="small"
                className="clarte-config-soft"
                onClick={() => setPublishing(true)}
              >
                <Plus aria-hidden="true" />
                {copy('heading')}
              </ClarteButton>
            )}
          </>
        }
      >
        <p className="clarte-settings-hint">{copy('notice')}</p>
        {!publishing && outcome}
        {read.kind === 'loading' && (
          <ClarteLoadingState label={copy('loading')} />
        )}
        {(read.kind === 'error' || read.kind === 'denied') && (
          <ClarteErrorState
            title={copy(read.kind)}
            action={
              <ClarteButton onClick={() => void template.load()}>
                {copy('reload')}
              </ClarteButton>
            }
          />
        )}
        {read.kind === 'ready' && (
          <>
            <p className="clarte-config-literal">
              <strong>{read.source.title}</strong> —{' '}
              {formatMessage(copy('source'), {
                version: formatNumber(read.source.version),
              })}
            </p>
            <ol className="clarte-config-steps">
              {tasks.map((task, index) => (
                <li key={task.key}>
                  <span className="clarte-config-step-dot" aria-hidden="true">
                    {formatNumber(index + 1)}
                  </span>
                  <strong>{task.title}</strong>
                </li>
              ))}
            </ol>
            {!canPublish && (
              <p className="clarte-settings-hint">{copy('readOnly')}</p>
            )}
          </>
        )}
      </ClarteCard>
      {publishing && read.kind === 'ready' && (
        <ClarteSidePanel
          title={copy('heading')}
          description={copy('notice')}
          dismissible={!template.protectedCommand}
          onClose={() => setPublishing(false)}
        >
          <form
            className="clarte-settings-form"
            onSubmit={template.submit}
            aria-label={copy('heading')}
          >
            {outcome}
            {read.drafts.map((title, index) => (
              <ClarteField
                key={index}
                label={formatMessage(copy('field'), {
                  number: formatNumber(index + 1),
                })}
              >
                {(control) => (
                  <input
                    {...control}
                    className="clarte-input"
                    value={title}
                    maxLength={200}
                    disabled={blocked}
                    onChange={(event) =>
                      template.editTitle(index, event.target.value)
                    }
                  />
                )}
              </ClarteField>
            ))}
            <h3>{copy('preview')}</h3>
            <ol className="clarte-config-steps" aria-label={copy('preview')}>
              {read.drafts.map((title, index) => (
                <li key={index}>
                  <span className="clarte-config-step-dot" aria-hidden="true">
                    {formatNumber(index + 1)}
                  </span>
                  <span className="clarte-config-step-label">
                    {title.trim()}
                  </span>
                </li>
              ))}
            </ol>
            {unchanged && (
              <p className="clarte-settings-hint">{copy('unchanged')}</p>
            )}
            {!valid && (
              <p className="clarte-settings-alert" role="alert">
                {copy('invalid')}
              </p>
            )}
            <div className="clarte-settings-actions">
              <ClarteButton
                type="submit"
                variant="primary"
                disabled={blocked || unchanged || !valid}
              >
                {copy('publish')}
              </ClarteButton>
            </div>
          </form>
        </ClarteSidePanel>
      )}
    </>
  );
}

function MissionPlans({
  authority,
  onActivityRecorded,
  ...props
}: MissionPlanProps & { authority: PlanAuthority }) {
  const context = { ...props, authority };
  const c = useMissionPlanCopy();
  const [selected, setSelected] = useState<PlanVersion | null>(null);
  const [editor, setEditor] = useState<{ basis: PlanVersion | null } | null>(
    null,
  );
  const [revision, setRevision] = useState(0);
  const command = useMissionPlanCommand<PlanVersion>(
    context,
    (version) => {
      setSelected(version);
      setEditor(null);
      setRevision((n) => n + 1);
      void onActivityRecorded?.();
    },
    'saved',
  );
  return (
    <>
      <ClarteCard
        title={c('heading')}
        actions={
          authority.canPublish && (
            <>
              <ClarteButton
                variant="quiet"
                size="small"
                className="clarte-config-soft"
                disabled={command.blocked}
                onClick={() => setEditor({ basis: null })}
              >
                <Plus aria-hidden="true" />
                {c('new')}
              </ClarteButton>
              {selected && (
                <ClarteButton
                  size="small"
                  disabled={command.blocked}
                  onClick={() => setEditor({ basis: selected })}
                >
                  <Pencil aria-hidden="true" />
                  {c('edit')}
                </ClarteButton>
              )}
            </>
          )
        }
      >
        <p className="clarte-settings-hint">{c('help')}</p>
        {!editor && <MissionPlanCommandStatus command={command} />}
        <div className="clarte-config-embedded clarte-config-plans">
          <MissionPlanPicker
            key={revision}
            context={context}
            disabled={command.blocked}
            onSelected={(version) => {
              setSelected(version);
              setEditor(null);
            }}
          />
        </div>
        {selected && (
          <div className="clarte-config-embedded clarte-config-plan">
            <MissionPlanContent version={selected} />
          </div>
        )}
      </ClarteCard>
      {editor && (
        <ClarteSidePanel
          title={editor.basis ? c('edit') : c('new')}
          description={editor.basis?.title}
          dismissible={!command.blocked}
          onClose={() => setEditor(null)}
        >
          <div className="clarte-config-plan-form">
            <MissionPlanCommandStatus command={command} />
            <MissionPlanForm
              key={editor.basis?.id ?? 'new'}
              initial={editor.basis}
              disabled={command.blocked}
              onCancel={() => setEditor(null)}
              onPublish={(content) =>
                publishMissionPlan({
                  command,
                  authority,
                  basis: editor.basis,
                  content,
                })
              }
            />
          </div>
        </ClarteSidePanel>
      )}
    </>
  );
}
