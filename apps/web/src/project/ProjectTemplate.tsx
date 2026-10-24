import { useEffect, useId, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { Select } from '../presentation/Select';
import { useProjectTemplateCopy } from './project-template.copy';
import { useProjectTemplateVersionCopy } from './project-template-version.copy';
import {
  pilotTemplateKey,
  legacyTemplateKey,
  readCopiedTemplatePlan,
  readTemplateCatalogue,
  readTemplateCataloguePage,
  type CopiedTemplatePlan,
  type SelectableTemplateVersion,
  type TemplateSelection,
  type PilotActivity,
} from './project-template-response';

type Props = { actor: ActorContext; identity: BrowserIdentity };
export function canUseProjectTemplate(actor: ActorContext) {
  const company = actor.activeCompany;
  return (
    company?.projectTemplatePermissionAssignmentId !== undefined &&
    (company.projectTemplatePermissionSetVersion === 'v1' ||
      company.projectTemplatePermissionSetVersion === 'v2') &&
    company.projectTemplatePermissions?.includes('project.template.read') ===
      true
  );
}
export function canUsePilotTemplate(actor: ActorContext) {
  return (
    canUseProjectTemplate(actor) &&
    actor.activeCompany?.projectTemplatePermissionSetVersion === 'v2' &&
    actor.activeCompany.projectTemplatePermissions?.includes(
      'project.template.pilot.read',
    ) === true
  );
}
function canInstantiatePilotTemplate(actor: ActorContext) {
  return (
    canUsePilotTemplate(actor) &&
    actor.activeCompany?.projectTemplatePermissions?.includes(
      'project.template.pilot.instantiate',
    ) === true
  );
}
export function canInstantiateProjectTemplate(actor: ActorContext) {
  return (
    canUseProjectTemplate(actor) &&
    actor.activeCompany?.projectTemplatePermissions?.includes(
      'project.template.instantiate',
    ) === true &&
    actor.activeCompany.projectPermissions?.includes('project.create') ===
      true &&
    actor.activeCompany.taskPermissions?.includes('task.manage') === true &&
    actor.activeCompany.taskPermissions.includes('task.read')
  );
}

export function ProjectTemplateSelector({
  actor,
  identity,
  selection,
  onSelection,
  disabled,
  catalogueRevision = 0,
  purpose = 'creation',
}: Props & {
  selection: TemplateSelection | null;
  onSelection: (selection: TemplateSelection | null) => void;
  disabled: boolean;
  catalogueRevision?: number;
  purpose?: 'creation' | 'inspection';
}) {
  const copy = useProjectTemplateCopy();
  const versionCopy = useProjectTemplateVersionCopy();
  const controlId = useId();
  const [generation, setGeneration] = useState(0);
  const [page, setPage] = useState<{
    revision: number;
    beforeVersion: number | undefined;
  }>({ revision: catalogueRevision, beforeVersion: undefined });
  const beforeVersion =
    page.revision === catalogueRevision ? page.beforeVersion : undefined;
  const priorTemplates = useRef<SelectableTemplateVersion[]>([]);
  const latestSelection = useRef(selection);
  latestSelection.current = selection;
  const [load, setLoad] = useState<
    | { kind: 'loading' | 'error' | 'denied' }
    | {
        kind: 'ready';
        templates: SelectableTemplateVersion[];
        nextBeforeVersion: number | null;
        revision: number;
      }
  >({ kind: 'loading' });
  const companyId = actor.activeCompany?.id;
  const includePilot =
    purpose === 'inspection'
      ? canUsePilotTemplate(actor)
      : canInstantiatePilotTemplate(actor);
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        const response = await api.request<unknown>(
          beforeVersion === undefined
            ? '/project-templates'
            : `/project-templates?beforeVersion=${beforeVersion}`,
          {
            companyContextId: companyId,
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted) return;
        if (response.status === 'unauthorized') {
          await identity.rejectSession();
          return;
        }
        if (response.status === 'forbidden') {
          setLoad({ kind: 'denied' });
          return;
        }
        const value = response.status === 'ok' ? response.value : undefined;
        const metadataPresent =
          value !== null &&
          typeof value === 'object' &&
          ('headVersion' in value || 'nextBeforeVersion' in value);
        const catalogue = metadataPresent
          ? readTemplateCataloguePage(value)
          : undefined;
        const templates = metadataPresent
          ? catalogue?.templates
          : readTemplateCatalogue(value);
        if (
          !templates ||
          templates.some((source) => source.templateKey !== legacyTemplateKey)
        ) {
          setLoad({ kind: 'error' });
          return;
        }
        if (includePilot) {
          const pilot = await api.request<unknown>(
            `/project-templates?templateKey=${pilotTemplateKey}`,
            { companyContextId: companyId, signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          if (pilot.status === 'unauthorized') {
            await identity.rejectSession();
            return;
          }
          if (pilot.status === 'forbidden') {
            setLoad({ kind: 'denied' });
            return;
          }
          const page =
            pilot.status === 'ok'
              ? readTemplateCataloguePage(pilot.value)
              : undefined;
          if (
            !page ||
            page.templates.some(
              (source) => source.templateKey !== pilotTemplateKey,
            )
          ) {
            setLoad({ kind: 'error' });
            return;
          }
          templates.push(...page.templates);
        }
        const selected = latestSelection.current;
        const captured = selected
          ? priorTemplates.current.find(
              (template) =>
                template.templateKey === selected.templateKey &&
                template.version === selected.version,
            )
          : undefined;
        const selectable =
          captured &&
          !templates.some(
            (template) =>
              template.templateKey === captured.templateKey &&
              template.version === captured.version,
          )
            ? [...templates, captured]
            : templates;
        priorTemplates.current = selectable;
        setLoad({
          kind: 'ready',
          templates: selectable,
          nextBeforeVersion: catalogue?.nextBeforeVersion ?? null,
          revision: catalogueRevision,
        });
      } catch {
        if (!controller.signal.aborted) setLoad({ kind: 'error' });
      }
    })();
    return () => controller.abort();
  }, [
    companyId,
    identity,
    generation,
    catalogueRevision,
    beforeVersion,
    includePilot,
  ]);
  if (load.kind !== 'ready' || load.revision !== catalogueRevision)
    return (
      <div className="project-template-choice">
        <p
          role={
            load.kind === 'loading' || load.kind === 'ready'
              ? 'status'
              : 'alert'
          }
        >
          {copy(load.kind === 'ready' ? 'loading' : load.kind)}
        </p>
        {load.kind === 'error' && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setGeneration((value) => value + 1)}
          >
            {copy('retry')}
          </button>
        )}
      </div>
    );
  const token = (value: TemplateSelection) =>
    `${value.templateKey}:${value.version}`;
  return (
    <div className="project-template-choice">
      <label htmlFor={controlId}>{copy('choose')}</label>
      <Select
        id={controlId}
        value={selection ? token(selection) : ''}
        disabled={disabled}
        options={[
          {
            value: '',
            label: copy(purpose === 'inspection' ? 'chooseSource' : 'manual'),
          },
          ...load.templates.map((template) => ({
            value: token(template),
            label: `${template.title} — ${copy('sourceVersion')} ${template.version}`,
          })),
        ]}
        onValueChange={(value) => {
          const template = load.templates.find(
            (candidate) => token(candidate) === value,
          );
          onSelection(
            template
              ? template.templateKey === pilotTemplateKey
                ? { templateKey: pilotTemplateKey, version: 1 }
                : { templateKey: legacyTemplateKey, version: template.version }
              : null,
          );
        }}
      />
      {load.templates
        .filter(
          (source) =>
            source.templateKey === selection?.templateKey &&
            source.version === selection.version,
        )
        .map((source) =>
          source.templateKey === pilotTemplateKey ? (
            <section
              key={source.templateKey}
              aria-label={copy('sourcePreview')}
            >
              <h4>{copy('sourcePreview')}</h4>
              <p>
                {source.title} — {copy('sourceVersion')} {source.version}
              </p>
              <ol>
                {source.activities.map((row) => (
                  <li key={row.key}>
                    <PilotActivityContent row={row} />
                  </li>
                ))}
              </ol>
              <p>{copy('pilotNotice')}</p>
            </section>
          ) : null,
        )}
      {load.templates.length === 0 && <p>{copy('empty')}</p>}
      {selection && (
        <p className="project-warning">
          {copy(
            selection.templateKey === pilotTemplateKey
              ? 'pilotWarning'
              : 'warning',
          )}
        </p>
      )}
      {beforeVersion !== undefined && (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            setPage({ revision: catalogueRevision, beforeVersion: undefined })
          }
        >
          {versionCopy('latest')}
        </button>
      )}
      {load.nextBeforeVersion !== null && (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            setPage({
              revision: catalogueRevision,
              beforeVersion: load.nextBeforeVersion ?? undefined,
            })
          }
        >
          {versionCopy('more')}
        </button>
      )}
    </div>
  );
}

