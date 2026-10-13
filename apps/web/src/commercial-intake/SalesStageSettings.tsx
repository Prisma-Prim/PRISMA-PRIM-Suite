import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { commercialIntakeCopy as copy } from './commercial-intake.copy';
import {
  useSalesStageCopy,
  type SalesStageMessageKey,
} from './sales-stage.copy';
import type { CommercialIntakeRequest } from './RequestClientAssociation';
import {
  isSalesStageList,
  isValidStageLabel,
  SALES_STAGE_LABEL_MAXIMUM_LENGTH,
  SALES_STAGE_LIMIT,
  type SalesStageList,
} from './sales-stage';

type HttpResult = Awaited<ReturnType<CommercialIntakeRequest>>;

// Indexing by the stage state makes a new state a type error until its
// localized label exists.
const STATE_KEYS = {
  ACTIVE: 'stateActive',
} as const satisfies Record<
  SalesStageList['stages'][number]['state'],
  SalesStageMessageKey
>;

export type SalesStageAccessHandler = (
  result: HttpResult,
  companyContextId: string,
  signal: AbortSignal,
  resource: 'intake' | 'sales-stage-configuration',
) => Promise<'ok' | 'retained' | 'rejected'>;

type ListState =
  { kind: 'loading' | 'error' } | { kind: 'ready'; list: SalesStageList };

/**
 * The create form: closed to edits while in flight, waiting for an explicit
 * retry after an uncertain outcome, or blocked until the list reloads after a
 * stale revision.
 */
type CreateState = 'idle' | 'saving' | 'uncertain' | 'conflict';

type CreateRetry = { label: string; expectedRevision: number; key: string };

/**
 * The active Company's Sales Stage settings (Commercial Workflow PRD section
 * 24.6): the stages in order with their state. A holder of the configuration
 * bundle creates stages at the end of the list; every other Commercial Intake
 * reader sees the list read-only.
 */
