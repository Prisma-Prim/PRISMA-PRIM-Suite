import { workspaceMembershipSuspensionMessages } from '../access/workspace-membership-suspension.copy';
import { contractDecisionMessages } from '../contract/contract-decision.copy';
import { contractSignatureMessages } from '../contract/contract-signature.copy';
import { contractProjectsMessages } from '../contract/contract-projects.copy';
import { contractProjectCreateMessages } from '../contract/contract-project-create.copy';
import { contractPrecontractMessages } from '../contract/contract-precontract.copy';
import { contractRuleSetMessages } from '../contract/contract-rule-set.copy';
import { offerBindingMessages } from '../offer/offer-binding.copy';
import { profitabilityMessages } from '../profitability-estimate/profitability.copy';
import { commercialRequestMessages } from '../commercial-intake/commercial-request.copy';
import { opportunityOutcomeMessages } from '../commercial-intake/opportunity-outcome.copy';
import { salesStageMessages } from '../commercial-intake/sales-stage.copy';
import { clientDirectoryMessages } from '../client/client-directory.copy';
import { appMessages } from '../app.copy';
import { companyContextMessages } from '../company/company-context.copy';
import { companyRegistrationMessages } from '../company/company-registration.copy';
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
  assertMessageCoverage('commercialRequest', commercialRequestMessages);
  assertMessageCoverage('opportunityOutcome', opportunityOutcomeMessages);
  assertMessageCoverage(
    'workspaceMembershipSuspension',
    workspaceMembershipSuspensionMessages,
  );
  assertMessageCoverage('contractDecision', contractDecisionMessages);
  assertMessageCoverage('contractSignature', contractSignatureMessages);
  assertMessageCoverage('contractProjects', contractProjectsMessages);
  assertMessageCoverage('contractProjectCreate', contractProjectCreateMessages);
  assertMessageCoverage('contractPrecontract', contractPrecontractMessages);
  assertMessageCoverage('contractRuleSet', contractRuleSetMessages);
  assertMessageCoverage('offerBinding', offerBindingMessages);
  assertMessageCoverage('profitability', profitabilityMessages);
  assertMessageCoverage('salesStage', salesStageMessages);
  assertMessageCoverage('clientDirectory', clientDirectoryMessages);
  assertMessageCoverage('app', appMessages);
  assertMessageCoverage('interfaceLocale', interfaceLocaleMessages);
  assertMessageCoverage('serviceCatalogue', serviceCatalogueMessages);
  assertMessageCoverage('publicWelcome', publicWelcomeMessages);
  assertMessageCoverage('prisme', prismeMessages);
  assertMessageCoverage('myTasks', myTasksMessages);
  assertMessageCoverage('fiber', fiberMessages);
  assertMessageCoverage('companyContext', companyContextMessages);
  assertMessageCoverage('companyRegistration', companyRegistrationMessages);
  assertMessageCoverage('operationalHome', operationalHomeMessages);
  assertMessageCoverage('sessionRevocation', sessionRevocationMessages);
  assertMessageCoverage('select', selectMessages);
}
