import {
  type FormEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useProfitabilityCopy } from '../profitability-estimate/profitability.copy';
import { Select } from '../presentation/Select';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import {
  type AssignmentBundleLabel,
  type CompanyAccessAdministration,
  type CompanyAccessMember,
  companyAccessAdministrationResponse,
} from './company-access-administration-response';
import { companyContextAccessCopy as copy } from './company-context-access.copy';
import { WorkspaceSessionRevocations } from './WorkspaceSessionRevocations';
import { WorkspaceMembershipSuspension } from './WorkspaceMembershipSuspension';
import './access-administration.css';

type Submission = 'grant' | 'revoke';
type AssignmentBundle =
  | 'task-manager'
  | 'company-context'
  | 'director-client'
  | 'document-registrar'
  | 'document-approver'
  | 'document-project-organizer'
  | 'commercial-intake'
  | 'service-catalogue'
  | 'pricing-configuration'
  | 'pricing-user'
  | 'offer-preparer'
  | 'contract-preparer'
  | 'offer-approver'
  | 'pricing-adjustment'
  | 'commercial-activity-reader'
  | 'opportunity-manager'
  | 'project'
  | 'project-approver'
  | 'profitability-contributor'
  | 'profitability-director';
// Indexing by the selected bundle makes a new bundle a type error until its
// route and label are decided here.
const ASSIGNMENT_PATHS: Record<AssignmentBundle, string> = {
  'profitability-contributor': '/company-profitability-contributor-assignments',
  'profitability-director': '/company-profitability-director-assignments',
  'task-manager': '/company-task-manager-assignments',
  'company-context': '/company-context-assignments',
  'director-client': '/company-director-client-assignments',
  'document-registrar': '/company-document-registrar-assignments',
  'document-approver': '/company-document-approver-assignments',
  'document-project-organizer':
    '/company-document-project-organizer-assignments',
  'commercial-intake': '/company-commercial-intake-assignments',
  'service-catalogue': '/company-service-catalogue-assignments',
  'pricing-configuration': '/company-pricing-configuration-assignments',
  'pricing-user': '/company-pricing-user-assignments',
  'offer-preparer': '/company-offer-preparer-assignments',
  'contract-preparer': '/company-contract-preparer-assignments',
  'offer-approver': '/company-offer-approver-assignments',
  'pricing-adjustment': '/company-pricing-adjustment-assignments',
  'commercial-activity-reader':
    '/company-commercial-activity-reader-assignments',
  'opportunity-manager': '/company-opportunity-manager-assignments',
  project: '/company-project-assignments',
  'project-approver': '/company-project-approver-assignments',
};
type AdministrationLoadState =
  | { status: 'loading' }
  | { status: 'ready'; value: CompanyAccessAdministration }
  | { status: 'error' };
type MutationState =
  | { status: 'idle' }
  | { status: 'submitting'; submission: Submission }
  | { status: 'ready'; submission: Submission }
  // The server confirmed the command, but the administration read after it
  // failed. Only a later successful read concludes it.
  | { status: 'unrefreshed'; submission: Submission }
  | { status: 'error' };
