import { ideasMessages } from '../ideas/ideas.copy';
import { companyAssignmentMessages } from '../access/company-assignment-localization.copy';
import { workspaceMembershipSuspensionMessages } from '../access/workspace-membership-suspension.copy';
import { contractDecisionMessages } from '../contract/contract-decision.copy';
import { contractQualityMessages } from '../contract/contract-quality.copy';
import { contractMessages } from '../contract/contract.copy';
import { clientRegistrationMessages } from '../client/client-registration.copy';
import { clientContactEditorMessages } from '../client/client-contact-editor.copy';
import { pricingConfigurationMessages } from '../pricing-configuration/pricing-configuration.copy';
import { tariffVersionMessages } from '../pricing-configuration/tariff-version.copy';
import { localInstantMessages } from '../pricing-configuration/local-instant.copy';
import { pricingSnapshotMessages } from '../pricing-configuration/pricing-snapshot.copy';
import { contractSignatureMessages } from '../contract/contract-signature.copy';
import { clientLegalEntitiesMessages } from '../client/client-legal-entities.copy';
import { contractProjectsMessages } from '../contract/contract-projects.copy';
import { contractProjectCreateMessages } from '../contract/contract-project-create.copy';
import { contractPrecontractMessages } from '../contract/contract-precontract.copy';
import { contractRuleSetMessages } from '../contract/contract-rule-set.copy';
import { documentPdfMessages } from '../documents/document-pdf.copy';
import { documentsMessages } from '../documents/documents.copy';
import { documentVersionsMessages } from '../documents/document-versions.copy';
import { documentCorrectionHistoryMessages } from '../documents/document-correction-history.copy';
import { offerBindingMessages } from '../offer/offer-binding.copy';
import { offerPreparationMessages } from '../offer/offer-preparation.copy';
import { offerQualityDecisionMessages } from '../offer/offer-quality-decision.copy';
import { offerTransmissionResponseMessages } from '../offer/offer-transmission-response.copy';
import { profitabilityMessages } from '../profitability-estimate/profitability.copy';
import { commercialRequestMessages } from '../commercial-intake/commercial-request.copy';
import { opportunityOutcomeMessages } from '../commercial-intake/opportunity-outcome.copy';
import { salesStageMessages } from '../commercial-intake/sales-stage.copy';
import { clientDirectoryMessages } from '../client/client-directory.copy';
import { clientDossierMessages } from '../client/client-dossier.copy';
import { clientDuplicateReviewMessages } from '../client/client-duplicate-review.copy';
import { clientCorrectionHistoryMessages } from '../client/client-correction-history.copy';
import { clientUnionHistoryMessages } from '../client/client-union-history.copy';
import { clientUnionConfirmationMessages } from '../client/client-union-confirmation.copy';
import { appMessages } from '../app.copy';
import { activityLogMessages } from '../production-shell/activity-log.copy';
import { companyContextMessages } from '../company/company-context.copy';
import { companyRegistrationMessages } from '../company/company-registration.copy';
import { projectTemplateMessages } from '../project/project-template.copy';
import { projectTaskMessages } from '../project/task.copy';
import { projectTemplateVersionMessages } from '../project/project-template-version.copy';
import { projectDocumentsMessages } from '../project/project-documents.copy';
import { projectStageMessages } from '../project/project-stage.copy';
import { upcomingDeadlinesMessages } from '../operational-home/upcoming-deadlines.copy';
import { recentChangesMessages } from '../operational-home/recent-changes.copy';
import { operationalHomeMessages } from '../operational-home/operational-home-localized.copy';
import { sessionRevocationMessages } from '../access/workspace-session-revocation.copy';
import { selectMessages } from '../presentation/select.copy';
import { myTasksMessages } from '../project/my-tasks-localized.copy';
import { fiberMessages } from '../production-shell/fiber/fiber.copy';
import { prismeMessages } from '../production-shell/prisme/prisme.copy';
import { serviceCatalogueMessages } from '../commercial-catalogue/service-catalogue.copy';
import { publicWelcomeMessages } from '../welcome/public-welcome.copy';
import { interfaceLocaleMessages } from './interface-locale.copy';
import { assertMessageCoverage } from './messages';

