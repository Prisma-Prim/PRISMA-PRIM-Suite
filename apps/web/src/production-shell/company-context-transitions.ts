import type { TaskEvent } from '../project/task-response';
import type { ResponsibleMember } from '../project/project-responsible-response';
import type { ProjectLifecycleActivityMetadata } from '../project/project-lifecycle-response';
import type { ActorContext } from '../access-types';

export interface VisibleCompany {
  id: string;
  displayName: string;
}

interface ReadyCompanyContextState {
  status: 'ready';
  selection: { status: 'idle' } | { status: 'pending'; companyId: string };
  recoveryMessage?: 'stale' | 'selection-failed';
  rejectionCandidate?: { companyId: string };
}

interface CompanyContextRecovery {
  companies: VisibleCompany[];
  rejectionCandidate?: { companyId: string };
}

export type CompanyContextState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error'; recovery?: undefined }
  | {
      status: 'error';
      recovery: CompanyContextRecovery;
    }
  | (ReadyCompanyContextState & { cardinality: 'zero'; companies: [] })
  | (ReadyCompanyContextState & {
      cardinality: 'one';
      companies: [VisibleCompany];
    })
  | (ReadyCompanyContextState & {
      cardinality: 'many';
      companies: [VisibleCompany, VisibleCompany, ...VisibleCompany[]];
    });

export interface OrdinaryActivityLogEvent {
  id: string;
  action:
    | 'workspace_invitation.issued'
    | 'workspace_invitation.revoked'
    | 'workspace_invitation.accepted'
    | 'internal_user.provisioned'
    | 'workspace_membership.suspended'
    | 'workspace_sessions.revoked'
    | 'workspace_sessions.revocation_retry_required'
    | 'project.created'
    | 'company_task_manager_assignment.granted'
    | 'company_task_manager_assignment.revoked'
    | 'company_project_assignment.granted'
    | 'company_project_assignment.revoked'
    | 'company_commercial_intake_assignment.granted'
    | 'company_commercial_intake_assignment.revoked'
    | 'company_service_catalogue_assignment.granted'
    | 'company_service_catalogue_assignment.revoked'
    | 'company_pricing_configuration_assignment.granted'
    | 'company_pricing_configuration_assignment.revoked'
    | 'company_commercial_activity_reader_assignment.granted'
    | 'company_commercial_activity_reader_assignment.revoked'
    | 'company_project_approver_assignment.granted'
    | 'company_project_approver_assignment.revoked'
    | 'company.registered'
    | 'company_context_assignment.granted'
    | 'company_context_assignment.revoked'
    | 'company_director_client_assignment.granted'
    | 'company_director_client_assignment.revoked'
    | 'company_document_project_organizer_assignment.granted'
    | 'company_document_project_organizer_assignment.revoked'
    | 'company_document_registrar_assignment.granted'
    | 'company_document_registrar_assignment.revoked'
    | 'client.created'
    | 'client_company_relationship.established'
    | 'client.corrected';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target:
    | {
        type: 'project';
        projectId: string;
        projectTitle: string;
        companyId: string;
      }
    | { type: 'workspace_invitation'; invitationId: string }
    | {
        type: 'internal_user';
        internalUserId: string;
        displayName: string;
      }
    | {
        type: 'workspace_membership';
        workspaceMembershipId: string;
        internalUserId: string;
        displayName: string;
      }
    | { type: 'company'; companyId: string; displayName: string }
    | {
        type: 'company_role_assignment';
        assignmentId: string;
        companyId: string;
        companyDisplayName: string;
        workspaceMembershipId: string;
        internalUserId: string;
        internalUserDisplayName: string;
      }
    | {
        type: 'client_account';
        clientAccountId: string;
        displayName: string;
        companyId?: string;
        companyDisplayName?: string;
      }
    | {
        type: 'client_company_relationship';
        relationshipId: string;
        clientAccountId: string;
        clientDisplayName: string;
        companyId: string;
        companyDisplayName: string;
      };
}

