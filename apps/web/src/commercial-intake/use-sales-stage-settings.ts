import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import type { CommercialIntakeRequest } from './RequestClientAssociation';
import { useSalesStageCopy } from './sales-stage.copy';
import {
  isSalesStageList,
  isValidStageLabel,
  SALES_STAGE_LIMIT,
  type SalesStageList,
} from './sales-stage';

type HttpResult = Awaited<ReturnType<CommercialIntakeRequest>>;

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
export type SalesStageCreateState =
  'idle' | 'saving' | 'uncertain' | 'conflict';

type CreateRetry = { label: string; expectedRevision: number; key: string };

export type SalesStageSettingsProps = {
  identity: BrowserIdentity;
  authority: { read: string; configure: string };
  companyId: string;
  canConfigure: boolean;
  request: CommercialIntakeRequest;
  handleAccess: SalesStageAccessHandler;
  onConfigured: () => Promise<void> | void;
};

/**
 * The active Company's Sales Stage settings (Commercial Workflow PRD section
 * 24.6), shared by both interfaces: the ordered list, and for a holder of the
 * configuration bundle one stage created at the end of it. An uncertain
 * create resends exactly its label, revision and key.
 */
export function useSalesStageSettings({
  identity,
  authority,
  companyId,
  canConfigure,
  request,
  handleAccess,
  onConfigured,
}: SalesStageSettingsProps) {
  const stageCopy = useSalesStageCopy();
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [label, setLabel] = useState('');
  const [create, setCreate] = useState<SalesStageCreateState>('idle');
  const [feedback, setFeedback] = useState('');
  const [labelError, setLabelError] = useState('');
  const readLifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      companyId,
      authority.read,
      identity.loaded,
      identity.signedIn,
    ]),
  );
  const createLifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      companyId,
      authority.configure,
      canConfigure,
      identity.loaded,
      identity.signedIn,
    ]),
  );
  const lists = useScopedOperationGroup(String(readLifetime));
  const creates = useScopedOperationGroup(String(createLifetime));
  const callbacks = useRef({ request, handleAccess, onConfigured });
  useLayoutEffect(() => {
    callbacks.current = { request, handleAccess, onConfigured };
  });
  const retry = useRef<CreateRetry | undefined>(undefined);

  const loadList = useCallback(async (): Promise<void> => {
    const operation = lists.beginLatest();
    if (!operation) return;
    const captured = callbacks.current;
    setList({ kind: 'loading' });
    try {
      const result = await captured.request({
        path: '/sales-stages',
        companyContextId: companyId,
        signal: operation.signal,
      });
      if (operation.signal.aborted) return;
      if (
        (await captured.handleAccess(
          result,
          companyId,
          operation.signal,
          'intake',
        )) !== 'ok'
      )
        return;
      if (operation.signal.aborted) return;
      setList(
        result.status === 200 && isSalesStageList(result.body)
          ? { kind: 'ready', list: result.body }
          : { kind: 'error' },
      );
    } catch {
      if (!operation.signal.aborted) setList({ kind: 'error' });
    } finally {
      operation.release();
    }
  }, [companyId, lists]);

  useEffect(() => {
    void loadList();
    return lists.retire;
  }, [loadList, lists]);

  // Losing the configuration bundle keeps the read-only list but retires the
  // draft and any pending command, so a later regrant cannot replay it.
  useEffect(() => {
    creates.retire();
    retry.current = undefined;
    setLabel('');
    setLabelError('');
    setCreate('idle');
  }, [createLifetime, creates]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (
      list.kind !== 'ready' ||
      create === 'saving' ||
      create === 'conflict' ||
      creates.isPending()
    )
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
    const operation = creates.beginLatest();
    if (!operation) return;
    const captured = callbacks.current;
    setCreate('saving');
    setFeedback('');
    setLabelError('');
    try {
      const result = await captured.request({
        path: '/sales-stages',
        companyContextId: companyId,
        signal: operation.signal,
        method: 'POST',
        body: JSON.stringify({ expectedRevision, label: draft }),
        idempotencyKey: key,
      });
      if (operation.signal.aborted) return;
      const access = await captured.handleAccess(
        result,
        companyId,
        operation.signal,
        'sales-stage-configuration',
      );
      if (operation.signal.aborted) return;
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
        operation.release();
        try {
          await callbacks.current.onConfigured();
        } catch {
          // Activity refresh cannot unconfirm the committed configuration.
        }
        return;
      }
      setCreate('uncertain');
      setFeedback(stageCopy('salesStageUncertain'));
    } catch {
      if (!operation.signal.aborted) {
        setCreate('uncertain');
        setFeedback(stageCopy('salesStageUncertain'));
      }
    } finally {
      operation.release();
    }
  }

  const stages = list.kind === 'ready' ? list.list.stages : [];
  return {
    list,
    stages,
    full: stages.length >= SALES_STAGE_LIMIT,
    label,
    create,
    feedback,
    labelError,
    loadList,
    submit,
    editLabel: (value: string) => {
      setLabel(value);
      setLabelError('');
    },
    /** Leaves a stale conflict and reads the list again. */
    reloadAfterConflict: () => {
      setCreate('idle');
      setFeedback('');
      void loadList();
    },
    /** Gives up an uncertain create and reads the list again. */
    abandonUncertain: () => {
      retry.current = undefined;
      setCreate('idle');
      setFeedback('');
      void loadList();
    },
  };
}

function errorCode(result: HttpResult): unknown {
  return result.status !== 'network' && isRecord(result.body)
    ? result.body.code
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