export function ProjectTemplatePlan({
  actor,
  identity,
  projectId,
  onOpenTask,
}: Props & { projectId: string; onOpenTask?: (taskId: string) => void }) {
  const copy = useProjectTemplateCopy();
  const [generation, setGeneration] = useState(0);
  const [load, setLoad] = useState<
    | { kind: 'loading' | 'error' | 'denied' }
    | { kind: 'ready'; template: CopiedTemplatePlan | null }
  >({ kind: 'loading' });
  const companyId = actor.activeCompany?.id;
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        const response = await api.request<unknown>(
          `/projects/${projectId}/template`,
          { companyContextId: companyId, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (response.status === 'unauthorized') {
          await identity.rejectSession();
          return;
        }
        if (response.status === 'forbidden') {
          setLoad({ kind: 'denied' });
          return;
        }
        const plan =
          response.status === 'ok'
            ? readCopiedTemplatePlan(response.value)
            : undefined;
        setLoad(
          plan ? { kind: 'ready', template: plan.template } : { kind: 'error' },
        );
      } catch {
        if (!controller.signal.aborted) setLoad({ kind: 'error' });
      }
    })();
    return () => controller.abort();
  }, [companyId, identity, projectId, generation]);
  if (load.kind === 'ready' && load.template === null) return null;
  return (
    <section className="project-template-plan" aria-label={copy('plan')}>
      <h4>{copy('plan')}</h4>
      {load.kind !== 'ready' ? (
        <>
          <p role={load.kind === 'loading' ? 'status' : 'alert'}>
            {load.kind === 'error' ? copy('planError') : copy(load.kind)}
          </p>
          {load.kind === 'error' && (
            <button
              type="button"
              onClick={() => setGeneration((value) => value + 1)}
            >
              {copy('retry')}
            </button>
          )}
        </>
      ) : (
        load.template && (
          <>
            <p>
              {load.template.title} — {copy('sourceVersion')}{' '}
              {load.template.version}
            </p>
            <p className="project-warning">
              {copy(
                load.template.templateKey === pilotTemplateKey
                  ? 'pilotWarning'
                  : 'warning',
              )}
            </p>
            <p>
              {copy(
                load.template.templateKey === pilotTemplateKey
                  ? 'pilotNotice'
                  : 'planNotice',
              )}
            </p>
            {load.template.templateKey === pilotTemplateKey ? (
              <ol>
                {load.template.activities.map((row) => (
                  <li key={row.taskId}>
                    <PilotActivityContent row={row} />
                    {onOpenTask && (
                      <button
                        type="button"
                        onClick={() => onOpenTask(row.taskId)}
                      >
                        {copy('openTask')} — {row.key}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <ol>
                {load.template.stages.map((stage) => (
                  <li key={stage.key}>
                    <h5>{stage.title}</h5>
                    <ul>
                      {stage.tasks.map((task) => (
                        <li key={task.taskId}>
                          {task.title} — {copy('required')}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </>
        )
      )}
    </section>
  );
}

/** Replacing any prerequisite retires template drafts and replies, even if labels match. */
export function projectTemplateAuthority(actor: ActorContext): string {
  const company = actor.activeCompany;
  return JSON.stringify([
    actor.workspaceId,
    actor.workspaceMembershipId,
    company?.id,
    company?.projectTemplatePermissionAssignmentId,
    company?.projectTemplatePermissionSetVersion,
    company?.projectTemplatePermissions,
    company?.projectPermissions,
    company?.taskPermissionAssignmentId,
    company?.taskPermissionSetVersion,
    company?.taskPermissions,
  ]);
}

function PilotActivityContent({ row }: { row: PilotActivity }) {
  const copy = useProjectTemplateCopy();
  return (
    <>
      <h5>
        {row.key} — {row.title}
      </h5>
      <p>
        <strong>{copy('activity')}: </strong>
        <span>{row.activity}</span>
      </p>
      <p>
        <strong>{copy('intendedResult')}: </strong>
        <span>{row.intendedResult}</span>
      </p>
    </>
  );
}
