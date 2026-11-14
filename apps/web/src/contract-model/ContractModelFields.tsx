import {
  ModelFrameworkFields,
  ModelStageFields,
  type CompanyModelFieldsProps,
} from '../company-model/CompanyModelForm';
import type { ContractModelContent } from './contract-model-content';
import { sectionKeys, signatureLabels } from './ContractModelBody';
import { useContractModelCopy } from './contract-model.copy';

export type ContractModelDraft = Omit<ContractModelContent, 'sourceKind'> & {
  sourceKind: '' | ContractModelContent['sourceKind'];
};
export function contractModelDraft(
  initial: ContractModelContent | null,
): ContractModelDraft {
  return (
    initial ?? {
      sourceKind: '',
      sourceDescription: '',
      title: '',
      serviceTitle: '',
      place: '',
      issuer: {
        legalName: '',
        taxId: '',
        legalAddress: '',
        contactDetails: null,
      },
      providerDetails: '',
      clientDetailsIntroduction: '',
      frameworks: [{ name: '', edition: '' }],
      sections: {
        subject: '',
        executionTerm: '',
        rightsAndObligations: '',
        confidentiality: '',
        priceAndPayment: '',
        liability: '',
        termination: '',
        finalProvisions: '',
        partiesAndSignatures: '',
      },
      signatureAreas: {
        provider: '',
        client: '',
        annexProvider: '',
        annexClient: '',
      },
      annex: {
        title: '',
        referenceWording: '',
        activities: Array.from({ length: 13 }, () => ({
          title: '',
          plannedActivity: '',
          intendedResult: '',
        })),
      },
    }
  );
}

/** The Contract model's content fields inside the shared form shell. */
export function ContractModelFields(
  props: CompanyModelFieldsProps<ContractModelDraft>,
) {
  const { draft, change } = props;
  const copy = useContractModelCopy();
  // A Contract text area grows only for its long clauses.
  const field: typeof props.field = (input) =>
    props.field({ ...input, multiline: input.limit > 1000 });
  return (
    <>
      {(
        [
          ['sourceDescription', 'sourceDescription', 500],
          ['title', 'contractTitle', 300],
          ['serviceTitle', 'serviceTitle', 300],
          ['place', 'place', 200],
          ['providerDetails', 'providerDetails', 4000],
          ['clientDetailsIntroduction', 'clientDetailsIntroduction', 1000],
        ] as const
      ).map(([key, label, limit]) =>
        field({
          id: key,
          label: copy(label),
          value: draft[key],
          limit,
          change: (value) => change({ ...draft, [key]: value }),
        }),
      )}
      {(['legalName', 'taxId', 'legalAddress', 'contactDetails'] as const).map(
        (key) =>
          field({
            id: key,
            label: copy(key),
            value: draft.issuer[key] ?? '',
            limit: key === 'legalName' ? 300 : key === 'taxId' ? 100 : 1000,
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
      <ModelFrameworkFields
        {...props}
        field={field}
        rows={draft.frameworks}
        change={(frameworks) => change({ ...draft, frameworks })}
      />
      {sectionKeys.map((key) =>
        field({
          id: key,
          label: copy(key),
          value: draft.sections[key],
          limit: 4000,
          change: (value) =>
            change({ ...draft, sections: { ...draft.sections, [key]: value } }),
        }),
      )}
      {(['provider', 'client', 'annexProvider', 'annexClient'] as const).map(
        (key) =>
          field({
            id: key,
            label: copy(signatureLabels[key]),
            value: draft.signatureAreas[key],
            limit: 500,
            change: (value) =>
              change({
                ...draft,
                signatureAreas: { ...draft.signatureAreas, [key]: value },
              }),
          }),
      )}
      {field({
        id: 'annexTitle',
        label: copy('annexTitle'),
        value: draft.annex.title,
        limit: 300,
        change: (value) =>
          change({ ...draft, annex: { ...draft.annex, title: value } }),
      })}
      {field({
        id: 'annexReference',
        label: copy('annexReference'),
        value: draft.annex.referenceWording,
        limit: 1000,
        change: (value) =>
          change({
            ...draft,
            annex: { ...draft.annex, referenceWording: value },
          }),
      })}
      <ModelStageFields
        {...props}
        field={field}
        idPrefix="activity"
        multiline={false}
        rows={draft.annex.activities}
        change={(activities) =>
          change({ ...draft, annex: { ...draft.annex, activities } })
        }
      />
    </>
  );
}
