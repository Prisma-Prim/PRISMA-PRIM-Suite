import type { ActorContext } from '../access-types';
import { companyModelAuthority } from '../company-model/company-model-authority';
import type { CompanyModelKind } from '../company-model/company-model-kind';
import {
  CompanyModelWorkspace,
  type CompanyModelWorkspaceProps,
} from '../company-model/CompanyModelWorkspace';
import {
  OFFER_MODEL_CODE,
  OFFER_MODEL_LANGUAGE,
  readOfferModelContent,
  type OfferModelContent,
} from './offer-model-content';
import { useOfferModelCopy } from './offer-model.copy';
import { OfferModelBody } from './OfferModelBody';
import {
  OfferModelFields,
  offerModelDraft,
  type OfferModelDraft,
} from './OfferModelFields';

/** The Company Offer model: the consulting Offer structure an Offer copies. */
export const OFFER_MODEL = {
  rootClass: 'offer-model-workspace',
  path: '/offer-models/consulting-ro',
  identity: { code: OFFER_MODEL_CODE, language: OFFER_MODEL_LANGUAGE },
  grants: {
    field: 'offerModelGrants',
    editor: {
      bundle: 'company_offer_model_editor',
      permissions: [
        'commercial.offer.model.read',
        'commercial.offer.model.version.create',
      ],
    },
    approver: {
      bundle: 'company_offer_model_approver',
      permissions: [
        'commercial.offer.model.read',
        'commercial.offer.model.decide',
        'commercial.offer.model.withdraw',
      ],
    },
  },
  readContent: readOfferModelContent,
  useCopy: useOfferModelCopy,
  useVersionKind: () => useOfferModelCopy()('language'),
  Body: OfferModelBody,
  draft: offerModelDraft,
  Fields: OfferModelFields,
} as const satisfies CompanyModelKind<OfferModelContent, OfferModelDraft>;

export function offerModelAuthority(actor: ActorContext) {
  return companyModelAuthority(actor, OFFER_MODEL.grants);
}

export function OfferModelWorkspace(props: CompanyModelWorkspaceProps) {
  return <CompanyModelWorkspace {...props} kind={OFFER_MODEL} />;
}
