import { Controller, Inject, Injectable, UseGuards } from '@nestjs/common';
import { ActorContextAdapter } from '../access/actor-context.adapter.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { CompanyModelAccessService } from '../access/company-model-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { CompanyModelController } from '../company-model/company-model.controller.js';
import { companyModelKind } from '../company-model/company-model.kind.js';
import { CompanyModelService } from '../company-model/company-model.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  contractModelCommands,
  contractModelDecisions,
  contractModels,
  contractModelVersions,
  contractModelWithdrawals,
} from '../database/schema/index.js';
import {
  CONTRACT_MODEL_CODE,
  CONTRACT_MODEL_LANGUAGE,
  contractModelFields,
  readContractModelContent,
  type ContractModelContent,
} from './contract-model.content.js';

/** The Company Contract model: the consulting Contract structure a Contract copies. */
export const CONTRACT_MODEL = companyModelKind({
  noun: 'Contract',
  codePrefix: 'CONTRACT_MODEL',
  lockName: 'contract-model',
  identity: {
    code: CONTRACT_MODEL_CODE,
    kind: 'CONTRACT',
    language: CONTRACT_MODEL_LANGUAGE,
  },
  tables: {
    models: contractModels,
    versions: contractModelVersions,
    decisions: contractModelDecisions,
    withdrawals: contractModelWithdrawals,
    commands: contractModelCommands,
  },
  fields: contractModelFields,
  parsedIntentReceipts: true,
  authority: 'contractModel',
  selection: {
    kind: 'APPROVED_COMPANY_CONTRACT_MODEL',
    permissions: [
      'commercial.contract.prepare',
      'commercial.contract.model.select',
    ],
  },
  readContent: (value): ContractModelContent => readContractModelContent(value),
  recordEvent: (accountability, { step, ...event }) =>
    accountability.recordContractModelEvent({
      ...event,
      action: `contract_model.version.${step}`,
    }),
});

@Injectable()
export class ContractModelService extends CompanyModelService<
  ContractModelContent,
  typeof CONTRACT_MODEL.identity,
  typeof CONTRACT_MODEL.selection.kind
> {
  constructor(
    database: DatabaseContext,
    access: CompanyModelAccessService,
    authorization: CompanyContextAuthorization,
    accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) clock: ServerClock,
  ) {
    super(CONTRACT_MODEL, {
      database,
      access,
      authorization,
      accountability,
      clock,
    });
  }
}

@Controller('contract-models/consulting-ro')
@UseGuards(ActorContextAdapter)
export class ContractModelController extends CompanyModelController<
  ContractModelContent,
  typeof CONTRACT_MODEL.identity,
  typeof CONTRACT_MODEL.selection.kind
> {
  constructor(models: ContractModelService) {
    super(models);
  }
}
