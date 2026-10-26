import { useId, useState } from 'react';
import { Select } from '../presentation/Select';
import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  readOfferModelContent,
  type OfferModelContent,
} from './offer-model-content';
import { useOfferModelCopy } from './offer-model.copy';

export const sectionKeys = [
  'introduction',
  'providerProfile',
  'scope',
  'objectives',
  'assessmentGuidance',
  'methodology',
  'deliverables',
  'realizationConditions',
  'paymentConditions',
  'closingRationale',
] as const;
type Draft = Omit<OfferModelContent, 'sourceKind'> & {
  sourceKind: '' | OfferModelContent['sourceKind'];
};
function blank(): Draft {
  return {
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
  };
}

export function OfferModelForm({
  initial,
  disabled,
  onSubmit,
  onCancel,
}: {
  initial: OfferModelContent | null;
  disabled: boolean;
  onSubmit: (content: OfferModelContent) => void;
  onCancel: () => void;
}) {
  const copy = useOfferModelCopy();
  const { formatNumber } = useInterfaceLocale();
  const prefix = useId();
  const [draft, setDraft] = useState<Draft>(() => initial ?? blank());
  const [invalid, setInvalid] = useState(false);
  const numbered = (
    key:
      | 'frameworkName'
      | 'frameworkEdition'
      | 'removeFramework'
      | 'stage'
      | 'stageTitle'
      | 'plannedActivity'
      | 'intendedResult',
    index: number,
  ) => formatMessage(copy(key), { number: formatNumber(index + 1) });
  function field({
    id,
    label,
    value,
    limit,
    multiline = false,
    optional = false,
    change,
  }: {
    id: string;
    label: string;
    value: string;
    limit: number;
    multiline?: boolean;
    optional?: boolean;
    change: (value: string) => void;
  }) {
    const props = {
      id: `${prefix}-${id}`,
      value,
      maxLength: limit,
      required: !optional,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
        change(event.target.value),
    };
    return (
      <div className="offer-model-field" key={id}>
        <label htmlFor={props.id}>{label}</label>
        <textarea {...props} rows={multiline ? 3 : 2} />
      </div>
    );
  }
  return (
    <form
      className="offer-model-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        try {
          const content = readOfferModelContent(draft);
          setInvalid(false);
          onSubmit(content);
        } catch {
          setInvalid(true);
        }
      }}
    >
      <p>{copy('formHelp')}</p>
      {invalid && <p role="alert">{copy('invalid')}</p>}
      <fieldset disabled={disabled}>
        <legend>{copy('newVersion')}</legend>
        <div className="offer-model-field">
          <label htmlFor={`${prefix}-source`}>{copy('sourceKind')}</label>
          <Select
            id={`${prefix}-source`}
            value={draft.sourceKind}
            placeholder={copy('chooseSource')}
            required
            options={['ILLUSTRATIVE', 'COMPANY_SUPPLIED'].map((value) => ({
              value,
              label:
                value === 'ILLUSTRATIVE'
                  ? copy('ILLUSTRATIVE')
                  : copy('COMPANY_SUPPLIED'),
            }))}
            onValueChange={(value) => {
              if (value === 'ILLUSTRATIVE' || value === 'COMPANY_SUPPLIED')
                setDraft({ ...draft, sourceKind: value });
            }}
          />
        </div>
        {field({
          id: 'sourceDescription',
          label: copy('sourceDescription'),
          value: draft.sourceDescription,
          limit: 500,
          multiline: true,
          change: (value) => setDraft({ ...draft, sourceDescription: value }),
        })}
        {(
          ['legalName', 'taxId', 'legalAddress', 'contactDetails'] as const
        ).map((key) =>
          field({
            id: key,
            label: copy(key),
            value: draft.issuer[key] ?? '',
            limit: key === 'legalName' ? 300 : key === 'taxId' ? 100 : 1000,
            multiline: key === 'legalAddress' || key === 'contactDetails',
            optional: key === 'contactDetails',
            change: (value) =>
              setDraft({
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
          change: (value) => setDraft({ ...draft, serviceTitle: value }),
        })}
        <fieldset>
          <legend>{copy('frameworks')}</legend>
          {draft.frameworks.map((framework, index) => (
            <div className="offer-model-framework" key={index}>
              {(['name', 'edition'] as const).map((key) =>
                field({
                  id: `framework-${index}-${key}`,
                  label: numbered(
                    key === 'name' ? 'frameworkName' : 'frameworkEdition',
                    index,
                  ),
                  value: framework[key],
                  limit: key === 'name' ? 200 : 100,
                  change: (value) =>
                    setDraft({
                      ...draft,
                      frameworks: draft.frameworks.map((entry, position) =>
                        position === index ? { ...entry, [key]: value } : entry,
                      ),
                    }),
                }),
              )}
              <button
                type="button"
                disabled={draft.frameworks.length === 1}
                onClick={() =>
                  setDraft({
                    ...draft,
                    frameworks: draft.frameworks.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                {numbered('removeFramework', index)}
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={draft.frameworks.length === 10}
            onClick={() =>
              setDraft({
                ...draft,
                frameworks: [...draft.frameworks, { name: '', edition: '' }],
              })
            }
          >
            {copy('addFramework')}
          </button>
        </fieldset>
        {sectionKeys.map((key) =>
          field({
            id: key,
            label: copy(key),
            value: draft.sections[key],
            limit: 4000,
            multiline: true,
            change: (value) =>
              setDraft({
                ...draft,
                sections: { ...draft.sections, [key]: value },
              }),
          }),
        )}
        <fieldset>
          <legend>{copy('plannedStages')}</legend>
          {draft.stages.map((stage, index) => (
            <fieldset key={index}>
              <legend>{numbered('stage', index)}</legend>
              {(['title', 'plannedActivity', 'intendedResult'] as const).map(
                (key) =>
                  field({
                    id: `stage-${index}-${key}`,
                    label: numbered(
                      key === 'title' ? 'stageTitle' : key,
                      index,
                    ),
                    value: stage[key],
                    limit: key === 'title' ? 200 : 1000,
                    multiline: key !== 'title',
                    change: (value) =>
                      setDraft({
                        ...draft,
                        stages: draft.stages.map((entry, position) =>
                          position === index
                            ? { ...entry, [key]: value }
                            : entry,
                        ),
                      }),
                  }),
              )}
            </fieldset>
          ))}
        </fieldset>
        <div className="offer-model-actions">
          <button type="submit">{copy('submit')}</button>
          <button type="button" onClick={onCancel}>
            {copy('cancel')}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