/** A Task event as the Activity Log lists it, without its change metadata. */
export interface TaskActivityLogEvent {
  id: string;
  action: TaskEvent['action'];
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: TaskEvent['target'];
}

export interface ClientUnionActivityLogEvent {
  action: 'client.union_confirmed' | 'client.union_reversed';
  projectionReference: string;
  companyId: string;
  actor: { kind: 'authorized_resolver' };
  target: {
    type: 'client_union_operation';
    projectionReference: string;
    companyId: string;
  };
}

export interface DocumentRegisteredActivityLogEvent {
  id: string;
  action: 'document.registered';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'document';
    documentId: string;
    documentTitle: string;
    companyId: string;
  };
}
export interface DocumentCorrectedActivityLogEvent {
  id: string;
  action: 'document.corrected';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'document';
    documentId: string;
    companyId: string;
  };
}
export interface DocumentProjectActivityLogEvent {
  id: string;
  action: 'document.project.linked' | 'document.project.unlinked';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'document_project';
    documentId: string;
    documentTitle: string;
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
}
/**
 * The authorized Company projection of a recorded commercial event. It never
 * carries request text, source label, subject, next action or Opportunity
 * scope.
 */
export interface CommercialActivityLogEvent {
  id: string;
  action:
    | 'client_request.created'
    | 'opportunity.created'
    | 'opportunity.next_action.updated';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target:
    | { type: 'client_request'; clientRequestId: string; companyId: string }
    | {
        type: 'opportunity';
        opportunityId: string;
        /** The containing Request, present only for a current Request reader. */
        clientRequestId?: string;
        companyId: string;
      };
}

/** Before and after keep only a membership identifier and its captured label. */
export interface ProjectResponsibleChangedActivityLogEvent {
  id: string;
  action: 'project.responsible.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project';
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
  metadata: {
    revision: number;
    before: ResponsibleMember | null;
    after: ResponsibleMember | null;
  };
}

/** A lifecycle transition: its resulting revision and from/to statuses only. */
export interface ProjectLifecycleChangedActivityLogEvent {
  id: string;
  action: 'project.lifecycle.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project';
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
  metadata: ProjectLifecycleActivityMetadata;
}

/**
 * One entry of a proved `/activity-log` page (see `activityLogPageResponse`).
 * The shell lists these entries and presents no metadata except the proved
 * before and after of a responsible-member change.
 */
export type ActivityLogEvent =
  | TaskActivityLogEvent
  | ProjectResponsibleChangedActivityLogEvent
  | ProjectLifecycleChangedActivityLogEvent
  | DocumentProjectActivityLogEvent
  | OrdinaryActivityLogEvent
  | ClientUnionActivityLogEvent
  | CommercialActivityLogEvent
  | DocumentRegisteredActivityLogEvent
  | DocumentCorrectedActivityLogEvent;

export type ActivityLogState =
  | { status: 'loading' }
  | { status: 'ready'; events: ActivityLogEvent[] }
  | { status: 'error' };

export type ProductionShellContext =
  | { status: 'checking' }
  | {
      status: 'active';
      actor: ActorContext;
      activityLog: ActivityLogState;
      companyContext: CompanyContextState;
      sessionGeneration: number;
    }
  | { status: 'signed-out' }
  | { status: 'forbidden' }
  | { status: 'error' };

export interface CompanyContextOrigin {
  activeCompanyId: string | undefined;
  internalUserId: string;
  workspaceId: string;
  workspaceMembershipId: string;
  sessionGeneration: number;
}

export type LoadedCompanyContext =
  | Exclude<CompanyContextState, { status: 'ready' }>
  | {
      status: 'ready';
      companies: VisibleCompany[];
      recoveryMessage?: 'stale' | 'selection-failed';
    };