export function CompanyContextAccess({
  actor,
  identity,
  onActorRevalidated = () => undefined,
  onCompanyContextRejected = () => undefined,
  onActivityRecorded = () => undefined,
  onClientAuthorityChanged = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (companyId: string) => Promise<void> | void;
  onActivityRecorded?: () => Promise<void> | void;
  onClientAuthorityChanged?: () => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}) {
  const profitabilityCopy = useProfitabilityCopy();
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [workspaceMembershipId, setWorkspaceMembershipId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [bundle, setBundle] = useState<AssignmentBundle>('company-context');
  const [administration, setAdministration] = useState<AdministrationLoadState>(
    { status: 'loading' },
  );
  const [mutation, setMutation] = useState<MutationState>({ status: 'idle' });
  const [suspensionPending, setSuspensionPending] = useState(false);
  const retryCommand = useRef<
    | {
        submission: Submission;
        bundle: AssignmentBundle;
        workspaceMembershipId: string;
        companyId: string;
        idempotencyKey: string;
      }
    | undefined
  >(undefined);
  const pendingRequest = useRef<AbortController | undefined>(undefined);
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  acceptRevalidatedActor.current = onActorRevalidated;
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  rejectCompanyContext.current = onCompanyContextRejected;
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  rejectWorkspaceAccess.current = onWorkspaceAccessRejected;
  const canManageAssignments = actor.workspacePermissions.includes(
    'company.assignment.manage',
  );

  const reloadAdministration = useCallback(
    async (request: AbortController, showLoading = false): Promise<boolean> => {
      if (showLoading) setAdministration({ status: 'loading' });
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (request.signal.aborted) return false;
        const result = await api.request<unknown>(
          '/company-context-assignments/administration',
          { signal: request.signal },
        );
        if (request.signal.aborted) return false;
        const rejection = await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId: undefined,
          onCompanyContextRejected: (companyId) =>
            rejectCompanyContext.current(companyId),
          onActorRevalidated: (revalidatedActor) =>
            acceptRevalidatedActor.current(revalidatedActor),
          onWorkspaceAccessRejected: () => rejectWorkspaceAccess.current(),
          signal: request.signal,
        });
        if (rejection) {
          if (request.signal.aborted) return false;
          if (rejection === 'forbidden') setAdministration({ status: 'error' });
          return false;
        }
        if (result.status !== 'ok') {
          setAdministration({ status: 'error' });
          return false;
        }
        const value = companyAccessAdministrationResponse(result.value);
        setAdministration({ status: 'ready', value });
        setWorkspaceMembershipId((current) =>
          value.members.some(
            (member) => member.workspaceMembershipId === current,
          )
            ? current
            : '',
        );
        setCompanyId((current) =>
          value.companies.some((company) => company.id === current)
            ? current
            : '',
        );
        return true;
      } catch (error) {
        if (request.signal.aborted) return false;
        if (error instanceof DOMException && error.name === 'AbortError')
          return false;
        setAdministration({ status: 'error' });
        return false;
      }
    },
    [identity],
  );

  useEffect(() => {
    pendingRequest.current?.abort();
    retryCommand.current = undefined;
    setWorkspaceMembershipId('');
    setCompanyId('');
    setMutation({ status: 'idle' });
    setSuspensionPending(false);
    if (!canManageAssignments) return;
    const request = new AbortController();
    pendingRequest.current = request;
    setAdministration({ status: 'loading' });
    void reloadAdministration(request);
    return () => pendingRequest.current?.abort();
  }, [
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    canManageAssignments,
    reloadAdministration,
  ]);

  if (!canManageAssignments) return null;

  async function submit(event: FormEvent, submission: Submission) {
    event.preventDefault();
    if (!workspaceMembershipId || !companyId) return;
    setMutation({ status: 'submitting', submission });
    const command =
      retryCommand.current?.submission === submission &&
      retryCommand.current.bundle === bundle &&
      retryCommand.current.workspaceMembershipId === workspaceMembershipId &&
      retryCommand.current.companyId === companyId
        ? retryCommand.current
        : {
            submission,
            bundle,
            workspaceMembershipId,
            companyId,
            idempotencyKey: crypto.randomUUID(),
          };
    retryCommand.current = command;
    pendingRequest.current?.abort();
    const request = new AbortController();
    pendingRequest.current = request;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const assignmentPath = ASSIGNMENT_PATHS[bundle];
      const result = await api.request<unknown>(
        submission === 'grant'
          ? assignmentPath
          : `${assignmentPath}/${encodeURIComponent(workspaceMembershipId)}/${encodeURIComponent(companyId)}`,
        submission === 'grant'
          ? {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': command.idempotencyKey,
              },
              body: JSON.stringify({ workspaceMembershipId, companyId }),
              signal: request.signal,
            }
          : {
              method: 'DELETE',
              headers: { 'idempotency-key': command.idempotencyKey },
              signal: request.signal,
            },
      );
      if (request.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }

      let actorRevalidationFailed = false;
      let activityRefreshedByRecovery = false;
      if (
        result.status === 'ok' &&
        command.bundle !== 'company-context' &&
        command.workspaceMembershipId.toLowerCase() ===
          actor.workspaceMembershipId.toLowerCase() &&
        command.companyId.toLowerCase() ===
          actor.activeCompany?.id.toLowerCase()
      ) {
        const revalidated = await api.request<ActorContext>(
          '/access/current-actor',
          {
            companyContextId: command.companyId,
            signal: request.signal,
          },
        );
        if (request.signal.aborted) return;
        if (revalidated.status === 'unauthorized') {
          await identity.rejectSession();
          return;
        }
        if (revalidated.status === 'forbidden') {
          await rejectCompanyContext.current(command.companyId);
          activityRefreshedByRecovery = true;
        } else if (revalidated.status === 'ok') {
          await acceptRevalidatedActor.current(revalidated.value);
        } else {
          actorRevalidationFailed = true;
        }
      }

      if (result.status === 'ok' && !activityRefreshedByRecovery) {
        await onActivityRecorded();
        if (request.signal.aborted) return;
      }

      if (
        result.status === 'ok' &&
        command.bundle !== 'company-context' &&
        command.workspaceMembershipId.toLowerCase() ===
          actor.workspaceMembershipId.toLowerCase()
      ) {
        await onClientAuthorityChanged();
        if (request.signal.aborted) return;
      }

      if (request.signal.aborted) return;
      const refreshed = await reloadAdministration(request);
      if (request.signal.aborted) return;
      if (result.status === 'ok' && refreshed && !actorRevalidationFailed) {
        retryCommand.current = undefined;
        setMutation({ status: 'ready', submission });
      } else if (result.status === 'ok' && !actorRevalidationFailed) {
        setMutation({ status: 'unrefreshed', submission });
      } else {
        setMutation({ status: 'error' });
      }
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMutation({ status: 'error' });
    } finally {
      if (pendingRequest.current === request)
        pendingRequest.current = undefined;
    }
  }

  function resetCommand() {
    retryCommand.current = undefined;
    setMutation({ status: 'idle' });
  }

  async function retryAdministration() {
    pendingRequest.current?.abort();
    const request = new AbortController();
    pendingRequest.current = request;
    const refreshed = await reloadAdministration(request, true);
    if (!refreshed || mutation.status !== 'unrefreshed') return;
    retryCommand.current = undefined;
    setMutation({ status: 'ready', submission: mutation.submission });
  }

  if (administration.status === 'loading') {
    return (
      <section
        aria-labelledby="company-context-access-title"
        className={`company-access${isPrisme ? ' company-access--prisme' : ''}`}
      >
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="company-context-access-title">{copy.title}</h2>
        <p role="status">{copy.loading}</p>
      </section>
    );
  }

  if (administration.status === 'error') {
    return (
      <section
        aria-labelledby="company-context-access-title"
        className={`company-access${isPrisme ? ' company-access--prisme' : ''}`}
      >
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="company-context-access-title">{copy.title}</h2>
        <p role="alert">{copy.error}</p>
        <button
          type="button"
          className={isPrisme ? 'company-access-primary-action' : undefined}
          onClick={() => void retryAdministration()}
        >
          {copy.retry}
        </button>
      </section>
    );
  }

  const data = administration.value;
  const duplicateMemberLabels = duplicatedLabels(data.members.map(memberLabel));
  const duplicateCompanyLabels = duplicatedLabels(
    data.companies.map((company) => company.displayName),
  );
  const selectedBundleLabel = bundleLabel(bundle);
  const selectedAssignment = data.assignments.find(
    (assignment) =>
      assignment.active &&
      assignment.workspaceMembershipId === workspaceMembershipId &&
      assignment.companyId === companyId &&
      assignment.bundle === selectedBundleLabel,
  );
  const activeAssignment = selectedAssignment !== undefined;
  const capturedVersion = selectedAssignment?.permissionSetVersion ?? null;
  const hasSelectableTargets =
    data.members.length > 0 && data.companies.length > 0;
  const pending = mutation.status === 'submitting';
  const busy = pending || suspensionPending;
  const unresolved =
    mutation.status === 'error' || mutation.status === 'unrefreshed';
  const retrySubmission =
    unresolved &&
    retryCommand.current?.bundle === bundle &&
    retryCommand.current.workspaceMembershipId === workspaceMembershipId &&
    retryCommand.current.companyId === companyId
      ? retryCommand.current.submission
      : undefined;

  return (
    <section
      aria-labelledby="company-context-access-title"
      className={`company-access${isPrisme ? ' company-access--prisme' : ''}`}
    >
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2 id="company-context-access-title">{copy.title}</h2>
      <p>{copy.description}</p>
      {!hasSelectableTargets && <p>{copy.empty}</p>}
      {hasSelectableTargets && (
        <form
          className={isPrisme ? 'company-access-form' : undefined}
          noValidate
          onSubmit={(event) => void submit(event, 'grant')}
        >
          <label htmlFor="context-access-member">
            {copy.workspaceMemberLabel}
          </label>
          <Select
            id="context-access-member"
            value={workspaceMembershipId}
            disabled={busy}
            placeholder={copy.selectMember}
            options={data.members.map((member) => ({
              value: member.workspaceMembershipId,
              label: disambiguatedLabel(
                memberLabel(member),
                member.workspaceMembershipId,
                duplicateMemberLabels,
              ),
            }))}
            onValueChange={(value) => {
              resetCommand();
              setWorkspaceMembershipId(value);
            }}
          />

          <label htmlFor="context-access-company">{copy.companyLabel}</label>
          <Select
            id="context-access-company"
            value={companyId}
            disabled={busy}
            placeholder={copy.selectCompany}
            options={data.companies.map((company) => ({
              value: company.id,
              label: disambiguatedLabel(
                company.displayName,
                company.id,
                duplicateCompanyLabels,
              ),
            }))}
            onValueChange={(value) => {
              resetCommand();
              setCompanyId(value);
            }}
          />

          <label htmlFor="context-access-bundle">{copy.bundleLabel}</label>
          <Select
            id="context-access-bundle"
            value={bundle}
            disabled={busy}
            options={[
              { value: 'company-context', label: copy.companyContextBundle },
              {
                value: 'commercial-intake',
                label: copy.commercialIntakeBundle,
              },
              {
                value: 'service-catalogue',
                label: copy.serviceCatalogueBundle,
              },
              {
                value: 'pricing-configuration',
                label: copy.pricingConfigurationBundle,
              },
              {
                value: 'profitability-contributor',
                label: profitabilityCopy('contributorBundle'),
              },
              {
                value: 'profitability-director',
                label: profitabilityCopy('directorBundle'),
              },
              { value: 'pricing-user', label: copy.pricingUserBundle },
              { value: 'offer-preparer', label: copy.offerPreparerBundle },
              {
                value: 'contract-preparer',
                label: copy.contractPreparerBundle,
              },
              { value: 'offer-approver', label: copy.offerApproverBundle },
              {
                value: 'pricing-adjustment',
                label: copy.pricingAdjustmentBundle,
              },
              {
                value: 'commercial-activity-reader',
                label: copy.commercialActivityReaderBundle,
              },
              {
                value: 'opportunity-manager',
                label: copy.opportunityManagerBundle,
              },
              { value: 'director-client', label: copy.directorClientBundle },
              {
                value: 'document-project-organizer',
                label: copy.documentProjectOrganizerBundle,
              },
              {
                value: 'document-registrar',
                label: copy.documentRegistrarBundle,
              },
              {
                value: 'document-approver',
                label: copy.documentApproverBundle,
              },
              { value: 'project', label: copy.projectBundle },
              { value: 'project-approver', label: copy.projectApproverBundle },
              { value: 'task-manager', label: copy.taskManagerBundle },
            ]}
            onValueChange={(value) => {
              resetCommand();
              if (
                value === 'profitability-contributor' ||
                value === 'profitability-director' ||
                value === 'task-manager' ||
                value === 'commercial-intake' ||
                value === 'service-catalogue' ||
                value === 'pricing-configuration' ||
                value === 'pricing-user' ||
                value === 'offer-preparer' ||
                value === 'contract-preparer' ||
                value === 'offer-approver' ||
                value === 'pricing-adjustment' ||
                value === 'commercial-activity-reader' ||
                value === 'opportunity-manager' ||
                value === 'company-context' ||
                value === 'director-client' ||
                value === 'document-project-organizer' ||
                value === 'document-registrar' ||
                value === 'project' ||
                value === 'document-approver' ||
                value === 'project-approver'
              )
                setBundle(value);
            }}
          />

          {bundle === 'profitability-contributor' && (
            <p>{profitabilityCopy('contributorPrerequisites')}</p>
          )}
          {bundle === 'profitability-director' && (
            <p>{profitabilityCopy('directorPrerequisites')}</p>
          )}
          {bundle === 'task-manager' && <p>{copy.taskManagerPrerequisites}</p>}
          {bundle === 'commercial-activity-reader' && (
            <p>{copy.commercialActivityReaderPrerequisites}</p>
          )}
          {bundle === 'pricing-configuration' && (
            <p>{copy.pricingConfigurationPrerequisites}</p>
          )}
          {bundle === 'project-approver' && (
            <p>{copy.projectApproverPrerequisites}</p>
          )}
          {bundle === 'document-approver' && (
            <p>{copy.documentApproverPrerequisites}</p>
          )}
          {bundle === 'pricing-user' && <p>{copy.pricingUserPrerequisites}</p>}
          {bundle === 'contract-preparer' && (
            <p>{copy.contractPreparerPrerequisites}</p>
          )}
          {bundle === 'offer-preparer' && (
            <p>{copy.offerPreparerPrerequisites}</p>
          )}
          {bundle === 'offer-approver' && (
            <p>{copy.offerApproverPrerequisites}</p>
          )}
          {bundle === 'opportunity-manager' && (
            <p>{copy.opportunityManagerPrerequisites}</p>
          )}
          {bundle === 'pricing-adjustment' && (
            <p>{copy.pricingAdjustmentPrerequisites}</p>
          )}
          {workspaceMembershipId && companyId && (
            <p role="status">
              {copy.currentStateLabel}:{' '}
              <strong>
                {!activeAssignment
                  ? copy.currentStateNotGranted
                  : capturedVersion === null
                    ? copy.currentStateGranted
                    : copy.currentStateGrantedVersion(capturedVersion)}
              </strong>
            </p>
          )}
          {capturedVersion !== null && <p>{copy.capturedVersionExplanation}</p>}

          <button
            type="submit"
            className={isPrisme ? 'company-access-primary-action' : undefined}
            disabled={
              busy ||
              !workspaceMembershipId ||
              !companyId ||
              (activeAssignment && retrySubmission !== 'grant')
            }
          >
            {copy.grant}
          </button>
          <button
            type="button"
            className={isPrisme ? 'company-access-secondary-action' : undefined}
            disabled={
              busy ||
              !workspaceMembershipId ||
              !companyId ||
              (!activeAssignment && retrySubmission !== 'revoke')
            }
            onClick={(event) => void submit(event, 'revoke')}
          >
            {copy.revoke}
          </button>
        </form>
      )}
      {mutation.status === 'ready' && (
        <p role="status">
          {mutation.submission === 'grant' ? copy.granted : copy.revoked}
        </p>
      )}
      {unresolved && <p role="alert">{copy.error}</p>}
      <WorkspaceSessionRevocations
        actor={actor}
        identity={identity}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
        onActivityRecorded={onActivityRecorded}
      />
      <WorkspaceMembershipSuspension
        actor={actor}
        identity={identity}
        members={data.members.map((member) => ({
          workspaceMembershipId: member.workspaceMembershipId,
          label: disambiguatedLabel(
            memberLabel(member),
            member.workspaceMembershipId,
            duplicateMemberLabels,
          ),
        }))}
        disabled={pending}
        reloadAdministration={reloadAdministration}
        onPendingChange={setSuspensionPending}
        onActivityRecorded={onActivityRecorded}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </section>
  );
}

