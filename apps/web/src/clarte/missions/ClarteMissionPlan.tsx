import { MissionPlanProjectCopy } from '../../mission-plan/MissionPlanProject';
import { missionPlanAuthority } from '../../mission-plan/mission-plan-authority';
import { pilotTemplateKey } from '../../project/project-template-response';
import { useProjectTemplateCopy } from '../../project/project-template.copy';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useClarteMissionsCopy } from './clarte-missions.copy';
import type { MissionTabContext } from './mission-tabs';

/**
 * The plan copied into the opened Project: a Template plan as a table whose
 * pilot activities open their Task, and a Mission Plan copy through its
 * existing owner. Neither is shown when the Project has none.
 */
export function ClarteMissionPlan(context: MissionTabContext) {
  const copy = useClarteMissionsCopy();
  const templateCopy = useProjectTemplateCopy();
  const read = context.templatePlan;
  const template = read?.kind === 'ready' ? read.template : null;
  const mayBeEmpty =
    read === undefined || (read.kind === 'ready' && read.template === null);
  return (
    <div className="clarte-mission-plan">
      {read !== undefined && read.kind !== 'ready' && (
        <ClarteCard title={templateCopy('plan')}>
          {read.kind === 'loading' && <ClarteLoadingState />}
          {read.kind === 'error' && (
            <ClarteErrorState
              title={templateCopy('planError')}
              action={
                <ClarteButton onClick={context.retryTemplatePlan}>
                  {templateCopy('retry')}
                </ClarteButton>
              }
            />
          )}
          {read.kind === 'denied' && (
            <ClarteErrorState title={templateCopy('denied')} />
          )}
        </ClarteCard>
      )}
      {template && (
        <ClarteCard title={templateCopy('plan')}>
          <p className="clarte-mission-plan-source">
            {copy.planCopied(template.title, template.version)}
          </p>
          <p className="clarte-mission-notice">
            {templateCopy(
              template.templateKey === pilotTemplateKey
                ? 'pilotWarning'
                : 'warning',
            )}
          </p>
          <p className="clarte-mission-plan-help">
            {templateCopy(
              template.templateKey === pilotTemplateKey
                ? 'pilotNotice'
                : 'planNotice',
            )}
          </p>
          <div className="clarte-table-wrap">
            {template.templateKey === pilotTemplateKey ? (
              <table className="clarte-table clarte-mission-table">
                <thead>
                  <tr>
                    <th scope="col">{templateCopy('activity')}</th>
                    <th scope="col">{templateCopy('intendedResult')}</th>
                    <th scope="col">{copy.text('planTask')}</th>
                  </tr>
                </thead>
                <tbody>
                  {template.activities.map((row) => (
                    <tr key={row.taskId}>
                      <td data-label={templateCopy('activity')}>
                        <strong>
                          {row.key} — {row.title}
                        </strong>
                        <small>{row.activity}</small>
                      </td>
                      <td data-label={templateCopy('intendedResult')}>
                        {row.intendedResult}
                      </td>
                      <td data-label={copy.text('planTask')}>
                        <ClarteButton
                          size="small"
                          onClick={() => context.openTask(row.taskId)}
                        >
                          {templateCopy('openTask')} — {row.key}
                        </ClarteButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="clarte-table clarte-mission-table">
                <thead>
                  <tr>
                    <th scope="col">{copy.text('planStage')}</th>
                    <th scope="col">{copy.text('planTask')}</th>
                    <th scope="col">
                      <span className="clarte-visually-hidden">
                        {templateCopy('required')}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {template.stages.flatMap((stage) =>
                    stage.tasks.map((task) => (
                      <tr key={task.taskId}>
                        <td data-label={copy.text('planStage')}>
                          <strong>{stage.title}</strong>
                        </td>
                        <td data-label={copy.text('planTask')}>{task.title}</td>
                        <td>
                          <ClarteBadge>{templateCopy('required')}</ClarteBadge>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            )}
          </div>
        </ClarteCard>
      )}
      {missionPlanAuthority(context.actor, 'copy') !== null && (
        <div className="clarte-mission-plan-copy">
          <MissionPlanProjectCopy
            actor={context.actor}
            identity={context.identity}
            projectId={context.project.id}
            onActorRevalidated={context.onActorRevalidated}
            onCompanyContextRejected={context.onCompanyContextRejected}
            onWorkspaceAccessRejected={context.onWorkspaceAccessRejected}
            onOpenTask={context.openTask}
          />
        </div>
      )}
      {mayBeEmpty && (
        <div className="clarte-mission-plan-empty">
          <ClarteEmptyState title={copy.text('planEmpty')} />
        </div>
      )}
    </div>
  );
}
