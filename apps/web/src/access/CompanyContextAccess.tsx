import { useMissionPlanCopy } from '../mission-plan/mission-plan.copy';
import { useReportedSigningCopy } from '../contract/reported-signing.copy';
import { useReceivedContractCopy } from '../documents/received-contract.copy';
import { useMissionDeliverableCopy } from '../documents/mission-deliverable.copy';
import { useMissionReviewCopy } from '../project/mission-result-review.copy';
import { useTaskResultCopy } from '../project/task-results.copy';
import { useIdeasCopy } from '../ideas/ideas.copy';
import { useContractModelCopy } from '../contract-model/contract-model.copy';
import { useOfferModelCopy } from '../offer-model/offer-model.copy';
import { useProjectTemplateVersionCopy } from '../project/project-template-version.copy';
import { useProjectStageCopy } from '../project/project-stage.copy';
import { useDocumentPdfCopy } from '../documents/document-pdf.copy';
import { useProjectTemplateCopy } from '../project/project-template.copy';
import { useSalesStageCopy } from '../commercial-intake/sales-stage.copy';
import { useContractDecisionCopy } from '../contract/contract-decision.copy';
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
import { useOperationalRiskCopy } from '../operational-risk/operational-risk.copy';
import { Select } from '../presentation/Select';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import {
  type AssignmentBundleLabel,
  type CompanyAccessAdministration,
  type CompanyAccessMember,
  companyAccessAdministrationResponse,
} from './company-access-administration-response';
import { formatMessage } from '../localization/messages';
import { useCompanyAssignmentCopy } from './company-assignment-localization.copy';
import { WorkspaceSessionRevocations } from './WorkspaceSessionRevocations';
import { WorkspaceMembershipSuspension } from './WorkspaceMembershipSuspension';
import './access-administration.css';

type Submission = 'grant' | 'revoke';
type AssignmentBundle =
  | 'mission-plan-configuration'
  | 'mission-plan-user'
  | 'contract-model-editor'
  | 'contract-model-approver'
  | 'offer-model-editor'
  | 'offer-model-approver'
  | 'mission-result-reviewer'
  | 'task-result-recorder'
  | 'task-manager'
  | 'company-context'
  | 'director-client'
  | 'mission-deliverable-access'
  | 'contract-signature-declarer'
  | 'received-contract-access'
  | 'document-registrar'
  | 'document-content-reader'
  | 'document-content-uploader'
  | 'document-approver'
  | 'document-project-organizer'
  | 'commercial-intake'
  | 'service-catalogue'
  | 'pricing-configuration'
  | 'pricing-user'
  | 'offer-preparer'
  | 'contract-preparer'
  | 'contract-early-preparation'
  | 'contract-approver'
  | 'offer-approver'
  | 'pricing-adjustment'
  | 'commercial-activity-reader'
  | 'opportunity-manager'
  | 'sales-stage-configuration'
  | 'project-template-user'
  | 'project-template-configuration'
  | 'project-stage-advancer'
  | 'project'
  | 'project-approver'
  | 'ideas-reader'
  | 'ideas-recorder'
  | 'ideas-reviewer'
  | 'profitability-contributor'
  | 'profitability-director'
  | 'operational-risk-reader'
  | 'operational-risk-recorder';
