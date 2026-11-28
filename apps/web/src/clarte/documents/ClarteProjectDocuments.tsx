import { useEffect, useState } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import { useAuthorityLifetime } from '../../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../../api/authenticated-api-client';
import {
  useActorObservation,
  useRequestLifetime,
} from '../../api/use-actor-requests';
import { useScopedOperationGroup } from '../../api/use-scoped-operation';
import { useDocumentsCopy } from '../../documents/documents.copy';
import { ProjectDocuments } from '../../project/ProjectDocuments';
import { isProject, type ProjectView } from '../../project/project-directory';
import { Select } from '../../presentation/Select';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useClarteDocumentsCopy } from './clarte-documents.copy';

type Projects =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; projects: ProjectView[] };

/**
 * The working Documents of one chosen Project, reached from the Documents
 * register: the existing Project association panel associates eligible
 * Documents, opens them and removes them. The Project list is the active
 * Company's, read fresh each time the panel opens; NestJS decides every
 * association.
 */
export function ClarteProjectDocuments({
  actor,
  identity,
  onActivityRecorded,
  onOpenDocument,
  onClose,
}: Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded?: () => void | Promise<void>;
  onOpenDocument: (documentId: string) => void;
  onClose: () => void;
}>) {
  const copy = useDocumentsCopy();
  const clarte = useClarteDocumentsCopy();
  const [projects, setProjects] = useState<Projects>({ kind: 'loading' });
  const [projectId, setProjectId] = useState('');
  const [generation, setGeneration] = useState(0);
  const lifetime = String(useRequestLifetime(identity, String(generation)));
  const reads = useScopedOperationGroup(lifetime);
  const captureRecovery = useAuthorityLifetime(
    String(useActorObservation(actor)),
    identity,
  );
  const companyId = actor.activeCompany?.id;

  useEffect(() => {
    if (!companyId) {
      setProjects({ kind: 'denied' });
      return;
    }
    const request = reads.beginLatest();
    if (!request) return;
    const { signal } = request;
    const canRejectSession = captureRecovery();
    setProjects({ kind: 'loading' });
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (signal.aborted) return;
        const result = await api.request('/projects', {
          companyContextId: companyId,
          signal,
        });
        if (signal.aborted) return;
        if (result.status === 'unauthorized') {
          setProjects({ kind: 'denied' });
          if (canRejectSession()) await identity.rejectSession();
          return;
        }
        if (result.status === 'forbidden' || result.status === 'notFound') {
          setProjects({ kind: 'denied' });
          return;
        }
        if (
          result.status !== 'ok' ||
          !Array.isArray(result.value) ||
          !result.value.every(isProject)
        )
          throw new Error('Project list unavailable.');
        setProjects({
          kind: 'ready',
          projects: result.value.filter(
            (project) => project.companyId === companyId,
          ),
        });
      } catch {
        if (!signal.aborted) setProjects({ kind: 'error' });
      } finally {
        request.release();
      }
    })();
    return request.retire;
    // The Documents session remounts this panel for another Company or member.
  }, [identity, companyId, generation]);

  const chosen =
    projects.kind === 'ready'
      ? projects.projects.find((project) => project.id === projectId)
      : undefined;
  return (
    <ClarteSidePanel
      title={clarte.projectsAction}
      description={clarte.projectsDescription}
      onClose={onClose}
    >
      <div className="clarte-document-stack">
        {projects.kind === 'loading' && (
          <ClarteLoadingState label={clarte.projectsLoading} />
        )}
        {projects.kind === 'denied' && (
          <ClarteErrorState title={clarte.projectsDenied} />
        )}
        {projects.kind === 'error' && (
          <ClarteErrorState
            title={clarte.projectsError}
            action={
              <ClarteButton onClick={() => setGeneration((value) => value + 1)}>
                {copy.retry}
              </ClarteButton>
            }
          />
        )}
        {projects.kind === 'ready' && projects.projects.length === 0 && (
          <ClarteEmptyState title={clarte.projectsEmpty} />
        )}
        {projects.kind === 'ready' && projects.projects.length > 0 && (
          <ClarteField label={clarte.projectChoice}>
            {(control) => (
              <Select
                id={control.id}
                describedBy={control['aria-describedby']}
                value={projectId}
                placeholder={clarte.projectChoicePlaceholder}
                options={projects.projects.map((project) => ({
                  value: project.id,
                  label: `${project.title} — ${project.clientDisplayName}`,
                }))}
                onValueChange={setProjectId}
              />
            )}
          </ClarteField>
        )}
        {chosen && (
          <div className="clarte-document-legacy">
            <ProjectDocuments
              key={chosen.id}
              actor={actor}
              identity={identity}
              projectId={chosen.id}
              projectStatus={chosen.status}
              onActivityRecorded={onActivityRecorded}
              onOpenDocument={onOpenDocument}
            />
          </div>
        )}
      </div>
    </ClarteSidePanel>
  );
}
