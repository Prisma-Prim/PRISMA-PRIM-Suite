import { useCertificationCopy } from '../certification/certification.copy';
import { useSalesStageCopy } from '../commercial-intake/sales-stage.copy';
import { useContractModelCopy } from '../contract-model/contract-model.copy';
import { useContractDecisionCopy } from '../contract/contract-decision.copy';
import { useReportedSigningCopy } from '../contract/reported-signing.copy';
import { useDocumentPdfCopy } from '../documents/document-pdf.copy';
import { useMissionDeliverableCopy } from '../documents/mission-deliverable.copy';
import { useReceivedAddendumCopy } from '../documents/received-addendum.copy';
import { useReceivedContractCopy } from '../documents/received-contract.copy';
import { useIdeasCopy } from '../ideas/ideas.copy';
import { useInternalTaskCopy } from '../internal-task/internal-task.copy';
import { useMissionPlanCopy } from '../mission-plan/mission-plan.copy';
import { useOfferModelCopy } from '../offer-model/offer-model.copy';
import { useOperationalRiskCopy } from '../operational-risk/operational-risk.copy';
import { useProfitabilityCopy } from '../profitability-estimate/profitability.copy';
import { useMissionApplicabilityCopy } from '../project/mission-applicability.copy';
import { useMissionReviewCopy } from '../project/mission-result-review.copy';
import { useProjectNextActionCopy } from '../project/project-next-action.copy';
import { useProjectStageCopy } from '../project/project-stage.copy';
import { useProjectTemplateVersionCopy } from '../project/project-template-version.copy';
import { useProjectTemplateCopy } from '../project/project-template.copy';
import { useTaskResultCopy } from '../project/task-results.copy';
import type { AssignmentBundle } from './assignment-bundles';
import { useCompanyAssignmentCopy } from './company-assignment-localization.copy';
import { useExternalInvoiceAssignmentCopy } from './external-invoice-assignment.copy';
import { usePaymentAssignmentCopy } from './payment-assignment.copy';

/** One grantable bundle as the administration offers it, in the interface language. */
export type AssignmentBundleOption = Readonly<{
  bundle: AssignmentBundle;
  label: string;
  /** What the bundle grants and what must be authorized separately, when stated. */
  prerequisites: string | undefined;
}>;

/**
 * Every administrable bundle in the order the administration offers them,
 * with its label and stated prerequisites. Both interfaces read this list.
 */