// Indexing by the selected bundle makes a new bundle a type error until its
// route and label are decided here.
const ASSIGNMENT_PATHS: Record<AssignmentBundle, string> = {
  'mission-plan-configuration':
    '/company-mission-plan-configuration-assignments',
  'mission-plan-user': '/company-mission-plan-user-assignments',
  'contract-model-editor': '/company-contract-model-editor-assignments',
  'contract-model-approver': '/company-contract-model-approver-assignments',
  'offer-model-editor': '/company-offer-model-editor-assignments',
  'offer-model-approver': '/company-offer-model-approver-assignments',
  'task-result-recorder': '/company-task-result-recorder-assignments',
  'mission-result-reviewer': '/company-mission-result-reviewer-assignments',
  'ideas-reader': '/company-ideas-reader-assignments',
  'ideas-recorder': '/company-ideas-recorder-assignments',
  'ideas-reviewer': '/company-ideas-reviewer-assignments',
  'operational-risk-reader': '/company-operational-risk-reader-assignments',
  'operational-risk-recorder': '/company-operational-risk-recorder-assignments',
  'profitability-contributor': '/company-profitability-contributor-assignments',
  'profitability-director': '/company-profitability-director-assignments',
  'task-manager': '/company-task-manager-assignments',
  'company-context': '/company-context-assignments',
  'director-client': '/company-director-client-assignments',
  'document-registrar': '/company-document-registrar-assignments',
  'contract-signature-declarer':
    '/company-contract-signature-declarer-assignments',
  'received-contract-access': '/company-received-contract-access-assignments',
  'mission-deliverable-access':
    '/company-mission-deliverable-access-assignments',
  'document-content-reader': '/company-document-content-reader-assignments',
  'document-content-uploader': '/company-document-content-uploader-assignments',
  'document-approver': '/company-document-approver-assignments',
  'document-project-organizer':
    '/company-document-project-organizer-assignments',
  'commercial-intake': '/company-commercial-intake-assignments',
  'service-catalogue': '/company-service-catalogue-assignments',
  'pricing-configuration': '/company-pricing-configuration-assignments',
  'pricing-user': '/company-pricing-user-assignments',
  'offer-preparer': '/company-offer-preparer-assignments',
  'contract-preparer': '/company-contract-preparer-assignments',
  'contract-early-preparation':
    '/company-contract-early-preparation-assignments',
  'contract-approver': '/company-contract-approver-assignments',
  'offer-approver': '/company-offer-approver-assignments',
  'pricing-adjustment': '/company-pricing-adjustment-assignments',
  'commercial-activity-reader':
    '/company-commercial-activity-reader-assignments',
  'opportunity-manager': '/company-opportunity-manager-assignments',
  'sales-stage-configuration': '/company-sales-stage-configuration-assignments',
  'project-template-user': '/company-project-template-user-assignments',
  'project-template-configuration':
    '/company-project-template-configuration-assignments',
  'project-stage-advancer': '/company-project-stage-advancer-assignments',
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
  const copy = useCompanyAssignmentCopy();
  const ideasCopy = useIdeasCopy();
  const missionPlanCopy = useMissionPlanCopy();
  const modelCopy = useOfferModelCopy();
  const contractModelCopy = useContractModelCopy();
  const profitabilityCopy = useProfitabilityCopy();
  const riskCopy = useOperationalRiskCopy();
  const decisionCopy = useContractDecisionCopy();
  const stageCopy = useSalesStageCopy();
  const templateCopy = useProjectTemplateCopy();
  const templateVersionCopy = useProjectTemplateVersionCopy();
  const projectStageCopy = useProjectStageCopy();
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

  const pdfCopy = useDocumentPdfCopy();
  const missionCopy = useMissionDeliverableCopy();
  const receivedCopy = useReceivedContractCopy();
  const signingCopy = useReportedSigningCopy();
  const taskResultCopy = useTaskResultCopy();
  const reviewCopy = useMissionReviewCopy();
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
        // Only this bundle carries Client read. Other consumers retire their own captured authority.
        command.bundle === 'director-client' &&
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
        <p className="eyebrow">{copy('eyebrow')}</p>
        <h2 id="company-context-access-title">{copy('title')}</h2>
        <p role="status">{copy('loading')}</p>
      </section>
    );
  }

  if (administration.status === 'error') {
    return (
      <section
        aria-labelledby="company-context-access-title"
        className={`company-access${isPrisme ? ' company-access--prisme' : ''}`}
      >
        <p className="eyebrow">{copy('eyebrow')}</p>
        <h2 id="company-context-access-title">{copy('title')}</h2>
        <p role="alert">{copy('error')}</p>
        <button
          type="button"
          className={isPrisme ? 'company-access-primary-action' : undefined}
          onClick={() => void retryAdministration()}
        >
          {copy('retry')}
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
      <p className="eyebrow">{copy('eyebrow')}</p>
      <h2 id="company-context-access-title">{copy('title')}</h2>
      <p>{copy('description')}</p>
      {!hasSelectableTargets && <p>{copy('empty')}</p>}
      {hasSelectableTargets && (
        <form
          className={isPrisme ? 'company-access-form' : undefined}
          noValidate
          onSubmit={(event) => void submit(event, 'grant')}
        >
          <label htmlFor="context-access-member">
            {copy('workspaceMemberLabel')}
          </label>
          <Select
            id="context-access-member"
            value={workspaceMembershipId}
            disabled={busy}
            placeholder={copy('selectMember')}
            options={data.members.map((member) => ({
              value: member.workspaceMembershipId,
              label: disambiguatedLabel({
                label: memberLabel(member),
                id: member.workspaceMembershipId,
                duplicates: duplicateMemberLabels,
                referenceLabel: copy('referenceLabel'),
              }),
            }))}
            onValueChange={(value) => {
              resetCommand();
              setWorkspaceMembershipId(value);
            }}
          />

          <label htmlFor="context-access-company">{copy('companyLabel')}</label>
          <Select
            id="context-access-company"
            value={companyId}
            disabled={busy}
            placeholder={copy('selectCompany')}
            options={data.companies.map((company) => ({
              value: company.id,
              label: disambiguatedLabel({
                label: company.displayName,
                id: company.id,
                duplicates: duplicateCompanyLabels,
                referenceLabel: copy('referenceLabel'),
              }),
            }))}
            onValueChange={(value) => {
              resetCommand();
              setCompanyId(value);
            }}
          />

          <label htmlFor="context-access-bundle">{copy('bundleLabel')}</label>
          <Select
            id="context-access-bundle"
            value={bundle}
            disabled={busy}
            options={[
              { value: 'ideas-reader', label: ideasCopy('reader') },
              { value: 'ideas-recorder', label: ideasCopy('recorder') },
              { value: 'ideas-reviewer', label: ideasCopy('reviewer') },
              { value: 'company-context', label: copy('companyContextBundle') },
              {
                value: 'commercial-intake',
                label: copy('commercialIntakeBundle'),
              },
              {
                value: 'service-catalogue',
                label: copy('serviceCatalogueBundle'),
              },
              {
                value: 'pricing-configuration',
                label: copy('pricingConfigurationBundle'),
              },
              {
                value: 'profitability-contributor',
                label: profitabilityCopy('contributorBundle'),
              },
              {
                value: 'profitability-director',
                label: profitabilityCopy('directorBundle'),
              },
              {
                value: 'operational-risk-reader',
                label: riskCopy('readerBundle'),
              },
              {
                value: 'operational-risk-recorder',
                label: riskCopy('recorderBundle'),
              },
              { value: 'pricing-user', label: copy('pricingUserBundle') },
              { value: 'offer-preparer', label: copy('offerPreparerBundle') },
              {
                value: 'mission-plan-configuration',
                label: missionPlanCopy('configBundle'),
              },
              {
                value: 'mission-plan-user',
                label: missionPlanCopy('userBundle'),
              },
              { value: 'offer-model-editor', label: modelCopy('editorBundle') },
              {
                value: 'offer-model-approver',
                label: modelCopy('approverBundle'),
              },
              {
                value: 'contract-model-editor',
                label: contractModelCopy('editorBundle'),
              },
              {
                value: 'contract-model-approver',
                label: contractModelCopy('approverBundle'),
              },
              {
                value: 'contract-preparer',
                label: copy('contractPreparerBundle'),
              },
              {
                value: 'contract-early-preparation',
                label: copy('contractEarlyPreparationBundle'),
              },
              { value: 'contract-approver', label: decisionCopy('bundle') },
              { value: 'offer-approver', label: copy('offerApproverBundle') },
              {
                value: 'pricing-adjustment',
                label: copy('pricingAdjustmentBundle'),
              },
              {
                value: 'commercial-activity-reader',
                label: copy('commercialActivityReaderBundle'),
              },
              {
                value: 'opportunity-manager',
                label: copy('opportunityManagerBundle'),
              },
              {
                value: 'sales-stage-configuration',
                label: stageCopy('configurationBundle'),
              },
              { value: 'project-template-user', label: templateCopy('bundle') },
              {
                value: 'project-template-configuration',
                label: templateVersionCopy('bundle'),
              },
              {
                value: 'project-stage-advancer',
                label: projectStageCopy('bundle'),
              },
              { value: 'director-client', label: copy('directorClientBundle') },
              {
                value: 'document-project-organizer',
                label: copy('documentProjectOrganizerBundle'),
              },
              {
                value: 'document-registrar',
                label: copy('documentRegistrarBundle'),
              },
              {
                value: 'contract-signature-declarer',
                label: signingCopy('bundle'),
              },
              {
                value: 'received-contract-access',
                label: receivedCopy.t('bundle'),
              },
              {
                value: 'mission-deliverable-access',
                label: missionCopy.t('bundle'),
              },
              {
                value: 'document-content-reader',
                label: pdfCopy.t('readerBundle'),
              },
              {
                value: 'document-content-uploader',
                label: pdfCopy.t('uploaderBundle'),
              },
              {
                value: 'document-approver',
                label: copy('documentApproverBundle'),
              },
              { value: 'project', label: copy('projectBundle') },
              {
                value: 'project-approver',
                label: copy('projectApproverBundle'),
              },
              { value: 'task-manager', label: copy('taskManagerBundle') },
              {
                value: 'mission-result-reviewer',
                label: reviewCopy('bundle'),
              },
              {
                value: 'task-result-recorder',
                label: taskResultCopy.t('bundle'),
              },
            ]}
            onValueChange={(value) => {
              resetCommand();
              if (
                value === 'ideas-reader' ||
                value === 'ideas-recorder' ||
                value === 'ideas-reviewer' ||
                value === 'profitability-contributor' ||
                value === 'profitability-director' ||
                value === 'operational-risk-reader' ||
                value === 'operational-risk-recorder' ||
                value === 'task-manager' ||
                value === 'mission-result-reviewer' ||
                value === 'task-result-recorder' ||
                value === 'commercial-intake' ||
                value === 'service-catalogue' ||
                value === 'pricing-configuration' ||
                value === 'pricing-user' ||
                value === 'offer-preparer' ||
                value === 'mission-plan-configuration' ||
                value === 'mission-plan-user' ||
                value === 'contract-model-editor' ||
                value === 'contract-model-approver' ||
                value === 'offer-model-editor' ||
                value === 'offer-model-approver' ||
                value === 'contract-preparer' ||
                value === 'contract-early-preparation' ||
                value === 'contract-approver' ||
                value === 'offer-approver' ||
                value === 'pricing-adjustment' ||
                value === 'commercial-activity-reader' ||
                value === 'opportunity-manager' ||
                value === 'sales-stage-configuration' ||
                value === 'project-template-user' ||
                value === 'project-template-configuration' ||
                value === 'project-stage-advancer' ||
                value === 'company-context' ||
                value === 'director-client' ||
                value === 'document-project-organizer' ||
                value === 'contract-signature-declarer' ||
                value === 'received-contract-access' ||
                value === 'mission-deliverable-access' ||
                value === 'document-registrar' ||
                value === 'project' ||
                value === 'document-content-reader' ||
                value === 'document-content-uploader' ||
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
          {bundle === 'operational-risk-reader' && (
            <p>{riskCopy('readerPrerequisites')}</p>
          )}
          {bundle === 'operational-risk-recorder' && (
            <p>{riskCopy('recorderPrerequisites')}</p>
          )}
          {bundle === 'task-manager' && (
            <p>{copy('taskManagerPrerequisites')}</p>
          )}
          {bundle === 'mission-result-reviewer' && (
            <p>{reviewCopy('prerequisites')}</p>
          )}
          {bundle === 'task-result-recorder' && (
            <p>{taskResultCopy.t('prerequisites')}</p>
          )}
          {bundle === 'commercial-activity-reader' && (
            <p>{copy('commercialActivityReaderPrerequisites')}</p>
          )}
          {bundle === 'pricing-configuration' && (
            <p>{copy('pricingConfigurationPrerequisites')}</p>
          )}
          {bundle === 'project-approver' && (
            <p>{copy('projectApproverPrerequisites')}</p>
          )}
          {bundle === 'contract-signature-declarer' && (
            <p>{signingCopy('prerequisites')}</p>
          )}
          {bundle === 'received-contract-access' && (
            <p>{receivedCopy.t('prerequisites')}</p>
          )}
          {bundle === 'mission-deliverable-access' && (
            <p>{missionCopy.t('prerequisites')}</p>
          )}
          {bundle === 'document-content-reader' && (
            <p>{pdfCopy.t('readerPrerequisites')}</p>
          )}
          {bundle === 'document-content-uploader' && (
            <p>{pdfCopy.t('uploaderPrerequisites')}</p>
          )}
          {bundle === 'document-approver' && (
            <p>{copy('documentApproverPrerequisites')}</p>
          )}
          {bundle === 'pricing-user' && (
            <p>{copy('pricingUserPrerequisites')}</p>
          )}
          {bundle === 'contract-preparer' && (
            <p>{copy('contractPreparerPrerequisites')}</p>
          )}
          {bundle === 'contract-early-preparation' && (
            <p>{copy('contractEarlyPreparationPrerequisites')}</p>
          )}
          {bundle === 'contract-approver' && (
            <p>{decisionCopy('prerequisites')}</p>
          )}
          {bundle === 'offer-preparer' && (
            <p>{copy('offerPreparerPrerequisites')}</p>
          )}
          {bundle === 'mission-plan-configuration' && (
            <p>{missionPlanCopy('configHelp')}</p>
          )}
          {bundle === 'mission-plan-user' && (
            <p>{missionPlanCopy('userHelp')}</p>
          )}
          {bundle === 'offer-model-editor' && (
            <p>{modelCopy('editorPrerequisites')}</p>
          )}
          {bundle === 'offer-model-approver' && (
            <p>{modelCopy('approverPrerequisites')}</p>
          )}
          {bundle === 'contract-model-editor' && (
            <p>{contractModelCopy('editorPrerequisites')}</p>
          )}
          {bundle === 'contract-model-approver' && (
            <p>{contractModelCopy('approverPrerequisites')}</p>
          )}
          {bundle === 'offer-approver' && (
            <p>{copy('offerApproverPrerequisites')}</p>
          )}
          {bundle === 'opportunity-manager' && (
            <p>{copy('opportunityManagerPrerequisites')}</p>
          )}
          {bundle === 'project-stage-advancer' && (
            <p>{projectStageCopy('prerequisites')}</p>
          )}
          {bundle === 'project-template-configuration' && (
            <p>{templateVersionCopy('prerequisites')}</p>
          )}
          {bundle === 'project-template-user' && (
            <p>{templateCopy('prerequisites')}</p>
          )}
          {bundle === 'sales-stage-configuration' && (
            <p>{stageCopy('configurationPrerequisites')}</p>
          )}
          {bundle === 'pricing-adjustment' && (
            <p>{copy('pricingAdjustmentPrerequisites')}</p>
          )}
          {workspaceMembershipId && companyId && (
            <p role="status">
              {copy('currentStateLabel')}:{' '}
              <strong>
                {!activeAssignment
                  ? copy('currentStateNotGranted')
                  : capturedVersion === null
                    ? copy('currentStateGranted')
                    : formatMessage(copy('currentStateGrantedVersion'), {
                        version: capturedVersion,
                      })}
              </strong>
            </p>
          )}
          {capturedVersion !== null && (
            <p>{copy('capturedVersionExplanation')}</p>
          )}

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
            {copy('grant')}
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
            {copy('revoke')}
          </button>
        </form>
      )}
      {mutation.status === 'ready' && (
        <p role="status">
          {mutation.submission === 'grant' ? copy('granted') : copy('revoked')}
        </p>
      )}
      {unresolved && <p role="alert">{copy('error')}</p>}
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
          label: disambiguatedLabel({
            label: memberLabel(member),
            id: member.workspaceMembershipId,
            duplicates: duplicateMemberLabels,
            referenceLabel: copy('referenceLabel'),
          }),
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
  const labels = {
    'mission-plan-configuration': 'Company Mission Plan Configuration',
    'mission-plan-user': 'Company Mission Plan User',
    'contract-model-editor': 'Company Contract Model Editor',
    'contract-model-approver': 'Company Contract Model Approver',
    'offer-model-editor': 'Company Offer Model Editor',
    'offer-model-approver': 'Company Offer Model Approver',
    'ideas-reader': 'Company Ideas Reader',
    'ideas-recorder': 'Company Ideas Recorder',
    'ideas-reviewer': 'Company Ideas Reviewer',
    'operational-risk-reader': 'Company Operational Risk Reader',
    'operational-risk-recorder': 'Company Operational Risk Recorder',
    'profitability-contributor': 'Company Profitability Contributor',
    'profitability-director': 'Company Profitability Director',
    'commercial-intake': 'Company Commercial Intake',
    'service-catalogue': 'Company Service Catalogue',
    'pricing-configuration': 'Company Pricing Configuration',
    'pricing-user': 'Company Pricing User',
    'offer-preparer': 'Company Offer Preparer',
    'contract-preparer': 'Company Contract Preparer',
    'contract-early-preparation': 'Company Contract Early Preparation',
    'contract-approver': 'Company Contract Approver',
    'offer-approver': 'Company Offer Approver',
    'pricing-adjustment': 'Company Pricing Adjustment',
    'commercial-activity-reader': 'Company Commercial Activity Reader',
    'opportunity-manager': 'Company Opportunity Manager',
    'sales-stage-configuration': 'Company Sales Stage Configuration',
    'project-template-user': 'Company Project Template User',
    'project-template-configuration': 'Company Project Template Configuration',
    'project-stage-advancer': 'Company Project Stage Advancer',
    'task-manager': 'Company Task Manager',
    'mission-result-reviewer': 'Company Mission Result Reviewer',
    'task-result-recorder': 'Company Task Result Recorder',
    'document-project-organizer': 'Company Document Project Organizer',
    'document-registrar': 'Company Document Registrar',
    'mission-deliverable-access': 'Company Mission Deliverable Access',
    'contract-signature-declarer': 'Company Contract Signature Declarer',
    'received-contract-access': 'Company Received Contract Access',
    'document-content-reader': 'Company Document Content Reader',
    'document-content-uploader': 'Company Document Content Uploader',
    'document-approver': 'Company Document Approver',
    project: 'Company Project Access',
    'project-approver': 'Company Project Approver',
    'director-client': 'Company Director Client Access',
    'company-context': 'Company Context Access',
  } satisfies Record<AssignmentBundle, AssignmentBundleLabel>;
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

function disambiguatedLabel({
  label,
  id,
  duplicates,
  referenceLabel,
}: {
  label: string;
  id: string;
  duplicates: ReadonlySet<string>;
  referenceLabel: string;
}): string {
  if (!duplicates.has(label)) return label;
  return `${label} — ${referenceLabel} ${stableReference(id)}`;
}

function stableReference(id: string): string {
  return BigInt(`0x${id.replaceAll('-', '')}`)
    .toString(36)
    .toUpperCase();
}
