import { useId, type FormEvent } from 'react';
import { Select } from '../presentation/Select';
import { useContractCopy } from './contract.copy';
import { useModelContractCopy } from './model-contract.copy';
import type { useModelContractJourney } from './use-model-contract-journey';

export function ModelContractForm({
  journey,
}: {
  journey: ReturnType<typeof useModelContractJourney>;
}) {
  const copy = useModelContractCopy(),
    common = useContractCopy(),
    id = useId();
  const { draft, setDraft, sources, locked } = journey;
  const change = (
    field: Exclude<keyof typeof draft, 'sourceConcordanceDeclaration'>,
    value: string,
  ) => setDraft((current) => ({ ...current, [field]: value }));
  const field = (
    key:
      | 'documentDate'
      | 'clientDetails'
      | 'termStartsOn'
      | 'termEndsOn'
      | 'specialConditions'
      | 'sourceConcordanceBasis',
    label: string,
    limit: number,
    required: boolean,
  ) => (
    <div className="contract-field" key={key}>
      <label htmlFor={id + key}>{label}</label>
      {key === 'documentDate' ||
      key === 'termStartsOn' ||
      key === 'termEndsOn' ? (
        <input
          id={id + key}
          type="date"
          value={draft[key]}
          required={required}
          onChange={(e) => change(key, e.target.value)}
        />
      ) : (
        <textarea
          id={id + key}
          value={draft[key]}
          maxLength={limit}
          required={required}
          rows={3}
          onChange={(e) => change(key, e.target.value)}
        />
      )}
    </div>
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    void journey.prepare();
  }
  return (
    <form
      onSubmit={submit}
      aria-label={copy(journey.mode === 'successor' ? 'successor' : 'prepare')}
    >
      <fieldset disabled={locked}>
        <legend>
          {copy(journey.mode === 'successor' ? 'successor' : 'prepare')}
        </legend>
        <div className="contract-field">
          <label htmlFor={id + 'offer'}>{copy('chooseOffer')}</label>
          <Select
            id={id + 'offer'}
            value={draft.offerVersionId}
            onValueChange={(value) => change('offerVersionId', value)}
            placeholder={copy('chooseOffer')}
            required
            disabled={
              locked || (!sources.offer && journey.readState === 'loading')
            }
            options={
              sources.offer
                ? [
                    {
                      value: sources.offer.version.id,
                      label: `${common('source')} ${sources.offer.illustrativeReference} · ${common('sourceVersion')} ${sources.offer.version.versionNumber} · ${sources.offer.version.recipient.legalName}`,
                    },
                  ]
                : []
            }
          />
        </div>
        {!sources.offer && journey.readState === 'idle' && (
          <p>{copy('sourceUnavailable')}</p>
        )}
        <div className="contract-field">
          <label htmlFor={id + 'model'}>{copy('chooseModel')}</label>
          <Select
            id={id + 'model'}
            value={draft.modelVersionId}
            onValueChange={(value) => change('modelVersionId', value)}
            placeholder={copy('chooseModel')}
            required
            disabled={
              locked || (!sources.model && journey.readState === 'loading')
            }
            options={
              sources.model
                ? [
                    {
                      value: sources.model.versionId,
                      label: `${sources.model.content.title} · ${common('sourceVersion')} ${sources.model.versionNumber}`,
                    },
                  ]
                : []
            }
          />
        </div>
        {!sources.model && journey.readState === 'idle' && (
          <p>{copy('noModel')}</p>
        )}
        <button
          type="button"
          disabled={locked}
          onClick={() => void journey.loadSources()}
        >
          {common('refresh')} · {common('source')}
        </button>
        {field('documentDate', copy('documentDate'), 10, true)}
        {field('clientDetails', copy('clientDetails'), 4000, true)}
        {field('termStartsOn', common('start'), 10, false)}
        {field('termEndsOn', common('end'), 10, false)}
        {field('specialConditions', common('conditions'), 4000, false)}
        <label className="contract-model-concordance">
          <input
            type="checkbox"
            required
            checked={draft.sourceConcordanceDeclaration}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                sourceConcordanceDeclaration: e.target.checked,
              }))
            }
          />
          {copy('concordance')}
        </label>
        {field('sourceConcordanceBasis', copy('basis'), 2000, true)}
        <button
          type="submit"
          disabled={locked || !sources.offer || !sources.model}
        >
          {copy('prepare')}
        </button>
      </fieldset>
    </form>
  );
}
