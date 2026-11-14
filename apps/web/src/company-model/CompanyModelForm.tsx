import { useId, useState, type ReactNode } from 'react';
import { Select } from '../presentation/Select';
import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import type {
  CompanyModelContentBase,
  CompanyModelCopy,
  CompanyModelDraftBase,
  CompanyModelKind,
} from './company-model-kind';

/** Renders one labelled literal text area of the draft. */
export type ModelField = (input: {
  id: string;
  label: string;
  value: string;
  limit: number;
  multiline?: boolean;
  optional?: boolean;
  change: (value: string) => void;
}) => ReactNode;
type NumberedKey =
  | 'frameworkName'
  | 'frameworkEdition'
  | 'removeFramework'
  | 'stage'
  | 'stageTitle'
  | 'plannedActivity'
  | 'intendedResult';

/** What the form shell hands a kind's content fields. */
export type CompanyModelFieldsProps<Draft> = {
  draft: Draft;
  change: (draft: Draft) => void;
  field: ModelField;
  copy: CompanyModelCopy;
  numbered: (key: NumberedKey, index: number) => string;
};

/** The shared form: source kind, validation, accessibility and actions. */
export function CompanyModelForm<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
>({
  kind,
  initial,
  disabled,
  onSubmit,
  onCancel,
}: {
  kind: CompanyModelKind<Content, Draft>;
  initial: Content | null;
  disabled: boolean;
  onSubmit: (content: Content) => void;
  onCancel: () => void;
}) {
  const copy = kind.useCopy();
  const { formatNumber } = useInterfaceLocale();
  const prefix = useId();
  const [draft, setDraft] = useState<Draft>(() => kind.draft(initial));
  const [invalid, setInvalid] = useState(false);
  const numbered = (key: NumberedKey, index: number) =>
    formatMessage(copy(key), { number: formatNumber(index + 1) });
  const field: ModelField = ({
    id,
    label,
    value,
    limit,
    multiline = false,
    optional = false,
    change,
  }) => (
    <div className="company-model-field" key={id}>
      <label htmlFor={`${prefix}-${id}`}>{label}</label>
      <textarea
        id={`${prefix}-${id}`}
        value={value}
        maxLength={limit}
        required={!optional}
        rows={multiline ? 3 : 2}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${prefix}-error` : undefined}
        onChange={(event) => change(event.target.value)}
      />
    </div>
  );
  return (
    <form
      className="company-model-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        try {
          const content = kind.readContent(draft);
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
        <div className="company-model-field">
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
        <kind.Fields
          draft={draft}
          change={setDraft}
          field={field}
          copy={copy}
          numbered={numbered}
        />
        <div className="company-model-actions">
          <button type="submit">{copy('submit')}</button>
          <button type="button" onClick={onCancel}>
            {copy('cancel')}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

type Framework = { name: string; edition: string };
/** The one to ten framework and edition rows both kinds carry. */
export function ModelFrameworkFields({
  rows,
  change,
  field,
  copy,
  numbered,
}: Omit<CompanyModelFieldsProps<unknown>, 'draft' | 'change'> & {
  rows: readonly Framework[];
  change: (rows: Framework[]) => void;
}) {
  return (
    <fieldset>
      <legend>{copy('frameworks')}</legend>
      {rows.map((row, index) => (
        <div className="company-model-framework" key={index}>
          {(['name', 'edition'] as const).map((key) =>
            field({
              id: `framework-${index}-${key}`,
              label: numbered(
                key === 'name' ? 'frameworkName' : 'frameworkEdition',
                index,
              ),
              value: row[key],
              limit: key === 'name' ? 200 : 100,
              change: (value) =>
                change(
                  rows.map((entry, position) =>
                    position === index ? { ...entry, [key]: value } : entry,
                  ),
                ),
            }),
          )}
          <button
            type="button"
            disabled={rows.length === 1}
            onClick={() =>
              change(rows.filter((_, position) => position !== index))
            }
          >
            {numbered('removeFramework', index)}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={rows.length === 10}
        onClick={() => change([...rows, { name: '', edition: '' }])}
      >
        {copy('addFramework')}
      </button>
    </fieldset>
  );
}

type Stage = { title: string; plannedActivity: string; intendedResult: string };
/** The fixed list of planned stages or annex activities. */
export function ModelStageFields({
  idPrefix,
  multiline,
  rows,
  change,
  field,
  copy,
  numbered,
}: Omit<CompanyModelFieldsProps<unknown>, 'draft' | 'change'> & {
  idPrefix: string;
  multiline: boolean;
  rows: readonly Stage[];
  change: (rows: Stage[]) => void;
}) {
  return (
    <fieldset>
      <legend>{copy('plannedStages')}</legend>
      {rows.map((row, index) => (
        <fieldset key={index}>
          <legend>{numbered('stage', index)}</legend>
          {(['title', 'plannedActivity', 'intendedResult'] as const).map(
            (key) =>
              field({
                id: `${idPrefix}-${index}-${key}`,
                label: numbered(key === 'title' ? 'stageTitle' : key, index),
                value: row[key],
                limit: key === 'title' ? 200 : 1000,
                multiline: multiline && key !== 'title',
                change: (value) =>
                  change(
                    rows.map((entry, position) =>
                      position === index ? { ...entry, [key]: value } : entry,
                    ),
                  ),
              }),
          )}
        </fieldset>
      ))}
    </fieldset>
  );
}