export type CompanyContextTransition =
  | { type: 'identity-changed' }
  | { type: 'session-signed-out' }
  | { type: 'access-forbidden' }
  | { type: 'access-failed' }
  | {
      type: 'session-activated';
      actor: ActorContext;
      companyContext: LoadedCompanyContext;
      sessionGeneration: number;
    }
  | {
      type: 'selection-started';
      origin: CompanyContextOrigin;
      companyId: string;
    }
  | {
      type: 'selection-confirmed';
      origin: CompanyContextOrigin;
      companyId: string;
      actor: ActorContext;
    }
  | {
      type: 'actor-revalidated';
      origin: CompanyContextOrigin;
      actor: ActorContext;
    }
  | {
      type: 'selection-denied';
      origin: CompanyContextOrigin;
      companyId: string;
    }
  | {
      type: 'selection-failed';
      origin: CompanyContextOrigin;
      companyId: string;
    }
  | {
      type: 'company-rejected';
      origin: CompanyContextOrigin;
      companyId: string;
      activityLog: 'preserve' | 'loading' | 'error';
    }
  | {
      type: 'company-included';
      origin: CompanyContextOrigin;
      company: VisibleCompany;
    }
  | {
      type: 'activity-resolved';
      origin: CompanyContextOrigin;
      activityLog: ActivityLogState;
    };