export function assertFirstJourneyTranslationCoverage(): void {
  assertMessageCoverage('ideas', ideasMessages);
  assertMessageCoverage('companyAssignment', companyAssignmentMessages);
  assertMessageCoverage('commercialRequest', commercialRequestMessages);
  assertMessageCoverage('opportunityOutcome', opportunityOutcomeMessages);
  assertMessageCoverage(
    'workspaceMembershipSuspension',
    workspaceMembershipSuspensionMessages,
  );
  assertMessageCoverage('contractDecision', contractDecisionMessages);
  assertMessageCoverage('contractQuality', contractQualityMessages);
  assertMessageCoverage('contract', contractMessages);
  assertMessageCoverage('clientRegistration', clientRegistrationMessages);
  assertMessageCoverage('clientContactEditor', clientContactEditorMessages);
  assertMessageCoverage('pricingConfiguration', pricingConfigurationMessages);
  assertMessageCoverage('tariffVersion', tariffVersionMessages);
  assertMessageCoverage('localInstant', localInstantMessages);
  assertMessageCoverage('pricingSnapshot', pricingSnapshotMessages);
  assertMessageCoverage('contractSignature', contractSignatureMessages);
  assertMessageCoverage('clientLegalEntities', clientLegalEntitiesMessages);
  assertMessageCoverage('contractProjects', contractProjectsMessages);
  assertMessageCoverage('contractProjectCreate', contractProjectCreateMessages);
  assertMessageCoverage('contractPrecontract', contractPrecontractMessages);
  assertMessageCoverage('contractRuleSet', contractRuleSetMessages);
  assertMessageCoverage('documentPdf', documentPdfMessages);
  assertMessageCoverage('documents', documentsMessages);
  assertMessageCoverage('documentVersions', documentVersionsMessages);
  assertMessageCoverage(
    'documentCorrectionHistory',
    documentCorrectionHistoryMessages,
  );
  assertMessageCoverage('offerBinding', offerBindingMessages);
  assertMessageCoverage('offerPreparation', offerPreparationMessages);
  assertMessageCoverage('offerQualityDecision', offerQualityDecisionMessages);
  assertMessageCoverage(
    'offerTransmissionResponse',
    offerTransmissionResponseMessages,
  );
  assertMessageCoverage('profitability', profitabilityMessages);
  assertMessageCoverage('salesStage', salesStageMessages);
  assertMessageCoverage('clientDirectory', clientDirectoryMessages);
  assertMessageCoverage('clientDossier', clientDossierMessages);
  assertMessageCoverage('clientUnionHistory', clientUnionHistoryMessages);
  assertMessageCoverage(
    'clientUnionConfirmation',
    clientUnionConfirmationMessages,
  );
  assertMessageCoverage('clientDuplicateReview', clientDuplicateReviewMessages);
  assertMessageCoverage(
    'clientCorrectionHistory',
    clientCorrectionHistoryMessages,
  );
  assertMessageCoverage('app', appMessages);
  assertMessageCoverage('activityLog', activityLogMessages);
  assertMessageCoverage('interfaceLocale', interfaceLocaleMessages);
  assertMessageCoverage('serviceCatalogue', serviceCatalogueMessages);
  assertMessageCoverage('publicWelcome', publicWelcomeMessages);
  assertMessageCoverage('prisme', prismeMessages);
  assertMessageCoverage('myTasks', myTasksMessages);
  assertMessageCoverage('fiber', fiberMessages);
  assertMessageCoverage('companyContext', companyContextMessages);
  assertMessageCoverage('companyRegistration', companyRegistrationMessages);
  assertMessageCoverage('projectTemplate', projectTemplateMessages);
  assertMessageCoverage('projectTask', projectTaskMessages);
  assertMessageCoverage(
    'projectTemplateVersion',
    projectTemplateVersionMessages,
  );
  assertMessageCoverage('projectDocuments', projectDocumentsMessages);
  assertMessageCoverage('projectStage', projectStageMessages);
  assertMessageCoverage('operationalHome', operationalHomeMessages);
  assertMessageCoverage('recentChanges', recentChangesMessages);
  assertMessageCoverage('upcomingDeadlines', upcomingDeadlinesMessages);
  assertMessageCoverage('sessionRevocation', sessionRevocationMessages);
  assertMessageCoverage('select', selectMessages);
}