export function useAssignmentBundleCatalogue(): readonly AssignmentBundleOption[] {
  const copy = useCompanyAssignmentCopy();
  const internalTaskCopy = useInternalTaskCopy();
  const externalInvoiceCopy = useExternalInvoiceAssignmentCopy();
  const paymentCopy = usePaymentAssignmentCopy();
  const ideasCopy = useIdeasCopy();
  const certificationCopy = useCertificationCopy();
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
  const pdfCopy = useDocumentPdfCopy();
  const missionCopy = useMissionDeliverableCopy();
  const receivedCopy = useReceivedContractCopy();
  const addendumCopy = useReceivedAddendumCopy();
  const signingCopy = useReportedSigningCopy();
  const taskResultCopy = useTaskResultCopy();
  const reviewCopy = useMissionReviewCopy();
  const applicabilityCopy = useMissionApplicabilityCopy();
  const nextActionCopy = useProjectNextActionCopy();
  const option = (
    bundle: AssignmentBundle,
    label: string,
    prerequisites?: string,
  ): AssignmentBundleOption => ({ bundle, label, prerequisites });
  const options = [
    option('ideas-reader', ideasCopy('reader')),
    option('ideas-recorder', ideasCopy('recorder')),
    option('ideas-reviewer', ideasCopy('reviewer')),
    option(
      'certification-reader',
      certificationCopy('readerBundle'),
      certificationCopy('readerPrerequisites'),
    ),
    option(
      'certification-programme-manager',
      certificationCopy('managerBundle'),
      certificationCopy('managerPrerequisites'),
    ),
    option(
      'certification-approver',
      certificationCopy('approverBundle'),
      certificationCopy('approverPrerequisites'),
    ),
    option(
      'certification-auditor',
      certificationCopy('auditorBundle'),
      certificationCopy('auditorPrerequisites'),
    ),
    option('company-context', copy('companyContextBundle')),
    option('commercial-intake', copy('commercialIntakeBundle')),
    option('service-catalogue', copy('serviceCatalogueBundle')),
    option(
      'pricing-configuration',
      copy('pricingConfigurationBundle'),
      copy('pricingConfigurationPrerequisites'),
    ),
    option(
      'profitability-contributor',
      profitabilityCopy('contributorBundle'),
      profitabilityCopy('contributorPrerequisites'),
    ),
    option(
      'profitability-director',
      profitabilityCopy('directorBundle'),
      profitabilityCopy('directorPrerequisites'),
    ),
    option(
      'operational-risk-reader',
      riskCopy('readerBundle'),
      riskCopy('readerPrerequisites'),
    ),
    option(
      'operational-risk-recorder',
      riskCopy('recorderBundle'),
      riskCopy('recorderPrerequisites'),
    ),
    option(
      'pricing-user',
      copy('pricingUserBundle'),
      copy('pricingUserPrerequisites'),
    ),
    option(
      'offer-preparer',
      copy('offerPreparerBundle'),
      copy('offerPreparerPrerequisites'),
    ),
    option(
      'mission-plan-configuration',
      missionPlanCopy('configBundle'),
      missionPlanCopy('configHelp'),
    ),
    option(
      'mission-plan-user',
      missionPlanCopy('userBundle'),
      missionPlanCopy('userHelp'),
    ),
    option(
      'offer-model-editor',
      modelCopy('editorBundle'),
      modelCopy('editorPrerequisites'),
    ),
    option(
      'offer-model-approver',
      modelCopy('approverBundle'),
      modelCopy('approverPrerequisites'),
    ),
    option(
      'contract-model-editor',
      contractModelCopy('editorBundle'),
      contractModelCopy('editorPrerequisites'),
    ),
    option(
      'contract-model-approver',
      contractModelCopy('approverBundle'),
      contractModelCopy('approverPrerequisites'),
    ),
    option(
      'contract-preparer',
      copy('contractPreparerBundle'),
      copy('contractPreparerPrerequisites'),
    ),
    option(
      'contract-early-preparation',
      copy('contractEarlyPreparationBundle'),
      copy('contractEarlyPreparationPrerequisites'),
    ),
    option(
      'contract-approver',
      decisionCopy('bundle'),
      decisionCopy('prerequisites'),
    ),
    option(
      'offer-approver',
      copy('offerApproverBundle'),
      copy('offerApproverPrerequisites'),
    ),
    option(
      'pricing-adjustment',
      copy('pricingAdjustmentBundle'),
      copy('pricingAdjustmentPrerequisites'),
    ),
    option(
      'commercial-activity-reader',
      copy('commercialActivityReaderBundle'),
      copy('commercialActivityReaderPrerequisites'),
    ),
    option(
      'opportunity-manager',
      copy('opportunityManagerBundle'),
      copy('opportunityManagerPrerequisites'),
    ),
    option(
      'sales-stage-configuration',
      stageCopy('configurationBundle'),
      stageCopy('configurationPrerequisites'),
    ),
    option(
      'project-template-user',
      templateCopy('bundle'),
      templateCopy('prerequisites'),
    ),
    option(
      'project-template-configuration',
      templateVersionCopy('bundle'),
      templateVersionCopy('prerequisites'),
    ),
    option(
      'project-stage-advancer',
      projectStageCopy('bundle'),
      projectStageCopy('prerequisites'),
    ),
    option(
      'payment-reader',
      paymentCopy('readerBundle'),
      paymentCopy('prerequisites'),
    ),
    option(
      'payment-recorder',
      paymentCopy('recorderBundle'),
      paymentCopy('prerequisites'),
    ),
    option(
      'payment-confirmer',
      paymentCopy('confirmerBundle'),
      paymentCopy('prerequisites'),
    ),
    option(
      'payment-reverser',
      paymentCopy('reverserBundle'),
      paymentCopy('prerequisites'),
    ),
    option(
      'payment-evidence-access',
      paymentCopy('familyBundle'),
      paymentCopy('prerequisites'),
    ),
    option(
      'invoice-reader',
      externalInvoiceCopy('readerBundle'),
      externalInvoiceCopy('prerequisites'),
    ),
    option(
      'invoice-recorder',
      externalInvoiceCopy('recorderBundle'),
      externalInvoiceCopy('prerequisites'),
    ),
    option(
      'external-invoice-access',
      externalInvoiceCopy('familyBundle'),
      externalInvoiceCopy('prerequisites'),
    ),
    option('director-client', copy('directorClientBundle')),
    option(
      'document-project-organizer',
      copy('documentProjectOrganizerBundle'),
    ),
    option('document-registrar', copy('documentRegistrarBundle')),
    option(
      'contract-signature-declarer',
      signingCopy('bundle'),
      signingCopy('prerequisites'),
    ),
    option(
      'working-evidence-case-reader',
      copy('workingEvidenceCaseReaderBundle'),
      copy('workingEvidenceCaseReaderPrerequisites'),
    ),
    option(
      'working-evidence-case-recorder',
      copy('workingEvidenceCaseRecorderBundle'),
      copy('workingEvidenceCaseRecorderPrerequisites'),
    ),
    option(
      'received-audit-source-access',
      copy('receivedAuditSourceAccessBundle'),
      copy('receivedAuditSourceAccessPrerequisites'),
    ),
    option(
      'received-addendum-access',
      addendumCopy.t('bundle'),
      addendumCopy.t('prerequisites'),
    ),
    option(
      'received-contract-access',
      receivedCopy.t('bundle'),
      receivedCopy.t('prerequisites'),
    ),
    option(
      'mission-deliverable-access',
      missionCopy.t('bundle'),
      missionCopy.t('prerequisites'),
    ),
    option(
      'document-content-reader',
      pdfCopy.t('readerBundle'),
      pdfCopy.t('readerPrerequisites'),
    ),
    option(
      'document-content-uploader',
      pdfCopy.t('uploaderBundle'),
      pdfCopy.t('uploaderPrerequisites'),
    ),
    option(
      'document-approver',
      copy('documentApproverBundle'),
      copy('documentApproverPrerequisites'),
    ),
    option('project', copy('projectBundle')),
    option(
      'project-approver',
      copy('projectApproverBundle'),
      copy('projectApproverPrerequisites'),
    ),
    option(
      'internal-task-manager',
      internalTaskCopy('bundle'),
      internalTaskCopy('prerequisites'),
    ),
    option(
      'task-manager',
      copy('taskManagerBundle'),
      copy('taskManagerPrerequisites'),
    ),
    option('project-next-action-coordinator', nextActionCopy('bundle')),
    option(
      'mission-applicability-coordinator',
      applicabilityCopy('coordinatorBundle'),
      applicabilityCopy('grantPrerequisites'),
    ),
    option(
      'mission-applicability-approver',
      applicabilityCopy('approverBundle'),
      applicabilityCopy('grantPrerequisites'),
    ),
    option(
      'mission-result-reviewer',
      reviewCopy('bundle'),
      reviewCopy('prerequisites'),
    ),
    option(
      'task-result-recorder',
      taskResultCopy.t('bundle'),
      taskResultCopy.t('prerequisites'),
    ),
    option(
      'opportunity-follow-up-coordinator',
      copy('opportunityFollowUpCoordinatorBundle'),
      copy('opportunityFollowUpCoordinatorPrerequisites'),
    ),
  ];
  return options;
}