export function transitionCompanyContext(
  current: ProductionShellContext,
  transition: CompanyContextTransition,
): ProductionShellContext {
  switch (transition.type) {
    case 'identity-changed':
      return { status: 'checking' };
    case 'session-signed-out':
      return { status: 'signed-out' };
    case 'access-forbidden':
      return { status: 'forbidden' };
    case 'access-failed':
      return { status: 'error' };
    case 'session-activated':
      return {
        status: 'active',
        actor: transition.actor,
        companyContext: normalizeLoadedCompanyContext(
          transition.companyContext,
        ),
        activityLog: { status: 'loading' },
        sessionGeneration: transition.sessionGeneration,
      };
    case 'selection-started': {
      if (
        !matchesReadyOrigin(current, transition.origin) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      return {
        ...current,
        companyContext: {
          ...current.companyContext,
          selection: { status: 'pending', companyId: transition.companyId },
        },
      };
    }
    case 'selection-confirmed': {
      if (
        !matchesPendingSelection(
          current,
          transition.origin,
          transition.companyId,
        ) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      return {
        ...current,
        actor: transition.actor,
        companyContext: readyCompanyContext(current.companyContext.companies),
        activityLog: { status: 'loading' },
      };
    }
    case 'actor-revalidated': {
      if (
        !matchesOrigin(current, transition.origin) ||
        !actorMatchesOrigin(transition.actor, transition.origin)
      )
        return current;
      return {
        ...current,
        actor: transition.actor,
        activityLog: { status: 'loading' },
      };
    }
    case 'selection-denied': {
      if (
        !matchesPendingSelection(
          current,
          transition.origin,
          transition.companyId,
        ) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      const companies = withoutCompany(
        current.companyContext.companies,
        transition.companyId,
      );
      const recovery = companyContextRecovery(
        current.companyContext,
        companies,
        transition.origin.activeCompanyId,
      );
      return {
        ...current,
        actor: withoutActiveCompany(current.actor),
        companyContext: readyCompanyContext(
          companies,
          'selection-failed',
          { status: 'idle' },
          recovery.rejectionCandidate,
        ),
      };
    }
    case 'selection-failed': {
      if (
        !matchesPendingSelection(
          current,
          transition.origin,
          transition.companyId,
        ) ||
        !current.companyContext.companies.some(
          ({ id }) => id === transition.companyId,
        )
      )
        return current;
      if (
        transition.origin.activeCompanyId !== undefined &&
        current.actor.activeCompany === undefined &&
        current.companyContext.recoveryMessage === 'stale'
      )
        return {
          ...current,
          companyContext: readyCompanyContext(
            current.companyContext.companies,
            'stale',
          ),
        };
      return {
        ...current,
        companyContext: {
          status: 'error',
          recovery: companyContextRecovery(
            current.companyContext,
            current.companyContext.companies,
          ),
        },
      };
    }
    case 'company-rejected': {
      if (!matchesCompanyRejectionOrigin(current, transition)) return current;
      const recoverableCompanies = recoveryCompanies(current.companyContext);
      if (recoverableCompanies === undefined) return current;
      return {
        ...current,
        actor: withoutActiveCompany(current.actor),
        companyContext: readyCompanyContext(
          withoutCompany(recoverableCompanies, transition.companyId),
          'stale',
          selectionAfterRejection(current.companyContext, transition.companyId),
        ),
        activityLog:
          transition.activityLog === 'error'
            ? { status: 'error' }
            : transition.activityLog === 'loading'
              ? { status: 'loading' }
              : current.activityLog,
      };
    }
    case 'company-included': {
      if (!matchesReadyOrigin(current, transition.origin)) return current;
      const companies = [
        ...current.companyContext.companies.filter(
          ({ id }) => id !== transition.company.id,
        ),
        transition.company,
      ].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
      const recovery = companyContextRecovery(
        current.companyContext,
        companies,
      );
      return {
        ...current,
        companyContext: readyCompanyContext(
          companies,
          current.companyContext.recoveryMessage,
          current.companyContext.selection,
          recovery.rejectionCandidate,
        ),
      };
    }
    case 'activity-resolved':
      if (!matchesOrigin(current, transition.origin)) return current;
      return { ...current, activityLog: transition.activityLog };
  }
}

export function captureCompanyContextOrigin(
  context: ProductionShellContext,
): CompanyContextOrigin | undefined {
  if (context.status !== 'active') return undefined;
  return {
    activeCompanyId: context.actor.activeCompany?.id,
    internalUserId: context.actor.internalUserId,
    workspaceId: context.actor.workspaceId,
    workspaceMembershipId: context.actor.workspaceMembershipId,
    sessionGeneration: context.sessionGeneration,
  };
}

function matchesReadyOrigin(
  context: ProductionShellContext,
  origin: CompanyContextOrigin,
): context is Extract<ProductionShellContext, { status: 'active' }> & {
  companyContext: Extract<CompanyContextState, { status: 'ready' }>;
} {
  return (
    context.status === 'active' &&
    context.companyContext.status === 'ready' &&
    matchesOrigin(context, origin)
  );
}

function matchesPendingSelection(
  context: ProductionShellContext,
  origin: CompanyContextOrigin,
  companyId: string,
): context is Extract<ProductionShellContext, { status: 'active' }> & {
  companyContext: Extract<CompanyContextState, { status: 'ready' }>;
} {
  if (
    context.status !== 'active' ||
    context.companyContext.status !== 'ready' ||
    context.companyContext.selection.status !== 'pending' ||
    context.companyContext.selection.companyId !== companyId ||
    !matchesSessionOrigin(context, origin)
  )
    return false;
  return (
    context.actor.activeCompany?.id === origin.activeCompanyId ||
    (origin.activeCompanyId !== undefined &&
      context.actor.activeCompany === undefined &&
      context.companyContext.recoveryMessage === 'stale')
  );
}

function matchesOrigin(
  context: ProductionShellContext,
  origin: CompanyContextOrigin,
): context is Extract<ProductionShellContext, { status: 'active' }> {
  return (
    context.status === 'active' &&
    context.actor.activeCompany?.id === origin.activeCompanyId &&
    matchesSessionOrigin(context, origin)
  );
}

function matchesCompanyRejectionOrigin(
  context: ProductionShellContext,
  transition: Extract<CompanyContextTransition, { type: 'company-rejected' }>,
): context is Extract<ProductionShellContext, { status: 'active' }> {
  if (
    context.status !== 'active' ||
    !matchesSessionOrigin(context, transition.origin)
  )
    return false;
  const activeCompanyId = context.actor.activeCompany?.id;
  if (activeCompanyId !== undefined)
    return (
      activeCompanyId === transition.companyId &&
      transition.origin.activeCompanyId === activeCompanyId
    );
  const recoverableCompanies = recoveryCompanies(context.companyContext);
  const rejectionCandidate = rejectionCandidateFor(context.companyContext);
  return (
    rejectionCandidate?.companyId === transition.companyId &&
    transition.origin.activeCompanyId === transition.companyId &&
    recoverableCompanies?.some(({ id }) => id === transition.companyId) === true
  );
}

function matchesSessionOrigin(
  context: Extract<ProductionShellContext, { status: 'active' }>,
  origin: CompanyContextOrigin,
): boolean {
  return (
    context.actor.internalUserId === origin.internalUserId &&
    context.actor.workspaceId === origin.workspaceId &&
    context.actor.workspaceMembershipId === origin.workspaceMembershipId &&
    context.sessionGeneration === origin.sessionGeneration
  );
}

function actorMatchesOrigin(
  actor: ActorContext,
  origin: CompanyContextOrigin,
): boolean {
  return (
    actor.activeCompany?.id === origin.activeCompanyId &&
    actor.internalUserId === origin.internalUserId &&
    actor.workspaceId === origin.workspaceId &&
    actor.workspaceMembershipId === origin.workspaceMembershipId
  );
}

function normalizeLoadedCompanyContext(
  state: LoadedCompanyContext,
): CompanyContextState {
  return state.status === 'ready'
    ? readyCompanyContext(state.companies, state.recoveryMessage)
    : state;
}

function readyCompanyContext(
  companies: VisibleCompany[],
  recoveryMessage?: 'stale' | 'selection-failed',
  selection: Extract<CompanyContextState, { status: 'ready' }>['selection'] = {
    status: 'idle',
  },
  rejectionCandidate?: { companyId: string },
): Extract<CompanyContextState, { status: 'ready' }> {
  const shared = {
    status: 'ready' as const,
    selection,
    recoveryMessage,
    ...(rejectionCandidate ? { rejectionCandidate } : {}),
  };
  if (companies.length === 0)
    return { ...shared, cardinality: 'zero', companies: [] };
  if (companies.length === 1)
    return { ...shared, cardinality: 'one', companies: [companies[0]!] };
  return {
    ...shared,
    cardinality: 'many',
    companies: [companies[0]!, companies[1]!, ...companies.slice(2)],
  };
}

function withoutCompany(
  companies: VisibleCompany[],
  rejectedCompanyId: string,
): VisibleCompany[] {
  return companies.filter((company) => company.id !== rejectedCompanyId);
}

function recoveryCompanies(
  state: CompanyContextState,
): VisibleCompany[] | undefined {
  if (state.status === 'ready') return state.companies;
  if (state.status === 'error') return state.recovery?.companies;
  return undefined;
}

function rejectionCandidateFor(
  state: CompanyContextState,
): { companyId: string } | undefined {
  if (state.status === 'ready') return state.rejectionCandidate;
  if (state.status === 'error') return state.recovery?.rejectionCandidate;
  return undefined;
}

function companyContextRecovery(
  state: CompanyContextState,
  companies: VisibleCompany[],
  fallbackCompanyId?: string,
): CompanyContextRecovery {
  const candidate =
    rejectionCandidateFor(state) ??
    (fallbackCompanyId ? { companyId: fallbackCompanyId } : undefined);
  const candidateRemainsVisible =
    candidate !== undefined &&
    companies.some(({ id }) => id === candidate.companyId);
  return {
    companies,
    ...(candidateRemainsVisible ? { rejectionCandidate: candidate } : {}),
  };
}

function selectionAfterRejection(
  state: CompanyContextState,
  rejectedCompanyId: string,
): Extract<CompanyContextState, { status: 'ready' }>['selection'] {
  if (
    state.status === 'ready' &&
    (state.selection.status !== 'pending' ||
      state.selection.companyId !== rejectedCompanyId)
  )
    return state.selection;
  return { status: 'idle' };
}

function withoutActiveCompany(actor: ActorContext): ActorContext {
  const workspaceActor = { ...actor };
  delete workspaceActor.activeCompany;
  return workspaceActor;
}