function bundleLabel(bundle: AssignmentBundle): AssignmentBundleLabel {
  const labels: Record<AssignmentBundle, AssignmentBundleLabel> = {
    'profitability-contributor': 'Company Profitability Contributor',
    'profitability-director': 'Company Profitability Director',
    'commercial-intake': copy.commercialIntakeBundle,
    'service-catalogue': copy.serviceCatalogueBundle,
    'pricing-configuration': copy.pricingConfigurationBundle,
    'pricing-user': copy.pricingUserBundle,
    'offer-preparer': copy.offerPreparerBundle,
    'contract-preparer': copy.contractPreparerBundle,
    'offer-approver': copy.offerApproverBundle,
    'pricing-adjustment': copy.pricingAdjustmentBundle,
    'commercial-activity-reader': copy.commercialActivityReaderBundle,
    'opportunity-manager': copy.opportunityManagerBundle,
    'task-manager': copy.taskManagerBundle,
    'document-project-organizer': copy.documentProjectOrganizerBundle,
    'document-registrar': 'Company Document Registrar',
    'document-approver': copy.documentApproverBundle,
    project: copy.projectBundle,
    'project-approver': copy.projectApproverBundle,
    'director-client': 'Company Director Client Access',
    'company-context': 'Company Context Access',
  };
  return labels[bundle];
}

function memberLabel(member: CompanyAccessMember): string {
  return `${member.displayName} — ${member.email}`;
}

function duplicatedLabels(labels: string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const label of labels) {
    if (seen.has(label)) duplicates.add(label);
    seen.add(label);
  }
  return duplicates;
}

function disambiguatedLabel(
  label: string,
  id: string,
  duplicates: ReadonlySet<string>,
): string {
  if (!duplicates.has(label)) return label;
  return `${label} — ${copy.referenceLabel} ${stableReference(id)}`;
}

function stableReference(id: string): string {
  return BigInt(`0x${id.replaceAll('-', '')}`)
    .toString(36)
    .toUpperCase();
}
