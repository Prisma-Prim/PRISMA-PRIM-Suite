import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { workingEvidenceAuthority } from '../working-evidence/working-evidence-access';
import { dossierAnalysisAuthority } from '../dossier-analysis/analysis-access';
import { certificationAuthority } from '../certification/certification-access';
import { projectTemplateAuthority } from './ProjectTemplate';
import type { TemplateSelection } from './project-template-response';
import type { RequestedTask } from './ProjectTasks';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import { clientReadAuthority } from './project-authority';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { isClosedProjectStatus } from './project-lifecycle-response';
import type { ResponsibleMember } from './project-responsible-response';
import { isProject, type ProjectView } from './project-directory';
import { useProjectDirectory } from './use-project-directory';
import type { ProjectNavigationRequest } from './use-project-navigation';

/**
 * The opened Project's views. The current interface offers the first five as
 * its detail tabs; the Clarté mission space also offers the plan, its
 * applicability, current work, review and Contracts as views.
 */
export type ProjectDetailPanel =
  | 'tasks'
  | 'documents'
  | 'working-evidence'
  | 'certification'
  | 'dossier-analysis'
  | 'plan'
  | 'applicability'
  | 'work'
  | 'review'
  | 'contracts';
/** Either the free-text search or one exact dossier identity is active. */
export type ProjectFilter =
  | { kind: 'text'; query: string }
  | { kind: 'client'; clientDossierId: string; displayName: string };
/** The sources the search last presented, compared by identity in render. */
type SearchSources = {
  scope: readonly unknown[];
  clientIdentityRevision: number;
  directoryRequestId: number | undefined;
};

function projectFilterText(value: string) {
  // Fold Romanian spelling only; removing every combining mark would conflate й/и.
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[ăâ]/gu, 'a')
    .replace(/î/gu, 'i')
    .replace(/[șş]/gu, 's')
    .replace(/[țţ]/gu, 't');
}
/**
 * The opened Project, the Client identity revision it was read under and, when
 * a requested open targeted one of its Tasks, that Task.
 */
export type SelectedProject = {
  project: ProjectView;
  identityRevision: number;
  requestedTask?: RequestedTask;
  requestedProjectFocusId?: number;
};
type Registration = {
  title: string;
  clientAccountId: string;
  key: string;
  source:
    | { kind: 'manual' }
    | { kind: 'template'; templateKey: string; templateVersion: number };
};
type TemplateCreationFeedback =
  | 'denied'
  | 'creationMissing'
  | 'creationUnavailable'
  | 'creationUncertain'
  | 'creationConflict'
  | 'creationValidation';
export type ProjectWorkspaceFeedback =
  | 'error'
  | 'validation'
  | 'conflict'
  | { kind: 'template'; message: TemplateCreationFeedback }
  | null;
/** A detail read, optionally requested with a Task target, or a registration. */
type ProjectRequest =
  | {
      kind: 'open';
      projectId: string;
      requestedTask?: RequestedTask & { projectId: string };
      sourceSignal?: AbortSignal;
      requestedProjectFocusId?: number;
    }
  | { kind: 'register'; command: Registration };

export type ProjectWorkspaceProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded?: () => void | Promise<void>;
  /** Increases when Client identities change, so derived targets are re-read. */
  clientIdentityRevision?: number;
  onOpenClientDossier?: (clientDossierId: string) => void;
  /** Passed unchanged to the opened Project's linked Documents. */
  onOpenDocument?: (documentId: string) => void;
  onOpenContract?: (clientRequestId: string) => void;
  /**
   * Directory navigation selects All/open-only with its optional dossier.
   * Exact navigation preserves the selected view and filter, reading the
   * Project before its optional Task; each activation is applied once.
   */
  navigation?: ProjectNavigationRequest;
  catalogueRevision?: number;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
};

/**
 * The Projects session both interfaces render: the directory and its search,
 * registration drafts and commands, the opened Project and its requested
 * Task, and every lifetime that retires them. The current interface and the
 * Clarté mission space differ only in markup.
 */
