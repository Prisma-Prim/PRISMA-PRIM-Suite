import { useId, useState } from 'react';
import { Select } from '../presentation/Select';
import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  readContractModelContent,
  type ContractModelContent,
} from './contract-model-content';
import { useContractModelCopy } from './contract-model.copy';

export const sectionKeys = [
  'subject',
  'executionTerm',
  'rightsAndObligations',
  'confidentiality',
  'priceAndPayment',
  'liability',
  'termination',
  'finalProvisions',
  'partiesAndSignatures',
] as const;
export const signatureLabels = {
  provider: 'signatureProvider',
  client: 'signatureClient',
  annexProvider: 'signatureAnnexProvider',
  annexClient: 'signatureAnnexClient',
} as const;
type Draft = Omit<ContractModelContent, 'sourceKind'> & {
  sourceKind: '' | ContractModelContent['sourceKind'];
};
function blank(): Draft {
  return {
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
  };
}

export function ContractModelForm({
  initial,
  disabled,
  onSubmit,
  onCancel,
}: {
  initial: ContractModelContent | null;
  disabled: boolean;
  onSubmit: (content: ContractModelContent) => void;
  onCancel: () => void;
}) {
  const copy = useContractModelCopy();
  const { formatNumber } = useInterfaceLocale();
  const prefix = useId();
  const [draft, setDraft] = useState<Draft>(() => initial ?? blank());
  const [invalid, setInvalid] = useState(false);
  function field(
    id: string,
    label: string,
    value: string,
    limit: number,
    change: (value: string) => void,
    optional = false,
  ) {
    return (
      <div className="contract-model-field" key={id}>
        <label htmlFor={`${prefix}-${id}`}>{label}</label>
        <textarea
          id={`${prefix}-${id}`}
          value={value}
          maxLength={limit}
          required={!optional}
          rows={limit > 1000 ? 3 : 2}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${prefix}-error` : undefined}
          onChange={(event) => change(event.target.value)}
        />
      </div>
    );
  }
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
  return (
    <form
      className="contract-model-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        try {
          const content = readContractModelContent(draft);
          setInvalid(false);
          onSubmit(content);
        } catch {
          setInvalid(true);
        }
      }}
    >
      <p>{copy('formHelp')}</p>
      {invalid && (
        <p role="alert" id={`${prefix}-error`}>
          {copy('invalid')}
        </p>
      )}
      <fieldset disabled={disabled}>
        <legend>{copy('newVersion')}</legend>
        <div className="contract-model-field">
          <label htmlFor={`${prefix}-source`}>{copy('sourceKind')}</label>
          <Select
            id={`${prefix}-source`}
            value={draft.sourceKind}
            placeholder={copy('chooseSource')}
            required
            options={(['ILLUSTRATIVE', 'COMPANY_SUPPLIED'] as const).map(
              (value) => ({ value, label: copy(value) }),
            )}
            onValueChange={(value) => {
              if (value === 'ILLUSTRATIVE' || value === 'COMPANY_SUPPLIED')
                setDraft({ ...draft, sourceKind: value });
            }}
          />
        </div>
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
          field(key, copy(label), draft[key], limit, (value) =>
            setDraft({ ...draft, [key]: value }),
          ),
        )}
        {(
          ['legalName', 'taxId', 'legalAddress', 'contactDetails'] as const
        ).map((key) =>
          field(
            key,
            copy(key),
            draft.issuer[key] ?? '',
            key === 'legalName' ? 300 : key === 'taxId' ? 100 : 1000,
            (value) =>
              setDraft({
                ...draft,
                issuer: {
                  ...draft.issuer,
                  [key]:
                    key === 'contactDetails' && value === '' ? null : value,
                },
              }),
            key === 'contactDetails',
          ),
        )}
        <fieldset>
          <legend>{copy('frameworks')}</legend>
          {draft.frameworks.map((row, index) => (
            <div className="contract-model-framework" key={index}>
              {(['name', 'edition'] as const).map((key) =>
                field(
                  `framework-${index}-${key}`,
                  numbered(
                    key === 'name' ? 'frameworkName' : 'frameworkEdition',
                    index,
                  ),
                  row[key],
                  key === 'name' ? 200 : 100,
                  (value) =>
                    setDraft({
                      ...draft,
                      frameworks: draft.frameworks.map((entry, position) =>
                        position === index ? { ...entry, [key]: value } : entry,
                      ),
                    }),
                ),
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
          field(key, copy(key), draft.sections[key], 4000, (value) =>
            setDraft({
              ...draft,
              sections: { ...draft.sections, [key]: value },
            }),
          ),
        )}
        {(['provider', 'client', 'annexProvider', 'annexClient'] as const).map(
          (key) =>
            field(
              key,
              copy(signatureLabels[key]),
              draft.signatureAreas[key],
              500,
              (value) =>
                setDraft({
                  ...draft,
                  signatureAreas: { ...draft.signatureAreas, [key]: value },
                }),
            ),
        )}
        {field(
          'annexTitle',
          copy('annexTitle'),
          draft.annex.title,
          300,
          (value) =>
            setDraft({ ...draft, annex: { ...draft.annex, title: value } }),
        )}
        {field(
          'annexReference',
          copy('annexReference'),
          draft.annex.referenceWording,
          1000,
          (value) =>
            setDraft({
              ...draft,
              annex: { ...draft.annex, referenceWording: value },
            }),
        )}
        <fieldset>
          <legend>{copy('plannedStages')}</legend>
          {draft.annex.activities.map((row, index) => (
            <fieldset key={index}>
              <legend>{numbered('stage', index)}</legend>
              {(['title', 'plannedActivity', 'intendedResult'] as const).map(
                (key) =>
                  field(
                    `activity-${index}-${key}`,
                    numbered(key === 'title' ? 'stageTitle' : key, index),
                    row[key],
                    key === 'title' ? 200 : 1000,
                    (value) =>
                      setDraft({
                        ...draft,
                        annex: {
                          ...draft.annex,
                          activities: draft.annex.activities.map(
                            (entry, position) =>
                              position === index
                                ? { ...entry, [key]: value }
                                : entry,
                          ),
                        },
                      }),
                  ),
              )}
            </fieldset>
          ))}
        </fieldset>
        <div className="contract-model-actions">
          <button type="submit">{copy('submit')}</button>
          <button type="button" onClick={onCancel}>
            {copy('cancel')}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