export function SalesStageSettings({
  companyId,
  canConfigure,
  request,
  handleAccess,
  onBack,
  onConfigured,
}: {
  companyId: string;
  canConfigure: boolean;
  request: CommercialIntakeRequest;
  handleAccess: SalesStageAccessHandler;
  onBack: () => void;
  onConfigured: () => Promise<void> | void;
}) {
  const stageCopy = useSalesStageCopy();
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [label, setLabel] = useState('');
  const [create, setCreate] = useState<CreateState>('idle');
  const [feedback, setFeedback] = useState('');
  const [labelError, setLabelError] = useState('');
  const listRequest = useRef<AbortController | undefined>(undefined);
  const createRequest = useRef<AbortController | undefined>(undefined);
  const retry = useRef<CreateRetry | undefined>(undefined);

  const loadList = useCallback(async (): Promise<void> => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setList({ kind: 'loading' });
    try {
      const result = await request({
        path: '/sales-stages',
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (
        (await handleAccess(result, companyId, controller.signal, 'intake')) !==
        'ok'
      )
        return;
      if (controller.signal.aborted) return;
      setList(
        result.status === 200 && isSalesStageList(result.body)
          ? { kind: 'ready', list: result.body }
          : { kind: 'error' },
      );
    } catch {
      if (!controller.signal.aborted) setList({ kind: 'error' });
    }
  }, [companyId, handleAccess, request]);

  useEffect(() => {
    void loadList();
    return () => {
      listRequest.current?.abort();
      createRequest.current?.abort();
    };
  }, [loadList]);

  // Losing the configuration bundle keeps the read-only list but retires the
  // draft and any pending command, so a later regrant cannot replay it.
  useEffect(() => {
    if (canConfigure) return;
    createRequest.current?.abort();
    retry.current = undefined;
    setLabel('');
    setLabelError('');
    setCreate('idle');
  }, [canConfigure]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (list.kind !== 'ready' || create === 'saving' || create === 'conflict')
      return;
    // An uncertain create resends exactly its label, revision and key; the
    // field stays disabled meanwhile, so the shown label is that label.
    const preserved = create === 'uncertain' ? retry.current : undefined;
    const draft = preserved?.label ?? label;
    if (!isValidStageLabel(draft)) {
      setLabelError(stageCopy('salesStageLabelValidation'));
      return;
    }
    const expectedRevision = preserved?.expectedRevision ?? list.list.revision;
    const key = preserved?.key ?? crypto.randomUUID();
    retry.current = { label: draft, expectedRevision, key };
    createRequest.current?.abort();
    const controller = new AbortController();
    createRequest.current = controller;
    setCreate('saving');
    setFeedback('');
    setLabelError('');
    try {
      const result = await request({
        path: '/sales-stages',
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: JSON.stringify({ expectedRevision, label: draft }),
        idempotencyKey: key,
      });
      if (controller.signal.aborted) return;
      const access = await handleAccess(
        result,
        companyId,
        controller.signal,
        'sales-stage-configuration',
      );
      if (controller.signal.aborted) return;
      if (access === 'retained') {
        // Configuration authority was lost while the list stays readable.
        retry.current = undefined;
        setCreate('idle');
        setFeedback(stageCopy('salesStageDenied'));
        return;
      }
      if (access === 'rejected') return;
      const code = errorCode(result);
      if (result.status === 400 && code === 'SALES_STAGE_LABEL_TAKEN') {
        retry.current = undefined;
        setCreate('idle');
        setLabelError(stageCopy('salesStageLabelTaken'));
        return;
      }
      if (result.status === 400) {
        retry.current = undefined;
        setCreate('idle');
        setLabelError(stageCopy('salesStageLabelValidation'));
        return;
      }
      if (result.status === 409 && code === 'SALES_STAGE_LIMIT') {
        retry.current = undefined;
        setCreate('idle');
        setFeedback(stageCopy('salesStageLimit'));
        return;
      }
      if (result.status === 409) {
        retry.current = undefined;
        setCreate('conflict');
        setFeedback(stageCopy('salesStageConflict'));
        return;
      }
      if (
        result.status === 201 &&
        isRecord(result.body) &&
        isSalesStageList(result.body.configuration)
      ) {
        retry.current = undefined;
        setList({ kind: 'ready', list: result.body.configuration });
        setLabel('');
        setCreate('idle');
        setFeedback(stageCopy('salesStageCreated'));
        await onConfigured();
        return;
      }
      setCreate('uncertain');
      setFeedback(stageCopy('salesStageUncertain'));
    } catch {
      if (!controller.signal.aborted) {
        setCreate('uncertain');
        setFeedback(stageCopy('salesStageUncertain'));
      }
    }
  }

  const stages = list.kind === 'ready' ? list.list.stages : [];
  const full = stages.length >= SALES_STAGE_LIMIT;
  return (
    <section
      className="commercial-intake-sales-stages"
      aria-labelledby="commercial-intake-sales-stages-title"
    >
      <button type="button" onClick={onBack} disabled={create === 'saving'}>
        {copy.back}
      </button>
      <h3 id="commercial-intake-sales-stages-title">
        {stageCopy('salesStageSettings')}
      </h3>
      <p>{stageCopy('salesStageSettingsHelp')}</p>
      {feedback ? <p role="alert">{feedback}</p> : null}
      {list.kind === 'loading' ? (
        <p role="status">{stageCopy('salesStagesLoading')}</p>
      ) : list.kind === 'error' ? (
        <>
          <p role="alert">{stageCopy('salesStagesError')}</p>
          <button type="button" onClick={() => void loadList()}>
            {stageCopy('salesStagesReload')}
          </button>
        </>
      ) : stages.length === 0 ? (
        <p>{stageCopy('salesStagesEmpty')}</p>
      ) : (
        <ol aria-label={stageCopy('salesStageList')}>
          {stages.map((stage) => (
            <li key={stage.id}>
              <span>{stage.label}</span>
              <small>{stageCopy(STATE_KEYS[stage.state])}</small>
            </li>
          ))}
        </ol>
      )}
      {canConfigure && list.kind === 'ready' ? (
        create === 'conflict' ? (
          <button
            type="button"
            onClick={() => {
              setCreate('idle');
              setFeedback('');
              void loadList();
            }}
          >
            {stageCopy('salesStagesReload')}
          </button>
        ) : full ? (
          <p>{stageCopy('salesStageLimit')}</p>
        ) : (
          <form
            className="commercial-intake-sales-stage-form"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <label>
              {stageCopy('salesStageLabel')}
              <input
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                  setLabelError('');
                }}
                maxLength={SALES_STAGE_LABEL_MAXIMUM_LENGTH}
                disabled={create !== 'idle'}
                aria-invalid={labelError ? true : undefined}
                aria-describedby={
                  labelError ? 'commercial-intake-sales-stage-error' : undefined
                }
              />
            </label>
            {labelError ? (
              <p id="commercial-intake-sales-stage-error" role="alert">
                {labelError}
              </p>
            ) : null}
            {create === 'saving' ? (
              <p role="status">{stageCopy('salesStageSaving')}</p>
            ) : null}
            <div className="commercial-intake-next-action-actions">
              <button
                type="submit"
                className="commercial-intake-primary-action"
                disabled={create === 'saving'}
              >
                {create === 'uncertain'
                  ? stageCopy('retrySalesStage')
                  : stageCopy('createSalesStage')}
              </button>
              {create === 'uncertain' ? (
                <button
                  type="button"
                  className="commercial-intake-secondary-action"
                  onClick={() => {
                    retry.current = undefined;
                    setCreate('idle');
                    setFeedback('');
                    void loadList();
                  }}
                >
                  {stageCopy('cancelSalesStage')}
                </button>
              ) : null}
            </div>
          </form>
        )
      ) : list.kind === 'ready' && !canConfigure ? (
        <p>{stageCopy('salesStageReadOnly')}</p>
      ) : null}
    </section>
  );
}

function errorCode(result: HttpResult): unknown {
  return result.status !== 'network' && isRecord(result.body)
    ? result.body.code
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