export function useProjectWorkspace(
  {
    actor,
    identity,
    onActivityRecorded = () => undefined,
    clientIdentityRevision = 0,
    navigation,
  }: ProjectWorkspaceProps,
  {
    landingPanel = 'tasks',
  }: Readonly<{
    /** The view a Project opens on when no Task was requested. */
    landingPanel?: ProjectDetailPanel;
  }> = {},
) {
  const evidenceAuthority = workingEvidenceAuthority(actor);
  const certificationReader = certificationAuthority(actor).read;
  const analysisReader = dossierAnalysisAuthority(actor);
  const planTaskRequestId = useRef(0);
  const templateAuthority = projectTemplateAuthority(actor);
  const previousTemplateAuthority = useRef(templateAuthority);
  const [deniedTemplateAuthority, setDeniedTemplateAuthority] = useState<
    string | null
  >(null);
  const [templateSelection, setTemplateSelection] =
    useState<TemplateSelection | null>(null);
  const [detailPanel, setDetailPanel] = useState<ProjectDetailPanel>('tasks');
  if (
    (!evidenceAuthority && detailPanel === 'working-evidence') ||
    (!certificationReader && detailPanel === 'certification') ||
    (!analysisReader && detailPanel === 'dossier-analysis')
  )
    setDetailPanel('tasks');
  const [generation, setGeneration] = useState(0);
  const [selected, setSelected] = useState<SelectedProject | null>(null);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [filter, setFilter] = useState<ProjectFilter>({
    kind: 'text',
    query: '',
  });
  const [title, setTitle] = useState('');
  const [clientAccountId, setClientAccountId] = useState('');
  const [feedback, setFeedback] = useState<ProjectWorkspaceFeedback>(null);
  const [pending, setPending] = useState(false);
  /** The opened Project's responsible member as its own section last read it. */
  const [responsibleRead, setResponsibleRead] = useState<{
    projectId: string;
    responsible: ResponsibleMember | null;
  } | null>(null);
  const lastResponsibleRead = useRef<{
    projectId: string;
    membershipId: string | null;
  } | null>(null);
  /** A detail replacement does not retire the Company/session that owns it. */
  const scope = useRef({ retired: false });
  /**
   * Whether that request is a registration, which no requested open aborts.
   * It describes the request in flight, so it is consulted only while pending.
   */
  const registering = useRef(false);
  /**
   * The latest requested open already consumed. A request present when this
   * owner mounts or resets was made for an earlier state and never replays.
   */
  const consumedProjectRequest = useRef<number | undefined>(undefined);
  // Directory presentation and an exact open waiting on registration have
  // independent lifetimes. A directory intent must not cancel that queued open.
  const latestProjectRequest = useRef<
    Extract<ProjectNavigationRequest, { kind: 'project' }> | undefined
  >(navigation?.kind === 'project' ? navigation : undefined);
  useLayoutEffect(() => {
    if (navigation?.kind === 'project')
      latestProjectRequest.current = navigation;
  }, [navigation]);
  const appliedNavigation = useRef<number | undefined>(undefined);
  const projectHeading = useRef<HTMLHeadingElement>(null);
  const focusedProjectRequest = useRef<number | undefined>(undefined);
  const identityRevision = useRef(clientIdentityRevision);
  useLayoutEffect(() => {
    identityRevision.current = clientIdentityRevision;
  }, [clientIdentityRevision]);
  const retry = useRef<Registration | null>(null);
  const companyId = actor.activeCompany?.id;
  const authorized =
    holds(actor.activeCompany, 'company_project_access', 'project.read') &&
    (actor.workspacePermissions.includes('client.manage') ||
      holds(
        actor.activeCompany,
        'company_director_client_access',
        'client.read',
      ));
  // The search follows its sources in the commit that delivers them, never a
  // passive effect later, so input on that first displayed frame cannot merge
  // with a late intent (#1158). A new scope clears it, a Client identity
  // refresh retires only a dossier restriction and each directory intent
  // applies once. The scope mirrors the reset effect's dependencies below.
  const scopeValues = [
    actor.workspaceId,
    actor.internalUserId,
    actor.workspaceMembershipId,
    companyId,
    authorized,
    generation,
  ];
  const searchScope = [...scopeValues, identity];
  const viewScope = useRequestLifetime(identity, JSON.stringify(scopeValues));
  // Replacing a consumed grant retires I/O, but equivalent access still owns
  // the open view and its independently authorized drafts.
  const operationScope = JSON.stringify([
    viewScope,
    grantOf(actor.activeCompany, 'company_project_access'),
    clientReadAuthority(actor),
  ]);
  const interactive = useScopedOperationGroup(operationScope);
  const selectedScope = JSON.stringify([operationScope, selected?.project.id]);
  const detailRefresh = useScopedOperationGroup(selectedScope);
  const identityRead = useScopedOperationGroup(
    JSON.stringify([selectedScope, clientIdentityRevision]),
  );
  const observation = useActorObservation(actor);
  const captureRecovery = useAuthorityLifetime(String(observation), identity);
  const [searchSources, setSearchSources] = useState<SearchSources>(() => ({
    scope: searchScope,
    clientIdentityRevision,
    directoryRequestId: undefined,
  }));
  const directoryRequest =
    navigation?.kind === 'directory' ? navigation : undefined;
  const rescoped = searchScope.some(
    (value, index) => !Object.is(value, searchSources.scope[index]),
  );
  const identityRefreshed =
    searchSources.clientIdentityRevision !== clientIdentityRevision;
  const directoryRequested =
    directoryRequest !== undefined &&
    directoryRequest.requestId !== searchSources.directoryRequestId;
  if (rescoped || identityRefreshed || directoryRequested) {
    setSearchSources({
      scope: searchScope,
      clientIdentityRevision,
      directoryRequestId: directoryRequested
        ? directoryRequest.requestId
        : searchSources.directoryRequestId,
    });
    if (directoryRequested) {
      setIncludeClosed(false);
      setFilter(
        directoryRequest.client
          ? { kind: 'client', ...directoryRequest.client }
          : { kind: 'text', query: '' },
      );
    } else if (rescoped || filter.kind === 'client')
      setFilter({ kind: 'text', query: '' });
  }
  const directory = useProjectDirectory({
    identity,
    operationScope,
    captureRecovery,
    companyId,
    authorized: Boolean(authorized),
    clientIdentityRevision,
    onDenied: () => {
      scope.current.retired = true;
      interactive.retire();
      detailRefresh.retire();
      identityRead.retire();
      setPending(false);
      setSelected(null);
    },
  });
  const load = directory.load;
  useLayoutEffect(() => {
    const current = { retired: false };
    scope.current = current;
    registering.current = false;
    setPending(false);
    if (retry.current) {
      retry.current = null;
      setFeedback(null);
    }
    consumedProjectRequest.current = latestProjectRequest.current?.requestId;
    return () => {
      current.retired = true;
    };
  }, [operationScope]);
  function deny() {
    directory.deny();
  }
  function refreshRow(project: ProjectView, startedUnder: number) {
    directory.refreshRow({ project, startedUnder });
  }
  // A different Company, member, authority or reload retires everything this
  // module presents, including the drafts, commands and requested opens
  // started under it. Its search was already cleared during render.
  useEffect(() => {
    setSelected(null);
    setResponsibleRead(null);
    lastResponsibleRead.current = null;
    setFeedback(null);
    setTitle('');
    setClientAccountId('');
    setTemplateSelection(null);
    setDeniedTemplateAuthority(null);
    directory.reset();
  }, [viewScope]);
  useEffect(() => {
    directory.resumeRetiredRead();
  }, [operationScope]);
  // Dedicated Template authority retires its choices and commands without
  // discarding independently authorized manual Project or Task work.
  useEffect(() => {
    if (previousTemplateAuthority.current === templateAuthority) return;
    previousTemplateAuthority.current = templateAuthority;
    setDeniedTemplateAuthority(null);
    setTemplateSelection(null);
    if (retry.current?.source.kind !== 'template') return;
    retry.current = null;
    if (!registering.current) return;
    interactive.retire();
    setPending(false);
    setFeedback(null);
  }, [templateAuthority]);
  // The opened Project owes one detail read under the current Client identity
  // revision. Until it lands its dossier target is withheld; a failed read
  // leaves it withheld rather than retried.
  const staleProjectId =
    selected && selected.identityRevision !== clientIdentityRevision
      ? selected.project.id
      : undefined;
  useEffect(() => {
    if (!staleProjectId || !companyId) return;
    const operation = identityRead.beginLatest();
    if (!operation) return;
    const { signal } = operation;
    const recoveryCurrent = captureRecovery();
    const startedUnder = clientIdentityRevision;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (signal.aborted) return;
        const result = await api.request(
          `/projects/${encodeURIComponent(staleProjectId)}`,
          { companyContextId: companyId, signal },
        );
        if (signal.aborted) return;
        if (result.status === 'unauthorized') {
          if (recoveryCurrent()) await identity.rejectSession();
          else setFeedback('error');
          return;
        }
        if (result.status === 'forbidden') {
          deny();
          return;
        }
        if (
          result.status !== 'ok' ||
          !isProject(result.value) ||
          result.value.id !== staleProjectId ||
          result.value.companyId !== companyId
        )
          throw new Error('Refresh failed');
        const project = result.value;
        setSelected((current) =>
          current?.project.id === project.id
            ? { ...current, project, identityRevision: startedUnder }
            : current,
        );
        refreshRow(project, startedUnder);
      } catch {
        if (!signal.aborted) setFeedback('error');
      } finally {
        operation.release();
      }
    })();
    return operation.retire;
  }, [
    staleProjectId,
    clientIdentityRevision,
    companyId,
    identity,
    identityRead,
    captureRecovery,
  ]);

  // Identity refresh retires only the obsolete dossier restriction (during
  // render, above). Stable exact targets, the selected view and independently
  // authorized work survive. A directory intent's search is presented during
  // render; only its All read starts here.
  useEffect(() => {
    if (!navigation || navigation.requestId === appliedNavigation.current)
      return;
    appliedNavigation.current = navigation.requestId;
    switch (navigation.kind) {
      case 'directory':
        directory.changeView('all');
        break;
      case 'project':
        if (load.view === 'all') setIncludeClosed(false);
        break;
      default: {
        const exhaustive: never = navigation;
        return exhaustive;
      }
    }
  }, [navigation]);
  // A requested open is the same detail read as choosing that Project's row,
  // and supersedes an open still reading. It waits for a pending registration
  // to settle rather than abort it; a denied owner reads nothing.
  useEffect(() => {
    const requestedProject = latestProjectRequest.current;
    if (
      !requestedProject ||
      requestedProject.requestId === consumedProjectRequest.current
    )
      return;
    if (load.kind === 'denied') {
      consumedProjectRequest.current = requestedProject.requestId;
      return;
    }
    if (requestedProject.sourceSignal?.aborted) {
      consumedProjectRequest.current = requestedProject.requestId;
      return;
    }
    if (pending && registering.current) return;
    consumedProjectRequest.current = requestedProject.requestId;
    const { projectId, taskId, requestId, focus, sourceSignal } =
      requestedProject;
    void run({
      kind: 'open',
      projectId,
      sourceSignal,
      requestedProjectFocusId: focus === 'project' ? requestId : undefined,
      requestedTask:
        taskId === undefined
          ? undefined
          : {
              projectId,
              taskId,
              requestId,
              focus: focus === 'task' ? 'task' : undefined,
              sourceSignal,
            },
    });
  }, [navigation, load.kind, pending]);

  useEffect(() => {
    const focusId = selected?.requestedProjectFocusId;
    if (focusId === undefined || focusId === focusedProjectRequest.current)
      return;
    const frame = window.requestAnimationFrame(() => {
      const heading = projectHeading.current;
      if (!heading?.isConnected) return;
      focusedProjectRequest.current = focusId;
      heading.scrollIntoView?.({ block: 'start' });
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  /**
   * Re-reads the opened Project after a confirmed lifecycle change or an
   * explicit reload, so its header status and list row follow the section.
   * The opened Project and every draft below it stay in place.
   */
  async function reloadDetail(input: {
    projectId: string;
    refreshMine?: boolean;
  }) {
    const { projectId } = input;
    if (!companyId) return;
    const operation = detailRefresh.beginLatest();
    if (!operation) return;
    const { signal } = operation;
    const sameScope = interactive.capture();
    const recoveryCurrent = captureRecovery();
    const startedUnder = identityRevision.current;
    const startedIn = scope.current;
    let authorityRejected = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request(
        `/projects/${encodeURIComponent(projectId)}`,
        { companyContextId: companyId, signal },
      );
      if (signal.aborted) return;
      if (result.status === 'unauthorized') {
        authorityRejected = true;
        if (recoveryCurrent()) {
          startedIn.retired = true;
          await identity.rejectSession();
        } else setFeedback('error');
        return;
      }
      if (result.status === 'forbidden') {
        authorityRejected = true;
        deny();
        return;
      }
      if (
        result.status !== 'ok' ||
        !isProject(result.value) ||
        result.value.id !== projectId ||
        result.value.companyId !== companyId
      )
        throw new Error('Refresh failed');
      const project = result.value;
      if (identityRevision.current === startedUnder)
        setSelected((current) =>
          current?.project.id === project.id
            ? { ...current, project, identityRevision: startedUnder }
            : current,
        );
      refreshRow(project, startedUnder);
    } catch {
      if (!signal.aborted) setFeedback('error');
    } finally {
      // A confirmed command still changes current Mine membership if a newer
      // detail read supersedes this one or this read is unavailable. Only the
      // owning scope's retirement or denial suppresses that continuation.
      operation.release();
      if (
        input.refreshMine &&
        sameScope() &&
        !startedIn.retired &&
        !authorityRejected
      )
        directory.refreshMineAfterChange();
    }
  }
  async function run(projectRequest: ProjectRequest) {
    const path =
      projectRequest.kind === 'open'
        ? `/projects/${encodeURIComponent(projectRequest.projectId)}`
        : projectRequest.command.source.kind === 'template'
          ? '/projects/from-template'
          : '/projects';
    const command =
      projectRequest.kind === 'register' ? projectRequest.command : undefined;
    const sourceSignal =
      projectRequest.kind === 'open' ? projectRequest.sourceSignal : undefined;
    if (
      sourceSignal?.aborted ||
      (registering.current && interactive.isPending())
    )
      return;
    const operation = interactive.beginLatest();
    if (!operation) return;
    detailRefresh.retire();
    identityRead.retire();
    const { signal } = operation;
    const recoveryCurrent = captureRecovery();
    const retireSourceRead = () => {
      if (signal.aborted) return;
      operation.retire();
      setPending(false);
    };
    sourceSignal?.addEventListener('abort', retireSourceRead, { once: true });
    registering.current = command !== undefined;
    let phase: 'preparing' | 'sent' | 'confirmed' = 'preparing';
    const startedUnder = identityRevision.current;
    setPending(true);
    setSelected(null);
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      phase = 'sent';
      const result = await api.request(path, {
        companyContextId: companyId,
        signal,
        ...(command
          ? {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': command.key,
              },
              body: JSON.stringify({
                title: command.title,
                clientAccountId: command.clientAccountId,
                ...(command.source.kind === 'template'
                  ? {
                      templateKey: command.source.templateKey,
                      templateVersion: command.source.templateVersion,
                    }
                  : {}),
              }),
            }
          : {}),
      });
      if (signal.aborted) return;
      if (result.status === 'unauthorized') {
        if (recoveryCurrent()) await identity.rejectSession();
        else setFeedback('error');
        return;
      }
      if (result.status === 'forbidden') {
        if (command?.source.kind === 'template') {
          setTemplateSelection(null);
          setDeniedTemplateAuthority(templateAuthority);
          retry.current = null;
          setFeedback({ kind: 'template', message: 'denied' });
          // A Template refusal does not establish loss of independent Project
          // access. Revalidate that server-owned read before restoring rows.
          // Prior Client choices are only hints; creation still checks them.
          directory.revalidateProjectRead();
        } else deny();
        return;
      }
      if (
        result.status !== 'ok' ||
        !isProject(result.value) ||
        (projectRequest.kind === 'open' &&
          (result.value.id !== projectRequest.projectId ||
            result.value.companyId !== companyId))
      ) {
        setFeedback(
          command?.source.kind === 'template'
            ? templateCreationMessage(result)
            : messageFor(result),
        );
        return;
      }
      phase = 'confirmed';
      if (projectRequest.kind === 'open') {
        // A requested Task opens only after its own Project read succeeds.
        const target = projectRequest.requestedTask;
        const requestedTask =
          target?.projectId === result.value.id
            ? {
                taskId: target.taskId,
                requestId: target.requestId,
                focus: target.focus,
                sourceSignal: target.sourceSignal,
              }
            : undefined;
        setDetailPanel(requestedTask ? 'tasks' : landingPanel);
        setSelected({
          project: result.value,
          identityRevision: startedUnder,
          requestedProjectFocusId: projectRequest.requestedProjectFocusId,
          requestedTask,
        });
        refreshRow(result.value, startedUnder);
        return;
      }
      setDetailPanel(landingPanel);
      // A registration confirmed after a Client identity change cannot vouch
      // for the dossier target resolved before it. Until a current read
      // replaces it, the Project offers no dossier navigation and matches no
      // dossier restriction.
      const project =
        identityRevision.current === startedUnder
          ? result.value
          : { ...result.value, clientDossierId: undefined };
      setSelected({ project, identityRevision: startedUnder });
      directory.confirmRegistration(project);
      retry.current = null;
      setTitle('');
      setClientAccountId('');
      setTemplateSelection(null);
      void Promise.resolve()
        .then(() => {
          if (!signal.aborted) return onActivityRecorded();
        })
        .catch(() => undefined);
    } catch {
      if (!signal.aborted)
        setFeedback(
          command?.source.kind === 'template' && phase !== 'confirmed'
            ? {
                kind: 'template',
                message:
                  phase === 'sent'
                    ? 'creationUncertain'
                    : 'creationUnavailable',
              }
            : 'error',
        );
    } finally {
      sourceSignal?.removeEventListener('abort', retireSourceRead);
      operation.release();
      if (!signal.aborted) setPending(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = title.trim();
    if (!normalized || normalized.length > 200 || !clientAccountId) {
      setFeedback('validation');
      return;
    }
    const source: Registration['source'] = templateSelection
      ? {
          kind: 'template',
          templateKey: templateSelection.templateKey,
          templateVersion: templateSelection.version,
        }
      : { kind: 'manual' };
    const command =
      retry.current?.title === normalized &&
      retry.current.clientAccountId === clientAccountId &&
      JSON.stringify(retry.current.source) === JSON.stringify(source)
        ? retry.current
        : {
            title: normalized,
            clientAccountId,
            key: crypto.randomUUID(),
            source,
          };
    retry.current = command;
    void run({ kind: 'register', command });
  }
  /** Retries the directory: the same view again, or a fresh scope for All. */
  function retryDirectory() {
    if (load.view === 'mine_open') {
      // Recovery owns a fresh lifetime; callbacks captured before denial
      // keep their retired scope even after the same-view read succeeds.
      if (load.kind === 'denied') scope.current = { retired: false };
      directory.refresh();
    } else setGeneration((value) => value + 1);
  }
  function openProject(projectId: string) {
    void run({ kind: 'open', projectId });
  }
  /**
   * Returns to the list. The opened Project's sections unmount as when
   * another Project opens; its detail reads retire with its scope.
   */
  function closeProject() {
    setSelected(null);
  }
  /** Opens one of the opened Project's Tasks from its plan or current work. */
  function openPlanTask(taskId: string) {
    const projectId = selected?.project.id;
    if (projectId === undefined) return;
    // Local requests use a separate negative sequence from shell navigation.
    const requestId = --planTaskRequestId.current;
    setDetailPanel('tasks');
    setSelected((current) =>
      current?.project.id === projectId
        ? {
            ...current,
            requestedTask: { taskId, requestId, focus: 'task' },
          }
        : current,
    );
  }
  /** Shows the opened Project's Tasks and moves focus to them. */
  function showTasks() {
    setDetailPanel('tasks');
    window.requestAnimationFrame(() =>
      document.getElementById('project-tasks-panel')?.focus(),
    );
  }
  /** Re-reads the opened Project after one of its sections changed it. */
  function reloadSelected(options: { refreshMine?: boolean } = {}) {
    if (!selected) return Promise.resolve();
    return reloadDetail({
      projectId: selected.project.id,
      refreshMine: options.refreshMine,
    });
  }
  function acceptResponsibleRead(
    projectId: string,
    responsible: ResponsibleMember | null | undefined,
  ) {
    setResponsibleRead(
      responsible === undefined ? null : { projectId, responsible },
    );
    if (responsible === undefined) return;
    const previous = lastResponsibleRead.current;
    const membershipId = responsible?.workspaceMembershipId ?? null;
    lastResponsibleRead.current = { projectId, membershipId };
    // The authoritative read follows the child's confirmed command or
    // explicit reload. A changed membership can change the Mine subset.
    if (
      previous?.projectId === projectId &&
      previous.membershipId !== membershipId
    )
      directory.refreshMineAfterChange();
  }
  /** A Mission Plan creation confirmed the Project: it opens like a registration. */
  function acceptMissionPlanProject(project: ProjectView) {
    directory.confirmRegistration(project);
    setSelected({
      project,
      identityRevision: identityRevision.current,
    });
    setDetailPanel(landingPanel);
  }
  // Derived dossier identities are compared only in rows read under the
  // current Client identity revision. Until such a read lands, a dossier
  // restriction matches none of the kept rows.
  const readyRows =
    load.kind === 'ready' && load.rows.kind === 'ready' ? load.rows : undefined;
  const directoryProjects = readyRows?.projects ?? [];
  const rowsAwaitRead =
    readyRows !== undefined &&
    readyRows.identityRevision !== clientIdentityRevision;
  const refreshFailed =
    rowsAwaitRead && readyRows?.refreshFailedUnder === clientIdentityRevision;
  const restrictionAwaitsRead = rowsAwaitRead && filter.kind === 'client';
  const normalizedQuery =
    filter.kind === 'text' ? projectFilterText(filter.query.trim()) : '';
  const projectsInStatusView = directoryProjects.filter(
    (project) =>
      (load.view === 'all' && includeClosed) ||
      !isClosedProjectStatus(project.status),
  );
  const filteredProjects = !restrictionAwaitsRead
    ? projectsInStatusView.filter((project) =>
        filter.kind === 'client'
          ? project.clientDossierId === filter.clientDossierId
          : normalizedQuery.length === 0 ||
            projectFilterText(project.title).includes(normalizedQuery) ||
            projectFilterText(project.clientDisplayName).includes(
              normalizedQuery,
            ),
      )
    : [];
  const dossierTarget =
    selected?.identityRevision === clientIdentityRevision
      ? selected.project.clientDossierId
      : undefined;
  const canCreate = holds(
    actor.activeCompany,
    'company_project_access',
    'project.create',
  );
  return {
    authorized,
    canCreate,
    evidenceAuthority,
    certificationReader,
    analysisReader,
    templateAuthority,
    /** The Template authority whose creation the server refused, if any. */
    templateDenied: deniedTemplateAuthority === templateAuthority,
    templateSelection,
    setTemplateSelection,
    detailPanel,
    setDetailPanel,
    selected,
    includeClosed,
    setIncludeClosed,
    filter,
    setFilter,
    title,
    setTitle,
    clientAccountId,
    setClientAccountId,
    feedback,
    pending,
    /** The opened Project's responsible member as its own section last read it. */
    responsible:
      responsibleRead !== null &&
      responsibleRead.projectId === selected?.project.id
        ? responsibleRead.responsible
        : undefined,
    load,
    directory,
    projectHeading,
    submit,
    retryDirectory,
    openProject,
    closeProject,
    openPlanTask,
    showTasks,
    reloadSelected,
    acceptResponsibleRead,
    acceptMissionPlanProject,
    directoryProjects,
    readyRows,
    projectsInStatusView,
    filteredProjects,
    refreshFailed,
    restrictionAwaitsRead,
    dossierTarget,
  };
}
export type ProjectWorkspaceSession = ReturnType<typeof useProjectWorkspace>;

function messageFor(
  result: ApiResult<unknown>,
): Exclude<ProjectWorkspaceFeedback, null> {
  return result.status === 'validation'
    ? 'validation'
    : result.status === 'conflict'
      ? 'conflict'
      : 'error';
}

function templateCreationMessage(
  result: ApiResult<unknown>,
): Extract<ProjectWorkspaceFeedback, { kind: 'template' }> {
  return {
    kind: 'template',
    message:
      result.status === 'notFound'
        ? 'creationMissing'
        : result.status === 'validation'
          ? 'creationValidation'
          : result.status === 'conflict'
            ? 'creationConflict'
            : 'creationUncertain',
  };
}
