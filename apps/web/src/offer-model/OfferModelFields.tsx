import {
  ModelFrameworkFields,
  ModelStageFields,
  type CompanyModelFieldsProps,
} from '../company-model/CompanyModelForm';
import type { OfferModelContent } from './offer-model-content';
import { sectionKeys } from './OfferModelBody';
import { useOfferModelCopy } from './offer-model.copy';

export type OfferModelDraft = Omit<OfferModelContent, 'sourceKind'> & {
  sourceKind: '' | OfferModelContent['sourceKind'];
};
export function offerModelDraft(
  initial: OfferModelContent | null,
): OfferModelDraft {
  return (
    initial ?? {
      sourceKind: '',
      sourceDescription: '',
      issuer: {
        legalName: '',
        taxId: '',
        legalAddress: '',
        contactDetails: null,
      },
      serviceTitle: '',
      frameworks: [{ name: '', edition: '' }],
      sections: {
        introduction: '',
        providerProfile: '',
        scope: '',
        objectives: '',
        assessmentGuidance: '',
        methodology: '',
        deliverables: '',
        realizationConditions: '',
        paymentConditions: '',
        closingRationale: '',
      },
      stages: Array.from({ length: 18 }, () => ({
        title: '',
        plannedActivity: '',
        intendedResult: '',
      })),
    }
  );
}

/** The Offer model's content fields inside the shared form shell. */
export function OfferModelFields(
  props: CompanyModelFieldsProps<OfferModelDraft>,
) {
  const { draft, change, field } = props;
  const copy = useOfferModelCopy();
  return (
    <>
      {field({
        id: 'sourceDescription',
        label: copy('sourceDescription'),
        value: draft.sourceDescription,
        limit: 500,
        multiline: true,
        change: (value) => change({ ...draft, sourceDescription: value }),
      })}
      {(['legalName', 'taxId', 'legalAddress', 'contactDetails'] as const).map(
        (key) =>
          field({
            id: key,
            label: copy(key),
            value: draft.issuer[key] ?? '',
            limit: key === 'legalName' ? 300 : key === 'taxId' ? 100 : 1000,
            multiline: key === 'legalAddress' || key === 'contactDetails',
            optional: key === 'contactDetails',
            change: (value) =>
              change({
                ...draft,
                issuer: {
                  ...draft.issuer,
                  [key]:
                    key === 'contactDetails' && value === '' ? null : value,
                },
              }),
          }),
      )}
      {field({
        id: 'serviceTitle',
        label: copy('serviceTitle'),
        value: draft.serviceTitle,
        limit: 300,
        change: (value) => change({ ...draft, serviceTitle: value }),
      })}
      <ModelFrameworkFields
        {...props}
        rows={draft.frameworks}
        change={(frameworks) => change({ ...draft, frameworks })}
      />
      {sectionKeys.map((key) =>
        field({
          id: key,
          label: copy(key),
          value: draft.sections[key],
          limit: 4000,
          multiline: true,
          change: (value) =>
            change({ ...draft, sections: { ...draft.sections, [key]: value } }),
        }),
      )}
      <ModelStageFields
        {...props}
        idPrefix="stage"
        multiline
        rows={draft.stages}
        change={(stages) => change({ ...draft, stages })}
      />
    </>
  );
}
