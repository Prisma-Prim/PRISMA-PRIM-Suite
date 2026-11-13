import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { Select, type SelectOption } from '../presentation/Select';
import { useWorkingEvidenceCopy } from './working-evidence.copy';
import { useEvidenceOperations } from './use-evidence-operations';
import {
  normalizedEvidenceValues,
  readEvidenceReceipt,
  readEvidenceSources,
  type EvidenceRevision,
  type EvidenceSource,
  type EvidenceValues,
} from './working-evidence-response';
import type { WorkingEvidenceProps } from './WorkingEvidenceWorkspace';
export function EvidenceEditor(
  props: WorkingEvidenceProps & {
    signature: string;
    newUseAvailable: boolean;
    correction: EvidenceRevision | null;
    onCancel: () => void;
    onSaved: (receipt: ReturnType<typeof readEvidenceReceipt>) => void;
  },
) {
  const copy = useWorkingEvidenceCopy(),
    id = useId(),
    operations = useEvidenceOperations({
      ...props,
      signature: props.signature,
    });
  const revision = props.correction;
  const [values, setValues] = useState<EvidenceValues>(() => ({
    title: revision?.title ?? '',
    declaredContext: revision?.declaredContext ?? null,
    process: revision?.process ?? '',
    statement: revision?.statement ?? '',
    observationNote: revision?.observationNote ?? null,
    supports:
      revision?.evidence.state === 'visible'
        ? revision.evidence.supports.map((item) => ({
            documentId: item.documentId,
            versionId: item.versionId,
            representationId: item.representationId,
            locator: item.locator,
            supportNote: item.supportNote,
          }))
        : [],
  }));
  const [reason, setReason] = useState(''),
    [sources, setSources] = useState<EvidenceSource[]>([]),
    [nextCursor, setCursor] = useState<string | null>(null);
  const [sourceState, setSourceState] = useState<
    'loading' | 'ready' | 'unavailable'
  >('loading');
  const [state, setState] = useState<
    | 'idle'
    | 'pending'
    | 'uncertain'
    | 'validation'
    | 'conflict'
    | 'denied'
    | 'unavailable'
  >('idle');
  const sealed = useRef<{
    body: string;
    path: string;
    commandId: string;
  } | null>(null);
  async function loadSources(cursor: string | null = null) {
    const request = operations.operation();
    setSourceState('loading');
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!request.current()) return;
      const result = await api.request(
        `/projects/${props.projectId}/working-evidence-sources${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        {
          companyContextId: props.actor.activeCompany?.id,
          signal: request.controller.signal,
          cache: 'no-store',
        },
      );
      if (!request.current()) return;
      if (result.status !== 'ok') {
        setSourceState('unavailable');
        request.recover(result);
        return;
      }
      const page = readEvidenceSources(result.value);
      if (!request.current()) return;
      setSources((previous) =>
        cursor ? [...previous, ...page.items] : page.items,
      );
      setCursor(page.nextCursor);
      setSourceState('ready');
    } catch {
      if (request.current()) setSourceState('unavailable');
    } finally {
      request.finish();
    }
  }
  useEffect(() => {
    void loadSources();
  }, []);
  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (state === 'pending' || state === 'conflict') return;
    if (!sealed.current && !props.newUseAvailable) return;
    if (!sealed.current) {
      try {
        const normalized = normalizedEvidenceValues(values),
          commandId = crypto.randomUUID();
        if (revision && (!reason.trim() || reason.trim().length > 2000))
          throw new Error('Reason required');
        sealed.current = {
          commandId,
          path: revision
            ? `/working-evidence-cases/${revision.caseId}/corrections`
            : `/projects/${props.projectId}/working-evidence-cases`,
          body: JSON.stringify({
            format: 'WORKING_EVIDENCE_CASE_COMMAND/1',
            commandId,
            expectedRevision: revision?.revisionNumber ?? 0,
            ...(revision ? { reason: reason.trim() } : {}),
            values: normalized,
          }),
        };
      } catch {
        setState('validation');
        return;
      }
    }
    const command = sealed.current,
      request = operations.operation();
    setState('pending');
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!request.current()) return;
      const result = await api.request(command.path, {
        method: 'POST',
        companyContextId: props.actor.activeCompany?.id,
        signal: request.controller.signal,
        headers: { 'content-type': 'application/json' },
        body: command.body,
      });
      if (!request.current()) return;
      if (result.status !== 'ok') {
        setState(
          result.status === 'unauthorized' || result.status === 'forbidden'
            ? 'denied'
            : result.status === 'conflict'
              ? 'conflict'
              : result.status === 'validation'
                ? 'validation'
                : result.status === 'notFound'
                  ? 'unavailable'
                  : 'uncertain',
        );
        if (result.status !== 'error') sealed.current = null;
        request.recover(result);
        return;
      }
      const receipt = readEvidenceReceipt(result.value);
      if (
        receipt.commandId !== command.commandId ||
        receipt.action !== (revision ? 'CORRECT' : 'RECORD') ||
        receipt.revisionNumber !== (revision?.revisionNumber ?? 0) + 1 ||
        (revision && receipt.caseId !== revision.caseId)
      )
        throw new Error('Unexpected receipt');
      if (request.current()) {
        sealed.current = null;
        props.onSaved(receipt);
      }
    } catch {
      if (request.current()) setState('uncertain');
    } finally {
      request.finish();
    }
  }
  const locked =
    state === 'pending' || state === 'uncertain' || state === 'conflict';
  function sourceKey(item: {
    documentId: string;
    versionId: string;
    representationId: string;
  }) {
    return JSON.stringify([
      item.documentId,
      item.versionId,
      item.representationId,
    ]);
  }
  function retainedBinding(item: EvidenceValues['supports'][number]) {
    return revision?.evidence.state === 'visible'
      ? revision.evidence.supports.find(
          (support) => sourceKey(support) === sourceKey(item),
        )
      : undefined;
  }
  function sourceOptions(item: EvidenceValues['supports'][number]) {
    const options: SelectOption[] = sources.map((source) => ({
      value: sourceKey(source),
      label: `${source.sourceTitle} · ${copy('revision')} ${source.versionNumber}`,
    }));
    const retained = retainedBinding(item);
    if (
      retained &&
      !sources.some((source) => sourceKey(source) === sourceKey(item))
    )
      options.unshift({
        value: sourceKey(retained),
        label: `${retained.sourceTitle} · ${copy('revision')} ${retained.versionNumber}`,
        disabled: true,
      });
    return options;
  }
  return (
    <form
      className="working-evidence-editor"
      onSubmit={(event) => void save(event)}
      aria-label={copy(revision ? 'correct' : 'create')}
      aria-describedby={state !== 'idle' ? `${id}-state` : undefined}
    >
      <p>{copy('meaning')}</p>
      <fieldset disabled={locked}>
        <label>
          {copy('caseTitle')}
          <input
            maxLength={200}
            required
            value={values.title}
            onChange={(event) =>
              setValues({ ...values, title: event.target.value })
            }
          />
        </label>
        <label>
          {copy('context')}
          <textarea
            maxLength={2000}
            value={values.declaredContext ?? ''}
            onChange={(event) =>
              setValues({
                ...values,
                declaredContext: event.target.value || null,
              })
            }
          />
        </label>
        <label>
          {copy('process')}
          <input
            maxLength={200}
            required
            value={values.process}
            onChange={(event) =>
              setValues({ ...values, process: event.target.value })
            }
          />
        </label>
        <label>
          {copy('statement')}
          <textarea
            maxLength={2000}
            required
            value={values.statement}
            onChange={(event) =>
              setValues({ ...values, statement: event.target.value })
            }
          />
        </label>
        <label>
          {copy('note')}
          <textarea
            maxLength={2000}
            value={values.observationNote ?? ''}
            onChange={(event) =>
              setValues({
                ...values,
                observationNote: event.target.value || null,
              })
            }
          />
        </label>
        {revision && (
          <label>
            {copy('reason')}
            <textarea
              required
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        )}
        {values.supports.map((item, index) => (
          <fieldset key={index}>
            <legend>
              {copy('source')} {index + 1}
            </legend>
            <label htmlFor={`${id}-source-${index}`}>{copy('source')}</label>
            <Select
              id={`${id}-source-${index}`}
              value={sourceKey(item)}
              options={sourceOptions(item)}
              placeholder={copy('select')}
              onValueChange={(key) => {
                const source = sources.find(
                  (source) => sourceKey(source) === key,
                );
                if (source)
                  setValues({
                    ...values,
                    supports: values.supports.map((support, position) =>
                      position === index
                        ? {
                            ...support,
                            documentId: source.documentId,
                            versionId: source.versionId,
                            representationId: source.representationId,
                          }
                        : support,
                    ),
                  });
              }}
            />
            {retainedBinding(item) && (
              <p>
                {retainedBinding(item)?.sourceTitle} · {copy('revision')}{' '}
                {retainedBinding(item)?.versionNumber}.{' '}
                {copy('retainedBinding')}
              </p>
            )}
            <label>
              {copy('locator')}
              <input
                maxLength={500}
                value={item.locator ?? ''}
                onChange={(event) =>
                  setValues({
                    ...values,
                    supports: values.supports.map((support, position) =>
                      position === index
                        ? { ...support, locator: event.target.value || null }
                        : support,
                    ),
                  })
                }
              />
            </label>
            <label>
              {copy('supportNote')}
              <textarea
                maxLength={2000}
                required
                value={item.supportNote}
                onChange={(event) =>
                  setValues({
                    ...values,
                    supports: values.supports.map((support, position) =>
                      position === index
                        ? { ...support, supportNote: event.target.value }
                        : support,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setValues({
                  ...values,
                  supports: values.supports.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              {copy('remove')}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={values.supports.length >= 3 || sources.length === 0}
          onClick={() => {
            const source = sources.find(
              (source) =>
                !values.supports.some(
                  (item) => sourceKey(item) === sourceKey(source),
                ),
            );
            if (source)
              setValues({
                ...values,
                supports: [
                  ...values.supports,
                  {
                    documentId: source.documentId,
                    versionId: source.versionId,
                    representationId: source.representationId,
                    locator: null,
                    supportNote: '',
                  },
                ],
              });
          }}
        >
          {copy('add')}
        </button>
      </fieldset>
      {sourceState === 'loading' && <p role="status">{copy('loading')}</p>}
      {sourceState === 'unavailable' && (
        <p role="alert">{copy('sourceUnavailable')}</p>
      )}
      {sourceState === 'ready' && sources.length === 0 && (
        <p>{copy('noSources')}</p>
      )}
      {nextCursor && (
        <button
          type="button"
          disabled={locked}
          onClick={() => void loadSources(nextCursor)}
        >
          {copy('next')}
        </button>
      )}
      {state !== 'idle' && (
        <p id={`${id}-state`} role={state === 'pending' ? 'status' : 'alert'}>
          {copy(state)}
        </p>
      )}
      <button
        type="submit"
        disabled={locked || sourceState !== 'ready' || !props.newUseAvailable}
      >
        {copy('save')}
      </button>
      {state === 'uncertain' && (
        <button type="button" onClick={() => void save()}>
          {copy('retry')}
        </button>
      )}
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={props.onCancel}
      >
        {copy('cancel')}
      </button>
    </form>
  );
}
