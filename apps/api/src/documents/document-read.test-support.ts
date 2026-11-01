import { ExternalInvoiceRelationsService } from './external-invoice-relations.service.js';
import { ContractExternalInvoiceReferenceService } from '../contract/contract-external-invoice-reference.service.js';
import { CommercialResponsibleAccessService } from '../access/commercial-responsible-access.service.js';
import type { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { AccountabilityService } from '../accountability/accountability.service.js';
import type { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { ContractDocumentReferenceService } from '../contract/contract-document-reference.service.js';
import type { DatabaseContext } from '../database/database-context.js';
import { SalesStageService } from '../sales-stage/sales-stage.service.js';
import { ReceivedContractRelationsService } from './received-contract-relations.service.js';

/** Real reference owners for the existing metadata-only public service seam. */
export function receivedContractRelationsForTest(input: {
  context: DatabaseContext;
  authorization: CompanyContextAuthorization;
  clients: ClientOperationalReferenceService;
  accountability: AccountabilityService;
}) {
  const { context, authorization, clients, accountability } = input;
  return new ReceivedContractRelationsService(
    context,
    new ContractDocumentReferenceService(
      context,
      authorization,
      new CommercialIntakeService(
        context,
        authorization,
        clients,
        accountability,
        new CommercialResponsibleAccessService(context),
        new SalesStageService(context, authorization, accountability),
      ),
      clients,
    ),
  );
}

export function externalInvoiceRelationsForTest(
  input: Parameters<typeof receivedContractRelationsForTest>[0],
) {
  const { context, authorization, clients, accountability } = input;
  return new ExternalInvoiceRelationsService(
    context,
    new ContractExternalInvoiceReferenceService(
      context,
      authorization,
      new CommercialIntakeService(
        context,
        authorization,
        clients,
        accountability,
        new CommercialResponsibleAccessService(context),
        new SalesStageService(context, authorization, accountability),
      ),
      clients,
    ),
    authorization,
  );
}
