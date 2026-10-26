import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import {
  readClientProjectPage,
  type ClientProjectPage,
} from './client-mission-response';
import type { ProjectOpenTarget } from './ProjectWorkspace';
import { ProjectStatusLabel } from './ProjectLifecycle';
import { useProjectCopy } from './project-localized.copy';
import { useProjectResponsibleCopy } from './project-responsible-localized.copy';
import { useClientMissionCopy } from './client-mission.copy';
import { ClientMissionTasks } from './ClientMissionTasks';
import { canReadTasks } from './MyTasks';
import './client-mission.css';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  clientDossierId: string;
  clientIdentityRevision: number;
  onOpenProject: (target: ProjectOpenTarget, sourceSignal: AbortSignal) => void;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated: (actor: ActorContext) => void | Promise<void>;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
};
type View =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; page: ClientProjectPage };

export function ClientMissionOverview(props: Props) {
  const session = useRef({ identity: props.identity, generation: 0 });
  if (session.current.identity !== props.identity)
    session.current = {
      identity: props.identity,
      generation: session.current.generation + 1,
    };
  const company = props.actor.activeCompany;
  if (
    !props.actor.active ||
    !props.identity.loaded ||
    !props.identity.signedIn ||
    !company ||
    !company.clientPermissions?.includes('client.read') ||
    !company.clientPermissionAssignmentId ||
    !['v1', 'v2'].includes(company.clientPermissionSetVersion ?? '') ||
    !company.projectPermissions?.includes('project.read') ||
    !company.projectPermissionAssignmentId ||
    !['v1', 'v2'].includes(company.projectPermissionSetVersion ?? '')
  )
    return null;
  const capture = [
    session.current.generation,
    props.actor.internalUserId,
    props.actor.workspaceMembershipId,
    props.actor.workspaceId,
    company.id,
    company.clientPermissionAssignmentId,
    company.clientPermissionSetVersion,
    [...company.clientPermissions].sort(),
    company.projectPermissionAssignmentId,
    company.projectPermissionSetVersion,
    [...company.projectPermissions].sort(),
    props.clientDossierId,
    props.clientIdentityRevision,
  ];
  return (
    <MissionOwner key={JSON.stringify(capture)} {...props} company={company} />
  );
}

function MissionOwner(
  props: Props & { company: NonNullable<ActorContext['activeCompany']> },
) {
  const copy = useClientMissionCopy(),
    projectCopy = useProjectCopy(),
    responsibleCopy = useProjectResponsibleCopy(),
    id = useId();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<
    ClientProjectPage['items'][number] | undefined
  >(undefined);
  const pending = useRef<AbortController | undefined>(undefined);
  const lifetime = useRef<AbortController | undefined>(undefined);
  const callbacks = useRef(props);
  callbacks.current = props;
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(
    (nextOffset: number, focus = false) => {
      lifetime.current?.abort();
      lifetime.current = undefined;
      setOffset(nextOffset);
      setSelected(undefined);
      setView({ kind: 'loading' });
      return runLatestAuthenticatedRequest({
        pending,
        identity: callbacks.current.identity,
        execute: (api, signal) =>
          api.request<unknown>(
            `/projects?clientDossierId=${encodeURIComponent(props.clientDossierId)}&offset=${nextOffset}`,
            { companyContextId: props.company.id, signal },
          ),
        onResult: async (result, signal) => {
          if (
            result.status === 'unauthorized' ||
            result.status === 'forbidden' ||
            result.status === 'notFound'
          ) {
            setView({ kind: 'denied' });
            await handleAuthenticatedAccessRejection({
              result,
              signal,
              identity: callbacks.current.identity,
              companyContextId: props.company.id,
              onCompanyContextRejected:
                callbacks.current.onCompanyContextRejected,
              onActorRevalidated: callbacks.current.onActorRevalidated,
              onWorkspaceAccessRejected:
                callbacks.current.onWorkspaceAccessRejected,
            });
          } else if (result.status === 'ok') {
            const page = readClientProjectPage(result.value, {
              companyId: props.company.id,
              clientDossierId: props.clientDossierId,
              offset: nextOffset,
            });
            lifetime.current = new AbortController();
            setView({ kind: 'ready', page });
          } else setView({ kind: 'error' });
        },
        onError: () => setView({ kind: 'error' }),
        onSettled: () => {
          if (focus) heading.current?.focus();
        },
      });
    },
    [props.company.id, props.clientDossierId],
  );
  useEffect(() => {
    void load(0);
    return () => {
      pending.current?.abort();
      lifetime.current?.abort();
    };
  }, [load]);
  return (
    <section className="client-mission-work" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} tabIndex={-1} ref={heading}>
        {copy('title')}
      </h4>
      <p>
        {projectCopy.companyPrefix} {props.company.displayName}
      </p>
      <p>{copy('hint')}</p>
      <div className="client-mission-actions">
        <button
          type="button"
          disabled={view.kind === 'loading'}
          onClick={() => void load(0, true)}
        >
          {copy('refresh')}
        </button>
        <span>
          {copy('page')} {Math.floor(offset / 25) + 1}
        </span>
      </div>
      {view.kind === 'ready' ? (
        <>
          {view.page.items.length === 0 ? (
            <p>{copy(offset === 0 ? 'empty' : 'outOfRange')}</p>
          ) : (
            <ul className="client-mission-list">
              {view.page.items.map((project) => (
                <li key={project.id}>
                  <h5>{project.title}</h5>
                  <p>
                    {projectCopy.clientPrefix} {project.clientDisplayName}
                  </p>
                  <p>
                    <ProjectStatusLabel status={project.status} />
                  </p>
                  <p>
                    <strong>{responsibleCopy.title}: </strong>
                    <span>
                      {project.responsible?.displayLabel ??
                        responsibleCopy.none}
                    </span>
                  </p>
                  <button
                    type="button"
                    aria-label={`${copy('openProject')}: ${project.title}`}
                    onClick={() => {
                      const signal = lifetime.current?.signal;
                      if (signal && !signal.aborted)
                        callbacks.current.onOpenProject(
                          { projectId: project.id, focus: 'project' },
                          signal,
                        );
                    }}
                  >
                    {copy('openProject')}
                  </button>
                  {canReadTasks(props.actor) && (
                    <button
                      type="button"
                      aria-label={`${copy('previewTasks')}: ${project.title}`}
                      onClick={() => setSelected(project)}
                    >
                      {copy('previewTasks')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="client-mission-actions">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => void load(Math.max(0, offset - 25), true)}
            >
              {copy('previous')}
            </button>
            <button
              type="button"
              disabled={!view.page.hasMore}
              onClick={() => void load(offset + 25, true)}
            >
              {copy('next')}
            </button>
          </div>
          {selected && lifetime.current && (
            <ClientMissionTasks
              key={selected.id}
              {...props}
              project={selected}
              sourceSignal={lifetime.current.signal}
            />
          )}
        </>
      ) : (
        <>
          <p role={view.kind === 'loading' ? 'status' : 'alert'}>
            {copy(view.kind)}
          </p>
          {view.kind !== 'loading' && (
            <button type="button" onClick={() => void load(offset, true)}>
              {copy('retry')}
            </button>
          )}
        </>
      )}
    </section>
  );
}
