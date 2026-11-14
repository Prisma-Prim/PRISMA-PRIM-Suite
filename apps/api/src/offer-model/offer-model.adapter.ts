import {
  Controller,
  Get,
  Inject,
  Injectable,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { CompanyModelAccessService } from '../access/company-model-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { CompanyModelController } from '../company-model/company-model.controller.js';
import { companyModelKind } from '../company-model/company-model.kind.js';
import { CompanyModelService } from '../company-model/company-model.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  offerModelCommands,
  offerModelDecisions,
  offerModels,
  offerModelVersions,
  offerModelWithdrawals,
} from '../database/schema/index.js';
import {
  OFFER_MODEL_CODE,
  OFFER_MODEL_LANGUAGE,
  offerModelFields,
  readOfferModelContent,
  type OfferModelContent,
} from './offer-model.content.js';

/** The Company Offer model: the consulting Offer structure an Offer copies. */
export const OFFER_MODEL = companyModelKind({
  noun: 'Offer',
  codePrefix: 'OFFER_MODEL',
  lockName: 'offer-model',
  identity: { code: OFFER_MODEL_CODE, language: OFFER_MODEL_LANGUAGE },
  tables: {
    models: offerModels,
    versions: offerModelVersions,
    decisions: offerModelDecisions,
    withdrawals: offerModelWithdrawals,
    commands: offerModelCommands,
  },
  fields: offerModelFields,
  parsedIntentReceipts: false,
  authority: 'offerModel',
  selection: {
    kind: 'APPROVED_COMPANY_OFFER_MODEL',
    permissions: ['commercial.offer.model.select'],
  },
  readContent: (value): OfferModelContent => readOfferModelContent(value),
  recordEvent: (accountability, { step, ...event }) =>
    accountability.recordOfferModelEvent({
      ...event,
      action: `offer_model.version.${step}`,
    }),
});

@Injectable()
export class OfferModelService extends CompanyModelService<
  OfferModelContent,
  typeof OFFER_MODEL.identity,
  typeof OFFER_MODEL.selection.kind
> {
  constructor(
    database: DatabaseContext,
    access: CompanyModelAccessService,
    authorization: CompanyContextAuthorization,
    accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) clock: ServerClock,
  ) {
    super(OFFER_MODEL, {
      database,
      access,
      authorization,
      accountability,
      clock,
    });
  }
}

@Controller('offer-models/consulting-ro')
@UseGuards(ActorContextAdapter)
export class OfferModelController extends CompanyModelController<
  OfferModelContent,
  typeof OFFER_MODEL.identity,
  typeof OFFER_MODEL.selection.kind
> {
  constructor(models: OfferModelService) {
    super(models);
  }

  @Get('for-offer')
  readSelectionForOffer(@Req() request: ActorContextRequest) {
    return this.models.readSelection({ actor: requireActorContext(request) });
  }
}
