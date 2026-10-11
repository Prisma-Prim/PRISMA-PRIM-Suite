import { contractDecisionMessages } from '../contract/contract-decision.copy';
import { contractSignatureMessages } from '../contract/contract-signature.copy';
import { contractProjectsMessages } from '../contract/contract-projects.copy';
import { contractProjectCreateMessages } from '../contract/contract-project-create.copy';
import { contractPrecontractMessages } from '../contract/contract-precontract.copy';
import { profitabilityMessages } from '../profitability-estimate/profitability.copy';
import { appMessages } from '../app.copy';
import { companyContextMessages } from '../company/company-context.copy';
import { companyRegistrationMessages } from '../company/company-registration.copy';
import { operationalHomeMessages } from '../operational-home/operational-home-localized.copy';
import { selectMessages } from '../presentation/select.copy';
import { fiberMessages } from '../production-shell/fiber/fiber.copy';
import { prismeMessages } from '../production-shell/prisme/prisme.copy';
import { publicWelcomeMessages } from '../welcome/public-welcome.copy';
import { interfaceLocaleMessages } from './interface-locale.copy';
import { assertMessageCoverage } from './messages';

export function assertFirstJourneyTranslationCoverage(): void {
  assertMessageCoverage('contractDecision', contractDecisionMessages);
  assertMessageCoverage('contractSignature', contractSignatureMessages);
  assertMessageCoverage('contractProjects', contractProjectsMessages);
  assertMessageCoverage('contractProjectCreate', contractProjectCreateMessages);
  assertMessageCoverage('contractPrecontract', contractPrecontractMessages);
  assertMessageCoverage('profitability', profitabilityMessages);
  assertMessageCoverage('app', appMessages);
  assertMessageCoverage('interfaceLocale', interfaceLocaleMessages);
  assertMessageCoverage('publicWelcome', publicWelcomeMessages);
  assertMessageCoverage('prisme', prismeMessages);
  assertMessageCoverage('fiber', fiberMessages);
  assertMessageCoverage('companyContext', companyContextMessages);
  assertMessageCoverage('companyRegistration', companyRegistrationMessages);
  assertMessageCoverage('operationalHome', operationalHomeMessages);
  assertMessageCoverage('select', selectMessages);
}
